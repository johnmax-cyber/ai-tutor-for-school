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
 * POST /api/practice/[sessionId]/attempt
 * Submit an attempt for a question in a practice session
 * Returns the attempt result and the next question
 */
export async function POST(
  request: Request,
  { params }: { params: { sessionId: string } }
) {
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  
  if (authError || !auth?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = auth.user.id;
  const sessionId = params.sessionId;

  try {
    const body = await request.json();
    const { questionId, answer } = z.object({
      questionId: z.string(),
      answer: z.string()
    }).parse(body);

    const result = await studySessionService.submitAttempt(
      userId,
      sessionId,
      questionId,
      answer
    );

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    if (error instanceof Error && error.message === "Session not found or access denied") {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    if (error instanceof Error && error.message === "Question not found or not in session") {
      return NextResponse.json({ error: "Question not found" }, { status: 404 });
    }
    console.error("Failed to submit attempt:", error);
    return NextResponse.json(
      { error: "Failed to submit attempt" },
      { status: 500 }
    );
  }
}