"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { StudyShell } from "@/components/study-shell";
import { 
  EmptyState,
  Button,
  ProgressBar
} from "@/components/ui";

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

interface Mistake {
  id: string;
  description: string;
  incorrect_count: number;
  correct_count: number;
  last_seen: string;
  recurring: boolean;
}

interface Recommendation {
  type: "review_mistake" | "continue_resource" | "practice_weak_concept" | "start_session" | "ask_tutor";
  title: string;
  description: string;
  estimatedTime: number; // in minutes
  actionText: string;
  actionLink: string;
  topicName?: string;
  subjectName?: string;
}

interface TodayActivity {
  type: "review" | "practice" | "ask_tutor";
  title: string;
  description: string;
  estimatedTime: number; // in minutes
  progress: number; // 0-100
  status: "not_started" | "in_progress" | "completed";
}

interface RecentActivityItem {
  id: string;
  type: "resource_uploaded" | "tutor_session" | "practice_completed" | "concept_reviewed" | "mistake_identified" | "mastery_changed";
  title: string;
  description: string;
  timestamp: string;
  icon: string;
}

interface DashboardData {
  user: { email?: string; name?: string } | null;
  studyContext: {
    topicName: string;
    subjectName: string | null;
    accuracy: number;
    masteryState: string;
  } | null;
  activeSession: StudySession | null;
  recentSessions: StudySession[];
  topics: Topic[];
  mistakes: Mistake[];
  recommendations: Recommendation[];
  todayActivities: TodayActivity[];
  recentActivity: RecentActivityItem[];
  loading: boolean;
  error: string | null;
}

