import { NextResponse } from "next/server";
import {
  retryProcessingSchema,
  validateN8nWebhook,
  createServiceSupabase,
  verifyUserExists,
  verifyResourceOwnership,
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

  const parsed = retryProcessingSchema.safeParse(body);
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

    const resource = await verifyResourceOwnership(supabase, userId, resourceId);
    if (!resource) {
      return NextResponse.json({ error: "Resource not found." }, { status: 404 });
    }

    const enabled = await isPreferenceEnabled(
      supabase,
      userId,
      "processing_retry_enabled",
      true,
    );
    if (!enabled) {
      return NextResponse.json(
        { skipped: true, reason: "processing_retry_disabled" },
        { status: 200 },
      );
    }

    // Retry safety: skip resources that have exhausted retries, are too recent,
    // or are marked as a permanent failure (never retry these).
    const gate: RetryGateResult = evaluateRetryGates(resource);
    if (!gate.retryable) {
      return NextResponse.json(
        { skipped: true, reason: gate.permanent ? "permanent_failure" : "retry_gate" },
        { status: 200 },
      );
    }

    const result = await processResource(resourceId, supabase);

    if (result.success) {
      const notificationService = new NotificationService(supabase);
      await notificationService.create({
        user_id: userId,
        type: "processing_complete",
        title: "Document ready",
        message: `${resource.title} has been processed and is ready to study.`,
        link: "/library",
      });
      return NextResponse.json(
        { success: true, status: "ready", resource: result.resource },
        { status: 200 },
      );
    }

    return NextResponse.json(
      { success: false, status: result.status, error: result.error },
      { status: 200 },
    );
  } catch (err) {
    console.error("retry-processing webhook error:", err);
    return NextResponse.json({ error: "Processing failed." }, { status: 500 });
  }
}
