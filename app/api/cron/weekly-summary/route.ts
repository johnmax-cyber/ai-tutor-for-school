import { NextResponse } from "next/server";
import {
  createServiceSupabase,
  verifyUserExists,
  isPreferenceEnabled,
} from "@/lib/automation/auth";
import { NotificationService } from "@/lib/notifications/service";
import { createAIService } from "@/lib/ai/client";
import { generateSummary } from "@/lib/tutor/summary";
import type { WeeklySessionSummary } from "@/lib/missions/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUMMARY_PERIOD_DAYS = 7;

async function generateWeeklySummaryForUser(
  supabase: ReturnType<typeof createServiceSupabase>,
  userId: string,
) {
  const userOk = await verifyUserExists(supabase, userId);
  if (!userOk) {
    return { skipped: true, reason: "user_not_found" };
  }

  const enabled = await isPreferenceEnabled(
    supabase,
    userId,
    "weekly_summary_enabled",
    true,
  );
  if (!enabled) {
    return { skipped: true, reason: "weekly_summary_disabled" };
  }

  const since = new Date();
  since.setUTCDate(since.getUTCDate() - SUMMARY_PERIOD_DAYS);

  const { data: sessions, error: sessionsError } = await supabase
    .from("study_sessions")
    .select(
      `id, topic_id, topics(name, subjects(name)), started_at, ended_at,
       questions_attempted, total_attempts, correct_attempts, hints_used`,
    )
    .eq("user_id", userId)
    .eq("status", "completed")
    .gte("ended_at", since.toISOString());

  if (sessionsError) {
    throw sessionsError;
  }

  if (!sessions || sessions.length === 0) {
    return { summary: null, reason: "no_sessions_in_period" };
  }

  const summaries: WeeklySessionSummary[] = sessions.map((s) => ({
    sessionId: s.id,
    topicName:
      (s.topics as Array<{ name: string }> | undefined)?.[0]?.name ??
      "Unknown Topic",
    subjectName:
      (s.topics as Array<{ subjects: Array<{ name: string }> }> | undefined)?.[0]?.subjects?.[0]?.name ?? null,
    accuracy: s.total_attempts > 0 ? s.correct_attempts / s.total_attempts : 0,
    totalAttempts: s.total_attempts,
    correctAttempts: s.correct_attempts,
    hintsUsed: s.hints_used,
    durationMinutes:
      s.ended_at && s.started_at
        ? Math.round(
            (new Date(s.ended_at).getTime() -
              new Date(s.started_at).getTime()) /
              60000,
          )
        : null,
  }));

  const ai = createAIService();
  const summary = await generateSummary(summaries, ai);

  const notificationService = new NotificationService(supabase);
  await notificationService.create({
    user_id: userId,
    type: "summary",
    title: "Weekly Learning Summary",
    message: summary,
    link: "/progress",
  });

  return { summary };
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceSupabase();

  try {
    const { data: prefs, error: prefsError } = await supabase
      .from("user_preferences")
      .select("user_id")
      .eq("weekly_summary_enabled", true);

    if (prefsError) {
      throw prefsError;
    }

    const results = await Promise.allSettled(
      (prefs ?? []).map((p) => generateWeeklySummaryForUser(supabase, p.user_id)),
    );

    let successful = 0;
    let skipped = 0;
    let noSessions = 0;
    let errors = 0;

    for (const r of results) {
      if (r.status === "fulfilled") {
        if (r.value.summary) {
          successful++;
        } else if (r.value.skipped) {
          skipped++;
        } else if (r.value.reason === "no_sessions_in_period") {
          noSessions++;
        }
      } else {
        errors++;
      }
    }

    return NextResponse.json(
      {
        processed: prefs?.length ?? 0,
        successful,
        skipped,
        noSessions,
        errors,
      },
      { status: 200 },
    );
  } catch (err) {
    console.error("cron weekly-summary error:", err);
    return NextResponse.json(
      { error: "Failed to generate weekly summaries" },
      { status: 500 },
    );
  }
}