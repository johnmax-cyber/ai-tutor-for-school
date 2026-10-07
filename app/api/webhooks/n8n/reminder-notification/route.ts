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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
      "study_reminders_enabled",
      true,
    );
    if (!enabled) {
      return NextResponse.json(
        { skipped: true, reason: "study_reminders_disabled" },
        { status: 200 },
      );
    }

    // Topics due for review (next_review_at <= now) for this user
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
      return NextResponse.json(
        { notified: false, reason: "no_topics_due" },
        { status: 200 },
      );
    }

    const names = (dueTopics ?? [])
      .map((t) => (t.subjects as Array<{ name: string }> | undefined)?.[0]?.name && `[${t.subjects[0].name}] ${t.name}` || t.name)
      .join(", ");

    const notificationService = new NotificationService(supabase);
    await notificationService.create({
      user_id: userId,
      type: "reminder",
      title: "Review Reminder",
      message: `${topicCount} topic${topicCount === 1 ? "" : "s"} ready for review: ${names}.`,
      link: "/study",
    });

    return NextResponse.json({ notified: true, topicCount }, { status: 200 });
  } catch (err) {
    console.error("reminder-notification webhook error:", err);
    return NextResponse.json({ error: "Failed to send reminder." }, { status: 500 });
  }
}
