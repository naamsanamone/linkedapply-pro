/* ============================================================
   LinkedApply Pro — Subscription Helpers
   Plan resolution, durations, email templates, and utilities
   used by the Stripe webhook and subscription API routes
   ============================================================ */

// ---- Plan Duration (days, -1 = recurring/indefinite) ----
export const PLAN_DURATIONS: Record<string, number> = {
  free_trial: 3,
  day: 1,
  week: 7,
  month: -1,  // Recurring subscription
  year: -1,   // Recurring subscription
  lifetime: -1, // Never expires
};

// ---- Resolve plan name from Stripe price_id ----
export function resolvePlanName(priceId: string): string {
  if (priceId.includes("lifetime")) return "lifetime";
  if (priceId.includes("year")) return "year";
  if (priceId.includes("month")) return "month";
  if (priceId.includes("week")) return "week";
  if (priceId.includes("day")) return "day";
  if (priceId.includes("free_trial")) return "free_trial";
  return "free_trial";
}

// ---- Plan display names ----
export function getPlanDisplayName(plan: string): string {
  const names: Record<string, string> = {
    free_trial: "Free Trial",
    day: "Day Pass",
    week: "Weekly",
    month: "Monthly",
    year: "Yearly",
    lifetime: "Lifetime",
  };
  return names[plan] || plan;
}

// ================================================
//  EMAIL TEMPLATES
// ================================================

const BRAND_COLOR = "#6366f1";
const LOGO_TEXT = "⚡ LinkedApply Pro";

