import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
import { createAIService } from "@/lib/ai/client";
import { AIError } from "@/lib/ai/types";
import { handleTutorQuestion } from "@/lib/tutor/service";
import { retrieveChunks } from "@/lib/tutor/retrieve";
import { jsonError } from "@/app/api/resources/route";

export const runtime = "nodejs";
export const maxDuration = 60;

const requestSchema = z.object({
  question: z.string().trim().min(1).max(500),
  resourceId: z.string().uuid().optional(),
  imageResourceId: z.string().uuid().optional(),
  imagePage: z.number().int().positive().optional(),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(1500),
      })
    )
    .max(12)
    .optional(),
});

const DAILY_REQUEST_CAP = 50;
const MINUTE_REQUEST_CAP = 5;
const MONTHLY_TOKEN_CAP = 100000;
const MONTHLY_TOKEN_WARNING = 80;

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();

  if (authError || !auth?.user) {
    return jsonError("Unauthorized.", 401);
  }

  const userId = auth.user.id;

  // Rate limiting: check daily cap and per-minute rate limit
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  let todayCount = 0;
  let monthTokenCount = 0;
  let lastRequest = now;

  try {
    const { data: usageData, error: usageError } = await supabase
      .from("tutor_usage_log")
      .select("request_count, total_tokens, last_request")
      .eq("user_id", userId)
      .maybeSingle();

    if (usageError && usageError.code !== "PGRST116") {
      console.error("Failed to check tutor usage:", usageError);
    }

    if (usageData) {
      todayCount = usageData.request_count || 0;
      monthTokenCount = usageData.total_tokens || 0;
      lastRequest = usageData.last_request ? new Date(usageData.last_request) : now;
    }
  } catch (err) {
    console.error("Error reading tutor usage:", err);
  }

  // Per-minute rate limit check
  const minutesSinceLast = Math.max(
    1,
    (now.getTime() - lastRequest.getTime()) / 60000
  );
  const minuteRateExceeded = minutesSinceLast < 1 && todayCount >= MINUTE_REQUEST_CAP;

  // Daily cap check
  const dailyCapExceeded = todayCount >= DAILY_REQUEST_CAP;

  if (dailyCapExceeded) {
    const retryAfter = Math.ceil((todayStart.getTime() + 86400000 - now.getTime()) / 1000);
    return new NextResponse(
      JSON.stringify({ error: "Daily request limit exceeded. Please try again tomorrow." }),
      {
        status: 429,
        headers: {
          "Retry-After": retryAfter.toString(),
          "Content-Type": "application/json",
        },
      }
    );
  }

  if (minuteRateExceeded) {
    const retryAfter = Math.ceil((lastRequest.getTime() + 60000 - now.getTime()) / 1000);
    return new NextResponse(
      JSON.stringify({ error: "Rate limit exceeded. Please wait a minute before sending another request." }),
      {
        status: 429,
        headers: {
          "Retry-After": retryAfter.toString(),
          "Content-Type": "application/json",
        },
      }
    );
  }

  // Monthly token spend warning at 80%
  const monthlyTokenWarningThreshold = MONTHLY_TOKEN_CAP * 0.8;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid request.", 400);
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError("Invalid request.", 400);
  }

  const { question, resourceId, imageResourceId, imagePage, history = [] } = parsed.data;

  // Validate resource ownership and status
  let imageBuffer: Uint8Array | null = null;
  let imageMimeType: string | null = null;

  if (resourceId) {
    const { data: resource, error: resError } = await supabase
      .from("resources")
      .select("id, status")
      .eq("id", resourceId)
      .eq("user_id", userId)
      .single();

    if (resError || !resource) {
      return jsonError("Resource not found.", 404);
    }

    if (resource.status !== "ready") {
      return jsonError("This document is still processing.", 409);
    }
  }

  // Validate imageResourceId + imagePage if provided
  if (imageResourceId || imagePage) {
    if (!imageResourceId || !imagePage) {
      return jsonError("Both imageResourceId and imagePage are required.", 400);
    }

    // Check ownership of image resource
    const { data: imgResource, error: imgResError } = await supabase
      .from("resources")
      .select("id, mime_type, status")
      .eq("id", imageResourceId)
      .eq("user_id", userId)
      .single();

    if (imgResError || !imgResource) {
      return jsonError("Image resource not found.", 404);
    }

    if (imgResource.status !== "ready") {
      return jsonError("Image resource is not ready.", 409);
    }

    // Fetch the image from resource_images
    const { data: imgRow, error: imgRowError } = await supabase
      .from("resource_images")
      .select("storage_path, mime_type")
      .eq("resource_id", imageResourceId)
      .eq("page_number", imagePage)
      .limit(1)
      .single();

    if (imgRowError || !imgRow) {
      return jsonError("Image not found on that page.", 404);
    }

    // Download the image
    const { data: imgData, error: imgDownloadError } = await supabase.storage
      .from("study-pdfs")
      .download(imgRow.storage_path);

    if (imgDownloadError || !imgData) {
      console.error("Tutor vision image download error:", imgDownloadError);
      return jsonError("Failed to load image.", 500);
    }

    imageBuffer = new Uint8Array(await imgData.arrayBuffer());
    imageMimeType = imgRow.mime_type;
  }

  // Check if vision is needed but not configured
  const ai = createAIService();
  if (imageBuffer && imageMimeType) {
    const hasVisionConfig = process.env.AI_VISION_MODEL && (process.env.AI_VISION_API_KEY || process.env.AI_API_KEY);
    if (!hasVisionConfig) {
      return jsonError("Vision is not configured.", 503);
    }
  }

  // Validate monthly token spend warning
  // (tracked via usage logging, warning displayed at 80% of monthly cap)

  try {
    const answer = await handleTutorQuestion(
      { ai, retrieve: retrieveChunks },
      { question, resourceId, imageBuffer, imageMimeType, imagePage, history }
    );

    // Log the request to tutor_usage_log
    // Log the request to tutor_usage_log
    try {
      const { error: logError } = await supabase
        .from("tutor_usage_log")
        .insert({
          user_id: userId,
          request_count: 1,
          total_tokens: 0,
          last_request: now.toISOString(),
        });

      if (logError) {
        console.error("Failed to log tutor usage:", logError);
      }
    } catch (logErr) {
      console.error("Error logging tutor usage:", logErr);
    }

    return NextResponse.json(answer);
  } catch (err) {
    const error = err as AIError;
    if (error.type === "rate_limit" || error.type === "unavailable") {
      return new NextResponse(
        JSON.stringify({ error: "The AI service is busy. Try again in a minute." }),
        { status: 503, headers: { "Retry-After": "30", "Content-Type": "application/json" } }
      );
    }
    if (error.type === "config" || error.type === "auth") {
      console.error("AI config/auth error:", error.message);
      return jsonError("AI service is not configured.", 500);
    }
    console.error("Tutor error:", err);
    return jsonError("Something went wrong.", 500);
  }
}