"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { StudySessionPlayer } from "@/components/study-session-player";
import { StudyHandoff } from "@/components/study-handoff";
import { StudySession } from "@/types/study";

export default function StudySessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [session, setSession] = useState<StudySession | null>(null);
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
      } catch (err) {
        setError("Failed to load session");
      } finally {
        setLoading(false);
      }
    }
    fetchSession();
  }, [id]);

  if (loading) {
    return <div className="p-6">Loading session...</div>;
  }

  if (error) {
    return (
      <div className="p-6">
        <h2 className="text-xl font-bold text-red-600">Error</h2>
        <p className="mt-2">{error}</p>
        <Link href="/study" className="inline-block mt-4 px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">
          ← Back to Study Hub
        </Link>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="p-6 text-center py-12">
        <h2 className="text-xl font-bold">Session not found</h2>
        <p className="mt-4 text-gray-600">
          The session you're looking for doesn't exist or you don't have access to it.
        </p>
        <Link href="/study" className="inline-block mt-4 px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">
          ← Back to Study Hub
        </Link>
      </div>
    );
  }

  // If session is completed, show handoff
  if (session.status === "completed") {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold">Session Completed</h1>
          <Link href="/study" className="text-sm text-blue-600 hover:text-blue-700">
            ← Back to Study Hub
          </Link>
        </div>

        <StudyHandoff handoffText={session.handoff_text ?? ""} />
        
        <div className="mt-6">
          <Link
            href="/study/new"
            className="inline-block px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Start New Session
          </Link>
        </div>
      </div>
    );
  }

  // If session is active, show the player
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">{session.topic_name}</h1>
        {session.subject_name && (
          <span className="text-sm text-gray-500 ml-2">({session.subject_name})</span>
        )}
        <Link href="/study" className="text-sm text-blue-600 hover:text-blue-700">
          ← Back to Study Hub
        </Link>
      </div>

      <StudySessionPlayer 
        sessionId={session.id} 
        onSessionComplete={() => {
          window.location.reload();
        }}
      />
    </div>
  );
}