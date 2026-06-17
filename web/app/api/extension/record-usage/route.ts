/* ============================================================
   LinkedApply Pro — Record Usage API Route
   Tracks daily application counts per user for plan limits
   ============================================================ */

import { NextResponse, NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/libs/supabase-admin";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Missing auth token" }, { status: 401 });
    }

    const token = authHeader.replace("Bearer ", "");
    const supabase = getSupabaseAdmin();
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const body = await req.json();
    const { action, jobId, status: jobStatus, metadata } = body;

    // Validate action type
    const validActions = ["applied", "external", "skipped", "failed"];
    if (!validActions.includes(action)) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    const today = new Date().toISOString().slice(0, 10);

    // Upsert daily usage record
    const { data: existing } = await supabase
      .from("usage_logs")
      .select("*")
      .eq("user_id", user.id)
      .eq("date", today)
      .single();

    if (existing) {
      // Update existing record
      const updates: Record<string, number> = {};
      if (action === "applied") updates.applications_count = (existing.applications_count || 0) + 1;
      if (action === "external") updates.external_count = (existing.external_count || 0) + 1;
      if (action === "skipped") updates.skipped_count = (existing.skipped_count || 0) + 1;
      if (action === "failed") updates.failed_count = (existing.failed_count || 0) + 1;

      await supabase
        .from("usage_logs")
        .update(updates)
        .eq("user_id", user.id)
        .eq("date", today);
    } else {
      // Create new record for today
      await supabase
        .from("usage_logs")
        .insert({
          user_id: user.id,
          date: today,
          applications_count: action === "applied" ? 1 : 0,
          external_count: action === "external" ? 1 : 0,
          skipped_count: action === "skipped" ? 1 : 0,
          failed_count: action === "failed" ? 1 : 0,
        });
    }

    // Log the individual action for analytics
    await supabase
      .from("activity_log")
      .insert({
        user_id: user.id,
        action,
        job_id: jobId || null,
        job_status: jobStatus || null,
        metadata: metadata || null,
        created_at: new Date().toISOString(),
      });

    // Get updated usage for the response
    const { data: updatedUsage } = await supabase
      .from("usage_logs")
      .select("*")
      .eq("user_id", user.id)
      .eq("date", today)
      .single();

    return NextResponse.json({
      success: true,
      usage: {
        applicationsToday: updatedUsage?.applications_count || 0,
        externalToday: updatedUsage?.external_count || 0,
        skippedToday: updatedUsage?.skipped_count || 0,
        failedToday: updatedUsage?.failed_count || 0,
      },
    });
  } catch (error) {
    console.error("record-usage error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// GET — fetch usage history for analytics
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Missing auth token" }, { status: 401 });
    }

    const token = authHeader.replace("Bearer ", "");
    const supabase = getSupabaseAdmin();
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const days = parseInt(searchParams.get("days") || "30");

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const { data: usageHistory } = await supabase
      .from("usage_logs")
      .select("*")
      .eq("user_id", user.id)
      .gte("date", startDate.toISOString().slice(0, 10))
      .order("date", { ascending: true });

    // Total stats
    const totals = (usageHistory || []).reduce(
      (acc, row) => ({
        totalApplied: acc.totalApplied + (row.applications_count || 0),
        totalExternal: acc.totalExternal + (row.external_count || 0),
        totalSkipped: acc.totalSkipped + (row.skipped_count || 0),
        totalFailed: acc.totalFailed + (row.failed_count || 0),
      }),
      { totalApplied: 0, totalExternal: 0, totalSkipped: 0, totalFailed: 0 }
    );

    return NextResponse.json({
      history: usageHistory || [],
      totals,
      days,
    });
  } catch (error) {
    console.error("record-usage GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
