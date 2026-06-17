/* ============================================================
   LinkedApply Pro — Sync Jobs API Route
   Cloud sync of applied jobs between extension and backend
   ============================================================ */

import { NextResponse, NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/libs/supabase-admin";

// POST — Push jobs from extension → cloud
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
    const { jobs } = body;

    if (!Array.isArray(jobs) || jobs.length === 0) {
      return NextResponse.json({ error: "No jobs to sync" }, { status: 400 });
    }

    // Cap batch size
    const batch = jobs.slice(0, 100);

    // Upsert jobs (use job_id + user_id as unique key)
    const records = batch.map((job: any) => ({
      user_id: user.id,
      job_id: job.id,
      title: job.title || "",
      company: job.company || "",
      location: job.location || "",
      work_style: job.workStyle || "",
      description: (job.description || "").substring(0, 5000), // Cap description size
      experience_required: job.experienceRequired || "",
      job_link: job.jobLink || "",
      external_link: job.externalLink || "",
      date_applied: job.dateApplied || null,
      date_listed: job.dateListed || null,
      status: job.status || "applied",
      match_score: job.matchScore ?? null,
      resume_used: job.resumeUsed || "",
      hr_name: job.hrName || "",
      hr_link: job.hrLink || "",
      notes: job.notes || "",
      skills_extracted: job.skillsExtracted || null,
      questions_answered: job.questionsAnswered || [],
      synced_at: new Date().toISOString(),
    }));

    const { error: upsertError } = await supabase
      .from("synced_jobs")
      .upsert(records, {
        onConflict: "user_id,job_id",
        ignoreDuplicates: false,
      });

    if (upsertError) {
      console.error("Sync upsert error:", upsertError);
      return NextResponse.json({ error: "Failed to sync jobs" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      synced: batch.length,
      message: `${batch.length} jobs synced to cloud`,
    });
  } catch (error) {
    console.error("sync-jobs POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// GET — Pull jobs from cloud → extension
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
    const since = searchParams.get("since"); // ISO date string
    const limit = Math.min(parseInt(searchParams.get("limit") || "500"), 1000);
    const offset = parseInt(searchParams.get("offset") || "0");

    let query = supabase
      .from("synced_jobs")
      .select("*")
      .eq("user_id", user.id)
      .order("synced_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (since) {
      query = query.gte("synced_at", since);
    }

    const { data: jobs, error: fetchError, count } = await query;

    if (fetchError) {
      console.error("Sync fetch error:", fetchError);
      return NextResponse.json({ error: "Failed to fetch jobs" }, { status: 500 });
    }

    // Map back to extension format (snake_case → camelCase)
    const mapped = (jobs || []).map((row: any) => ({
      id: row.job_id,
      title: row.title,
      company: row.company,
      location: row.location,
      workStyle: row.work_style,
      description: row.description,
      experienceRequired: row.experience_required,
      jobLink: row.job_link,
      externalLink: row.external_link,
      dateApplied: row.date_applied,
      dateListed: row.date_listed,
      status: row.status,
      matchScore: row.match_score,
      resumeUsed: row.resume_used,
      hrName: row.hr_name,
      hrLink: row.hr_link,
      notes: row.notes,
      skillsExtracted: row.skills_extracted,
      questionsAnswered: row.questions_answered,
    }));

    return NextResponse.json({
      jobs: mapped,
      total: count || mapped.length,
      hasMore: mapped.length === limit,
    });
  } catch (error) {
    console.error("sync-jobs GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE — Remove a synced job
export async function DELETE(req: NextRequest) {
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
    const { jobId } = body;

    if (!jobId) {
      return NextResponse.json({ error: "Missing jobId" }, { status: 400 });
    }

    await supabase
      .from("synced_jobs")
      .delete()
      .eq("user_id", user.id)
      .eq("job_id", jobId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("sync-jobs DELETE error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
