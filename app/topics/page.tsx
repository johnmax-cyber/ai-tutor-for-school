"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { StudyShell } from "@/components/study-shell";
import TopicCard from "@/components/topic-card";
import { Button, Alert } from "@/components/ui";
import type { Topic } from "@/types/study";

export default function TopicsPage() {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newTopicName, setNewTopicName] = useState("");
  const [newSubjectName, setNewSubjectName] = useState("");
  const [creatingTopic, setCreatingTopic] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);

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
      setShowCreateModal(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create topic");
    } finally {
      setCreatingTopic(false);
    }
  };

  if (loading) {
    return (
      <StudyShell breadcrumbs={[{ label: "Subjects & Topics" }]}>
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
    <StudyShell breadcrumbs={[{ label: "Subjects & Topics" }]}>
      <div className="space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-surface-container-high">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-on-surface flex items-center gap-2.5">
              <span className="material-symbols-outlined text-primary text-[28px]">
                category
              </span>
              <span>Academic Topics &amp; Taxonomy</span>
            </h1>
            <p className="text-xs sm:text-sm text-on-surface-variant mt-1">
              Organize your curriculum, track spaced mastery, and launch targeted drill sessions.
            </p>
          </div>

          <div className="flex items-center gap-2.5 self-start sm:self-auto">
            <Button
              variant={showCreateModal ? "secondary" : "primary"}
              onClick={() => setShowCreateModal(!showCreateModal)}
            >
              {showCreateModal ? "Cancel" : "New Topic"}
            </Button>
            <Link href="/study" className="hidden sm:inline-block">
              <Button variant="outline" size="sm">
                Study Hub
              </Button>
            </Link>
          </div>
        </div>

        {error && (
          <Alert variant="error" icon={false}>
            {error}
          </Alert>
        )}

        {showCreateModal && (
          <div className="p-6 rounded-xl bg-surface-container-low border border-primary/30 shadow-sm space-y-4">
            <h2 className="text-base font-semibold text-on-surface flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-[20px]">
                add_box
              </span>
              <span>Define New Topic</span>
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
                    placeholder="e.g. Metric Spaces &amp; Compactness"
                    className="w-full px-3.5 py-2 rounded-lg bg-surface-container border border-surface-container-high text-sm text-on-surface placeholder:text-outline focus:outline-none focus:border-primary"
                    disabled={creatingTopic}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-outline mb-1.5">
                    Subject / Department (Optional)
                  </label>
                  <input
                    type="text"
                    value={newSubjectName}
                    onChange={(e) => setNewSubjectName(e.target.value)}
                    placeholder="e.g. Mathematics"
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
                {creatingTopic ? "Creating..." : "Create Topic"}
              </Button>
            </form>
          </div>
        )}

        <div>
          <h2 className="text-base font-semibold text-on-surface mb-4">
            Configured Topics ({topics.length})
          </h2>

          {topics.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {topics.map((topic) => (
                <TopicCard key={topic.id} topic={topic} />
              ))}
            </div>
          ) : (
            <div className="p-8 rounded-xl bg-surface-container/30 border border-dashed border-surface-container-high text-center">
              <span className="material-symbols-outlined text-[42px] text-outline mb-2">
                category
              </span>
              <p className="text-sm text-outline">
                No topics created yet. Define your first topic above to start categorizing your library.
              </p>
            </div>
          )}
        </div>
      </div>
    </StudyShell>
  );
}