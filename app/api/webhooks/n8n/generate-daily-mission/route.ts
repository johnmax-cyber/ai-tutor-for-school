import { NextResponse } from "next/server";
import {
  webhookBaseSchema,
  validateN8nWebhook,
  createServiceSupabase,
  verifyUserExists,
  verifyResourceOwnership,
  isPreferenceEnabled,
} from "@/lib/automation/auth";
import { MissionService } from "@/lib/missions/service";
import {
  selectDailyMissionTopic,
  generateDailyMission,
} from "@/lib/missions/generation";
import type { MissionTopic } from "@/lib/missions/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Number of days ahead the daily mission is scheduled for
const MISSION_LEAD_DAYS = 1;

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
      "daily_mission_enabled",
      true,
    );
    if (!enabled) {
      return NextResponse.json(
        { skipped: true, reason: "daily_mission_disabled" },
        { status: 200 },
      );
    }

    // Build the candidate topic list (topics with ready resources)
    const { data: topicRows, error: topicsError } = await supabase
      .from("topics")
      .select(
        `id, name, subjects(name), mastery_state, next_review_at, last_studied`,
      )
      .eq("user_id", userId);

    if (topicsError) {
      throw topicsError;
    }

    const topicIds = (topicRows ?? []).map((t) => t.id);

    const resourceCounts: Record<string, number> = {};
    if (topicIds.length > 0) {
      const { data: topicResources } = await supabase
        .from("resources_topics")
        .select("topic_id, resource_id")
        .in("topic_id", topicIds);

      const resourceIds = (topicResources ?? []).map((r) => r.resource_id);
      if (resourceIds.length > 0) {
        const { data: readyResources } = await supabase
          .from("resources")
          .select("id")
          .eq("user_id", userId)
          .eq("status", "ready")
          .in("id", resourceIds);

        const readyIds = new Set((readyResources ?? []).map((r) => r.id));
        for (const tr of topicResources ?? []) {
          if (readyIds.has(tr.resource_id)) {
            resourceCounts[tr.topic_id] =
              (resourceCounts[tr.topic_id] ?? 0) + 1;
          }
        }
      }
    }

    const topics: MissionTopic[] = (topicRows ?? []).map((t) => ({
      id: t.id,
      name: t.name,
      subject_name: (t.subjects as Array<{ name: string }> | undefined)?.[0]?.name ?? null,
      mastery_state: t.mastery_state as MissionTopic["mastery_state"],
      next_review_at: t.next_review_at,
      last_studied: t.last_studied,
      resource_count: resourceCounts[t.id] ?? 0,
    }));

    const selected = selectDailyMissionTopic(topics);
    if (!selected) {
      return NextResponse.json(
        { created: false, reason: "no_topics_available" },
        { status: 200 },
      );
    }

    const { title, description } = generateDailyMission(selected);

    const scheduledFor = new Date();
    scheduledFor.setUTCDate(scheduledFor.getUTCDate() + MISSION_LEAD_DAYS);
    const scheduledForStr = scheduledFor.toISOString().slice(0, 10);

    const missionService = new MissionService(supabase);
    const mission = await missionService.create({
      user_id: userId,
      type: "daily_review",
      topic_id: selected.id,
      title,
      description,
      scheduled_for: scheduledForStr,
    });

    return NextResponse.json({ created: true, mission }, { status: 200 });
  } catch (err) {
    console.error("generate-daily-mission webhook error:", err);
    return NextResponse.json(
      { error: "Failed to generate daily mission." },
      { status: 500 },
    );
  }
}
