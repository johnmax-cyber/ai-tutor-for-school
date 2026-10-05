"use client";

import { useState, useRef, useEffect, FormEvent } from "react";
import type { TutorAnswer, TutorChatMessage, Citation } from "@/types/tutor";

interface TutorChatProps {
  resources: { id: string; title: string }[];
  initialResourceId?: string;
}

export function TutorChat({ resources, initialResourceId }: TutorChatProps) {
  const [messages, setMessages] = useState<TutorAnswer[]>([]);
  const [question, setQuestion] = useState("");
  const [selectedResourceId, setSelectedResourceId] = useState(
    initialResourceId ?? ""
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!question.trim() || isLoading) return;

    const userQuestion = question;
    setQuestion("");
    setError(null);
    setIsLoading(true);

    const history: TutorChatMessage[] = messages.slice(-6).flatMap((m) => [
      { role: "user" as const, content: m.answer },
      ...(m.citations.length > 0
        ? []
        : [{ role: "assistant" as const, content: m.answer }]),
    ]);

    try {
      const res = await fetch("/api/tutor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: userQuestion,
          resourceId: selectedResourceId || undefined,
          history,
        }),
      });

      const data: TutorAnswer = await res.json();

      if (!res.ok) {
        throw new Error("The tutor service encountered an internal error.");
      }

      setMessages((prev) => [...prev, data]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as FormEvent);
    }
  };

  const renderCitations = (citations: Citation[]) => (
    <div className="mt-2 flex flex-wrap gap-2">
      {citations.map((c) => (
        <details key={c.chunk_id} className="group">
          <summary className="cursor-pointer rounded bg-zinc-100 dark:bg-zinc-800 px-2 py-1 text-xs font-medium text-zinc-700 dark:text-zinc-300">
            {c.resource_title} · p.{c.page_number}
          </summary>
          <div className="mt-1 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-2 text-xs text-zinc-600 dark:text-zinc-400 max-h-32 overflow-auto">
            {c.content}
          </div>
        </details>
      ))}
    </div>
  );

  return (
    <section className="space-y-4">
      {resources.length > 1 && (
        <div className="flex items-center gap-2">
          <label htmlFor="resource-select" className="text-sm font-medium">
            Document
          </label>
          <select
            id="resource-select"
            value={selectedResourceId}
            onChange={(e) => setSelectedResourceId(e.target.value)}
            className="flex-1 max-w-xs rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All documents</option>
            {resources.map((r) => (
              <option key={r.id} value={r.id}>
                {r.title}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="flex flex-col gap-4 max-h-[60vh] overflow-y-auto">
        {messages.map((msg, idx) => (
          <div key={idx} className="space-y-2">
            <div className="prose prose-sm dark:prose-invert max-w-none">
              {msg.answer}
            </div>
            {msg.grounded && msg.citations.length > 0 && (
              <>
                <div className="text-xs text-zinc-500 dark:text-zinc-400">
                  Sources:
                </div>
                {renderCitations(msg.citations)}
              </>
            )}
            {!msg.grounded && (
              <span className="inline-block rounded bg-amber-100 dark:bg-amber-900 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-300">
                Not found in your materials
              </span>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {error && (
        <div className="rounded bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-2">
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            maxLength={500}
            rows={3}
            placeholder={isLoading ? "Thinking..." : "Ask a question about your documents..."}
            className="w-full rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <div className="absolute bottom-1 right-2 text-xs text-zinc-400">
            {question.length}/500
          </div>
        </div>
        <button
          type="submit"
          disabled={isLoading || !question.trim()}
          className="w-full rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? "Thinking..." : "Send"}
        </button>
      </form>
    </section>
  );
}