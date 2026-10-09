"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { StudyShell } from "@/components/study-shell";
import { Button, EmptyState } from "@/components/ui";

interface StudySession {
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

interface PracticeData {
  user: { email?: string; name?: string } | null;
  activeSession: StudySession | null;
  recentSessions: StudySession[];
  topics: Topic[];
  recommendations: {
    continue: StudySession | null;
    recommended: { topic: Topic | null; reason: string } | null;
    subjects: { name: string; topicCount: number }[];
    concepts: { topic: Topic; reason: string }[];
    recentPractice: StudySession[];
    reviewMistakes: { topic: Topic; mistakeCount: number }[];
  };
  loading: boolean;
  error: string | null;
}

export default function PracticePage() {
  const [data, setData] = useState<PracticeData>({
    user: null,
    activeSession: null,
    recentSessions: [],
    topics: [],
    recommendations: {
      continue: null,
      recommended: { topic: null, reason: "" },
      subjects: [],
      concepts: [],
      recentPractice: [],
      reviewMistakes: []
    },
    loading: true,
    error: null
  });

  useEffect(() => {
    async function loadPracticeData() {
      try {
        setData(prev => ({ ...prev, loading: true, error: null }));
        
        const supabase = (await import("@/lib/supabase/client")).createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
          const { redirect } = await import("next/navigation");
          redirect("/login");
          return;
        }

        const userData = {
          email: user.email ?? undefined,
          name: user.user_metadata?.full_name ?? user.user_metadata?.name ?? undefined,
        };

        // Fetch user's active study session (we'll consider any active session as a practice session candidate)
        const sessionsRes = await fetch(`/api/study/sessions`);
        let activeSession: StudySession | null = null;
        let recentSessions: StudySession[] = [];
        if (sessionsRes.ok) {
          const sessionsData = await sessionsRes.json();
          const sessions = (sessionsData.sessions || []) as StudySession[];
          
          activeSession = sessions.find(s => s.status === "active") ?? null;
          recentSessions = sessions
            .filter(s => s.status === "completed")
            .slice(0, 5)
            .map(s => ({ ...s, formattedDate: new Date(s.started_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) }));
        }

        // Fetch topics
        const topicsRes = await fetch(`/api/topics`);
        let topics: Topic[] = [];
        if (topicsRes.ok) {
          const topicsData = await topicsRes.json();
          topics = (topicsData.topics || []) as Topic[];
        } else {
          throw new Error("Failed to load topics");
        }

        // Generate recommendations
        const recommendations = generateRecommendations(
          activeSession,
          recentSessions,
          topics
        );

        setData({
          user: userData,
          activeSession,
          recentSessions,
          topics,
          recommendations,
          loading: false,
          error: null
        });
      } catch (error) {
        console.error("Failed to load practice data:", error);
        setData(prev => ({
          ...prev,
          loading: false,
          error: "Failed to load practice data. Please try again."
        }));
      }
    }

    loadPracticeData();
  }, []);

  if (data.loading) {
    return (
      <StudyShell>
        <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
          <span className="material-symbols-outlined text-[36px] text-primary animate-spin">
            progress_activity
          </span>
          <p className="text-sm text-outline font-mono">Loading your practice dashboard...</p>
        </div>
      </StudyShell>
    );
  }

