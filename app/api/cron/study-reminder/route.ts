import { NextResponse } from "next/server";
import {
  createServiceSupabase,
  verifyUserExists,
  isPreferenceEnabled,
} from "@/lib/automation/auth";
import { NotificationService } from "@/lib/notifications/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function sendReminderForUser(
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
    "study_reminders_enabled",
    true,
  );
  if (!enabled) {
    return { skipped: true, reason: "study_reminders_disabled" };
  }

  const now = new Date().toISOString();
  const { data: dueTopics, error: topicsError } = await supabase
    .from("topics")
    .select("name, subjects(name)")
    .eq("user_id", userId)
    .neq("mastery_state", "not_started")
    .lte("next_review_at", now)
    .order("next_review_at", { ascending: true })
    .limit(10);

  if (topicsError) {
    throw topicsError;
  }

  const topicCount = dueTopics?.length ?? 0;
  if (topicCount === 0) {
    return { notified: false, reason: "no_topics_due" };
  }

  const names = (dueTopics ?? [])
    .map(
      (t) =>
        (t.subjects as Array<{ name: string }> | undefined)?.[0]?.name &&
        `[${t.subjects[0].name}] ${t.name}`,
    )
    .filter(Boolean)
    .join(", ");

  const notificationService = new NotificationService(supabase);
  await notificationService.create({
    user_id: userId,
    type: "reminder",
    title: "Review Reminder",
    message: `${topicCount} topic${topicCount === 1 ? "" : "s"} ready for review: ${names}.`,
    link: "/study",
  });

  return { notified: true, topicCount };
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
      .select("user_id, reminder_time")
      .eq("study_reminders_enabled", true);

    if (prefsError) {
      throw prefsError;
    }

    const currentHour = new Date().getUTCHours().toString().padStart(2, "0");

    const results = await Promise.allSettled(
      (prefs ?? [])
        .filter((p) => (p.reminder_time || "").startsWith(currentHour))
        .map((p) => sendReminderForUser(supabase, p.user_id)),
    );

    let successful = 0;
    let skipped = 0;
    let noTopics = 0;
    let errors = 0;

    for (const r of results) {
      if (r.status === "fulfilled") {
        if (r.value.notified) {
          successful++;
        } else if (r.value.skipped) {
          skipped++;
        } else if (r.value.reason === "no_topics_due") {
          noTopics++;
        }
      } else {
        errors++;
      }
    }

    return NextResponse.json(
      {
        processed: prefs?.length ?? 0,
        matched: (prefs ?? []).filter((p) =>
          (p.reminder_time || "").startsWith(currentHour),
        ).length,
        successful,
        skipped,
        noTopics,
        errors,
      },
      { status: 200 },
    );
  } catch (err) {
    console.error("cron study-reminder error:", err);
    return NextResponse.json(
      { error: "Failed to send reminders" },
      { status: 500 },
    );
  }
}