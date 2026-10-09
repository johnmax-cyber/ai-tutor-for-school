"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { StudyShell } from "@/components/study-shell";
import { Button } from "@/components/ui";

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

export default function PracticeNewPage() {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [questionCount, setQuestionCount] = useState(5);
  const [mode, setMode] = useState("practice");
  const router = useRouter();

  useEffect(() => {
    async function loadTopics() {
      try {
        setLoading(true);
        const res = await fetch(`/api/topics`);
        if (!res.ok) throw new Error("Failed to load topics");
        const data = await res.json();
        setTopics(data.topics || []);
        setLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
        setLoading(false);
      }
    }

    loadTopics();
  }, []);

  const handleStartPractice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTopicId) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/practice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topicId: selectedTopicId })
      });

      if (!res.ok) throw new Error("Failed to start practice session");

      const data = await res.json();
      // Redirect to the practice session page with the sessionId and our configuration
      // We'll pass the questionCount and mode as query parameters
      router.push(`/practice/${data.session.id}?questionCount=${questionCount}&mode=${mode}`);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to start practice session");
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <StudyShell>
        <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
          <span className="material-symbols-outlined text-[36px] text-primary animate-spin">
            progress_activity
          </span>
          <p className="text-sm text-outline font-mono">Loading topics...</p>
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
              <span className="material-symbols-outlined text-[48px] text-error-crimson">
                error
              </span>
              <div>
                <h2 className="text-xl font-bold text-error-crimson">Could not load topics</h2>
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

  return (
    <StudyShell>
      <div className="max-w-2xl mx-auto p-4 sm:p-6">
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-on-surface flex items-center gap-2.5">
            <span className="material-symbols-outlined text-primary text-[28px]">
              psyche
            </span>
            <span>New Practice Session</span>
          </h1>
          <p className="text-sm text-on-surface-variant mt-1">
            Configure your practice session below.
          </p>
        </div>

        <form onSubmit={handleStartPractice} className="space-y-4">
          {/* Topic Selection */}
          <div className="space-y-3">
            <label className="block text-sm font-medium text-on-surface mb-2">
              Topic
            </label>
            {topics.length === 0 ? (
              <p className="text-sm text-on-surface-variant">
                No topics available. Create a topic first.
              </p>
            ) : (
              <div className="space-y-2">
                {topics.map((topic) => (
                  <div
                    key={topic.id}
                    className={`flex items-center gap-3 p-3 rounded-lg border border-surface-container-high hover:border-primary/50 transition-colors ${
                      selectedTopicId === topic.id ? "border-primary/20 bg-primary/10" : ""
                    }`}
                    onClick={() => setSelectedTopicId(topic.id)}
                  >
                    <div className="flex items-center gap-2">
                      <div className="flex-shrink-0">
                        <span className="material-symbols-outlined text-[24px]">
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
                        <div className="flex items-center gap-2 mt-1">
                          <span className="material-symbols-outlined text-[16px] text-outline">
                            psychology_alt
                          </span>
                          <span className={getMasteryStateColor(topic.mastery_state)}>
                            {getMasteryStateLabel(topic.mastery_state)}
                          </span>
                        </div>
                        {topic.next_review_at && (
                          <div className="text-xs text-on-surface-variant">
                            Next review: {new Date(topic.next_review_at).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Question Count */}
          <div className="space-y-3">
            <label className="block text-sm font-medium text-on-surface mb-2">
              Number of questions
            </label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setQuestionCount(Math.max(1, questionCount - 1))}
                disabled={questionCount <= 1}
                className="px-3 py-1.5 rounded-lg bg-surface-container-low border border-surface-container-high text-on-surface hover:bg-surface-container hover:text-on-surface transition-colors"
              >
                <span className="material-symbols-outlined text-[20px]">remove</span>
              </button>
              <span className="px-4 py-1.5 rounded-lg bg-surface-container-low border border-surface-container-high text-on-surface min-w-[40px] text-center">
                {questionCount}
              </span>
              <button
                type="button"
                onClick={() => setQuestionCount(questionCount + 1)}
                className="px-3 py-1.5 rounded-lg bg-surface-container-low border border-surface-container-high text-on-surface hover:bg-surface-container hover:text-on-surface transition-colors"
              >
                <span className="material-symbols-outlined text-[20px]">add</span>
              </button>
              <p className="text-xs text-on-surface-variant ml-4">
                (default: 5)
              </p>
            </div>
          </div>

          {/* Mode Selector */}
          <div className="space-y-3">
            <label className="block text-sm font-medium text-on-surface mb-2">
              Mode
            </label>
            <div className="space-y-2">
              <div
                className={`p-3 rounded-lg border border-surface-container-high cursor-pointer hover:border-primary/50 transition-colors ${
                  mode === "practice" ? "bg-primary/10 text-primary" : ""
                }`}
                onClick={() => setMode("practice")}
              >
                <span className="material-symbols-outiled text-[20px]">psychology_alt</span>
                <span className="ml-2">Practice</span>
              </div>
              <div
                className={`p-3 rounded-lg border border-surface-container-high cursor-pointer hover:border-primary/50 transition-colors ${
                  mode === "quiz" ? "bg-primary/10 text-primary" : ""
                }`}
                onClick={() => setMode("quiz")}
              >
                <span className="material-symbols-outiled text-[20px]">quiz</span>
                <span className="ml-2">Quiz me</span>
              </div>
              <div
                className={`p-3 rounded-lg border border-surface-container-high cursor-pointer hover:border-primary/50 transition-colors ${
                  mode === "exam" ? "bg-primary/10 text-primary" : ""
                }`}
                onClick={() => setMode("exam")}
              >
                <span className="material-symbols-outiled text-[20px]">text_snippet</span>
                <span className="ml-2">Exam preparation</span>
              </div>
            </div>
            <p className="text-xs text-on-surface-variant mt-2">
              Note: Only &quot;Practice&quot; mode is fully supported in this version.
            </p>
          </div>

          <div className="mt-6">
            <Button
              variant="primary"
              size="md"
              onClick={handleStartPractice}
              className="w-full"
            >
              Start Practice Session
            </Button>
          </div>
        </form>

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

// Helper functions
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

function getMasteryStateColor(state: Topic["mastery_state"]): string {
  switch (state) {
    case "strong": return "text-secondary";
    case "developing": return "text-primary";
    case "review_needed": return "text-error-crimson";
    case "not_started": return "text-on-surface-variant";
    case "learning": return "text-primary";
    default: return "text-on-surface-variant";
  }
}

function getMasteryStateLabel(state: Topic["mastery_state"]): string {
  return state.replace("_", " ");
}