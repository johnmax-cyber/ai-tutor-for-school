"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { StudySession } from "@/types/study";

export default function StudyHub() {
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchSessions() {
      try {
        const res = await fetch("/api/study/sessions");
        if (!res.ok) throw new Error("Failed to fetch sessions");
        const data = await res.json();
        setSessions(data.sessions || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }
    fetchSessions();
  }, []);

  if (loading) {
    return <div className="p-6">Loading sessions...</div>;
  }

  if (error) {
    return (
      <div className="p-6">
        <h2 className="text-xl font-bold text-red-600">Error</h2>
        <p className="mt-2">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Study Sessions</h1>
        <Link
          href="/study/new"
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          Start New Session
        </Link>
      </div>

      <div className="space-y-4">
        <div className="border-t pt-4">
          <h2 className="text-lg font-semibold mb-2">Active Sessions</h2>
          {sessions
            .filter(s => s.status === "active")
            .map(session => (
              <div key={session.id} className="border border-gray-200 rounded-lg p-4 hover:border-blue-300">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h3 className="font-medium">{session.topic_name}</h3>
                    {session.subject_name && (
                      <span className="text-sm text-gray-500 ml-2">({session.subject_name})</span>
                    )}
                  </div>
                  <span className={`px-2 py-1 text-xs rounded-full ${
                    session.status === "active" 
                      ? "bg-blue-100 text-blue-800" 
                      : "bg-gray-100 text-gray-800"
                  }`}>
                    {session.status}
                  </span>
                </div>
                <p className="text-sm text-gray-600">
                  Started: {new Date(session.started_at).toLocaleDateString()}
                </p>
                {session.handoff_text && (
                  <div className="mt-2 pt-2 border-t border-gray-100">
                    <p className="text-sm text-gray-600">
                      {session.handoff_text.substring(0, 100)}{session.handoff_text.length > 100 ? "..." : ""}
                    </p>
                  </div>
                )}
                <Link
                  href={`/study/${session.id}`}
                  className="mt-3 inline-block px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                >
                  Continue Session
                </Link>
              </div>
            ))}
          {sessions.filter(s => s.status === "active").length === 0 && (
            <p className="text-sm text-gray-500 italic">No active sessions</p>
          )}
        </div>

        <div className="border-t pt-4">
          <h2 className="text-lg font-semibold mb-2">Past Sessions</h2>
          {sessions
            .filter(s => s.status === "completed")
            .map(session => (
              <div key={session.id} className="border border-gray-200 rounded-lg p-4 hover:border-blue-300">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h3 className="font-medium">{session.topic_name}</h3>
                    {session.subject_name && (
                      <span className="text-sm text-gray-500 ml-2">({session.subject_name})</span>
                    )}
                  </div>
                  <span className={`px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-800`}>
                    Completed
                  </span>
                </div>
                <p className="text-sm text-gray-600">
                  {new Date(session.started_at).toLocaleDateString()} • {new Date(session.ended_at ?? session.started_at).toLocaleDateString()}
                </p>
                {session.handoff_text && (
                  <div className="mt-2 pt-2 border-t border-gray-100">
                    <p className="text-sm text-gray-600">
                      {session.handoff_text.substring(0, 100)}{session.handoff_text.length > 100 ? "..." : ""}
                    </p>
                  </div>
                )}
                <Link
                  href={`/study/${session.id}`}
                  className="mt-3 inline-block px-3 py-1 bg-gray-600 text-white rounded text-sm hover:bg-gray-700"
                >
                  Review Session
                </Link>
              </div>
            ))}
          {sessions.filter(s => s.status === "completed").length === 0 && (
            <p className="text-sm text-gray-500 italic">No completed sessions yet</p>
          )}
        </div>
      </div>
    </div>
  );
}