  if (data.error) {
    return (
      <StudyShell>
        <div className="max-w-2xl mx-auto p-6">
          <div className="bg-error-container/20 border border-error-crimson/30 rounded-xl p-6">
            <div className="flex items-start gap-4">
              <span className="material-symbols-outlined text-[48px] text-error-crimson">
                error
              </span>
              <div>
                <h2 className="text-xl font-bold text-error-crimson">Could not load practice</h2>
                <p className="text-sm text-on-surface-variant">{data.error}</p>
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

  // Helper function to get icon for subject
  function getIconForSubject(subject: string | null): string {
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
  }

  // Helper function to format date
  function formatDate(dateString: string | null | undefined): string {
    if (!dateString) return "Not yet";
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  return (
    <StudyShell>
      <div className="max-w-4xl mx-auto p-4 sm:p-6">
        {/* Practice Home Header */}
        <section className="mb-6">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0">
              <span className="material-symbols-outlined text-[36px] text-primary">
                psyche
              </span>
            </div>
            <div>
              <p className="text-sm text-on-surface-variant">
                Good {getTimeOfGreeting()}, 
                {data.user?.name?.split(" ")[0] ?? "there"}!
              </p>
              <p className="text-base font-semibold text-on-surface">
                Ready to practice?
              </p>
            </div>
          </div>
        </section>

        {/* Continue Practice Section */}
        <section className="mb-6">
          {data.activeSession ? (
            <div className="card-container">
              <div className="flex items-start gap-4 p-6 bg-surface-container-low rounded-xl border border-surface-container-high">
                <div className="flex-shrink-0">
                  <span className="material-symbols-outlined text-[48px]">
                    {getIconForSubject(data.activeSession.subject_name)}
                  </span>
                </div>
                <div className="flex-1">
                  <h2 className="text-lg font-semibold text-on-surface mb-2">
                    {data.activeSession.subject_name || "Your Practice"}
                  </h2>
                  <p className="text-base text-on-surface-variant mb-2">
                    {data.activeSession.topic_name || "Continue your practice"}
                  </p>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="flex items-center gap-2 text-xs font-mono">
                      <span className="material-symbols-outlined text-[16px] text-outline">
                        timer
                      </span>
                      <span>Last practiced: {formatDate(data.activeSession.started_at)}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs font-mono">
                      <span className="material-symbols-outlined text-[16px] text-outline">
                        psychology_alt
                      </span>
                      <span>{data.activeSession.status === "active" ? "In Progress" : "Completed"}</span>
                    </div>
                  </div>
                  <div className="w-full bg-surface-container-high rounded-full h-2.5 mb-3">
                    <div
                      className="h-full bg-primary rounded-full"
                      style={{ width: `${data.activeSession.correct_attempts > 0 ? Math.round((data.activeSession.correct_attempts / data.activeSession.total_attempts) * 100) : 0}%` }}
                    ></div>
                  </div>
                  <div className="text-sm font-medium text-primary">
                    {data.activeSession.correct_attempts > 0 ? Math.round((data.activeSession.correct_attempts / data.activeSession.total_attempts) * 100) : 0}% mastery
                  </div>
                  <Link
                    href={`/practice/${data.activeSession.id}`}
                    className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-primary text-on-primary text-sm font-semibold hover:opacity-90 transition-opacity"
                  >
                    Continue practice →
                    <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                  </Link>
                </div>
              </div>
            </div>
          ) : (
            <EmptyState
              title="No active practice"
              description="Start a new practice session to begin learning."
              icon="psyche"
              action={<Link href="/practice/new" className="text-primary hover:underline">Start practice</Link>}
            />
          )}
        </section>

        {/* Recommended Practice Section */}
        <section className="mb-6">
          <h2 className="text-xl font-bold text-on-surface mb-4">
            Recommended for you
          </h2>
          {data.recommendations.recommended?.topic ? (
            <div className="p-6 bg-surface-container-low rounded-lg border border-surface-container-high">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0">
                  <span className="material-symbols-outiled text-[36px] text-primary">
                    {getIconForSubject(data.recommendations.recommended.topic?.subject_name)}
                  </span>
                </div>
                <div className="flex-1">
                  <h2 className="text-lg font-semibold text-on-surface mb-2">
                    {data.recommendations.recommended.topic?.name}
                  </h2>
                  <p className="text-sm text-on-surface-variant mb-2">
                    {data.recommendations.recommended.reason}
                  </p>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="flex items-center gap-2 text-xs font-mono">
                      <span className="material-symbols-outlined text-[16px] text-outline">
                        timer
                      </span>
                      <span>Estimated time: ~8 minutes</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs font-mono">
                      <span className="material-symbols-outlined text-[16px] text-outline">
                        folder
                      </span>
                      <span>{data.recommendations.recommended.topic?.resource_count} resources</span>
                    </div>
                  </div>
                  <Link
                    href={`/practice/new?topicId=${data.recommendations.recommended.topic?.id}`}
                    className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-primary text-on-primary text-sm font-medium hover:opacity-90 transition-opacity"
                  >
                    Start →
                    <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                  </Link>
                </div>
              </div>
            </div>
          ) : (
            <EmptyState
              title="No recommendations yet"
              description="Start practicing to get personalized suggestions."
              icon="psyche"
              action={<Link href="/practice/new" className="text-primary hover:underline">Start practice</Link>}
            />
          )}
        </section>

        {/* Subject Selection Section */}
        <section className="mb-6">
          <h2 className="text-xl font-bold text-on-surface mb-4">
            Practice by subject
          </h2>
          {data.recommendations.subjects.length > 0 ? (
            <div className="space-y-3">
              {data.recommendations.subjects.map((subject, index) => (
                <div key={index} className="p-4 bg-surface-container-low rounded-lg border border-surface-container-high">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0">
                      <span className="material-symbols-outiled text-[24px] text-primary">
                        school
                      </span>
                    </div>
                    <div className="flex-1">
                      <h3 className="text-base font-semibold text-on-surface mb-1">
                        {subject.name}
                      </h3>
                      <p className="text-sm text-on-surface-variant">
                        {subject.topicCount} topics
                      </p>
                    </div>
                  </div>
                  <Link
                    href={`/practice/new?subject=${encodeURIComponent(subject.name)}`}
                    className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 bg-primary text-on-primary text-xs font-sm hover:opacity-90 transition-opacity"
                  >
                    Practice this subject
                    <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                  </Link>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No subjects yet"
              description="Create topics and assign them to subjects to see subject-based practice."
              icon="category"
              action={<Link href="/topics" className="text-primary hover:underline">Create topic</Link>}
            />
          )}
        </section>

        {/* Concept Selection Section */}
        <section className="mb-6">
          <h2 className="text-xl font-bold text-on-surface mb-4">
            Practice by concept
          </h2>
          {data.recommendations.concepts.length > 0 ? (
            <div className="space-y-3">
              {data.recommendations.concepts.map((concept, index) => (
                <div key={index} className="p-4 bg-surface-container-low rounded-lg border border-surface-container-high">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0">
                      <span className="material-symbols-outiled text-[24px] text-primary">
                        {getIconForSubject(concept.topic?.subject_name)}
                      </span>
                    </div>
                    <div className="flex-1">
                      <h3 className="text-base font-semibold text-on-surface mb-1">
                        {concept.topic?.name}
                      </h3>
                      <p className="text-sm text-on-surface-variant mb-2">
                        {concept.reason}
                      </p>
                    </div>
                  </div>
                  <Link
                    href={`/practice/new?topicId=${concept.topic?.id}`}
                    className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 bg-primary text-on-primary text-xs font-sm hover:opacity-90 transition-opacity"
                  >
                    Practice this concept
                    <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                  </Link>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No concepts yet"
              description="Create topics to see concept-based practice."
              icon="psychology_alt"
              action={<Link href="/topics" className="text-primary hover:underline">Create topic</Link>}
            />
          )}
        </section>

        {/* Recent Practice Section */}
        <section className="mb-6">
          <h2 className="text-xl font-bold text-on-surface mb-4">
            Recent practice
          </h2>
          {data.recommendations.recentPractice.length > 0 ? (
            <div className="space-y-3">
              {data.recommendations.recentPractice.map((session, index) => (
                <div key={index} className="p-3 bg-surface-container-low rounded-lg border border-surface-container-high">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0">
                      <span className="material-symbols-outiled text-[24px] text-primary">
                        {session.status === "completed" ? "timer" : "psyche"}
                      </span>
                    </div>
                    <div className="flex-1">
                      <h3 className="text-base font-semibold text-on-surface mb-1">
                        {session.topic_name}
                      </h3>
                      <p className="text-sm text-on-surface-variant mb-2">
                        {session.subject_name || "No subject"}
                      </p>
                      <p className="text-xs text-on-surface-variant">
                        {new Date(session.started_at).toLocaleDateString()} • {session.questions_attempted} questions • {session.correct_attempts > 0 ? Math.round((session.correct_attempts / session.total_attempts) * 100) : 0}% accuracy
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No recent practice"
              description="Your practice sessions will appear here as you learn."
              icon="history"
              action={<Link href="/practice/new" className="text-primary hover:underline">Start practice</Link>}
            />
          )}
        </section>

        {/* Review Mistakes Section */}
        <section className="mb-6">
          <h2 className="text-xl font-bold text-on-surface mb-4">
            Review mistakes
          </h2>
          {data.recommendations.reviewMistakes.length > 0 ? (
            <div className="space-y-3">
              {data.recommendations.reviewMistakes.map((item, index) => (
                <div key={index} className="p-4 bg-surface-container-low rounded-lg border border-surface-container-high">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0">
                      <span className="material-symbols-outiled text-[24px] text-primary">
                        repeat
                      </span>
                    </div>
                    <div className="flex-1">
                      <h3 className="text-base font-semibold text-on-surface mb-1">
                        {item.topic?.name}
                      </h3>
                      <p className="text-sm text-on-surface-variant mb-2">
                        {item.mistakeCount} recent mistakes
                      </p>
                    </div>
                  </div>
                  <Link
                    href={`/practice/new?topicId=${item.topic?.id}`}
                    className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 bg-primary text-on-primary text-xs font-sm hover:opacity-90 transition-opacity"
                  >
                    Review mistakes
                    <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                  </Link>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No mistakes to review"
              description="Great job! No mistakes need review right now."
              icon="check_circle"
              action={<Link href="/practice/new" className="text-primary hover:underline">Start practice</Link>}
            />
          )}
        </section>
      </div>
    </StudyShell>
  );
}

// Helper functions
function getTimeOfGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

function generateRecommendations(
  activeSession: StudySession | null,
  recentSessions: StudySession[],
  topics: Topic[]
): PracticeData["recommendations"] {
  // Continue practice: active session
  const continuePractice = activeSession;

  // Recommended practice: find a topic with mistakes or low mastery
  let recommendedTopic: Topic | null = null;
  let recommendedReason = "";
  
  // First, look for topics with mistakes (we don't have mistake data here, so we'll use low mastery as proxy)
  const topicsWithLowMastery = topics.filter(topic => 
    topic.total_attempts > 0 && 
    (topic.correct_attempts / topic.total_attempts) < 0.7
  );
  
  if (topicsWithLowMastery.length > 0) {
    recommendedTopic = topicsWithLowMastery[0];
    recommendedReason = "Based on your recent practice, this concept needs reinforcement.";
  } else {
    // If no low mastery topics, recommend a topic with resources but no recent activity
    const staleTopics = topics.filter(topic => 
      topic.resource_count > 0 && 
      (!topic.last_studied || new Date(topic.last_studied).getTime() < Date.now() - 24 * 60 * 60 * 1000)
    );
    if (staleTopics.length > 0) {
      recommendedTopic = staleTopics[0];
      recommendedReason = "You have resources for this topic but haven't practiced recently.";
    } else if (topics.length > 0) {
      // Otherwise, recommend the first topic
      recommendedTopic = topics[0];
      recommendedReason = "Start practicing to build your mastery.";
    }
  }

  // Subject recommendations: group by subject
  const subjectMap: Record<string, { topics: Topic[] }> = {};
  topics.forEach(topic => {
    const subject = topic.subject_name || "No Subject";
    if (!subjectMap[subject]) {
      subjectMap[subject] = { topics: [] };
    }
    subjectMap[subject].topics.push(topic);
  });
  
  const subjects = Object.entries(subjectMap).map(([subject, data]) => ({
    name: subject,
    topicCount: data.topics.length
  }));

  // Concept recommendations: topics that need practice (low mastery or stale)
  const conceptRecommendations = topics
    .filter(topic => 
      (topic.total_attempts > 0 && (topic.correct_attempts / topic.total_attempts) < 0.7) ||
      (topic.resource_count > 0 && (!topic.last_studied || new Date(topic.last_studied).getTime() < Date.now() - 24 * 60 * 60 * 1000))
    )
    .map(topic => ({
      topic,
      reason: (topic.total_attempts > 0 && (topic.correct_attempts / topic.total_attempts) < 0.7)
        ? "Your mastery in this topic is below 70%. Practice to build strength."
        : "You have resources for this topic but haven't practiced recently."
    }));

  // Recent practice: last 5 completed sessions
  const recentPractice = recentSessions.slice(0, 5);

  // Review mistakes: we don't have mistake data here, so we'll use topics with low mastery as proxy for mistakes
  const reviewMistakes = topics
    .filter(topic => topic.total_attempts > 0 && (topic.correct_attempts / topic.total_attempts) < 0.7)
    .map(topic => ({
      topic,
      mistakeCount: topic.total_attempts - topic.correct_attempts // approximate
    }));

  return {
    continue: continuePractice,
    recommended: { topic: recommendedTopic, reason: recommendedReason },
    subjects,
    concepts: conceptRecommendations,
    recentPractice,
    reviewMistakes
  };
}