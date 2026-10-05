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

  const { question, resourceId, history = [] } = parsed.data;

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

  const ai = createAIService();

  try {
    const answer = await handleTutorQuestion(
      { ai, retrieve: retrieveChunks },
      { question, resourceId, history }
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