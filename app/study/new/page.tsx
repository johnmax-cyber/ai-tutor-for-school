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
  last_studied: string | null;
  next_review_at: string | null;
  resource_count: number;
}

export default function StudyNew() {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newTopicName, setNewTopicName] = useState("");
  const [newSubjectName, setNewSubjectName] = useState("");
  const [creatingTopic, setCreatingTopic] = useState(false);
  const router = useRouter();

  useEffect(() => {
    async function fetchTopics() {
      try {
        const res = await fetch("/api/topics");
        if (!res.ok) throw new Error("Failed to fetch topics");
        const data = await res.json();
        setTopics(data.topics || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }
    fetchTopics();
  }, []);

  const handleCreateTopic = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTopicName.trim()) return;

    setCreatingTopic(true);
    setError(null);

    try {
      const res = await fetch("/api/topics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newTopicName,
          subject: newSubjectName || undefined,
        }),
      });

      if (!res.ok) throw new Error("Failed to create topic");

      const data = await res.json();
      setNewTopicName("");
      setNewSubjectName("");
      setTopics((prev) => [data.topic, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create topic");
    } finally {
      setCreatingTopic(false);
    }
  };

  const handleStartSession = async (topicId: string) => {
    try {
      const res = await fetch("/api/study/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topicId }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to start session");
      }

      const data = await res.json();
      router.push(`/study/${data.session.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start session");
    }
  };

  if (loading) {
    return (
      <StudyShell
        breadcrumbs={[
          { label: "Study Hub", href: "/study" },
          { label: "New Session" },
        ]}
      >
        <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
          <span className="material-symbols-outlined text-[36px] text-primary animate-spin">
            progress_activity
          </span>
          <p className="text-sm text-outline font-mono">Loading topics...</p>
        </div>
      </StudyShell>
    );
  }

  return (
    <StudyShell
      breadcrumbs={[
        { label: "Study Hub", href: "/study" },
        { label: "New Session" },
      ]}
    >
      <div className="space-y-8">
        <div className="flex items-center justify-between pb-4 border-b border-surface-container-high">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-on-surface flex items-center gap-2.5">
              <span className="material-symbols-outlined text-primary text-[28px]">
                flash_on
              </span>
              <span>Start Adaptive Drill</span>
            </h1>
            <p className="text-xs sm:text-sm text-on-surface-variant mt-1">
              Select an ingested topic to launch an AI-evaluated retrieval drill.
            </p>
          </div>
          <Link
            href="/study"
            className="text-xs sm:text-sm text-outline hover:text-on-surface flex items-center gap-1 transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">
              arrow_back
            </span>
            <span>Back to Hub</span>
          </Link>
        </div>

        {error && (
          <div className="p-4 rounded-xl bg-error-container/20 border border-error-crimson/30 text-error-crimson text-sm flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px]">error</span>
            <span>{error}</span>
          </div>
        )}

        <div className="p-6 rounded-xl bg-surface-container-low border border-surface-container-high shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-on-surface flex items-center gap-2">
              <span className="material-symbols-outlined text-secondary text-[20px]">
                category
              </span>
              <span>Available Topics ({topics.length})</span>
            </h2>
          </div>

          {topics.length === 0 ? (
            <div className="p-8 rounded-lg bg-surface-container/30 border border-dashed border-surface-container-high text-center">
              <p className="text-sm text-outline">
                No topics configured yet. Create a topic below or assign a document to one in your library.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {topics.map((topic) => {
                const accuracy =
                  topic.total_attempts > 0
                    ? Math.round((topic.correct_attempts / topic.total_attempts) * 100)
                    : 0;

                const hasResources = topic.resource_count > 0;

                return (
                  <div
                    key={topic.id}
                    className="p-5 rounded-xl bg-surface-container border border-surface-container-high hover:border-primary/50 transition-colors flex flex-col justify-between gap-4 shadow-sm"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-base text-on-surface truncate">
                          {topic.name}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-surface-container-high border border-outline-variant/30 text-xs font-mono text-secondary capitalize">
                          {topic.mastery_state.replace("_", " ")}
                        </span>
                      </div>

                      {topic.subject_name && (
                        <p className="text-xs text-outline">
                          Subject: {topic.subject_name}
                        </p>
                      )}

                      <div className="flex items-center gap-3 text-xs text-outline font-mono">
                        <span>{topic.resource_count} doc{topic.resource_count === 1 ? "" : "s"}</span>
                        <span>•</span>
                        <span className="text-secondary font-semibold">
                          {accuracy}% accuracy
                        </span>
                      </div>

                      {!hasResources && (
                        <p className="text-[11px] text-warning flex items-center gap-1 pt-1">
                          <span className="material-symbols-outlined text-[14px]">
                            warning
                          </span>
                          <span>No resources assigned yet.</span>
                        </p>
                      )}
                    </div>

                    <button
                      onClick={() => handleStartSession(topic.id)}
                      disabled={!hasResources}
                      className="flex items-center justify-center gap-1.5 w-full py-2 rounded-lg bg-primary text-on-primary text-xs font-semibold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
                    >
                      <span className="material-symbols-outlined text-[16px]">
                        play_arrow
                      </span>
                      <span>Launch Session</span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="p-6 rounded-xl bg-surface-container-low border border-surface-container-high shadow-sm space-y-4">
          <h2 className="text-base font-semibold text-on-surface flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[20px]">
              add_circle
            </span>
            <span>Create New Study Topic</span>
          </h2>

          <form onSubmit={handleCreateTopic} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-outline mb-1.5">
                  Topic Name
                </label>
                <input
                  type="text"
                  value={newTopicName}
                  onChange={(e) => setNewTopicName(e.target.value)}
                  placeholder="e.g. Metric Spaces &amp; Topology"
                  className="w-full px-3.5 py-2 rounded-lg bg-surface-container border border-surface-container-high text-sm text-on-surface placeholder:text-outline focus:outline-none focus:border-primary"
                  disabled={creatingTopic}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-outline mb-1.5">
                  Subject / Course (Optional)
                </label>
                <input
                  type="text"
                  value={newSubjectName}
                  onChange={(e) => setNewSubjectName(e.target.value)}
                  placeholder="e.g. Real Analysis II"
                  className="w-full px-3.5 py-2 rounded-lg bg-surface-container border border-surface-container-high text-sm text-on-surface placeholder:text-outline focus:outline-none focus:border-primary"
                  disabled={creatingTopic}
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={creatingTopic || !newTopicName.trim()}
              className="w-full"
            >
              {creatingTopic ? "Creating..." : "Save Topic"}
            </Button>
          </form>
        </div>

        <div className="pt-4">
          <Link
            href="/study"
            className="inline-flex items-center gap-2 px-3 py-1.5 bg-surface-container-low border border-surface-container-high text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors text-sm"
          >
            <span className="material-symbols-outlined text-[18px]">arrow_back</span>
            Back to Study Hub
          </Link>
        </div>
      </div>
    </StudyShell>
  );
}