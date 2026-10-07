"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { StudyShell } from "@/components/study-shell";
import { StudySessionPlayer } from "@/components/study-session-player";
import { StudyHandoff } from "@/components/study-handoff";
import { StudySession } from "@/types/study";
import { SessionAnalytics } from "@/lib/study/types";

export default function StudySessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [session, setSession] = useState<StudySession | null>(null);
  const [analytics, setAnalytics] = useState<SessionAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchSession() {
      try {
        const res = await fetch(`/api/study/sessions/${id}`);
        if (!res.ok) {
          if (res.status === 404) {
            setError("Session not found");
          } else {
            setError("Failed to load session");
          }
          return;
        }
        const data = await res.json();
        setSession(data.session);

        // Fetch analytics for completed sessions
        if (data.session?.status === "completed") {
          const analyticsRes = await fetch(`/api/study/analytics?sessionId=${id}`);
          if (analyticsRes.ok) {
            const analyticsData = await analyticsRes.json();
            setAnalytics(analyticsData.analytics);
          }
        }
      } catch {
        setError("Failed to load session");
      } finally {
        setLoading(false);
      }
    }
    fetchSession();
  }, [id]);

  if (loading) {
    return (
      <StudyShell
        breadcrumbs={[
          { label: "Study Hub", href: "/study" },
          { label: "Session" },
        ]}
      >
        <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
          <span className="material-symbols-outlined text-[36px] text-primary animate-spin">
            progress_activity
          </span>
          <p className="text-sm text-outline font-mono">Loading session...</p>
        </div>
      </StudyShell>
    );
  }

  if (error || !session) {
    return (
      <StudyShell
        breadcrumbs={[
          { label: "Study Hub", href: "/study" },
          { label: "Error" },
        ]}
      >
        <div className="max-w-xl mx-auto p-8 rounded-xl bg-surface-container-low border border-surface-container-high text-center space-y-4">
          <span className="material-symbols-outlined text-[48px] text-error-crimson">
            error
          </span>
          <h2 className="text-xl font-bold text-on-surface">
            {error || "Session not found"}
          </h2>
          <p className="text-sm text-outline">
            The requested study session does not exist or access was denied.
          </p>
          <Link
            href="/study"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-surface-container-high hover:bg-surface-bright text-on-surface text-sm font-semibold transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">
              arrow_back
            </span>
            <span>Back to Study Hub</span>
          </Link>
        </div>
      </StudyShell>
    );
  }

  return (
    <StudyShell
      breadcrumbs={[
        { label: "Study Hub", href: "/study" },
        { label: session.topic_name },
      ]}
      activeTopicName={session.topic_name}
    >
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Top Session Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-surface-container-high">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 text-xs font-semibold uppercase tracking-wider">
                {session.subject_name || "Study Session"}
              </span>
              <span
                className={`px-2 py-0.5 rounded text-xs font-mono font-medium ${
                  session.status === "completed"
                    ? "bg-secondary/10 text-secondary border border-secondary/20"
                    : "bg-primary/10 text-primary border border-primary/20"
                }`}
              >
                {session.status.toUpperCase()}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-on-surface tracking-tight">
              {session.topic_name}
            </h1>
          </div>

          <Link
            href="/study"
            className="text-xs sm:text-sm text-outline hover:text-on-surface flex items-center gap-1 self-start sm:self-auto transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">
              arrow_back
            </span>
            <span>Exit to Hub</span>
          </Link>
        </div>

        {/* Completed Session: Show Handoff + Analytics */}
        {session.status === "completed" ? (
          <div className="space-y-6">
            <StudyHandoff handoffText={session.handoff_text ?? ""} />
            
            {analytics && (
              <div className="p-5 rounded-xl bg-surface-container-low border border-surface-container-high space-y-4">
                <h3 className="text-base font-semibold text-on-surface flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary text-[20px]">
                    analytics
                  </span>
                  Session Analytics
                </h3>
                
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="p-3 rounded-lg bg-surface-container border border-surface-container-high">
                    <div className="text-xs text-outline font-mono mb-1">Accuracy</div>
                    <div className="text-lg font-bold text-on-surface">
                      {Math.round(analytics.accuracy * 100)}%
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-surface-container border border-surface-container-high">
                    <div className="text-xs text-outline font-mono mb-1">Correct</div>
                    <div className="text-lg font-bold text-on-surface">
                      {analytics.correctAttempts}/{analytics.totalAttempts}
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-surface-container border border-surface-container-high">
                    <div className="text-xs text-outline font-mono mb-1">Hints</div>
                    <div className="text-lg font-bold text-on-surface">
                      {analytics.hintsUsed}
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-surface-container border border-surface-container-high">
                    <div className="text-xs text-outline font-mono mb-1">Trend</div>
                    <div className="text-lg font-bold text-on-surface capitalize">
                      {analytics.performanceTrend.replace("_", " ")}
                    </div>
                  </div>
                </div>

                {analytics.studyTips.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold text-on-surface">Study Tips</h4>
                    <ul className="space-y-1.5">
                      {analytics.studyTips.map((tip, idx) => (
                        <li
                          key={idx}
                          className="text-xs text-on-surface-variant flex items-start gap-2"
                        >
                          <span className="material-symbols-outlined text-primary text-[16px] mt-0.5">
                            lightbulb
                          </span>
                          <span>{tip.message}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {analytics.commonMistakes.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold text-on-surface">Common Mistakes</h4>
                    <ul className="space-y-1.5">
                      {analytics.commonMistakes.map((mistake, idx) => (
                        <li
                          key={idx}
                          className="text-xs text-on-surface-variant flex items-start gap-2"
                        >
                          <span className="material-symbols-outlined text-warning text-[16px] mt-0.5">
                            warning
                          </span>
                          <span>
                            {mistake.description} ({mistake.occurrenceCount}x)
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <StudySessionPlayer
            sessionId={session.id}
            onSessionComplete={() => {
              window.location.reload();
            }}
          />
        )}
      </div>
    </StudyShell>
  );
}