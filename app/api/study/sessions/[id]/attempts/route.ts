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
* POST /api/study/sessions/[id]/attempts
* Submit an attempt for a question in a study session
*/
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  
  if (authError || !auth?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = auth.user.id;
  const { id } = await params;

  try {
    const body = await request.json();
    const { questionId, answer } = z.object({
      questionId: z.string(),
      answer: z.string().max(2000)
    }).parse(body);

    const result = await studySessionService.submitAttempt(userId, id, questionId, answer);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    if (error.message === "Session not found or access denied") {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    if (error.message === "Question not found or not in session") {
      return NextResponse.json({ error: "Invalid question" }, { status: 400 });
    }
    console.error("Failed to submit attempt:", error);
    return NextResponse.json(
      { error: "Failed to process attempt" },
      { status: 500 }
    );
  }
}