function emailWrapper(content: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1a1a2e; margin: 0; padding: 0; background: #f4f4f8; }
    .container { max-width: 560px; margin: 24px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
    .header { background: linear-gradient(135deg, ${BRAND_COLOR}, #818cf8); padding: 32px 24px; text-align: center; color: #fff; }
    .header h1 { margin: 0; font-size: 24px; letter-spacing: -0.5px; }
    .body { padding: 32px 24px; }
    .body h2 { color: ${BRAND_COLOR}; margin-top: 0; }
    .body p { color: #4a4a6a; margin: 12px 0; }
    .cta { display: inline-block; background: ${BRAND_COLOR}; color: #fff !important; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; margin: 16px 0; }
    .footer { padding: 20px 24px; text-align: center; font-size: 12px; color: #9ca3af; border-top: 1px solid #e5e7eb; }
    .highlight { background: #f0f0ff; padding: 16px; border-radius: 8px; border-left: 4px solid ${BRAND_COLOR}; margin: 16px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${LOGO_TEXT}</h1>
    </div>
    <div class="body">
      ${content}
    </div>
    <div class="footer">
      <p>LinkedApply Pro — AI-Powered LinkedIn Job Automation</p>
      <p>Questions? Reply to this email or contact support@linkedapplypro.com</p>
    </div>
  </div>
</body>
</html>`;
}

// ---- Welcome Email ----
export function getWelcomeEmail(planName: string, price: number): string {
  const displayName = getPlanDisplayName(planName);
  return emailWrapper(`
    <h2>Welcome to ${displayName}! 🎉</h2>
    <p>Your <strong>${displayName}</strong> plan is now active. You're all set to supercharge your job search!</p>
    
    <div class="highlight">
      <strong>What's included:</strong>
      <ul style="margin: 8px 0; padding-left: 20px; color: #4a4a6a;">
        <li>✅ Unlimited job applications</li>
        <li>🤖 AI-powered form filling</li>
        <li>📊 Analytics & job tracking</li>
        ${planName !== "day" ? "<li>☁️ Cloud sync across devices</li>" : ""}
        ${["month", "year", "lifetime"].includes(planName) ? "<li>📝 AI cover letters & resume tailoring</li>" : ""}
      </ul>
    </div>

    <p><strong>Quick start:</strong></p>
    <ol style="color: #4a4a6a; padding-left: 20px;">
      <li>Open the LinkedApply Pro extension on LinkedIn</li>
      <li>Fill in your profile in Settings</li>
      <li>Set your search preferences</li>
      <li>Click <strong>Start</strong> and watch the magic! ✨</li>
    </ol>

    <a href="https://linkedin.com/jobs" class="cta">Open LinkedIn Jobs →</a>
  `);
}

// ---- Payment Failed Email ----
export function getPaymentFailedEmail(planName: string): string {
  const displayName = getPlanDisplayName(planName);
  return emailWrapper(`
    <h2>Payment Issue ⚠️</h2>
    <p>We couldn't process the payment for your <strong>${displayName}</strong> plan.</p>
    
    <p>Don't worry — your access is still active while we retry. But please update your payment method to avoid service interruption.</p>

    <a href="https://linkedapplypro.com/dashboard" class="cta">Update Payment Method →</a>

    <p style="font-size: 13px; color: #9ca3af;">We'll retry the payment automatically over the next few days. If the issue persists, your subscription will be paused.</p>
  `);
}

// ---- Subscription Canceled Email ----
export function getSubscriptionCanceledEmail(planName: string): string {
  const displayName = getPlanDisplayName(planName);
  return emailWrapper(`
    <h2>We're sorry to see you go 😔</h2>
    <p>Your <strong>${displayName}</strong> subscription has ended.</p>
    
    <p>Your applied jobs and analytics data are safely stored and will be here if you come back.</p>

    <div class="highlight">
      <strong>What you'll miss:</strong>
      <ul style="margin: 8px 0; padding-left: 20px; color: #4a4a6a;">
        <li>Unlimited automated applications</li>
        <li>AI-powered question answering</li>
        <li>Resume tailoring & cover letters</li>
        <li>Job match scoring</li>
      </ul>
    </div>

    <p>Changed your mind? Resubscribe anytime:</p>
    <a href="https://linkedapplypro.com/#pricing" class="cta">Resubscribe →</a>

    <p style="font-size: 13px; color: #9ca3af;">We'd love to hear your feedback — what could we improve? Just reply to this email.</p>
  `);
}

// ---- Plan Upgraded Email ----
export function getPlanUpgradedEmail(fromPlan: string, toPlan: string): string {
  const fromName = getPlanDisplayName(fromPlan);
  const toName = getPlanDisplayName(toPlan);
  return emailWrapper(`
    <h2>Plan Upgraded! ✨</h2>
    <p>You've upgraded from <strong>${fromName}</strong> to <strong>${toName}</strong>. Nice move!</p>
    
    <div class="highlight">
      <strong>New features unlocked:</strong>
      <ul style="margin: 8px 0; padding-left: 20px; color: #4a4a6a;">
        ${toPlan === "week" ? "<li>🎯 AI job match scoring</li><li>📄 AI resume tailoring</li><li>☁️ Cloud sync</li>" : ""}
        ${["month", "year", "lifetime"].includes(toPlan) ? "<li>📝 AI cover letter generation</li><li>🔍 ATS keyword analysis</li><li>📊 Full analytics</li><li>🔔 Follow-up reminders</li>" : ""}
      </ul>
    </div>

    <a href="https://linkedin.com/jobs" class="cta">Start Applying →</a>
  `);
}

// ---- Trial Expiring Email ----
export function getTrialExpiringEmail(daysLeft: number): string {
  return emailWrapper(`
    <h2>Trial ending ${daysLeft === 1 ? "tomorrow" : `in ${daysLeft} days`} ⏰</h2>
    <p>You've been using LinkedApply Pro's free trial. It expires ${daysLeft === 1 ? "tomorrow" : `in ${daysLeft} days`}.</p>
    
    <p>During your trial, here's what you used:</p>
    <div class="highlight">
      <p>Don't lose your progress — upgrade now to keep applying with unlimited power!</p>
    </div>

    <a href="https://linkedapplypro.com/#pricing" class="cta">Upgrade Now — From $2.99 →</a>

    <p style="font-size: 13px; color: #9ca3af;">The free trial is limited to 5 applications/day. Paid plans include unlimited applications and AI features.</p>
  `);
}
