"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { StudyShell } from "@/components/study-shell";
import { StudySession } from "@/types/study";
import { TopicInsights } from "@/lib/study/types";
import {
  selectDailyMissionTopic,
  generateDailyMission,
} from "@/lib/missions/generation";
import type { MissionTopic } from "@/lib/missions/types";

export default function StudyHub() {
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [topicsInsights, setTopicsInsights] = useState<TopicInsights[]>([]);
  const [missionTopic, setMissionTopic] = useState<MissionTopic | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const [sessionsRes, topicsRes] = await Promise.all([
          fetch("/api/study/sessions"),
          fetch("/api/topics"),
        ]);

        if (!sessionsRes.ok) throw new Error("Failed to fetch sessions");
        if (!topicsRes.ok) throw new Error("Failed to fetch topics");

        const [sessionsData, topicsData] = await Promise.all([
          sessionsRes.json(),
          topicsRes.json(),
        ]);

        setSessions(sessionsData.sessions || []);

        const allTopics = (topicsData.topics || []) as MissionTopic[];
        setMissionTopic(selectDailyMissionTopic(allTopics));

        // Fetch insights for topics that need review
        const reviewTopics = (topicsData.topics || []).filter(
          (t: { mastery_state: string; next_review_at: string | null }) =>
            t.mastery_state === "review_needed" || !t.next_review_at
        );

        const insightsPromises = reviewTopics.map(async (topic: { id: string }) => {
          const res = await fetch(`/api/study/analytics?topicId=${topic.id}`);
          if (res.ok) {
            const data = await res.json();
            return data.insights;
          }
          return null;
        });

        const insights = (await Promise.all(insightsPromises)).filter(
          (insight): insight is TopicInsights => insight !== null
        );
        setTopicsInsights(insights);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const activeSessions = sessions.filter((s) => s.status === "active");
  const pastSessions = sessions.filter((s) => s.status === "completed");

  if (loading) {
    return (
      <StudyShell breadcrumbs={[{ label: "Study Sessions", href: "/study" }]}>
        <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
          <span className="material-symbols-outlined text-[36px] text-primary animate-spin">
            progress_activity
          </span>
          <p className="text-sm text-outline font-mono">
            Loading study sessions...
          </p>
        </div>
      </StudyShell>
    );
  }

  return (
    <StudyShell breadcrumbs={[{ label: "Study Sessions", href: "/study" }]}>
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Today's Mission Card */}
        {missionTopic && (
          <Link
            href={`/study/new?topicId=${missionTopic.id}`}
            className="block group"
          >
            <div className="p-5 rounded-xl bg-surface-container-low border border-surface-container-high hover:border-primary/50 transition-colors shadow-sm">
              <div className="flex items-start gap-3">
                <span
                  className="material_symbols_outlined text-[22px] text-secondary flex-shrink-0"
                  aria-hidden="true"
                >
                  emoji_events
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-sm font-semibold text-on-surface-variant flex items-center gap-1.5">
                    <span>Today's Mission</span>
                  </h2>
                  {(() => {
                    const { title, description } = generateDailyMission(
                      missionTopic,
                    );
                    return (
                      <>
                        <p className="mt-1 text-lg font-medium text-on-surface truncate">
                          {title}
                        </p>
                        <pre className="mt-1 text-xs text-on-surface-variant whitespace-pre-line leading-relaxed">
                          {description}
                        </pre>
                      </>
                    );
                  })()}
                </div>
                <span className="material_symbols_outlined text-[20px] text-outline group-hover:text-primary transition-colors">
                  arrow_forward
                </span>
              </div>
            </div>
          </Link>
        )}

        {/* Header Title & Quick Action */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-surface-container-high">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-on-surface flex items-center gap-2.5">
              <span className="material-symbols-outlined text-secondary text-[28px]">
                timer
              </span>
              <span>Study Sessions Hub</span>
            </h1>
            <p className="text-xs sm:text-sm text-on-surface-variant mt-1">
              Interactive spaced-retrieval practice and mastery diagnostics.
            </p>
          </div>

          <Link
            href="/study/new"
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-on-primary text-sm font-semibold hover:opacity-90 transition-opacity shadow-sm self-start sm:self-auto"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            <span>Start New Session</span>
          </Link>
        </div>

        {error && (
          <div className="p-4 rounded-xl bg-error-container/20 border border-error-crimson/30 text-error-crimson text-sm flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px]">error</span>
            <span>{error}</span>
          </div>
        )}

        {/* Overall Progress Overview */}
        {topicsInsights.length > 0 && (
          <div className="p-5 rounded-xl bg-surface-container-low border border-surface-container-high space-y-4">
            <h2 className="text-base font-semibold text-on-surface flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-[20px]">
                insights
              </span>
              Topics Needing Review
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {topicsInsights.map((insight) => (
                <Link
                  key={insight.topicId}
                  href={`/study/new?topicId=${insight.topicId}`}
                  className="p-3 rounded-lg bg-surface-container border border-surface-container-high hover:border-primary/50 transition-colors"
                >
                  <div className="text-sm font-semibold text-on-surface truncate">
                    {insight.topicName}
                  </div>
                  <div className="flex items-center justify-between text-xs text-outline font-mono mt-1">
                    <span className="capitalize">{insight.performanceTrend.replace("_", " ")}</span>
                    <span>{Math.round(insight.accuracy * 100)}% accuracy</span>
                  </div>
                  {insight.nextReviewAt && (
                    <div className="text-xs text-outline mt-1">
                      Review by: {new Date(insight.nextReviewAt).toLocaleDateString()}
                    </div>
                  )}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Section 1: Active Sessions */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-on-surface flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-secondary animate-pulse"></span>
              <span>Active Sessions ({activeSessions.length})</span>
            </h2>
          </div>

          {activeSessions.length === 0 ? (
            <div className="p-6 rounded-xl bg-surface-container-low border border-dashed border-surface-container-high text-center">
              <p className="text-xs text-outline italic">
                No active sessions currently in progress.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {activeSessions.map((session) => (
                <div
                  key={session.id}
                  className="p-5 rounded-xl bg-surface-container-low border border-surface-container-high hover:border-primary/50 transition-colors flex flex-col justify-between gap-4 shadow-sm"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-base text-on-surface truncate">
                        {session.topic_name}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-secondary/10 text-secondary border border-secondary/20 text-[11px] font-semibold">
                        In Progress
                      </span>
                    </div>

                    {session.subject_name && (
                      <p className="text-xs text-outline">
                        Subject: {session.subject_name}
                      </p>
                    )}

                    <div className="text-xs text-outline font-mono">
                      Started: {new Date(session.started_at).toLocaleDateString()}
                    </div>

                    {session.handoff_text && (
                      <p className="text-xs text-on-surface-variant line-clamp-2 italic pt-1">
                        {session.handoff_text}
                      </p>
                    )}
                  </div>

                  <Link
                    href={`/study/${session.id}`}
                    className="flex items-center justify-center gap-1.5 w-full py-2 rounded-lg bg-primary text-on-primary text-xs font-semibold hover:opacity-90 transition-opacity"
                  >
                    <span>Continue Drill</span>
                    <span className="material-symbols-outlined text-[16px]">
                      arrow_forward
                    </span>
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Section 2: Completed Session Archives */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-on-surface flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px] text-outline">
                inventory_2
              </span>
              <span>Session Archives ({pastSessions.length})</span>
            </h2>
          </div>

          {pastSessions.length === 0 ? (
            <div className="p-6 rounded-xl bg-surface-container-low border border-dashed border-surface-container-high text-center">
              <p className="text-xs text-outline italic">
                No archived sessions yet. Complete your first study session to review summaries.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-surface-container-high rounded-xl bg-surface-container-low border border-surface-container-high overflow-hidden shadow-sm">
              {pastSessions.map((session) => {
                const accuracy =
                  session.total_attempts > 0
                    ? Math.round(
                        (session.correct_attempts / session.total_attempts) * 100
                      )
                    : 0;

                return (
                  <div
                    key={session.id}
                    className="p-4 hover:bg-surface-container/40 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-on-surface truncate">
                          {session.topic_name}
                        </span>
                        {session.subject_name && (
                          <span className="text-xs text-outline">
                            ({session.subject_name})
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-3 text-xs text-outline font-mono">
                        <span>
                          {new Date(session.started_at).toLocaleDateString()}
                        </span>
                        <span>•</span>
                        <span>{session.questions_attempted} questions</span>
                        <span>•</span>
                        <span className="text-secondary font-semibold">
                          {accuracy}% accuracy
                        </span>
                      </div>
                    </div>

                    <Link
                      href={`/study/${session.id}`}
                      className="px-3 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-xs font-medium text-on-surface border border-outline-variant/30 flex items-center gap-1 self-start sm:self-auto transition-colors"
                    >
                      <span>Review Handoff</span>
                      <span className="material-symbols-outlined text-[14px]">
                        chevron_right
                      </span>
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </StudyShell>
  );
}