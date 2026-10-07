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
    <div className="mt-3 flex flex-wrap gap-2">
      {citations.map((c) => (
        <details key={c.chunk_id} className="group w-full sm:w-auto">
          <summary className="cursor-pointer inline-flex items-center gap-1.5 rounded bg-tertiary/10 border border-tertiary/30 px-2.5 py-1 text-xs font-mono text-tertiary hover:bg-tertiary/20 transition-colors">
            <span className="material-symbols-outlined text-[14px]">link</span>
            <span>
              {c.resource_title} • Page {c.page_number}
            </span>
          </summary>
          <div className="mt-2 rounded-lg border border-surface-container-high bg-surface-container-lowest p-3 text-xs text-on-surface-variant font-mono leading-relaxed max-h-48 overflow-auto shadow-inner">
            <div className="text-[11px] text-outline mb-1">
              CHUNK EXCERPT (PAGE {c.page_number}):
            </div>
            {c.content}
          </div>
        </details>
      ))}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Document Scope Filter Bar - Academic Theme */}
      {resources.length > 1 && (
        <div className="p-3.5 rounded-xl bg-surface-container-low border border-surface-container-high flex flex-wrap items-center justify-between gap-3 text-xs shadow-sm">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[18px]">
              filter_list
            </span>
            <span className="font-semibold text-on-surface">Target Corpus:</span>
          </div>
          <select
            id="resource-select"
            value={selectedResourceId}
            onChange={(e) => setSelectedResourceId(e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-surface-container border border-surface-container-high text-on-surface text-xs font-medium focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">All Indexed Documents</option>
            {resources.map((r) => (
              <option key={r.id} value={r.id}>
                {r.title}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Messages Stream - Academic Companion Interface */}
      <div className="flex flex-col gap-4 min-h-[350px] max-h-[60vh] overflow-y-auto pr-1">
        {messages.length === 0 ? (
          <div className="p-8 rounded-xl bg-surface-container-low border border-dashed border-surface-container-high flex flex-col items-center justify-center text-center gap-3 my-auto">
            <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
              <span className="material-symbols-outlined text-[26px]">
                psychology
              </span>
            </div>
            <div>
              <h3 className="font-semibold text-base text-on-surface">
                Academic Companion Ready
              </h3>
              <p className="text-xs text-on-surface-variant max-w-sm mt-1">
                Ask questions regarding definitions, lemmas, or calculations in
                your documents. Responses are strictly grounded in your materials.
              </p>
            </div>

            {/* Quick suggested prompts - Contextual queries */}
            <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
              <button
                type="button"
                onClick={() =>
                  setQuestion("Summarize the primary definitions and key points.")
                }
                className="px-3 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high border border-outline-variant/30 text-xs text-on-surface transition-colors"
              >
                Summarize key definitions
              </button>
              <button
                type="button"
                onClick={() =>
                  setQuestion(
                    "What are the major theorems and proof techniques used here?"
                  )
                }
                className="px-3 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high border border-outline-variant/30 text-xs text-on-surface transition-colors"
              >
                Theorems &amp; proof methods
              </button>
              <button
                type="button"
                onClick={() =>
                  setQuestion(
                    "Explain how these concepts build on previous material."
                  )
                }
                className="px-3 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high border border-outline-variant/30 text-xs text-on-surface transition-colors"
              >
                Concept relationships
              </button>
              <button
                type="button"
                onClick={() =>
                  setQuestion(
                    "Identify potential counterexamples or exceptions."
                  )
                }
                className="px-3 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high border border-outline-variant/30 text-xs text-on-surface transition-colors"
              >
                Counterexamples
              </button>
            </div>
          </div>
        ) : (
          messages.map((msg, idx) => (
            <div
              key={idx}
              className="p-5 rounded-xl bg-surface-container-low border border-surface-container-high shadow-sm space-y-3"
            >
              <div className="flex items-center justify-between pb-2 border-b border-surface-container-high text-xs">
                <div className="flex items-center gap-2 font-semibold text-primary">
                  <span className="material-symbols-outlined text-[16px]">
                    smart_toy
                  </span>
                  <span>Academic Companion</span>
                </div>
                {msg.grounded ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-secondary/10 text-secondary border border-secondary/20 text-[11px] font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-secondary"></span>
                    Verified &amp; Grounded
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-warning/10 text-warning border border-warning/20 text-[11px] font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-warning"></span>
                    Not Found in Materials
                  </span>
                )}
              </div>

              <div className="text-sm text-on-surface leading-relaxed whitespace-pre-line font-sans">
                {msg.answer}
              </div>

              {msg.grounded && msg.citations.length > 0 && (
                <div className="pt-2 border-t border-surface-container-high">
                  <div className="text-[11px] font-semibold text-outline uppercase tracking-wider">
                    Grounding Citations ({msg.citations.length})
                  </div>
                  {renderCitations(msg.citations)}
                </div>
              )}
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {error && (
        <div className="p-3.5 rounded-lg bg-error-container/20 border border-error-crimson/30 text-error-crimson text-xs flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px]">error</span>
          <span>{error}</span>
        </div>
      )}

      {/* Input Console - Academic Theme */}
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="p-3 rounded-xl bg-surface-container-low border border-surface-container-high shadow-sm focus-within:border-primary transition-colors flex flex-col gap-2">
          <textarea
            ref={textareaRef}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            maxLength={500}
            rows={3}
            placeholder={
              isLoading
                ? "Synthesizing answer from grounded citations..."
                : "Ask a question about your documents, theorems, or formulas..."
            }
            className="w-full bg-transparent text-sm text-on-surface placeholder:text-outline font-sans outline-none resize-none disabled:opacity-50"
          />

          <div className="flex items-center justify-between pt-2 border-t border-surface-container-high">
            <span className="text-[11px] text-outline font-mono">
              {question.length}/500 chars • Press Enter to send
            </span>

            <button
              type="submit"
              disabled={isLoading || !question.trim()}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-primary text-on-primary text-xs font-semibold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
            >
              <span className="material-symbols-outlined text-[16px]">
                {isLoading ? "hourglass_empty" : "send"}
              </span>
              <span>{isLoading ? "Synthesizing..." : "Send Prompt"}</span>
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}