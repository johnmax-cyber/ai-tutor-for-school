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
 * GET /api/mistakes
 * List user's mistakes, optionally filtered by topicId
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();

  if (authError || !auth?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = auth.user.id;
  const { searchParams } = new URL(request.url);
  const topicId = searchParams.get("topicId");

  try {
    const mistakes = topicId
      ? await studySessionService.listMistakes(userId, topicId)
      : await studySessionService.listMistakes(userId);
    return NextResponse.json({ mistakes });
  } catch (error) {
    console.error("Failed to list mistakes:", error);
    return NextResponse.json(
      { error: "Failed to load mistakes" },
      { status: 500 }
    );
  }
}
