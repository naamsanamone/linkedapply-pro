/* ============================================================
   LinkedApply Pro — Verify Subscription API Route
   Extension calls this to validate user's plan status
   ============================================================ */

import { NextResponse, NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/libs/supabase-admin";

export async function POST(req: NextRequest) {
  try {
    // Verify the auth token from the extension
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Missing auth token" }, { status: 401 });
    }

    const token = authHeader.replace("Bearer ", "");

    // Verify the JWT with Supabase
    const supabase = getSupabaseAdmin();
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    }

    // Get the user's profile with subscription info
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, email, has_access, customer_id, price_id, created_at")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    // Get usage data for today
    const today = new Date().toISOString().slice(0, 10);
    const { data: usage } = await supabase
      .from("usage_logs")
      .select("applications_count")
      .eq("user_id", user.id)
      .eq("date", today)
      .single();

    // Determine plan from price_id
    const planInfo = determinePlan(profile.price_id, profile.has_access, profile.created_at);

    return NextResponse.json({
      valid: true,
      subscription: {
        plan: planInfo.plan,
        status: planInfo.status,
        expiresAt: planInfo.expiresAt,
        features: planInfo.features,
        dailyLimit: planInfo.dailyLimit,
        trialDaysRemaining: planInfo.trialDaysRemaining,
      },
      usage: {
        applicationsToday: usage?.applications_count || 0,
        remainingToday: planInfo.dailyLimit === -1
          ? -1
          : Math.max(0, planInfo.dailyLimit - (usage?.applications_count || 0)),
      },
      user: {
        id: user.id,
        email: profile.email,
      },
    });
  } catch (error) {
    console.error("verify-subscription error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ---- Plan Resolution ----

interface PlanInfo {
  plan: string;
  status: string;
  expiresAt: string | null;
  features: string[];
  dailyLimit: number;
  trialDaysRemaining?: number;
}

const PLAN_MAP: Record<string, { plan: string; dailyLimit: number; features: string[] }> = {
  price_free_trial: {
    plan: "free_trial",
    dailyLimit: 5,
    features: ["basic_filters", "local_history"],
  },
  price_free_trial_dev: {
    plan: "free_trial",
    dailyLimit: 5,
    features: ["basic_filters", "local_history"],
  },
  price_day: {
    plan: "day",
    dailyLimit: -1,
    features: ["ai_answers", "all_filters", "speed_control"],
  },
  price_day_dev: {
    plan: "day",
    dailyLimit: -1,
    features: ["ai_answers", "all_filters", "speed_control"],
  },
  price_week: {
    plan: "week",
    dailyLimit: -1,
    features: ["ai_answers", "ai_resume_tailor", "job_match_score", "cloud_sync"],
  },
  price_week_dev: {
    plan: "week",
    dailyLimit: -1,
    features: ["ai_answers", "ai_resume_tailor", "job_match_score", "cloud_sync"],
  },
  price_month: {
    plan: "month",
    dailyLimit: -1,
    features: [
      "ai_answers", "ai_resume_tailor", "ai_cover_letter", "ats_keywords",
      "job_match_score", "kanban_board", "analytics", "cloud_sync",
      "follow_up_reminders", "email_notifications", "export_data",
    ],
  },
  price_month_dev: {
    plan: "month",
    dailyLimit: -1,
    features: [
      "ai_answers", "ai_resume_tailor", "ai_cover_letter", "ats_keywords",
      "job_match_score", "kanban_board", "analytics", "cloud_sync",
      "follow_up_reminders", "email_notifications", "export_data",
    ],
  },
  price_year: {
    plan: "year",
    dailyLimit: -1,
    features: [
      "ai_answers", "ai_resume_tailor", "ai_cover_letter", "ats_keywords",
      "job_match_score", "kanban_board", "analytics", "cloud_sync",
      "follow_up_reminders", "email_notifications", "export_data",
      "priority_support", "early_access",
    ],
  },
  price_year_dev: {
    plan: "year",
    dailyLimit: -1,
    features: [
      "ai_answers", "ai_resume_tailor", "ai_cover_letter", "ats_keywords",
      "job_match_score", "kanban_board", "analytics", "cloud_sync",
      "follow_up_reminders", "email_notifications", "export_data",
      "priority_support", "early_access",
    ],
  },
  price_lifetime: {
    plan: "lifetime",
    dailyLimit: -1,
    features: [
      "ai_answers", "ai_resume_tailor", "ai_cover_letter", "ats_keywords",
      "job_match_score", "kanban_board", "analytics", "cloud_sync",
      "follow_up_reminders", "email_notifications", "export_data",
      "priority_support", "early_access", "lifetime_updates",
    ],
  },
  price_lifetime_dev: {
    plan: "lifetime",
    dailyLimit: -1,
    features: [
      "ai_answers", "ai_resume_tailor", "ai_cover_letter", "ats_keywords",
      "job_match_score", "kanban_board", "analytics", "cloud_sync",
      "follow_up_reminders", "email_notifications", "export_data",
      "priority_support", "early_access", "lifetime_updates",
    ],
  },
};

function determinePlan(priceId: string | null, hasAccess: boolean, createdAt: string): PlanInfo {
  // No priceId = free trial
  if (!priceId) {
    const created = new Date(createdAt);
    const trialEnd = new Date(created.getTime() + 3 * 24 * 60 * 60 * 1000); // 3-day trial
    const now = new Date();
    const trialDaysRemaining = Math.max(0, Math.ceil((trialEnd.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)));

    return {
      plan: "free_trial",
      status: trialDaysRemaining > 0 ? "active" : "expired",
      expiresAt: trialEnd.toISOString(),
      features: ["basic_filters", "local_history"],
      dailyLimit: 5,
      trialDaysRemaining,
    };
  }

  const planConfig = PLAN_MAP[priceId];
  if (!planConfig) {
    return {
      plan: "free_trial",
      status: "expired",
      expiresAt: null,
      features: [],
      dailyLimit: 5,
    };
  }

  return {
    plan: planConfig.plan,
    status: hasAccess ? "active" : "expired",
    expiresAt: null, // Managed by Stripe
    features: planConfig.features,
    dailyLimit: planConfig.dailyLimit,
  };
}
