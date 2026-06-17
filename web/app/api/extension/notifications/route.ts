/* ============================================================
   LinkedApply Pro — Email Notification Service (Backend)
   Sends automated email notifications for key events:
   - Daily application summary
   - Weekly analytics digest
   - Interview scheduled alerts
   - Trial expiry warnings
   ============================================================ */

import { NextResponse, NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/libs/supabase-admin";
import { sendEmail } from "@/libs/mailgun";
import { getPlanDisplayName, getTrialExpiringEmail } from "@/libs/subscription-helpers";

// POST — Send notification (called from extension or cron)
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    
    // Allow both JWT auth (from extension) and cron secret (from scheduled jobs)
    const cronSecret = req.headers.get("x-cron-secret");
    let userId: string | null = null;

    if (cronSecret === process.env.CRON_SECRET) {
      // Cron job — process all users
      return handleCronNotifications(req);
    }

    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.replace("Bearer ", "");
    const supabase = getSupabaseAdmin();
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }
    userId = user.id;

    const body = await req.json();
    const { type, data } = body;

    switch (type) {
      case "daily_summary":
        await sendDailySummary(userId);
        break;
      case "interview_alert":
        await sendInterviewAlert(userId, data);
        break;
      case "milestone":
        await sendMilestoneEmail(userId, data);
        break;
      default:
        return NextResponse.json({ error: "Unknown notification type" }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Notification error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ---- Cron Handler (processes batch notifications) ----
async function handleCronNotifications(req: NextRequest): Promise<NextResponse> {
  const body = await req.json().catch(() => ({ type: "daily" }));
  const type = body.type || "daily";

  let processed = 0;

  if (type === "daily" || type === "all") {
    processed += await processDailySummaries();
  }

  if (type === "trial_expiry" || type === "all") {
    processed += await processTrialExpiryWarnings();
  }

  if (type === "weekly" || type === "all") {
    processed += await processWeeklyDigests();
  }

  return NextResponse.json({ success: true, processed });
}

// ================================================
//  DAILY APPLICATION SUMMARY
// ================================================

async function sendDailySummary(userId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { data: profile } = await supabase
    .from("profiles")
    .select("email, plan_name")
    .eq("id", userId)
    .single();

  if (!profile?.email) return;

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const dateStr = yesterday.toISOString().slice(0, 10);

  const { data: usage } = await supabase
    .from("usage_logs")
    .select("*")
    .eq("user_id", userId)
    .eq("date", dateStr)
    .single();

  if (!usage || usage.applications_count === 0) return;

  const html = buildDailySummaryEmail({
    applied: usage.applications_count || 0,
    external: usage.external_count || 0,
    skipped: usage.skipped_count || 0,
    date: dateStr,
    plan: profile.plan_name,
  });

  await sendEmail({
    to: profile.email,
    subject: `📊 Daily Summary: ${usage.applications_count} applications on ${dateStr}`,
    html,
  });
}

async function processDailySummaries(): Promise<number> {
  // Find users with notification preference enabled
  const supabase = getSupabaseAdmin();
  const { data: users } = await supabase
    .from("profiles")
    .select("id")
    .eq("has_access", true)
    .not("email", "is", null);

  if (!users) return 0;

  let count = 0;
  for (const user of users) {
    try {
      await sendDailySummary(user.id);
      count++;
    } catch (e) {
      console.error(`Daily summary failed for ${user.id}:`, e);
    }
  }
  return count;
}

// ================================================
//  TRIAL EXPIRY WARNINGS
// ================================================

async function processTrialExpiryWarnings(): Promise<number> {
  // Find trial users expiring in 1 day
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);

  const { data: expiringUsers } = await getSupabaseAdmin()
    .from("profiles")
    .select("id, email")
    .eq("plan_name", "free_trial")
    .eq("has_access", true)
    .lte("plan_expires_at", `${tomorrowStr}T23:59:59Z`)
    .not("email", "is", null);

  if (!expiringUsers) return 0;

  let count = 0;
  for (const user of expiringUsers) {
    try {
      const html = getTrialExpiringEmail(1);
      await sendEmail({
        to: user.email,
        subject: "⏰ Your LinkedApply Pro trial expires tomorrow",
        html,
      });
      count++;
    } catch (e) {
      console.error(`Trial expiry email failed for ${user.id}:`, e);
    }
  }
  return count;
}

// ================================================
//  WEEKLY ANALYTICS DIGEST
// ================================================

async function processWeeklyDigests(): Promise<number> {
  const { data: users } = await getSupabaseAdmin()
    .from("profiles")
    .select("id, email, plan_name")
    .eq("has_access", true)
    .in("plan_name", ["month", "year", "lifetime"])
    .not("email", "is", null);

  if (!users) return 0;

  let count = 0;
  for (const user of users) {
    try {
      await sendWeeklyDigest(user);
      count++;
    } catch (e) {
      console.error(`Weekly digest failed for ${user.id}:`, e);
    }
  }
  return count;
}

async function sendWeeklyDigest(user: { id: string; email: string; plan_name: string }): Promise<void> {
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const { data: weekUsage } = await getSupabaseAdmin()
    .from("usage_logs")
    .select("*")
    .eq("user_id", user.id)
    .gte("date", weekAgo.toISOString().slice(0, 10));

  const totals = (weekUsage || []).reduce(
    (acc, row) => ({
      applied: acc.applied + (row.applications_count || 0),
      external: acc.external + (row.external_count || 0),
      skipped: acc.skipped + (row.skipped_count || 0),
    }),
    { applied: 0, external: 0, skipped: 0 }
  );

  if (totals.applied === 0) return; // Don't send if inactive

  const html = buildWeeklyDigestEmail(totals, user.plan_name);
  await sendEmail({
    to: user.email,
    subject: `📈 Weekly Report: ${totals.applied} applications this week`,
    html,
  });
}

// ================================================
//  INTERVIEW ALERT
// ================================================

async function sendInterviewAlert(
  userId: string,
  data: { jobTitle: string; company: string; notes?: string }
): Promise<void> {
  const { data: profile } = await getSupabaseAdmin()
    .from("profiles")
    .select("email")
    .eq("id", userId)
    .single();

  if (!profile?.email) return;

  const html = buildInterviewAlertEmail(data);
  await sendEmail({
    to: profile.email,
    subject: `🎉 Interview status: ${data.company} — ${data.jobTitle}`,
    html,
  });
}

// ================================================
//  MILESTONE
// ================================================

async function sendMilestoneEmail(
  userId: string,
  data: { milestone: string; count: number }
): Promise<void> {
  const { data: profile } = await getSupabaseAdmin()
    .from("profiles")
    .select("email")
    .eq("id", userId)
    .single();

  if (!profile?.email) return;

  const html = buildMilestoneEmail(data);
  await sendEmail({
    to: profile.email,
    subject: `🏆 Milestone: ${data.milestone}!`,
    html,
  });
}

// ================================================
//  EMAIL BUILDERS
// ================================================

const BRAND = "#6366f1";

function wrap(content: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.6;color:#1a1a2e;margin:0;padding:0;background:#f4f4f8}
  .c{max-width:560px;margin:24px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)}
  .h{background:linear-gradient(135deg,${BRAND},#818cf8);padding:32px 24px;text-align:center;color:#fff}
  .h h1{margin:0;font-size:22px}
  .b{padding:32px 24px}.b h2{color:${BRAND};margin-top:0}.b p{color:#4a4a6a;margin:12px 0}
  .stat{display:inline-block;text-align:center;padding:12px 20px;background:#f0f0ff;border-radius:8px;margin:6px}
  .stat .n{font-size:28px;font-weight:700;color:${BRAND}}.stat .l{font-size:12px;color:#9ca3af}
  .cta{display:inline-block;background:${BRAND};color:#fff!important;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;margin:16px 0}
  .f{padding:20px 24px;text-align:center;font-size:12px;color:#9ca3af;border-top:1px solid #e5e7eb}
  </style></head><body><div class="c"><div class="h"><h1>⚡ LinkedApply Pro</h1></div><div class="b">${content}</div><div class="f">LinkedApply Pro — AI-Powered LinkedIn Automation</div></div></body></html>`;
}

function buildDailySummaryEmail(d: { applied: number; external: number; skipped: number; date: string; plan: string }): string {
  const timeSaved = Math.round((d.applied * 80 + d.external * 20) / 60);
  return wrap(`
    <h2>Daily Summary — ${d.date}</h2>
    <div style="text-align:center;margin:20px 0">
      <div class="stat"><div class="n">${d.applied}</div><div class="l">Applied</div></div>
      <div class="stat"><div class="n">${d.external}</div><div class="l">External</div></div>
      <div class="stat"><div class="n">${d.skipped}</div><div class="l">Skipped</div></div>
      <div class="stat"><div class="n">~${timeSaved}m</div><div class="l">Time Saved</div></div>
    </div>
    <p style="text-align:center">Keep the momentum going! 🚀</p>
    <div style="text-align:center"><a href="https://linkedin.com/jobs" class="cta">Continue Applying →</a></div>
  `);
}

function buildWeeklyDigestEmail(totals: { applied: number; external: number; skipped: number }, plan: string): string {
  const timeSaved = Math.round((totals.applied * 80 + totals.external * 20) / 60);
  const hours = Math.floor(timeSaved / 60);
  const mins = timeSaved % 60;
  return wrap(`
    <h2>Weekly Report 📈</h2>
    <div style="text-align:center;margin:20px 0">
      <div class="stat"><div class="n">${totals.applied}</div><div class="l">Applications</div></div>
      <div class="stat"><div class="n">${totals.external}</div><div class="l">External</div></div>
      <div class="stat"><div class="n">${hours}h ${mins}m</div><div class="l">Time Saved</div></div>
    </div>
    <p>That's <strong>${totals.applied} applications</strong> in just 7 days — ${hours > 0 ? `${hours} hours` : `${mins} minutes`} of your time saved! 🎯</p>
    <p>Your <strong>${getPlanDisplayName(plan)}</strong> plan is working hard for you.</p>
    <div style="text-align:center"><a href="https://linkedin.com/jobs" class="cta">Keep Going →</a></div>
  `);
}

function buildInterviewAlertEmail(d: { jobTitle: string; company: string; notes?: string }): string {
  return wrap(`
    <h2>Interview Update! 🎉</h2>
    <p>Great news! The status for your application has been updated:</p>
    <div style="background:#f0f0ff;padding:16px;border-radius:8px;border-left:4px solid ${BRAND};margin:16px 0">
      <strong>${d.jobTitle}</strong> at <strong>${d.company}</strong>
      ${d.notes ? `<p style="margin:8px 0 0;color:#6b7280">${d.notes}</p>` : ""}
    </div>
    <p><strong>Tips for interview prep:</strong></p>
    <ul style="color:#4a4a6a">
      <li>Research the company's recent news</li>
      <li>Review the job description one more time</li>
      <li>Prepare STAR method examples</li>
      <li>Have questions ready for the interviewer</li>
    </ul>
    <div style="text-align:center"><a href="https://linkedin.com/company/${encodeURIComponent(d.company)}" class="cta">Research ${d.company} →</a></div>
  `);
}

function buildMilestoneEmail(d: { milestone: string; count: number }): string {
  return wrap(`
    <h2>Milestone Reached! 🏆</h2>
    <div style="text-align:center;margin:24px 0">
      <div class="stat" style="padding:24px 40px"><div class="n">${d.count}</div><div class="l">${d.milestone}</div></div>
    </div>
    <p style="text-align:center">You've reached <strong>${d.count} ${d.milestone}</strong>. That's incredible consistency! 💪</p>
    <div style="text-align:center"><a href="https://linkedin.com/jobs" class="cta">Keep the Streak →</a></div>
  `);
}
