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

export async function POST(request: Request) {
  const supabase = await createClient();

  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth?.user) {
    return jsonError("Unauthorized.", 401);
  }

  const userId = auth.user.id;

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
  let imageBuffer: Uint8Array | null = null;
  let imageMimeType: string | null = null;

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

  const ai = createAIService();

  // Check if vision is needed but not configured
  if (imageBuffer && imageMimeType) {
    const hasVisionConfig = process.env.AI_VISION_MODEL && (process.env.AI_VISION_API_KEY || process.env.AI_API_KEY);
    if (!hasVisionConfig) {
      return jsonError("Vision is not configured.", 503);
    }
  }

  try {
       const answer = await handleTutorQuestion(
       { ai, retrieve: retrieveChunks },
       { question, resourceId, imageBuffer, imageMimeType, imagePage, history }
     );
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