import { NextResponse } from "next/server";
import {
  createServiceSupabase,
  verifyUserExists,
  isPreferenceEnabled,
} from "@/lib/automation/auth";
import {
  evaluateRetryGates,
  processResource,
  type RetryGateResult,
} from "@/lib/resources/processing";
import { NotificationService } from "@/lib/notifications/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function retryProcessingForUser(
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
    "processing_retry_enabled",
    true,
  );
  if (!enabled) {
    return { skipped: true, reason: "processing_retry_disabled" };
  }

  const { data: pendingResources, error: resourcesError } = await supabase
    .from("resources")
    .select(
      "id, user_id, storage_path, mime_type, retry_count, processing_started_at, processing_metadata, title",
    )
    .eq("user_id", userId)
    .in("status", ["processing", "failed"])
    .lte("retry_count", 2);

  if (resourcesError) {
    throw resourcesError;
  }

  if (!pendingResources || pendingResources.length === 0) {
    return { processed: 0, reason: "no_pending_resources" };
  }

  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  let skipped = 0;

  for (const resource of pendingResources) {
    const gate: RetryGateResult = evaluateRetryGates(resource);
    if (!gate.retryable) {
      skipped++;
      continue;
    }

    const result = await processResource(resource.id, supabase);

    if (result.success) {
      succeeded++;
      const notificationService = new NotificationService(supabase);
      await notificationService.create({
        user_id: userId,
        type: "processing_complete",
        title: "Document ready",
        message: `${resource.title} has been processed and is ready to study.`,
        link: "/library",
      });
    } else {
      failed++;
    }
    processed++;
  }

  return { processed, succeeded, failed, skipped };
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
      .eq("processing_retry_enabled", true);

    if (prefsError) {
      throw prefsError;
    }

    const results = await Promise.allSettled(
      (prefs ?? []).map((p) => retryProcessingForUser(supabase, p.user_id)),
    );

    let totalProcessed = 0;
    let totalSucceeded = 0;
    let totalFailed = 0;
    let totalSkipped = 0;
    let errors = 0;

    for (const r of results) {
      if (r.status === "fulfilled") {
        totalProcessed += typeof r.value.processed === 'number' ? r.value.processed : 0;
        totalSucceeded += typeof r.value.succeeded === 'number' ? r.value.succeeded : 0;
        totalFailed += typeof r.value.failed === 'number' ? r.value.failed : 0;
        totalSkipped += typeof r.value.skipped === 'number' ? r.value.skipped : 0;
      } else {
        errors++;
      }
    }

    return NextResponse.json(
      {
        usersProcessed: prefs?.length ?? 0,
        totalProcessed,
        totalSucceeded,
        totalFailed,
        totalSkipped,
        errors,
      },
      { status: 200 },
    );
  } catch (err) {
    console.error("cron processing-retry error:", err);
    return NextResponse.json(
      { error: "Failed to process retries" },
      { status: 500 },
    );
  }
}