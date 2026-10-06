import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { StudySessionService } from "@/lib/study/service";
import { createAIService } from "@/lib/ai/client";
import { retrieveChunksForTopic } from "@/lib/tutor/retrieve";

export const dynamic = "force-dynamic";

const studySessionService = new StudySessionService({
  ai: createAIService(),
  retrieve: retrieveChunksForTopic
});

/**
 * GET /api/study/sessions
 * List user's study sessions
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  
  if (authError || !auth?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = auth.user.id;

  try {
    const sessions = await studySessionService.listSessions(userId);
    return NextResponse.json({ sessions });
  } catch (error) {
    console.error("Failed to list study sessions:", error);
    return NextResponse.json(
      { error: "Failed to load study sessions" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/study/sessions
 * Create a new study session
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  
  if (authError || !auth?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = auth.user.id;

  try {
    const body = await request.json();
    const { topicId } = z.object({ topicId: z.string() }).parse(body);

    const result = await studySessionService.createSession(userId, topicId);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    if (error.message === "Topic not found or access denied") {
      return NextResponse.json({ error: "Topic not found" }, { status: 404 });
    }
    if (error.message === "Topic has no processed documents") {
      return NextResponse.json({ error: "Topic has no processed documents" }, { status: 422 });
    }
    console.error("Failed to create study session:", error);
    return NextResponse.json(
      { error: "Failed to create study session" },
      { status: 500 }
    );
  }
}