export default function HomePage() {
  const [data, setData] = useState<DashboardData>({
    user: null,
    studyContext: null,
    activeSession: null,
    recentSessions: [],
    topics: [],
    mistakes: [],
    recommendations: [],
    todayActivities: [],
    recentActivity: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    async function loadDashboardData() {
      try {
        setData(prev => ({ ...prev, loading: true, error: null }));
        
        const supabase = (await import("@/lib/supabase/client")).createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
          // Redirect to login if not authenticated
          const { redirect } = await import("next/navigation");
          redirect("/login");
          return;
        }

        const userId = user.id;

        // Fetch user info
        const userData = {
          email: user.email ?? undefined,
          name: user.user_metadata?.full_name ?? user.user_metadata?.name ?? undefined,
        };

        // Fetch study context (active or recent session)
        const sessionsRes = await fetch(`/api/study/sessions`);
        let studyContext = null;
        let activeSession = null;
        let recentSessions: StudySession[] = [];
        
        if (sessionsRes.ok) {
          const sessionsData = await sessionsRes.json();
          const sessions = sessionsData.sessions || [];
          
          recentSessions = sessions.slice(0, 5).map((session: Record<string, unknown>) => ({
            id: session.id as string,
            topic_name: session.topic_name as string,
            subject_name: session.subject_name as string | null,
            status: session.status as StudySession["status"],
            started_at: session.started_at as string,
            ended_at: session.ended_at as string | null,
            questions_attempted: session.questions_attempted as number,
            total_attempts: session.total_attempts as number,
            correct_attempts: session.correct_attempts as number,
            hints_used: session.hints_used as number,
          }));
          
           const foundActiveSession = sessions.find((s: Record<string, unknown>) => s.status === "active");
           activeSession = foundActiveSession 
             ? {
                 id: foundActiveSession.id,
                 topic_name: foundActiveSession.topic_name,
                 subject_name: foundActiveSession.subject_name,
                 status: foundActiveSession.status,
                 started_at: foundActiveSession.started_at,
                 ended_at: foundActiveSession.ended_at,
                 questions_attempted: foundActiveSession.questions_attempted,
                 total_attempts: foundActiveSession.total_attempts,
                 correct_attempts: foundActiveSession.correct_attempts,
                 hints_used: foundActiveSession.hints_used,
               }
             : null;
            
          const recentOrActive = activeSession || (sessions.length > 0 ? sessions[0] : null);
          if (recentOrActive) {
            studyContext = {
              topicName: recentOrActive.topic_name,
              subjectName: recentOrActive.subject_name,
              accuracy: recentOrActive.correct_attempts > 0 
                ? Math.round((recentOrActive.correct_attempts / recentOrActive.total_attempts) * 100)
                : 0,
              masteryState: recentOrActive.mastery_state || "not_started",
            };
          }
        }

        // Fetch topics
        const topicsRes = await fetch(`/api/topics`);
        let topics: Topic[] = [];
        if (topicsRes.ok) {
          const topicsData = await topicsRes.json();
          topics = (topicsData.topics || []).map((topic: Record<string, unknown>) => ({
            id: topic.id as string,
            name: topic.name as string,
            description: topic.description as string | null,
            subject_name: topic.subject_name as string | null,
            mastery_state: topic.mastery_state as Topic["mastery_state"],
            total_attempts: topic.total_attempts as number,
            correct_attempts: topic.correct_attempts as number,
            hints_used: topic.hints_used as number,
            last_studied: topic.last_studied as string | null,
            next_review_at: topic.next_review_at as string | null,
            resource_count: (topic.resource_count as number) || 0,
          }));
        }

        // Fetch mistakes
        const mistakesRes = await fetch(`/api/mistakes`);
        let mistakes: Mistake[] = [];
        if (mistakesRes.ok) {
          const mistakesData = await mistakesRes.json();
          mistakes = (mistakesData.mistakes || []).map((mistake: Record<string, unknown>) => ({
            id: mistake.id as string,
            description: mistake.description as string,
            incorrect_count: mistake.incorrect_count as number,
            correct_count: mistake.correct_count as number,
            last_seen: mistake.last_seen as string,
            recurring: mistake.recurring as boolean,
          }));
        }

        // Generate recommendations based on data
        const recommendations: Recommendation[] = generateRecommendations(
          studyContext, 
          activeSession, 
          topics, 
          mistakes
        );

        // Generate today's activities
        const todayActivities: TodayActivity[] = generateTodayActivities(
          studyContext,
          activeSession
        );

        // Fetch recent activity (combine various sources)
        const recentActivity: RecentActivityItem[] = await fetchRecentActivity(userId);

        setData({
          user: userData,
          studyContext,
          activeSession,
          recentSessions,
          topics,
          mistakes,
          recommendations,
          todayActivities,
          recentActivity,
          loading: false,
          error: null,
        });
      } catch (error) {
        console.error("Failed to load dashboard data:", error);
        setData(prev => ({
          ...prev,
          loading: false,
          error: "Failed to load dashboard data. Please try again.",
        }));
      }
    }

    loadDashboardData();
  }, []);

  if (data.loading) {
    return (
      <StudyShell>
        <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
          <span className="material-symbols-outlined text-[36px] text-primary animate-spin">
            progress_activity
          </span>
          <p className="text-sm text-outline font-mono">Loading your learning dashboard...</p>
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
                <h2 className="text-xl font-bold text-error-crimson">Could not load dashboard</h2>
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

  // Handle case where user has no data at all (new user)
  const isNewUser = !data.studyContext && data.topics.length === 0 && data.mistakes.length === 0;

  return (
    <StudyShell>
      <div className="max-w-4xl mx-auto p-4 sm:p-6">
        {!isNewUser && (
          <>
            {/* Section 1: Greeting / Context */}
            <section className="mb-6">
              <div className="flex items-center gap-3">
                <div className="flex-shrink-0">
                  <span className="material-symbols-outlined text-primary text-[36px]">
                    person
                  </span>
                </div>
                <div>
                  <p className="text-sm text-on-surface-variant">
                    Good {getTimeOfGreeting()}, 
                    {data.user?.name?.split(" ")[0] ?? "there"}!
                  </p>
                  <p className="text-base font-semibold text-on-surface">
                    Ready to continue learning?
                  </p>
                </div>
              </div>
            </section>

            {/* Section 2: Continue Learning */}
            <section className="mb-6">
              {data.studyContext ? (
                <div className="card-container">
                  <div className="flex items-start gap-4 p-6 bg-surface-container-low rounded-xl border border-surface-container-high">
                    <div className="flex-shrink-0">
                      <span className="material-symbols-outlined text-primary text-[48px]">
                        {getIconForSubject(data.studyContext.subjectName)}
                      </span>
                    </div>
                    <div className="flex-1">
                      <h2 className="text-lg font-semibold text-on-surface mb-2">
                        {data.studyContext.subjectName || "Your Studies"}
                      </h2>
                      <p className="text-base text-on-surface-variant mb-2">
                        {data.studyContext.topicName || "Continue your learning"}
                      </p>
                      <div className="flex items-center gap-3 mb-2">
                        <div className="flex items-center gap-2 text-xs font-mono">
                          <span className="material-symbols-outlined text-[16px] text-outline">
                            timer
                          </span>
                          <span>Last studied: {formatDate((data.recentSessions[0]?.started_at || data.activeSession?.started_at || ""))}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs font-mono">
                          <span className="material-symbols-outlined text-[16px] text-outline">
                            psychology_alt
                          </span>
                          <span>{data.studyContext.masteryState.replace("_", " ")}</span>
                        </div>
                      </div>
                      <div className="w-full bg-surface-container-high rounded-full h-2.5 mb-3">
                        <div
                          className="h-full bg-primary rounded-full"
                          style={{ width: `${data.studyContext.accuracy}%` }}
                        ></div>
                      </div>
                      <div className="text-sm font-medium text-primary">
                        {data.studyContext.accuracy}% mastery
                      </div>
                      <Link
                        href="/study"
                        className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-primary text-on-primary text-sm font-semibold hover:opacity-90 transition-opacity"
                      >
                        Continue studying →
                        <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                      </Link>
                    </div>
                  </div>
                </div>
              ) : (
                <EmptyState
                  title="Your study space is ready"
                  description="Add your first study resource to begin."
                  icon="add_circle"
                  action={<Link href="/library" className="text-primary hover:underline">Upload resource →</Link>}
                />
              )}
            </section>

            {/* Section 3: Next Best Action */}
            <section className="mb-6">
              <h2 className="text-xl font-bold text-on-surface mb-4">
                What should you do next?
              </h2>
              {data.recommendations.length > 0 ? (
                <div className="space-y-3">
                  {data.recommendations.map((rec, index) => (
                    <div key={index} className="p-4 bg-surface-container-low rounded-lg border border-surface-container-high">
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0">
                          <span className="material-symbols-outlined text-[24px] text-primary">
                            {getRecommendationIcon(rec.type)}
                          </span>
                        </div>
                        <div className="flex-1">
                          <h3 className="text-base font-semibold text-on-surface mb-1">
                            {rec.title}
                          </h3>
                          <p className="text-sm text-on-surface-variant mb-2">
                            {rec.description}
                          </p>
                          <div className="flex items-center gap-3 text-xs font-mono text-on-surface-variant">
                            <span>
                              {getEstimatedTimeBadge(rec.estimatedTime)}
                            </span>
                            <span>
                              {rec.topicName && (
                                <>
                                  <span className="material-symbols-outlined text-[16px] text-outline me-1">
                                    folder
                                  </span>
                                  <span>{rec.topicName}</span>
                                </>
                              )}
                            </span>
                          </div>
                          <Link
                            href={rec.actionLink}
                            className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 bg-primary text-on-primary text-xs font-sm hover:opacity-90 transition-opacity"
                          >
                            {rec.actionText}
                            <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                          </Link>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="No recommendations yet"
                  description="Start studying to get personalized suggestions."
                  icon="psychology"
                  action={<Link href="/library" className="text-primary hover:underline">Begin learning</Link>}
                />
              )}
            </section>

            {/* Section 4: Today's Learning */}
            <section className="mb-6">
              <h2 className="text-xl font-bold text-on-surface mb-4">
                Today&apos;s learning
              </h2>
              {data.todayActivities.length > 0 ? (
                <div className="grid gap-4">
                  {["review", "practice", "ask_tutor"].map((type) => {
                    const activity = data.todayActivities.find(a => a.type === type);
                    return (
                      <div key={type} className={activity ? 
                        "p-4 bg-surface-container-low rounded-lg border border-surface-container-high" :
                        "p-4 text-center text-on-surface-variant"
                      }>
                        {activity ? (
                          <>
                            <div className="flex items-start gap-3">
                              <div className="flex-shrink-0">
                                <span className="material-symbols-outlined text-[24px] text-primary">
                                  {getActivityIcon(activity.type)}
                                </span>
                              </div>
                              <div className="flex-1">
                                <h3 className="text-base font-semibold text-on-surface mb-1">
                                  {activity.title}
                                </h3>
                                <p className="text-sm text-on-surface-variant mb-2">
                                  {activity.description}
                                </p>
                                <div className="mb-3">
                                <ProgressBar
                                    value={activity.progress}
                                    className="mt-2"
                                  />
                                </div>
                                <div className="flex items-center gap-2 text-xs font-mono">
                                  <span>
                                    {getEstimatedTimeBadge(activity.estimatedTime)}
                                  </span>
                                  <span className={activity.status === "completed" ? "text-secondary" : "text-on-surface-variant"}>
                                    {activity.status === "completed" ? "Completed" : 
                                     activity.status === "in_progress" ? "In progress" : "Not started"}
                                  </span>
                                </div>
                                {activity.status !== "completed" && (
                                  <Link
                                    href="#"
                                    className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 bg-primary text-on-primary text-xs font-sm hover:opacity-90 transition-opacity"
                                  >
                                    Start {activity.type.toLowerCase()} →
                                    <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                                  </Link>
                                )}
                              </div>
                            </div>
                          </>
                        ) : (
                          <>
                            <p className="text-sm">No {type.toLowerCase()} planned for today</p>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyState
                  title="No today&apos;s learning planned"
                  description="Set up your daily learning goals to get started."
                  icon="today"
                  action={<Link href="/study" className="text-primary hover:underline">Set goals</Link>}
                />
              )}
            </section>

            {/* Section 5: Subject Progress */}
            <section className="mb-6">
              <h2 className="text-xl font-bold text-on-surface mb-4">
                Subject progress
              </h2>
              {data.topics.length > 0 ? (
                <div className="space-y-3">
                  {data.topics.map((topic, index) => {
                    return (
                      <div key={index} className="p-4 bg-surface-container-low rounded-lg border border-surface-container-high">
                        <div className="flex items-start gap-3">
                          <div className="flex-shrink-0">
                            <span className="material-symbols-outioned text-[24px] text-primary">
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
                            <div className="flex items-center gap-2 text-xs font-mono">
                              <span className="material-symbols-outlined text-[16px] text-outline">
                                folder
                              </span>
                              <span>{topic.resource_count} resources</span>
                            </div>
                            <div className="flex items-center gap-2 mb-2">
                              <span className="material-symbols-outlined text-[16px] text-outline">
                                psychology_alt
                              </span>
                              <span>{topic.mastery_state.replace("_", " ")}</span>
                            </div>
                            <div className="w-full bg-surface-container-high rounded-full h-2.5">
                              <div
                                className="h-full bg-primary rounded-full"
                                style={{ width: `${calculateTopicAccuracy(topic)}%` }}
                              ></div>
                            </div>
                            <div className="text-sm font-medium text-primary mt-1">
                              {calculateTopicAccuracy(topic)}% mastery
                            </div>
                            {topic.next_review_at && (
                              <div className="text-xs text-on-surface-variant mt-2">
                                Next review: {formatDate(topic.next_review_at)}
                              </div>
                            )}
                            <Link
                              href={`/topics`}
                              className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 bg-primary text-on-primary text-xs font-sm hover:opacity-90 transition-opacity"
                            >
                              View topic details
                              <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                            </Link>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
            ) : (
                <EmptyState
                  title="No subjects yet"
                  description="Create your first topic to start tracking progress."
                  icon="category"
                  action={<Link href="/topics" className="text-primary hover:underline">Create topic</Link>}
                />
              )}
            </section>

            {/* Section 6: Recent Activity */}
            <section className="mb-6">
              <h2 className="text-xl font-bold text-on-surface mb-4">
                Recent activity
              </h2>
              {data.recentActivity.length > 0 ? (
                <div className="space-y-3">
                  {data.recentActivity.map((activity, index) => (
                    <div key={index} className="p-3 bg-surface-container-low rounded-lg border border-surface-container-high">
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0">
                          <span className="material-symbols-outlined text-[24px] text-primary">
                            {activity.icon}
                          </span>
                        </div>
                        <div className="flex-1">
                          <h3 className="text-base font-semibold text-on-surface mb-1">
                            {activity.title}
                          </h3>
                          <p className="text-sm text-on-surface-variant mb-2">
                            {activity.description}
                          </p>
                          <p className="text-xs text-on-surface-variant">
                            {formatTimeAgo(activity.timestamp)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="No recent activity"
                  description="Your learning activity will appear here as you study."
                  icon="history"
                  action={<Link href="/study" className="text-primary hover:underline">Start learning</Link>}
                />
              )}
            </section>
            {/* Section 7: Review Recommendations */}
            <section className="mb-6">
              <h2 className="text-xl font-bold text-on-surface mb-4">
                Review recommendations
              </h2>
              {data.mistakes.filter(m => m.recurring || m.incorrect_count >= 2).length > 0 ? (
                <div className="space-y-3">
                  {data.mistakes.filter(m => m.recurring || m.incorrect_count >= 2).map((mistake, index) => (
                    <div key={index} className="p-4 bg-surface-container-low rounded-lg border border-surface-container-high">
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0">
                          <span className="material-symbols-outlined text-[24px] text-primary">
                            {mistake.recurring ? "repeat" : "building"}
                          </span>
                        </div>
                        <div className="flex-1">
                          <h3 className="text-base font-semibold text-on-surface mb-1">
                            Needs review
                          </h3>
                          <p className="text-sm text-on-surface-variant mb-2">
                            {mistake.description}
                          </p>
                          {mistake.recurring ? (
                            <p className="text-xs text-on-surface-variant">
                              {mistake.incorrect_count} recent mistakes
                            </p>
                          ) : (
                            <p className="text-xs text-on-surface-variant">
                              {mistake.incorrect_count} incorrect, {mistake.correct_count} correct
                            </p>
                          )}
                          <Link
                            href={`/study/new?topicId=${getTopicIdForMistake(mistake, data.topics)}`}
                            className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 bg-primary text-on-primary text-xs font-sm hover:opacity-90 transition-opacity"
                          >
                            Start review →
                            <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                          </Link>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="No items need review"
                  description="Keep up the great work! Nothing needs review right now."
                  icon="check_circle"
                  action={<Link href="/study" className="text-primary hover:underline">Continue learning</Link>}
                />
              )}
            </section>
          </>
        )}

        {isNewUser && (
          <div className="max-w-2xl mx-auto p-6">
            <EmptyState
              title="Your study space is ready"
              description="Add your first study resource to begin your learning journey."
              icon="school"
              action={<Link href="/library" className="text-primary hover:underline">Upload resource →</Link>}
            />
          </div>
        )}
      </div>
    </StudyShell>
  );
}
// Helper functions

// Helper functions
function getTimeOfGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
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

function getRecommendationIcon(type: Recommendation["type"]): string {
  switch (type) {
    case "review_mistake": return "repeat";
    case "continue_resource": return "play_arrow";
    case "practice_weak_concept": return "psychology_alt";
    case "start_session": return "get_app";
    case "ask_tutor": return "question_answer";
    default: return "lightbulb";
  }
}

function getActivityIcon(type: TodayActivity["type"]): string {
  switch (type) {
    case "review": return "repeat";
    case "practice": return "psychology_alt";
    case "ask_tutor": return "question_answer";
    default: return "school";
  }
}

function getEstimatedTimeBadge(minutes: number): string {
  if (minutes < 5) return `${minutes} min`;
  if (minutes < 60) return `${minutes} min`;
  return `${Math.round(minutes / 60)}h`;
}

function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return "Not yet";
  const date = new Date(dateString);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatTimeAgo(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  if (diffSeconds < 60) return "just now";
  if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`;
  if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}h ago`;
  if (diffSeconds < 2592000) // 30 days
    return `${Math.floor(diffSeconds / 86400)}d ago`;
  
  return date.toLocaleDateString();
}

function calculateTopicAccuracy(topic: Topic): number {
  if (topic.total_attempts === 0) return 0;
  return Math.round((topic.correct_attempts / topic.total_attempts) * 100);
}

function getTopicIdForMistake(mistake: Mistake, topics: Topic[]): string | undefined {
  const topic = topics.find(t => t.name === mistake.description.split(" ")[0] || t.description?.includes(mistake.description.split(" ")[0]));
  return topic?.id;
}

// Mock data generators (in a real app, these would come from backend APIs)
function generateRecommendations(
  studyContext: { topicName: string; subjectName: string | null; accuracy: number; masteryState: string } | null,
  activeSession: StudySession | null,
  topics: Topic[],
  mistakes: Mistake[]
): Recommendation[] {
  const recommendations: Recommendation[] = [];

  // If there's an active session, recommend continuing it
  if (activeSession) {
    recommendations.push({
      type: "continue_resource",
      title: `Continue ${activeSession.topic_name}`,
      description: `You have an active study session in progress`,
      estimatedTime: 15,
      actionText: "Continue session",
      actionLink: `/study/${activeSession.id}`,
      topicName: activeSession.topic_name,
      subjectName: activeSession.subject_name ?? undefined,
    });
    return recommendations;
  }

  // If there are mistakes that need review, recommend reviewing them
  const reviewMistakes = mistakes.filter(m => m.recurring || m.incorrect_count >= 2);
  if (reviewMistakes.length > 0) {
    const mistake = reviewMistakes[0];
    recommendations.push({
      type: "review_mistake",
      title: `Review ${mistake.description.split(" ")[0] || "concept"}`,
      description: `You have ${mistake.incorrect_count} recent mistakes with this concept`,
      estimatedTime: 10,
      actionText: "Start review",
      actionLink: "/review", // Link to review page
      topicName: mistake.description.split(" ")[0],
    });
    return recommendations;
  }

  // If there are topics with low mastery, recommend practicing weak concepts
  const weakTopics = topics.filter(t => 
    t.total_attempts > 0 && 
    calculateTopicAccuracy(t) < 70 && 
    t.mastery_state !== "not_started"
  );
  if (weakTopics.length > 0) {
    const topic = weakTopics[0];
    recommendations.push({
      type: "practice_weak_concept",
      title: `Practice ${topic.name}`,
      description: `Your mastery in ${topic.name} is below 70%`,
      estimatedTime: 20,
      actionText: "Start practice",
      actionLink: `/study/new?topicId=${topic.id}`,
      topicName: topic.name,
      subjectName: topic.subject_name ?? undefined,
    });
    return recommendations;
  }

  // If there are topics with resources but no recent activity, recommend starting a session
  const staleTopics = topics.filter(t => 
    t.resource_count > 0 && 
    (!t.last_studied || new Date(t.last_studied).getTime() < Date.now() - 24 * 60 * 60 * 1000)
  );
  if (staleTopics.length > 0) {
    const topic = staleTopics[0];
    recommendations.push({
      type: "start_session",
      title: `Start studying ${topic.name}`,
      description: `You have resources for ${topic.name} but haven't studied recently`,
      estimatedTime: 25,
      actionText: "Begin session",
      actionLink: `/study/new?topicId=${topic.id}`,
      topicName: topic.name,
      subjectName: topic.subject_name ?? undefined,
    });
    return recommendations;
  }

  // Default recommendation: ask tutor about current topic or first available topic
  const firstTopic = topics[0] || (studyContext ? { 
    name: studyContext.topicName, 
    subject_name: studyContext.subjectName,
    id: "unknown"
  } : null);
  
  if (firstTopic) {
    recommendations.push({
      type: "ask_tutor",
      title: `Ask tutor about ${firstTopic.name}`,
      description: `Get help understanding key concepts in ${firstTopic.name}`,
      estimatedTime: 5,
      actionText: "Ask tutor",
      actionLink: "/tutor",
      topicName: firstTopic.name,
      subjectName: firstTopic.subject_name ?? undefined,
    });
  }

  return recommendations;
}

function generateTodayActivities(
  _studyContext: { topicName: string; subjectName: string | null; accuracy: number; masteryState: string } | null,
  _activeSession: StudySession | null
): TodayActivity[] {
  const activities: TodayActivity[] = [];
  
  // Review activity
  activities.push({
    type: "review",
    title: "Review key concepts",
    description: "Go over what you learned yesterday to reinforce memory",
    estimatedTime: 10,
    progress: Math.random() > 0.7 ? 60 : 0,
    status: Math.random() > 0.7 ? "in_progress" : "not_started",
  });
  
  // Practice activity
  activities.push({
    type: "practice",
    title: "Practice problems",
    description: "Work through exercises to build skills",
    estimatedTime: 15,
    progress: Math.random() > 0.6 ? 40 : 0,
    status: Math.random() > 0.6 ? "in_progress" : "not_started",
  });
  
  // Ask tutor activity
  activities.push({
    type: "ask_tutor",
    title: "Ask tutor for help",
    description: "Get clarification on difficult concepts",
    estimatedTime: 5,
    progress: Math.random() > 0.8 ? 100 : 0,
    status: Math.random() > 0.8 ? "completed" : "not_started",
  });
  
  return activities;
}

async function fetchRecentActivity(userId: string): Promise<RecentActivityItem[]> {
  try {
    // In a real implementation, this would fetch from various APIs
    // For now, we'll return mock data based on what we have available
    
    // Try to fetch actual data from Supabase if possible
    const supabase = await (await import("@/lib/supabase/client")).createClient();
    
    // Fetch recent sessions
    const { data: sessions, error: sessionsError } = await supabase
      .from("study_sessions")
      .select(`
        id,
        topics(name, subject_id, subjects(name)),
        status,
        started_at,
        ended_at,
        questions_attempted,
        total_attempts,
        correct_attempts,
        hints_used
      `)
      .eq("user_id", userId)
      .order("started_at", { ascending: false })
      .limit(5);
    
    const recentActivity: RecentActivityItem[] = [];
    
    if (!sessionsError && sessions) {
      for (const session of sessions) {
        const topicName = session.topics?.[0]?.name ?? "Unknown topic";
        const subjectName = session.topics?.[0]?.subjects?.[0]?.name ?? null;
        
        if (session.status === "completed" && session.ended_at) {
          recentActivity.push({
            id: session.id,
            type: "practice_completed",
            title: `Completed study session: ${topicName}`,
            description: `${subjectName || "Unknown subject"} • ${session.total_attempts} questions • ${Math.round((session.correct_attempts / session.total_attempts) * 100)}% accuracy`,
            timestamp: session.ended_at,
            icon: "timer",
          });
        } else if (session.status === "active") {
          recentActivity.push({
            id: session.id,
            type: "tutor_session",
            title: `Active study session: ${topicName}`,
            description: `${subjectName || "Unknown subject"} • ${session.total_attempts} questions attempted`,
            timestamp: session.started_at,
            icon: "psychology",
          });
        }
      }
    }
    
    // If we have real data, return it
    if (recentActivity.length > 0) {
      return recentActivity;
    }
    
    // Otherwise return mock data
    return [
      {
        id: "1",
        type: "resource_uploaded",
        title: "Uploaded Biology notes",
        description: "Cell Biology chapter 3 PDF",
        timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
        icon: "description",
      },
      {
        id: "2",
        type: "practice_completed",
        title: "Completed algebra practice",
        description: "15 quadratic equation problems • 80% accuracy",
        timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(), // 4 hours ago
        icon: "timer",
      },
      {
        id: "3",
        type: "concept_reviewed",
        title: "Reviewed photosynthesis",
        description: "Reviewed light-dependent reactions",
        timestamp: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(), // 1 hour ago
        icon: "psychology_alt",
      },
    ];
  } catch (error) {
    console.error("Failed to fetch recent activity:", error);
    // Return empty array on error - the EmptyState will handle this
    return [];
  }
}