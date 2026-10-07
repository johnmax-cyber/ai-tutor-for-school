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
 * GET /api/study/analytics
 * Get analytics for a topic or session
 * Query params:
 *   - topicId (uuid, optional): topic to analyze
 *   - sessionId (uuid, optional): session to analyze
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();

  if (authError || !auth?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = auth.user.id;
  const url = new URL(request.url);

  const { topicId, sessionId } = z.object({
    topicId: z.string().uuid().optional(),
    sessionId: z.string().uuid().optional(),
  }).parse({
    topicId: url.searchParams.get("topicId") || undefined,
    sessionId: url.searchParams.get("sessionId") || undefined,
  });

  try {
    if (topicId) {
      const insights = await studySessionService.getTopicInsights(userId, topicId);
      return NextResponse.json({ insights });
    }

    if (sessionId) {
      const analytics = await studySessionService.getSessionAnalytics(userId, sessionId);
      return NextResponse.json({ analytics });
    }

    return NextResponse.json({ error: "topicId or sessionId required" }, { status: 400 });
  } catch (error) {
    console.error("Failed to load analytics:", error);
    if (error instanceof Error && error.message === "Topic not found or access denied") {
      return NextResponse.json({ error: "Topic not found" }, { status: 404 });
    }
    if (error instanceof Error && error.message === "Session not found or access denied") {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    return NextResponse.json(
      { error: "Failed to load analytics" },
      { status: 500 }
    );
  }
}
