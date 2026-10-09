"use client";

import { useState, useEffect } from "react";
import { StudyShell } from "@/components/study-shell";
import Link from "next/link";
import { Button, Card, EmptyState } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

interface Mistake {
  id: string;
  topic_id: string;
  description: string;
  incorrect_count: number;
  correct_count: number;
  hint_count: number;
  recurring: boolean;
  last_seen: string;
  created_at: string;
}

interface ReviewTopic {
  id: string;
  name: string;
  mastery_state: "not_started" | "learning" | "developing" | "strong" | "review_needed";
  total_attempts: number;
  correct_attempts: number;
  hints_used: number;
  mistake_count: number;
  last_studied: string | null;
}

export default function ReviewPage() {
  const [mistakes, setMistakes] = useState<Mistake[]>([]);
  const [reviewTopics, setReviewTopics] = useState<ReviewTopic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadReviewData() {
      setLoading(true);
      setError(null);

      const supabase = createClient();

      try {
        // Fetch mistakes
        const { data: mistakesData, error } = await supabase
          .from("mistakes")
          .select("*")
          .eq("user_id", (await supabase.auth.getUser()).data.user?.id)
          .order("last_seen", { ascending: false });

        if (error) throw error;
        setMistakes(mistakesData || []);

        // Fetch topics with mistake counts
        const topicIds = [...new Set(mistakesData?.map((m: Mistake) => m.topic_id) || [])];
        const { data: topicsData, error: topicsError } = await supabase
          .from("topics")
          .select("*")
          .in("id", topicIds);

        if (topicsError) throw topicsError;

        const mistakeCounts: Record<string, number> = {};
        mistakesData?.forEach((m: Mistake) => {
          mistakeCounts[m.topic_id] = (mistakeCounts[m.topic_id] || 0) + m.incorrect_count;
        });

        setReviewTopics(
          (topicsData || []).map((topic: { id: string; name: string; mastery_state: string; total_attempts: number; correct_attempts: number; hints_used: number; last_studied: string | null }) => ({
            id: topic.id,
            name: topic.name,
            mastery_state: topic.mastery_state as ReviewTopic["mastery_state"],
            total_attempts: topic.total_attempts,
            correct_attempts: topic.correct_attempts,
            hints_used: topic.hints_used,
            mistake_count: mistakeCounts[topic.id] || 0,
            last_studied: topic.last_studied,
          }))
        );
      } catch (err) {
        console.error("Failed to load review data:", err);
        setError("Failed to load review data. Please try again.");
      }
      setLoading(false);
    }

    loadReviewData();
  }, []);

  if (loading) {
    return (
      <StudyShell
        breadcrumbs={[
          { label: "Mistakes / Review", href: "/review" },
        ]}
      >
        <div className="max-w-2xl mx-auto space-y-8">
          <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
            <span className="material-symbols-outlined text-[36px] text-primary animate-spin">
              build
            </span>
            <p className="text-sm text-outline font-mono">Loading your review data...</p>
          </div>
        </div>
      </StudyShell>
    );
  }

  if (error) {
    return (
      <StudyShell
        breadcrumbs={[
          { label: "Mistakes / Review", href: "/review" },
        ]}
      >
        <div className="max-w-2xl mx-auto p-6">
          <div className="bg-error-container/20 border border-error-crimson/30 rounded-xl p-6">
            <div className="flex items-start gap-4">
              <span className="material-symbols-outlined text-[48px] text-error-crimson">
                error
              </span>
              <div>
                <h2 className="text-xl font-bold text-error-crimson">Could not load review data</h2>
                <p className="text-sm text-on-surface-variant">{error}</p>
                <Button variant="outline" size="sm" onClick={() => window.location.reload()} className="mt-3">
                  Retry
                </Button>
              </div>
            </div>
          </div>
        </div>
      </StudyShell>
    );
  }

  return (
    <StudyShell
      breadcrumbs={[
        { label: "Mistakes / Review", href: "/review" },
      ]}
    >
      <div className="max-w-2xl mx-auto space-y-8">
        <div className="grid gap-6">
          {/* Mistakes Summary */}
          <Card padding="md" className="border border-surface-container-high">
            <h3 className="text-base font-semibold text-on-surface mb-4">
              <span className="material-symbols-outlined text-primary text-[24px]">
                error
              </span>
              Mistakes Summary
            </h3>
            {mistakes.length === 0 ? (
              <p className="text-on-surface-variant">
                No mistakes recorded yet. Keep practicing to build your mistake log!
              </p>
            ) : (
              <div className="space-y-3">
                {mistakes.slice(0, 5).map((mistake: Mistake) => (
                  <div key={mistake.id} className="p-3 bg-surface-container-low rounded-lg border border-surface-container-high">
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0">
                        <span className="material-symbols-outlined text-[16px]">
                          error
                        </span>
                      </div>
                      <div className="flex-1">
                        <h4 className="text-sm font-medium text-on-surface">
                          {mistake.description || "Unknown mistake"}
                        </h4>
                        <p className="text-xs text-on-surface-variant">
                          {mistake.incorrect_count} incorrect • {mistake.correct_count} correct
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Topics Needing Review */}
          {reviewTopics.length > 0 ? (
            <Card padding="md" className="border border-surface-container-high">
              <h3 className="text-base font-semibold text-on-surface mb-4">
                <span className="material-symbols-outlined text-primary text-[24px]">
                  repeat
                </span>
                Topics Needing Review
              </h3>
              <div className="space-y-3">
                {reviewTopics
                  .filter((t) => t.mistake_count > 0 || t.mastery_state === "review_needed")
                  .slice(0, 5)
                  .map((topic: ReviewTopic) => (
                    <div key={topic.id} className="p-3 bg-surface-container-low rounded-lg border border-surface-container-high">
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0">
                          <span className="material-symbols-outlined text-[16px]">
                            repeat
                          </span>
                        </div>
                        <div className="flex-1">
                          <h4 className="text-sm font-medium text-on-surface">
                            {topic.name}
                          </h4>
                          <p className="text-xs text-on-surface-variant">
                            Mistakes: {topic.mistake_count}
                          </p>
                          {topic.mastery_state === "review_needed" && (
                            <span className="text-xs text-error-crimson">Review needed</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </Card>
          ) : (
            <EmptyState
              title="No topics need review"
              description="Great job! All topics are strong. Keep up the learning."
              icon="check_circle"
              action={<Link href="/study" className="text-primary hover:underline">Continue learning</Link>}
            />
          )}
        </div>
      </div>
    </StudyShell>
  );
}