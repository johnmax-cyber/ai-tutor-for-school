import { NextResponse } from "next/server";
import {
  createServiceSupabase,
  verifyUserExists,
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

const MISSION_LEAD_DAYS = 1;

async function generateDailyMissionForUser(
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
    "daily_mission_enabled",
    true,
  );
  if (!enabled) {
    return { skipped: true, reason: "daily_mission_disabled" };
  }

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
    subject_name: (t.subjects as Array<{ name: string }> | undefined)?.[0]?.name ??
      null,
    mastery_state: t.mastery_state as MissionTopic["mastery_state"],
    next_review_at: t.next_review_at,
    last_studied: t.last_studied,
    resource_count: resourceCounts[t.id] ?? 0,
  }));

  const selected = selectDailyMissionTopic(topics);
  if (!selected) {
    return { created: false, reason: "no_topics_available" };
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

  return { created: true, mission };
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
      .eq("daily_mission_enabled", true);

    if (prefsError) {
      throw prefsError;
    }

    const results = await Promise.allSettled(
      (prefs ?? []).map((p) => generateDailyMissionForUser(supabase, p.user_id)),
    );

    let successful = 0;
    let skipped = 0;
    let errors = 0;

    for (const r of results) {
      if (r.status === "fulfilled") {
        if (r.value.created) {
          successful++;
        } else if (r.value.skipped || r.value.reason) {
          skipped++;
        }
      } else {
        errors++;
      }
    }

    return NextResponse.json(
      { processed: prefs?.length ?? 0, successful, skipped, errors },
      { status: 200 },
    );
  } catch (err) {
    console.error("cron daily-mission error:", err);
    return NextResponse.json(
      { error: "Failed to generate daily missions" },
      { status: 500 },
    );
  }
}