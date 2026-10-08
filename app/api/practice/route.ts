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
 * POST /api/practice
 * Create a new practice session (wrapper around study session creation)
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
    if (error instanceof Error && error.message === "Topic not found or access denied") {
      return NextResponse.json({ error: "Topic not found" }, { status: 404 });
    }
    if (error instanceof Error && error.message === "Topic has no processed documents") {
      return NextResponse.json({ error: "Topic has no processed documents" }, { status: 422 });
    }
    console.error("Failed to create practice session:", error);
    return NextResponse.json(
      { error: "Failed to create practice session" },
      { status: 500 }
    );
  }
}