"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { StudyShell } from "@/components/study-shell";
import { 
  EmptyState,
  Button,
  ProgressBar,
  MetricCard,
  TodayFocusCard,
  RecommendationsList,
  StatsGrid,
  AchievementsList
} from "@/components/ui";

interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  date: string;
}

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
  topic_id: string | null;
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
  achievements: Achievement[];
  loading: boolean;
  error: string | null;
}

export default function HomePage() {
  const router = useRouter();
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
    achievements: [],
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
          // Redirect to login if not authenticated (client-side navigation)
          router.push("/login");
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
            topic_id: mistake.topic_id as string | null,
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

        // Generate achievements (mock data for now)
        const achievements: Achievement[] = [
          { id: "1", title: "Streak Master", description: "Maintained a 7-day learning streak", icon: "fire", date: new Date().toISOString() },
          { id: "2", title: "Quick Learner", description: "Completed 10 sessions this week", icon: "speed", date: new Date().toISOString() },
          { id: "3", title: "Perfect Score", description: "Achieved 100% on a practice session", icon: "star", date: new Date().toISOString() },
        ];

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
          achievements,
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
  }, [router]);

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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {!isNewUser && (
          <>
            {/* Hero Section */}
            <section className="mb-8">
              <div className="bg-gradient-to-br from-primary/10 to-transparent rounded-2xl p-8">
                <h1 className="text-3xl font-bold text-primary mb-4">
                  Welcome Back, {data.user?.name?.split(" ")[0] ?? "there"}!
                </h1>
                <p className="text-lg text-on-surface-variant">
                  Continue your learning journey with personalized recommendations
                </p>
                <div className="flex items-center gap-4 mt-6">
                  <Link href="/study" className="btn-primary px-6 py-3">
                    <span className="material-symbols-outlined mr-2">play_arrow</span>
                    Continue Learning
                  </Link>
                  <Link href="/library" className="btn-outline px-6 py-3">
                    <span className="material-symbols-outlined mr-2">add_circle</span>
                    Add Resources
                  </Link>
                </div>
              </div>
            </section>

            {/* Key Metrics */}
            <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              <MetricCard 
                title="Streak" 
                value={(data.activeSession || data.recentSessions[0]) ? "Active" : "0 days"} 
                icon="fire" 
                color="secondary" 
              />
              <MetricCard 
                title="Mastery" 
                value={data.studyContext ? `${data.studyContext.accuracy}%` : "N/A"} 
                icon="psychology_alt" 
                color="primary" 
              />
              <MetricCard 
                title="Resources" 
                value={data.topics.reduce((sum, t) => sum + t.resource_count, 0)} 
                icon="library_books" 
                color="accent" 
              />
              <MetricCard 
                title="Questions" 
                value={data.recentSessions.reduce((sum, s) => sum + s.total_attempts, 0)} 
                icon="quiz" 
                color="success" 
              />
            </section>

            {/* Main Content */}
            <div className="grid gap-6">
              {/* Primary Column */}
              <div className="md:col-span-2">
                <section className="mb-6">
                  <h2 className="text-xl font-bold text-on-surface mb-4">
                    Today's Focus
                  </h2>
                  <TodayFocusCard 
                    topic={data.todayActivities.find(a => a.type === "review")?.title ?? "Review key concepts"}
                    progress={data.todayActivities.find(a => a.type === "review")?.progress ?? 0}
                    timeEstimate={data.todayActivities.find(a => a.type === "review")?.estimatedTime ?? 10}
                  />
                </section>
                
                <section className="mb-6">
                  <h2 className="text-xl font-bold text-on-surface mb-4">
                    Recommended Activities
                  </h2>
                  <RecommendationsList recommendations={data.recommendations} />
                </section>
              </div>

              {/* Secondary Column */}
              <div className="md:col-span-1">
                <section className="mb-6">
                  <h2 className="text-xl font-bold text-on-surface mb-4">
                    Quick Stats
                  </h2>
                  <StatsGrid stats={[
                    { title: "Topics", value: data.topics.length },
                    { title: "Sessions", value: data.recentSessions.length },
                    { title: "Mistakes", value: data.mistakes.length },
                    { title: "Accuracy", value: data.studyContext ? `${data.studyContext.accuracy}%` : "N/A" },
                  ]} />
                </section>
                
                <section>
                  <h2 className="text-xl font-bold text-on-surface mb-4">
                    Recent Achievements
                  </h2>
                  <AchievementsList achievements={[
                    { id: "1", title: "Streak Master", description: "Maintained a 7-day learning streak", icon: "fire", date: new Date().toISOString() },
                    { id: "2", title: "Quick Learner", description: "Completed 10 sessions this week", icon: "speed", date: new Date().toISOString() },
                    { id: "3", title: "Perfect Score", description: "Achieved 100% on a practice session", icon: "star", date: new Date().toISOString() },
                  ]} />
                </section>
              </div>
            </div>
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
  return mistake.topic_id ? topics.find(t => t.id === mistake.topic_id)?.id : undefined;
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
    const topic = topics.find(t => t.id === mistake.topic_id);
    recommendations.push({
      type: "review_mistake",
      title: `Review ${topic?.name || "concept"}`,
      description: `You have ${mistake.incorrect_count} recent mistakes with this concept`,
      estimatedTime: 10,
      actionText: "Start review",
      actionLink: "/review", // Link to review page
      topicName: topic?.name,
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
    progress: 60,
    status: "in_progress",
  });
  
  // Practice activity
  activities.push({
    type: "practice",
    title: "Practice problems",
    description: "Work through exercises to build skills",
    estimatedTime: 15,
    progress: 40,
    status: "in_progress",
  });
  
  // Ask tutor activity
  activities.push({
    type: "ask_tutor",
    title: "Ask tutor for help",
    description: "Get clarification on difficult concepts",
    estimatedTime: 5,
    progress: 100,
    status: "completed",
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
    
    return recentActivity;
  } catch (error) {
    console.error("Failed to fetch recent activity:", error);
    // Return empty array on error - the EmptyState will handle this
    return [];
  }
}