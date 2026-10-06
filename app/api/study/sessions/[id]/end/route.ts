import { NextResponse } from "next/server";
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
 * POST /api/study/sessions/[id]/end
 * End a study session and generate handoff
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
    const result = await studySessionService.endSession(userId, id);
    return NextResponse.json(result);
  } catch (error) {
    if (error.message === "Session not found or access denied") {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    if (error.message === "Session is not active") {
      return NextResponse.json({ error: "Session is not active" }, { status: 400 });
    }
    console.error("Failed to end study session:", error);
    return NextResponse.json(
      { error: "Failed to end session" },
      { status: 500 }
    );
  }
}