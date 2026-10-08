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
 * POST /api/practice/[sessionId]/end
 * End a practice session and get the handoff and session details
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
    const result = await studySessionService.endSession(userId, sessionId);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    if (error instanceof Error && error.message === "Session not found or access denied") {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    if (error instanceof Error && error.message === "Session is not active") {
      return NextResponse.json({ error: "Session is not active" }, { status: 400 });
    }
    console.error("Failed to end practice session:", error);
    return NextResponse.json(
      { error: "Failed to end practice session" },
      { status: 500 }
    );
  }
}