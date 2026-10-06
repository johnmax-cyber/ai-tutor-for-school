"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface Topic {
  id: string;
  name: string;
  description: string;
  subject_name: string | null;
  mastery_state: string;
  total_attempts: number;
  correct_attempts: number;
  last_studied: string | null;
  resource_count: number;
}

export default function StudyNew() {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newTopicName, setNewTopicName] = useState("");
  const [newSubjectName, setNewSubjectName] = useState("");
  const [creatingTopic, setCreatingTopic] = useState(false);

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
      setTopics(prev => [data.topic, ...prev]);
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
        const error = await res.json();
        throw new Error(error.error || "Failed to start session");
      }

      const data = await res.json();
      window.location.href = `/study/${data.session.id}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start session");
    }
  };

  if (loading) {
    return <div className="p-6">Loading topics...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Start Study Session</h1>
        <Link href="/study" className="text-sm text-blue-600 hover:text-blue-700">
          ← Back to Study Hub
        </Link>
      </div>

      <div className="border rounded-lg p-4">
        <h2 className="text-lg font-semibold mb-4">Choose a Topic</h2>
        {topics.length > 0 ? (
          <div className="space-y-3">
            {topics.map(topic => (
              <div key={topic.id} className="p-3 border border-gray-200 rounded-lg hover:border-blue-300">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium">{topic.name}</h3>
                    {topic.subject_name && (
                      <p className="text-sm text-gray-500">{topic.subject_name}</p>
                    )}
                    <p className="text-sm text-gray-600">
                      {topic.resource_count} resources • {topic.total_attempts > 0 ? Math.round((topic.correct_attempts / topic.total_attempts) * 100) : 0}% accuracy
                    </p>
                  </div>
                  <button
                    onClick={() => handleStartSession(topic.id)}
                    disabled={topic.resource_count === 0}
                    className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Start Session
                  </button>
                </div>
                {topic.resource_count === 0 && (
                  <p className="mt-2 text-sm text-amber-600">
                    No ready resources assigned to this topic
                  </p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500 text-center py-8">
            No topics yet. Create your first topic below!
          </p>
        )}
      </div>

      <div className="border rounded-lg p-4">
        <h2 className="text-lg font-semibold mb-4">Create New Topic</h2>
        <form onSubmit={handleCreateTopic} className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">Topic Name</label>
            <input
              type="text"
              value={newTopicName}
              onChange={(e) => setNewTopicName(e.target.value)}
              placeholder="Enter topic name"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={creatingTopic}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Subject (Optional)</label>
            <input
              type="text"
              value={newSubjectName}
              onChange={(e) => setNewSubjectName(e.target.value)}
              placeholder="Enter subject name"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={creatingTopic}
            />
          </div>
          <button
            type="submit"
            disabled={creatingTopic || !newTopicName.trim()}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {creatingTopic ? "Creating..." : "Create Topic"}
          </button>
        </form>
      </div>
    </div>
  );
}