"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { StudyShell } from "@/components/study-shell";
import { Button, EmptyState } from "@/components/ui";

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

type PerformanceTrend = "improving" | "stable" | "declining" | "insufficient_data";

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

export default function ProgressPage() {
  const [data, setData] = useState<{
    topics: Topic[];
    topicInsightsMap: Record<string, TopicInsights>;
    sessions: StudySession[];
    loading: boolean;
    error: string | null;
  }>({
    topics: [],
    topicInsightsMap: {},
    sessions: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    async function loadProgressData() {
      try {
        setData(prev => ({ ...prev, loading: true, error: null }));

        const topicsRes = await fetch(`/api/topics`);
        let topics: Topic[] = [];
        if (topicsRes.ok) {
          const topicsData = await topicsRes.json();
          topics = (topicsData.topics || []).map((topic: Topic) => ({
            id: topic.id,
            name: topic.name,
            description: topic.description,
            subject_name: topic.subject_name,
            mastery_state: topic.mastery_state,
            total_attempts: topic.total_attempts,
            correct_attempts: topic.correct_attempts,
            hints_used: topic.hints_used,
            last_studied: topic.last_studied,
            next_review_at: topic.next_review_at,
            resource_count: topic.resource_count || 0,
          }));
        } else {
          throw new Error("Failed to load topics");
        }

        const sessionsRes = await fetch(`/api/study/sessions`);
        let sessions: StudySession[] = [];
        if (sessionsRes.ok) {
          const sessionsData = await sessionsRes.json();
          sessions = (sessionsData.sessions || []).map((session: StudySession) => ({
            id: session.id,
            topic_name: session.topic_name,
            subject_name: session.subject_name,
            status: session.status,
            started_at: session.started_at,
            ended_at: session.ended_at,
            questions_attempted: session.questions_attempted,
            total_attempts: session.total_attempts,
            correct_attempts: session.correct_attempts,
            hints_used: session.hints_used,
          }));
        } else {
          throw new Error("Failed to load study sessions");
        }

        const topicIds = topics.map(t => t.id);
        const insightsPromises = topicIds.map(async (topicId) => {
          try {
            const res = await fetch(`/api/study/analytics?topicId=${topicId}`);
            if (!res.ok) {
              return { topicId, insights: null };
            }
            const data = await res.json();
            return { topicId, insights: data.insights };
          } catch (err) {
            console.error(`Failed to load insights for topic ${topicId}:`, err);
            return { topicId, insights: null };
          }
        });

        const insightsResults = await Promise.allSettled(insightsPromises);
        const topicInsightsMap: Record<string, TopicInsights> = {};
        insightsResults.forEach(result => {
          if (result.status === "fulfilled" && result.value.insights) {
            const { topicId, insights } = result.value;
            topicInsightsMap[topicId] = insights;
          }
        });

        setData({
          topics,
          topicInsightsMap,
          sessions,
          loading: false,
          error: null,
        });
      } catch (error) {
        console.error("Failed to load progress data:", error);
        setData(prev => ({
          ...prev,
          loading: false,
          error: "Failed to load progress data. Please try again.",
        }));
      }
    }

    loadProgressData();
  }, []);

  if (data.loading) {
    return (
      <StudyShell>
        <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
          <span className="material-symbols-outlined text-[36px] text-primary animate-spin">
            progress_activity
          </span>
          <p className="text-sm text-outline font-mono">Loading your progress...</p>
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
                <h2 className="text-xl font-bold text-error-crimson">Could not load progress</h2>
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

  const getMasteryPercentage = (topic: Topic): number => {
    if (topic.total_attempts === 0) return 0;
    return Math.round((topic.correct_attempts / topic.total_attempts) * 100);
  };

  const getMasteryStateLabel = (state: Topic["mastery_state"]): string => {
    return state.replace("_", " ");
  };

  const getMasteryStateColor = (state: Topic["mastery_state"]): string => {
    switch (state) {
      case "strong": return "text-secondary";
      case "developing": return "text-primary";
      case "review_needed": return "text-error-crimson";
      case "not_started": return "text-on-surface-variant";
      case "learning": return "text-primary";
      default: return "text-on-surface-variant";
    }
  };

  const totalTopics = data.topics.length;
  const totalResources = data.topics.reduce((sum, topic) => sum + topic.resource_count, 0);
  const totalSessions = data.sessions.length;
  const topicsWithAttempts = data.topics.filter(t => t.total_attempts > 0);
  const averageMastery = topicsWithAttempts.length > 0 
    ? Math.round(topicsWithAttempts.reduce((sum, t) => sum + getMasteryPercentage(t), 0) / topicsWithAttempts.length)
    : 0;

  const subjectMap: Record<string, { topics: Topic[]; totalAttempts: number; correctAttempts: number }> = {};
  data.topics.forEach(topic => {
    const subject = topic.subject_name || "No Subject";
    if (!subjectMap[subject]) {
      subjectMap[subject] = { topics: [], totalAttempts: 0, correctAttempts: 0 };
    }
    subjectMap[subject].topics.push(topic);
    subjectMap[subject].totalAttempts += topic.total_attempts;
    subjectMap[subject].correctAttempts += topic.correct_attempts;
  });

  const subjectMastery = Object.entries(subjectMap).map(([subject, data]) => ({
    subject,
    mastery: data.totalAttempts > 0 ? Math.round((data.correctAttempts / data.totalAttempts) * 100) : 0,
    topicCount: data.topics.length,
  }));

  const needsReviewTopics = data.topics.filter(topic => {
    const insights = data.topicInsightsMap[topic.id];
    const hasMistakes = insights && insights.commonMistakes.some(m => m.occurrenceCount > 0);
    return topic.mastery_state === "review_needed" || hasMistakes;
  });

  const weakTopics = data.topics.filter(topic => {
    const masteryPct = getMasteryPercentage(topic);
    const insights = data.topicInsightsMap[topic.id];
    const hasSignificantMistakes = insights && insights.commonMistakes.some(m => m.occurrenceCount >= 3);
    return masteryPct < 70 && (hasSignificantMistakes || topic.mastery_state === "developing");
  });

  const improvableTopics = data.topics.filter(topic => 
    topic.total_attempts > 0 && 
    getMasteryPercentage(topic) < 90 && 
    topic.mastery_state !== "not_started"
  );

  const recentSessions = data.sessions.slice(0, 5).map(session => ({
    ...session,
    formattedDate: new Date(session.started_at).toLocaleDateString(undefined, { month: 'short', year: 'numeric', day: '2-digit', hour: '2-digit', minute: '2-digit' }),
    accuracy: session.total_attempts > 0 ? Math.round((session.correct_attempts / session.total_attempts) * 100) : 0,
  }));

  let recommendedAction: { title: string; description: string; actionText: string; actionLink: string } | null = null;

  if (needsReviewTopics.length > 0) {
    const topic = needsReviewTopics[0];
    recommendedAction = {
      title: `Review ${topic.name}`,
      description: `This topic needs your attention based on recent performance or mistakes.`,
      actionText: "Start review",
      actionLink: `/study/new?topicId=${topic.id}`,
    };
  } else if (improvableTopics.length > 0) {
    const topic = improvableTopics[0];
    recommendedAction = {
      title: `Improve ${topic.name}`,
      description: `Your mastery in this topic is below 90%. Practice to build strength.`,
      actionText: "Start practice",
      actionLink: `/study/new?topicId=${topic.id}`,
    };
  } else if (data.topics.some(topic => topic.resource_count > 0)) {
    recommendedAction = {
      title: "Start a study session",
      description: "You have resources ready to study. Begin a session to build mastery.",
      actionText: "Start session",
      actionLink: `/study/new`,
    };
  } else if (data.topics.length === 0) {
    recommendedAction = {
      title: "Create your first topic",
      description: "To begin tracking your progress, create a topic for your studies.",
      actionText: "Create topic",
      actionLink: `/topics`,
    };
  } else {
    if (totalResources === 0) {
      recommendedAction = {
        title: "Add your first resource",
        description: "Upload a study resource to begin learning with the AI Tutor.",
        actionText: "Upload resource",
        actionLink: `/library`,
      };
    } else {
      const topic = data.topics[0];
      recommendedAction = {
        title: `Review ${topic.name}`,
        description: "Start by reviewing your first topic to reinforce learning.",
        actionText: "Start review",
        actionLink: `/study/new?topicId=${topic.id}`,
      };
    }
  }

  return (
    <StudyShell>
      <div className="space-y-8">
        <section className="mb-8">
          <h2 className="text-xl font-bold text-on-surface mb-4">
            Learning Overview
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="p-4 bg-surface-container-low rounded-lg border border-surface-container-high">
              <h3 className="text-base font-semibold text-on-surface mb-2">Topics Studied</h3>
              <p className="text-2xl font-bold text-on-surface">{totalTopics}</p>
            </div>
            <div className="p-4 bg-surface-container-low rounded-lg border border-surface-container-high">
              <h3 className="text-base font-semibold text-on-surface mb-2">Resources</h3>
              <p className="text-2xl font-bold text-on-surface">{totalResources}</p>
            </div>
            <div className="p-4 bg-surface-container-low rounded-lg border border-surface-container-high">
              <h3 className="text-base font-semibold text-on-surface mb-2">Study Sessions</h3>
              <p className="text-2xl font-bold text-on-surface">{totalSessions}</p>
            </div>
            <div className="p-4 bg-surface-container-low rounded-lg border border-surface-container-high">
              <h3 className="text-base font-semibold text-on-surface mb-2">Average Mastery</h3>
              <p className="text-2xl font-bold text-on-surface">{averageMastery}%</p>
              <div className="w-full bg-surface-container-high rounded-full h-2.5 mt-2">
                <div
                  className="h-full bg-primary rounded-full"
                  style={{ width: `${averageMastery}%` }}
                ></div>
              </div>
            </div>
          </div>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold text-on-surface mb-4">
            Subject Mastery
          </h2>
          {subjectMastery.length > 0 ? (
            <div className="space-y-3">
              {subjectMastery.map((subject, index) => (
                <div key={index} className="p-4 bg-surface-container-low rounded-lg border border-surface-container-high">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0">
                      <span className="material-symbols-outlined text-[24px] text-primary">
                        school
                      </span>
                    </div>
                    <div className="flex-1">
                      <h3 className="text-base font-semibold text-on-surface mb-1">
                        {subject.subject}
                      </h3>
                      <p className="text-sm text-on-surface-variant">
                        {subject.topicCount} topics • {subject.mastery}% mastery
                      </p>
                      <div className="w-full bg-surface-container-high rounded-full h-2.5">
                        <div
                          className="h-full bg-primary rounded-full"
                          style={{ width: `${subject.mastery}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No subjects yet"
              description="Create topics and assign them to subjects to see subject mastery."
              icon="category"
              action={<Link href="/topics" className="text-primary hover:underline">Create topic</Link>}
            />
          )}
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold text-on-surface mb-4">
            Concept Mastery
          </h2>
          {data.topics.length > 0 ? (
            <div className="space-y-3">
              {data.topics.map((topic, index) => (
                <div key={index} className="p-4 bg-surface-container-low rounded-lg border border-surface-container-high">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0">
                      <span className="material-symbols-outlined text-[24px] text-primary">
                        {getIconForSubject(topic.subject_name)}
                      </span>
                    </div>
                    <div className="flex-1">
                      <h3 className="text-base font-semibold text-on-surface mb-1">
                        {topic.name}
                      </h3>
                      {topic.description && (
                        <p className="text-xs text-on-surface-variant mb-1">
                          {topic.description}
                        </p>
                      )}
                      <div className="flex items-center gap-2 text-xs text-outline font-mono">
                        <span className="material-symbols-outlined text-[16px]">
                          folder
                        </span>
                        <span>{topic.resource_count} resources</span>
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="material-symbols-outlined text-[16px] text-outline">
                          psychology_alt
                        </span>
                        <span className={getMasteryStateColor(topic.mastery_state)}>
                          {getMasteryStateLabel(topic.mastery_state)}
                        </span>
                      </div>
                      <div className="w-full bg-surface-container-high rounded-full h-2.5 mb-2">
                        <div
                          className="h-full bg-primary rounded-full"
                          style={{ width: `${getMasteryPercentage(topic)}%` }}
                        ></div>
                      </div>
                      <div className="text-sm font-medium text-primary">
                        {getMasteryPercentage(topic)}% mastery
                      </div>
                      {topic.next_review_at && (
                        <div className="text-xs text-on-surface-variant mt-2">
                          Next review: {new Date(topic.next_review_at).toLocaleDateString()}
                        </div>
                      )}
                      <Link
                        href={`/study/new?topicId=${topic.id}`}
                        className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 bg-primary text-on-primary text-xs font-medium hover:opacity-90 transition-opacity"
                      >
                        Start session
                        <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No concepts yet"
              description="Create your first topic to start tracking concept mastery."
              icon="psychology_alt"
              action={<Link href="/topics" className="text-primary hover:underline">Create topic</Link>}
            />
          )}
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold text-on-surface mb-4">
            Weak Topics
          </h2>
          {weakTopics.length > 0 ? (
            <div className="space-y-3">
              {weakTopics.map((topic, index) => {
                const masteryPct = getMasteryPercentage(topic);
                const insights = data.topicInsightsMap[topic.id];
                const commonMistakes = insights && insights.commonMistakes ? insights.commonMistakes.filter(m => m.occurrenceCount > 0) : [];
                const topMistake = commonMistakes.length > 0 ? commonMistakes[0] : null;
                return (
                  <div key={index} className="p-4 bg-surface-container-low rounded-lg border border-surface-container-high">
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0">
                        <span className="material-symbols-outlined text-[24px] text-warning">
                          trending_down
                        </span>
                      </div>
                      <div className="flex-1">
                        <h3 className="text-base font-semibold text-on-surface mb-1">
                          {topic.name}
                        </h3>
                        <p className="text-sm text-on-surface-variant mb-2">
                          {masteryPct}% mastery
                        </p>
                        {topMistake && (
                          <p className="text-xs text-on-surface-variant">
                            Common: {topMistake.description}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="w-full bg-surface-container-high rounded-full h-2.5 mb-2">
                      <div
                        className="h-full bg-warning rounded-full"
                        style={{ width: `${masteryPct}%` }}
                      ></div>
                    </div>
                    <div className="text-sm font-medium text-warning">
                      {masteryPct}% mastery • Needs attention
                    </div>
                  </div>
                );
              })} 
            </div>
          ) : (
            <EmptyState
              title="No weak topics"
              description="Keep up the great work! All topics are progressing well."
              icon="check_circle"
              action={<Link href="/study" className="text-primary hover:underline">Continue learning</Link>}
            />
          )}
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold text-on-surface mb-4">
            Recent Study Activity
          </h2>
          {recentSessions.length > 0 ? (
            <div className="space-y-3">
              {recentSessions.map((session, index) => (
                <div key={index} className="p-3 bg-surface-container-low rounded-lg border border-surface-container-high">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0">
                      <span className="material-symbols-outlined text-[24px] text-primary">
                        {session.status === "completed" ? "timer" : "psychology"}
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
                        {session.formattedDate} • {session.questions_attempted} questions • {session.accuracy}% accuracy
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No study activity yet"
              description="Your study sessions will appear here as you learn."
              icon="history"
              action={<Link href="/study" className="text-primary hover:underline">Start learning</Link>}
            />
          )}
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold text-on-surface mb-4">
            Recommended Next Step
          </h2>
          {recommendedAction ? (
            <div className="p-6 bg-surface-container-low rounded-lg border border-surface-container-high">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0">
                  <span className="material-symbols-outlined text-[36px] text-primary">
                    lightbulb
                  </span>
                </div>
                <div className="flex-1">
                  <h2 className="text-lg font-semibold text-on-surface mb-2">
                    {recommendedAction.title}
                  </h2>
                  <p className="text-sm text-on-surface-variant mb-2">
                    {recommendedAction.description}
                  </p>
                  <Link
                    href={recommendedAction.actionLink}
                    className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-primary text-on-primary text-sm font-medium hover:opacity-90 transition-opacity"
                  >
                    {recommendedAction.actionText}
                    <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                  </Link>
                </div>
              </div>
            </div>
          ) : (
            <EmptyState
              title="No recommendations"
              description="Keep learning and the system will suggest your next steps."
              icon="psychology"
              action={<Link href="/study" className="text-primary hover:underline">Continue learning</Link>}
            />
          )}
        </section>
      </div>
    </StudyShell>
  );
}

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