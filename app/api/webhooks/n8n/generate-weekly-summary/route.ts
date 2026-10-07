import { NextResponse } from "next/server";
import {
  webhookBaseSchema,
  validateN8nWebhook,
  createServiceSupabase,
  verifyUserExists,
  verifyResourceOwnership,
  isPreferenceEnabled,
} from "@/lib/automation/auth";
import { NotificationService } from "@/lib/notifications/service";
import { createAIService } from "@/lib/ai/client";
import { generateSummary } from "@/lib/tutor/summary";
import type { WeeklySessionSummary } from "@/lib/missions/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUMMARY_PERIOD_DAYS = 7;

export async function POST(request: Request) {
  const { valid } = validateN8nWebhook(request);
  if (!valid) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const parsed = webhookBaseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const supabase = createServiceSupabase();
  const { userId, resourceId } = parsed.data;

  try {
    const userOk = await verifyUserExists(supabase, userId);
    if (!userOk) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    if (resourceId) {
      const resource = await verifyResourceOwnership(supabase, userId, resourceId);
      if (!resource) {
        return NextResponse.json({ error: "Resource not found." }, { status: 404 });
      }
    }

    const enabled = await isPreferenceEnabled(
      supabase,
      userId,
      "weekly_summary_enabled",
      true,
    );
    if (!enabled) {
      return NextResponse.json(
        { skipped: true, reason: "weekly_summary_disabled" },
        { status: 200 },
      );
    }

    // Gather the user's study sessions from the last N days
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
      return NextResponse.json(
        { summary: null, reason: "no_sessions_in_period" },
        { status: 200 },
      );
    }

    const summaries: WeeklySessionSummary[] = sessions.map((s) => ({
      sessionId: s.id,
      topicName: (s.topics as Array<{ name: string }> | undefined)?.[0]?.name ?? "Unknown Topic",
      subjectName: (s.topics as Array<{ subjects: Array<{ name: string }> }> | undefined)?.[0]?.subjects?.[0]?.name ?? null,
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

    return NextResponse.json({ summary }, { status: 200 });
  } catch (err) {
    console.error("generate-weekly-summary webhook error:", err);
    return NextResponse.json(
      { error: "Failed to generate weekly summary." },
      { status: 500 },
    );
  }
}
