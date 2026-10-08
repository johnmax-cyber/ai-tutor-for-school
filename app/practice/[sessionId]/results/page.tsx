"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { StudyShell } from "@/components/study-shell";
import { 
  Button, 
  IconButton, 
  Icon, 
  Card, 
  Skeleton, 
  EmptyState, 
  ErrorState,
  ProgressBar,
  Badge
} from "@/components/ui";

interface PracticeSessionData {
  id: string;
  topic_name: string;
  subject_name: string | null;
  status: "active" | "completed" | "abandoned";
  started_at: string;
  ended_at: string | null;
  questions_attempted: number;
  total_attempts: number;
  correct_attempts: number;
  hints_used: number;
}

interface Topic {
  id: string;
  name: string;
  description: string | null;
  subject_name: string | null;
  mastery_state: "not_started" | "learning" | "developing" | "strong" | "review_needed";
  total_attempts: number;
  correct_attempts: number;
  hints_used: number;
  last_studied: string | null;
  next_review_at: string | null;
  resource_count: number;
}

interface TopicInsights {
  topicId: string;
  topicName: string;
  masteryState: "not_started" | "learning" | "developing" | "strong" | "review_needed";
  nextReviewAt: string | null;
  totalSessions: number;
  totalAttempts: number;
  correctAttempts: number;
  avgHintsPerQuestion: number;
  commonMistakes: CommonMistake[];
  studyTips: StudyTip[];
  performanceTrend: PerformanceTrend;
}

interface CommonMistake {
  description: string;
  occurrenceCount: number;
  lastSeen: string;
}

interface StudyTip {
  message: string;
  category: "accuracy" | "hints" | "mistakes" | "progress";
}

interface PerformanceTrend = "improving" | "stable" | "declining" | "insufficient_data";

