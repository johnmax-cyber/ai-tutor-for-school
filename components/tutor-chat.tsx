"use client";

import { useState, useRef, useEffect, FormEvent, useCallback } from "react";
import type { TutorAnswer, TutorChatMessage, Citation } from "@/types/tutor";

interface ImageResource {
  id: string;
  title: string;
  mime_type: string;
  page_count: number | null;
}

interface TutorChatProps {
  resources: { id: string; title: string }[];
  imageResources: ImageResource[];
  initialResourceId?: string;
  visionConfigured: boolean;
}

export function TutorChat({ resources, imageResources, initialResourceId, visionConfigured }: TutorChatProps) {
  const [messages, setMessages] = useState<TutorAnswer[]>([]);
  const [question, setQuestion] = useState("");
  const [selectedResourceId, setSelectedResourceId] = useState(
    initialResourceId ?? ""
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showImagePicker, setShowImagePicker] = useState(false);
  const [selectedImageResource, setSelectedImageResource] = useState<{ resourceId: string; page: number } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pickerTriggerRef = useRef<HTMLButtonElement>(null);

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
      const body: Record<string, unknown> = {
        question: userQuestion,
        resourceId: selectedResourceId || undefined,
        history,
      };

      if (selectedImageResource) {
        body.imageResourceId = selectedImageResource.resourceId;
        body.imagePage = selectedImageResource.page;
      }

      const res = await fetch("/api/tutor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data: TutorAnswer = await res.json();

      if (!res.ok) {
        throw new Error("The tutor service encountered an internal error.");
      }

      setMessages((prev) => [...prev, data]);
      setSelectedImageResource(null);
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

  const openImagePicker = useCallback(() => {
    if (!visionConfigured) return;
    setShowImagePicker(true);
  }, [visionConfigured]);

  const closeImagePicker = useCallback(() => {
    setShowImagePicker(false);
  }, []);

  const handleImageSelect = useCallback((resourceId: string, page: number) => {
    setSelectedImageResource({ resourceId, page });
    setShowImagePicker(false);
  }, []);

  const clearSelectedImage = useCallback(() => {
    setSelectedImageResource(null);
  }, []);

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

  const imageResourceOptions = imageResources.filter(r => r.mime_type === "image/png" || r.mime_type === "image/jpeg" || r.mime_type === "image/jpg" || r.mime_type === "application/vnd.openxmlformats-officedocument.presentationml.presentation");

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
                Theorems & proof methods
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
                    Verified & Grounded
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

          {selectedImageResource && (
            <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-secondary/10 border border-secondary/30 text-sm text-secondary animate-in fade-in slide-in-from-top-2">
              <span className="material-symbols-outlined text-[18px]">image</span>
              <span className="flex-1 truncate">
                Image attached: {imageResources.find(r => r.id === selectedImageResource.resourceId)?.title || "Selected"} • Page {selectedImageResource.page}
              </span>
              <button
                type="button"
                onClick={clearSelectedImage}
                className="p-1 rounded hover:bg-secondary/20 text-secondary hover:text-on-surface transition-colors"
                aria-label="Remove attached image"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
          )}

          <div className="flex items-center justify-between pt-2 border-t border-surface-container-high">
            <span className="text-[11px] text-outline font-mono">
              {question.length}/500 chars • Press Enter to send
            </span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={openImagePicker}
                disabled={!visionConfigured || isLoading || imageResourceOptions.length === 0}
                className="p-2 rounded-lg bg-surface-container hover:bg-surface-container-high border border-surface-container-high text-on-surface text-[18px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
                aria-label={visionConfigured
                  ? imageResourceOptions.length === 0
                    ? "No image resources available. Upload images or slides first."
                    : "Attach an image from your library"
                  : "Vision not configured. Set AI_VISION_MODEL to enable image questions."}
                aria-expanded={showImagePicker}
                aria-haspopup="dialog"
                ref={pickerTriggerRef}
              >
                <span className="material-symbols-outlined">add_photo_alternate</span>
              </button>

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
        </div>
      </form>

      {/* Image Picker Modal */}
      {showImagePicker && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in"
          role="dialog"
          aria-modal="true"
          aria-labelledby="image-picker-title"
          onClick={closeImagePicker}
        >
          <div
            className="w-full max-w-md rounded-xl bg-surface-container-low border border-surface-container-high shadow-xl p-4 animate-in zoom-in-95 slide-in-from-bottom-2"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 id="image-picker-title" className="text-lg font-semibold text-on-surface">
                Attach Image
              </h3>
              <button
                type="button"
                onClick={closeImagePicker}
                className="p-1 rounded hover:bg-surface-container text-on-surface-variant transition-colors"
                aria-label="Close image picker"
              >
                <span className="material-symbols-outlined text-[24px]">close</span>
              </button>
            </div>

            {imageResourceOptions.length === 0 ? (
              <div className="text-center py-8 text-on-surface-variant">
                <span className="material-symbols-outlined text-[48px] mb-2 block">photo_library</span>
                <p className="font-medium">No image resources available</p>
                <p className="text-sm mt-1">Upload images or slides to attach them to your questions.</p>
              </div>
            ) : (
              <div className="max-h-[60vh] overflow-y-auto space-y-2">
                {imageResourceOptions.map((resource) => {
                  const pageCount = resource.page_count ?? 1;
                  return (
                    <details
                      key={resource.id}
                      className="group rounded-lg border border-surface-container-high bg-surface-container overflow-hidden"
                    >
                      <summary className="p-3 flex items-center gap-3 cursor-pointer list-none">
                        <span className="material-symbols-outlined text-tertiary text-[24px]">
                          {resource.mime_type === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ? "slideshow" : "image"}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-on-surface truncate">{resource.title}</p>
                          <p className="text-xs text-outline">{pageCount} page{pageCount !== 1 ? "s" : ""}</p>
                        </div>
                        <span className="material-symbols-outlined text-outline text-[20px] group-open:rotate-90 transition-transform">expand_more</span>
                      </summary>
                      <div className="px-3 pb-3 pt-0 grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8">
                        {Array.from({ length: pageCount }, (_, i) => i + 1).map((pageNum) => (
                          <button
                            key={pageNum}
                            type="button"
                            onClick={() => handleImageSelect(resource.id, pageNum)}
                            className="aspect-square rounded border-2 border-surface-container-high bg-surface-container hover:border-primary hover:bg-primary/5 transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary flex flex-col items-center justify-center p-1"
                            aria-label={`Page ${pageNum} of ${resource.title}`}
                          >
                            <span className="material-symbols-outlined text-[20px] text-on-surface-variant">picture_as_pdf</span>
                            <span className="text-[10px] font-mono text-outline mt-1">{pageNum}</span>
                          </button>
                        ))}
                      </div>
                    </details>
                  );
                })}
              </div>
            )}

            <div className="mt-4 pt-4 border-t border-surface-container-high flex justify-end">
              <button
                type="button"
                onClick={closeImagePicker}
                className="px-4 py-2 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface text-sm font-medium transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}