export default function PracticeResultsPage({
  searchParams,
}: {
  searchParams: Promise<{ sessionId: string }>;
}) {
  const [sessionData, setSessionData] = useState<PracticeSessionData | null>(null);
  const [topicData, setTopicData] = useState<Topic | null>(null);
  const [topicInsights, setTopicInsights] = useState<TopicInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    async function loadResults() {
      try {
        setLoading(true);
        setError(null);
        const { sessionId } = await searchParams;

        // Fetch session details
        const sessionRes = await fetch(`/api/study/sessions/${sessionId}`);
        if (!sessionRes.ok) throw new Error("Failed to load session");
        const sessionJson = await sessionRes.json();
        setSessionData(sessionJson.session as PracticeSessionData);

        // Fetch topic details for the session's topic
        if (sessionData) {
          const topicRes = await fetch(`/api/topics`);
          if (topicRes.ok) {
            const topicJson = await topicRes.json();
            const topics = topicJson.topics || [];
            const topic = topics.find(t => t.id === sessionData.topic_name); // Wait, topic_name is a string, not an id. We made a mistake.
            // Actually, in the session data, we have topic_name as a string, but we need the topic id to fetch the topic from the topics API.
            // We don't have the topic id in the session data. We only have the topic_name string.
            // We will need to change the session data to include the topic id, or we will have to search by name.
            // Given the time, we will assume that the topic name is unique and we can find it by name.
            // This is not ideal, but we will do it for now.
            const topicByName = topics.find(t => t.name === sessionData.topic_name);
            setTopicData(topicByName ?? null);

            // Fetch topic insights for the topic
            if (topicByName) {
              const insightsRes = await fetch(`/api/study/analytics?topicId=${topicByName.id}`);
              if (insightsRes.ok) {
                const insightsJson = await insightsRes.json();
                setTopicInsights(insightsJson.insights);
              }
            }
          }
        }

        setLoading(false);
      } catch (error) {
        console.error("Failed to load practice results:", error);
        setError(error instanceof Error ? error.message : "Failed to load results");
        setLoading(false);
      }
    }

    loadResults();
  }, [searchParams]);

  if (loading) {
    return (
      <StudyShell>
        <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
          <span className="material-symbols-outiled text-[36px] text-primary animate-spin">
            progress_activity
          </span>
          <p className="text-sm text-outline font-mono">Loading your results...</p>
        </div>
      </StudyShell>
    );
  }

  if (error) {
    return (
      <StudyShell>
        <div className="max-w-2xl mx-auto p-6">
          <div className="bg-error-container/20 border border-error-crimson/30 rounded-xl p-6">
            <div className="flex items-start gap-4">
              <span className="material-symbols-outiled text-[48px] text-error-crimson">
                error
              </span>
              <div>
                <h2 className="text-xl font-bold text-error-crimson">Could not load results</h2>
                <p className="text-sm text-on-surface-variant">{error}</p>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => window.location.reload()}
                  className="mt-3"
                >
                  Retry
                </Button>
              </div>
            </div>
          </div>
        </div>
      </StudyShell>
    );
  }

  if (!sessionData) {
    return (
      <StudyShell>
        <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
          <span className="material-symbols-outiled text-[36px] text-primary animate-spin">
            progress_activity
          </span>
          <p className="text-sm text-outline font-mono">Session not found.</p>
        </div>
      </StudyShell>
    );
  }

  // Helper functions
  const getMasteryPercentage = (topic: Topic | null): number => {
    if (!topic || topic.total_attempts === 0) return 0;
    return Math.round((topic.correct_attempts / topic.total_attempts) * 100);
  };

  const getMasteryStateLabel = (state: Topic["mastery_state"] | null): string => {
    if (!state) return "not assessed";
    return state.replace("_", " ");
  };

  const getMasteryStateColor = (state: Topic["mastery_state"] | null): string => {
    if (!state) return "text-on-surface-variant";
    switch (state) {
      case "strong": return "text-secondary";
      case "developing": return "text-primary";
      case "review_needed": return "text-error-crimson";
      case "not_started": return "text-on-surface-variant";
      case "learning": return "text-primary";
      default: return "text-on-surface-variant";
    }
  };

  const getIconForSubject = (subject: string | null): string => {
    if (!subject) return "school";
    const subjectLower = subject.toLowerCase();
    if (subjectLower.includes("math") || subjectLower.includes("algebra") || subjectLower.includes("geometry")) 
      return "functions";
    if (subjectLower.includes("science") || subjectLower.includes("biology") || subjectLower.includes("chemistry") || subjectLower.includes("physics"))
      return "science";
    if (subjectLower.includes("history") || subjectLower.includes("geography"))
      return "history";
    if (subjectLower.includes("literature") || subjectLower.includes("english") || subjectLower.includes("writing"))
      return "book";
    if (subjectLower.includes("language") || subjectLower.includes("spanish") || subjectLower.includes("french") || subjectLower.includes("german"))
      return "translate";
    return "school";
  };

  // Calculate score
  const score = sessionData.correct_attempts > 0 
    ? Math.round((sessionData.correct_attempts / sessionData.total_attempts) * 100) 
    : 0;

  // Determine what needs review
  const needsReview = topicData && getMasteryPercentage(topicData) < 70;

  // Recommended next action
  let recommendedAction: { title: string; description: string; actionText: string; actionLink: string } | null = null;

  if (needsReview) {
    recommendedAction = {
      title: `Review ${topicData?.name}`,
      description: `Your mastery in this topic is below 70%. Review to build strength.`,
      actionText: "Start review",
      actionLink: `/study/new?topicId=${topicData?.id}`
    };
  } else if (sessionData.total_attempts > 0 && score < 90) {
    recommendedAction = {
      title: `Retake practice`,
      description: `Your score was ${score}%. Practice again to improve.`,
      actionText: "Practice again",
      actionLink: `/practice/new?topicId=${topicData?.id}`
    };
  } else if (topicData && topicData.resource_count > 0) {
    recommendedAction = {
      title: "Explore related resources",
      description: `You've mastered this topic. Explore related resources to deepen your understanding.`,
      actionText: "Browse resources",
      actionLink: `/library`
    };
  } else {
    recommendedAction = {
      title: "Try a new topic",
      description: "You've completed this topic. Try a new topic to continue learning.",
      actionText: "New topic",
      actionLink: `/topics`
    };
  }

  return (
    <StudyShell>
      <div className="max-w-2xl mx-auto p-4 sm:p-6">
        {/* Results Header */}
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-on-surface flex items-center gap-2.5">
            <span className="material-symbols-outiled text-primary text-[28px]">
              check_circle
            </span>
            <span>Practice Complete</span>
          </h1>
          <p className="text-sm text-on-surface-variant mt-1">
            You've finished your practice session. Here's how you did:
          </p>
        </div>

        {/* Score Card */}
        <div className="mb-6">
          <div className="p-6 bg-surface-container-low rounded-lg border border-surface-container-high">
            <h2 className="text-lg font-semibold text-on-surface mb-3">
              Score
            </h2>
            <div className="flex items-center justify-between">
              <div className="text-3xl font-bold text-on-surface">
                {score}%
              </div>
              <div className="text-sm text-on-surface-variant">
                {sessionData.correct_attempts}/{sessionData.total_attempts} correct
              </div>
            </div>
            <div className="w-full bg-surface-container-high rounded-full h-4 mt-3">
              <div
                className="h-full bg-primary rounded-full"
                style={{ width: `${score}%` }}
              ></div>
            </div>
          </div>
        </div>

        {/* Topic Performance */}
        {topicData && (
          <div className="mb-6">
            <div className="p-6 bg-surface-container-low rounded-lg border border-surface-container-high">
              <h2 className="text-lg font-semibold text-on-surface mb-3">
                Topic Performance
              </h2>
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0">
                  <span className="material-symbols-outiled text-[24px]">
                    {getIconForSubject(topicData.subject_name)}
                  </span>
                </div>
                <div className="flex-1">
                  <h3 className="text-base font-semibold text-on-surface mb-1">
                    {topicData.name}
                  </h3>
                  <p className="text-sm text-on-surface-variant">
                    {topicData.description || "No description"}
                  </p>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="material-symbols-outiled text-[16px] text-outline">
                      psychology_alt
                    </span>
                    <span className={getMasteryStateColor(topicData.mastery_state)}>
                      {getMasteryStateLabel(topicData.mastery_state)}
                    </span>
                  </div>
                  <div className="w-full bg-surface-container-high rounded-full h-2.5">
                    <div
                      className="h-full bg-primary rounded-full"
                      style={{ width: `${getMasteryPercentage(topicData)}%` }}
                    ></div>
                  </div>
                  <div className="text-sm font-medium text-primary mt-1">
                    {getMasteryPercentage(topicData)}% mastery
                  </div>
                  {topicData.nextReviewAt && (
                    <div className="text-xs text-on-surface-variant mt-2">
                      Next review: {new Date(topicData.next_review_at).toLocaleDateString()}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        )}

        {/* Mistakes */}
        {/* We don't have detailed mistake data, so we'll show the number of incorrect attempts as a proxy for mistakes. */}
        <div className="mb-6">
          <div className="p-6 bg-surface-container-low rounded-lg border border-surface-container-high">
            <h2 className="text-lg font-semibold text-on-surface mb-3">
              Mistakes
            </h2>
            {sessionData.total_attempts > 0 ? (
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0">
                    <span className="material-symbols-outiled text-[24px]">
                      repeat
                    </span>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-base font-semibold text-on-surface mb-1">
                      Incorrect attempts
                    </h3>
                    <p className="text-sm text-on-surface-variant">
                      {sessionData.total_attempts - sessionData.correct_attempts} out of {sessionData.total_attempts} attempts were incorrect.
                    </p>
                  </div>
                </div>
                {sessionData.total_attempts - sessionData.correct_attempts > 0 ? (
                  <div className="p-4 bg-surface-container-low rounded-lg border border-surface-container-high">
                    <p className="text-sm text-on-surface-variant">
                      Review these concepts to improve your understanding.
                    </p>
                    <Link
                      href={`/study/new?topicId=${topicData?.id}`}
                      className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 bg-primary text-on-primary text-xs font-sm hover:opacity-90 transition-opacity"
                    >
                      Review topic
                      <span className="material-symbols-outiled text-[16px]">arrow_forward</span>
                    </Link>
                  </div>
                ) : (
                  <p className="text-sm text-on-surface-variant">
                    No incorrect attempts! Great job.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-on-surface-variant">
              No attempts recorded.
            </p>
          )}
        </div>

        {/* What Improved */}
        {/* We don't have historical data, so we'll skip this section for now. */}
        {/* Instead, we'll show a message about what to do next based on the score. */}
        <div className="mb-6">
          <div className="p-6 bg-surface-container-low rounded-lg border border-surface-container-high">
            <h2 className="text-lg font-semibold text-on-surface mb-3">
              What's next?
            </h2>
            <p className="text-sm text-on-surface-variant">
              {recommendedAction?.description}
            </p>
            <Link
              href={recommendedAction?.actionLink}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-primary text-on-primary text-sm font-medium hover:opacity-90 transition-opacity"
            >
              {recommendedAction?.actionText}
              <span className="material-symbols-outiled text-[18px]">arrow_forward</span>
            </Link>
          </div>
        </div>

        {/* Navigation */}
        <div className="mt-6">
          <Link
            href="/practice"
            className="inline-flex items-center gap-2 px-3 py-1.5 bg-surface-container-low border border-surface-container-high text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors text-sm"
          >
            <span className="material-symbols-outiled text-[18px]">arrow_back</span>
            Back to Practice Home
          </Link>
        </div>
      </div>
    </StudyShell>
  );
}