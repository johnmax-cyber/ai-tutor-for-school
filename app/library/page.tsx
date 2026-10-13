"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { StudyShell } from "@/components/study-shell";
import { DocumentWorkspace } from "@/components/document-workspace";
import { UploadForm } from "@/components/upload-form";
import type { Resource } from "@/lib/resources/types";
import type { StudySession } from "@/types/study";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

function statusBadge(status: Resource["status"]) {
  switch (status) {
    case "ready":
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-secondary/10 text-secondary border border-secondary/20">
          <span className="w-1.5 h-1.5 rounded-full bg-secondary"></span>
          Ready & Indexed
        </span>
      );
    case "failed":
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-error/10 text-error-crimson border border-error/20">
          <span className="w-1.5 h-1.5 rounded-full bg-error-crimson"></span>
          Failed
        </span>
      );
    case "processing":
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-warning/10 text-warning border border-warning/20">
          <span className="w-1.5 h-1.5 rounded-full bg-warning animate-pulse"></span>
          Processing
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-surface-container text-on-surface-variant">
          Uploaded
        </span>
      );
  }
}

function fileTypeIcon(mimeType: string) {
  switch (mimeType) {
    case "application/pdf":
      return (
        <span className="material-symbols-outlined text-primary" aria-hidden="true">
          picture_as_pdf
        </span>
      );
    case "image/png":
    case "image/jpeg":
    case "image/jpg":
      return (
        <span className="material-symbols-outlined text-tertiary" aria-hidden="true">
          image
        </span>
      );
    case "application/vnd.openxmlformats-officedocument.presentationml.presentation":
      return (
        <span className="material-symbols-outlined text-secondary" aria-hidden="true">
          slideshow
        </span>
      );
    case "text/plain":
    case "text/markdown":
    case "text/x-markdown":
      return (
        <span className="material-symbols-outlined text-outline" aria-hidden="true">
          description
        </span>
      );
    default:
      return (
        <span className="material-symbols-outlined text-outline" aria-hidden="true">
          insert_drive_file
        </span>
      );
  }
}

function fileTypeLabel(mimeType: string) {
  switch (mimeType) {
    case "application/pdf": return "PDF";
    case "image/png": return "PNG";
    case "image/jpeg":
    case "image/jpg": return "JPG";
    case "application/vnd.openxmlformats-officedocument.presentationml.presentation": return "Slides";
    case "text/plain": return "Text";
    case "text/markdown":
    case "text/x-markdown": return "Markdown";
    default: return "File";
  }
}

function warningsIndicator(metadata: Record<string, unknown> | null | undefined) {
  if (!metadata) return null;
  const hasWarnings = metadata.vision_failed && typeof metadata.vision_failed === "number" && metadata.vision_failed > 0;
  const hasOcrWarnings = metadata.ocr_confidence !== undefined && metadata.ocr_confidence !== null && typeof metadata.ocr_confidence === "number" && metadata.ocr_confidence < 70;
  const hasCoverageWarnings = Object.keys(metadata).some(k => k.includes("coverage") || k.includes("gap"));

  if (hasWarnings || hasOcrWarnings || hasCoverageWarnings) {
    return (
      <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-warning/10 text-warning border border-warning/20" title="Processed with warnings">
        <span className="material-symbols-outlined text-[12px]">warning</span>
        Warnings
      </span>
    );
  }
  return null;
}

function LibraryContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const docIdParam = searchParams.get("doc");

  const [loading, setLoading] = useState(true);
  const [resources, setResources] = useState<Resource[]>([]);
  const [topics, setTopics] = useState<{ id: string; name: string }[]>([]);
  const [resourceTopicsMap, setResourceTopicsMap] = useState<
    Record<string, string[]>
  >({});
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [viewMode, setViewMode] = useState<"workspace" | "catalog">(
    "workspace",
  );
  const [assigningResourceId, setAssigningResourceId] = useState<string | null>(
    null,
  );
  const [selectedTopicId, setSelectedTopicId] = useState<string>("");
  const [embeddingsEnabled, setEmbeddingsEnabled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    async function loadEmbeddingStatus() {
      try {
        const res = await fetch("/api/embedding-status");
        if (res.ok) {
          const data = await res.json();
          setEmbeddingsEnabled(data.enabled === true);
        }
      } catch {
      }
    }
    loadEmbeddingStatus();
  }, []);

  useEffect(() => {
    async function loadData() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      const { data: resourcesData } = await supabase
        .from("resources")
        .select(
          "id, user_id, title, original_filename, storage_path, mime_type, size_bytes, char_count, status, error_message, extracted_text, page_count, ocr_used, ocr_confidence, processing_metadata, created_at, updated_at",
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      const loadedResources = (resourcesData || []) as Resource[];
      setResources(loadedResources);

      const { data: topicsData } = await supabase
        .from("topics")
        .select("id, name, mastery_state, total_attempts, correct_attempts")
        .eq("user_id", user.id)
        .order("name", { ascending: true });

      setTopics(topicsData || []);

      const { data: rtData } = await supabase
        .from("resources_topics")
        .select("resource_id, topic_id");

      if (rtData) {
        const map: Record<string, string[]> = {};
        for (const item of rtData) {
          if (!map[item.resource_id]) map[item.resource_id] = [];
          map[item.resource_id].push(item.topic_id);
        }
        setResourceTopicsMap(map);
      }

      const { data: sessionsData } = await supabase
        .from("study_sessions")
        .select("*")
        .eq("user_id", user.id)
        .order("started_at", { ascending: false });

      setSessions(sessionsData || []);
      setLoading(false);
    }

    loadData();
  }, [router]);

  const handleAssignResource = async (resourceId: string, topicId: string) => {
    if (!topicId) return;
    const supabase = createClient();
    const { error } = await supabase.from("resources_topics").insert({
      resource_id: resourceId,
      topic_id: topicId,
    });

    if (error) {
      console.error("Failed to assign resource to topic:", error);
      return;
    }

    setResourceTopicsMap((prev) => ({
      ...prev,
      [resourceId]: [...(prev[resourceId] || []), topicId],
    }));
    setAssigningResourceId(null);
    setSelectedTopicId("");
  };

  const activeResource =
    (docIdParam
      ? resources.find((r) => r.id === docIdParam)
      : resources.find((r) => r.status === "ready") || resources[0]) || null;

  const assignedTopics = activeResource
    ? (resourceTopicsMap[activeResource.id] || [])
        .map((tid) => topics.find((t) => t.id === tid))
        .filter((t): t is { id: string; name: string } => Boolean(t))
    : [];

  if (loading) {
    return (
      <StudyShell>
        <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
          <span className="material-symbols-outlined text-[36px] text-primary animate-spin">
            progress_activity
          </span>
          <p className="text-sm text-outline font-mono">
            Loading study materials & indexing state...
          </p>
        </div>
      </StudyShell>
    );
  }

  return (
    <StudyShell>
      <div className="space-y-4 pb-20">
        {/* Mobile Top Bar */}
        <div className="flex items-center justify-between p-3 md:hidden">
          <h1 className="text-lg font-semibold text-on-surface">Library</h1>
          <Button variant="ghost" size="sm" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
            <span className="material-symbols-outlined text-[24px]">
              {mobileMenuOpen ? "close" : "menu"}
            </span>
          </Button>
        </div>

        {/* Mobile Bottom Navigation */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-sm border-t border-surface-container-high z-50">
          <div className="grid grid-cols-4">
            <Link
              href="/dashboard"
              className="flex flex-col items-center gap-1 px-3 py-2 text-xs text-on-surface-variant hover:text-primary transition-colors"
            >
              <span className="material-symbols-outlined text-[24px]">dashboard</span>
              <span>Dashboard</span>
            </Link>
            <Link
              href="/library"
              className="flex flex-col items-center gap-1 px-3 py-2 text-xs text-primary hover:text-primary transition-colors"
            >
              <span className="material-symbols-outlined text-[24px]">library_books</span>
              <span>Library</span>
            </Link>
            <Link
              href="/study"
              className="flex flex-col items-center gap-1 px-3 py-2 text-xs text-on-surface-variant hover:text-primary transition-colors"
            >
              <span className="material-symbols-outlined text-[24px]">flash_on</span>
              <span>Study</span>
            </Link>
            <Link
              href="/tutor"
              className="flex flex-col items-center gap-1 px-3 py-2 text-xs text-on-surface-variant hover:text-primary transition-colors"
            >
              <span className="material-symbols-outlined text-[24px]">smart_toy</span>
              <span>Tutor</span>
            </Link>
          </div>
        </nav>

        {/* Desktop Sidebar Toggle */}
        <div className="hidden md:flex mb-4">
          <div className="flex items-center gap-2 bg-surface-container-low p-1 rounded-lg border border-surface-container-high">
            <button
              onClick={() => setViewMode("workspace")}
              disabled={!activeResource}
              className={
                viewMode === "workspace"
                  ? "px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 bg-surface-container-high text-on-surface shadow-sm border border-outline-variant/30"
                  : "px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 text-on-surface-variant hover:text-on-surface disabled:opacity-40"
              }
            >
              <span className="material-symbols-outlined text-[16px]">
                menu_book
              </span>
              <span>Document Workspace</span>
            </button>

            <button
              onClick={() => setViewMode("catalog")}
              className={
                viewMode === "catalog"
                  ? "px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 bg-surface-container-high text-on-surface shadow-sm border border-outline-variant/30"
                  : "px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 text-on-surface-variant hover:text-on-surface"
              }
            >
              <span className="material-symbols-outlined text-[16px]">
                inventory_2
              </span>
              <span>Document Catalog ({resources.length})</span>
            </button>
          </div>
        </div>

        {viewMode === "workspace" && activeResource ? (
          <DocumentWorkspace
            resource={activeResource}
            allResources={resources}
            assignedTopics={assignedTopics}
            allTopics={topics}
            onAssignTopic={handleAssignResource}
            linkedSessions={sessions}
          />
        ) : null}

        {(viewMode === "catalog" || !activeResource) && (
          <div className="space-y-4 p-3 md:p-6">
            <div className="p-4 md:p-6 rounded-xl bg-surface-container-low border border-surface-container-high shadow-sm">
              <h2 className="text-lg font-semibold text-on-surface mb-2 flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-[20px]">
                  cloud_upload
                </span>
                <span>Upload New Academic Material</span>
              </h2>
              <p className="text-xs text-on-surface-variant mb-4">
                Add lecture notes, problem sets, or reference textbooks. Scanned
                materials will automatically trigger OCR pipeline with confidence
                scoring.
              </p>
              <UploadForm embeddingsEnabled={embeddingsEnabled} />
            </div>

            <div className="p-4 md:p-6 rounded-xl bg-surface-container-low border border-surface-container-high shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 gap-3">
                <h2 className="text-lg font-semibold text-on-surface flex items-center gap-2">
                  <span className="material-symbols-outlined text-secondary text-[20px]">
                    library_books
                  </span>
                  <span>Ingested Documents & OCR Index</span>
                </h2>
                <span className="text-xs text-outline font-mono self-start sm:self-auto">
                  {resources.length} Total Materials
                </span>
              </div>

              {resources.length === 0 ? (
                <div className="text-center py-12 px-4 rounded-lg bg-surface-container/30 border border-dashed border-surface-container-high">
                  <span className="material-symbols-outlined text-[48px] text-outline mb-2">
                    folder_open
                  </span>
                  <h3 className="font-semibold text-on-surface">
                    No documents yet
                  </h3>
                  <p className="text-sm text-outline mt-1">
                    Upload your first PDF document above to begin studying.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {resources.map((r) => {
                    const rAssigned = (resourceTopicsMap[r.id] || [])
                      .map((tid) => topics.find((t) => t.id === tid))
                      .filter((t): t is { id: string; name: string } =>
                        Boolean(t),
                      );

                    return (
                      <Card
                        key={r.id}
                        variant="default"
                        padding="md"
                        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 sm:p-4"
                      >
                        <button
                          onClick={() => {
                            router.push(`/library?doc=${r.id}`);
                            setViewMode("workspace");
                          }}
                          className="flex flex-col sm:flex-row sm:items-center gap-3 w-full text-left"
                        >
                          <div className="flex items-center gap-3 flex-shrink-0">
                            <span className="flex items-center justify-center w-10 h-10 rounded bg-surface-container flex-shrink-0">
                              {fileTypeIcon(r.mime_type)}
                            </span>
                            <div className="min-w-0">
                              <span className="font-medium text-on-surface truncate block sm:inline">
                                {r.title || r.original_filename}
                              </span>
                              <div className="flex items-center gap-2 text-[11px] text-outline font-mono mt-1">
                                <span className="px-1.5 py-0.5 rounded bg-surface-container border border-outline-variant/30">
                                  {fileTypeLabel(r.mime_type)}
                                </span>
                                <span>ID: {r.id.slice(0, 8)}</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 flex-wrap">
                            <div className="flex items-center gap-2">
                              {statusBadge(r.status)}
                              {warningsIndicator(r.processing_metadata as Record<string, unknown> | null | undefined)}
                            </div>
                            <span className="font-mono text-on-surface-variant hidden sm:inline">
                              {r.page_count ?? "—"} pages
                            </span>
                            <span className="font-mono text-outline hidden sm:inline">
                              {(r.size_bytes / (1024 * 1024)).toFixed(2)} MB
                            </span>
                          </div>
                        </button>

                        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 w-full sm:w-auto">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {rAssigned.map((top) => (
                              <span
                                key={top.id}
                                className="px-2 py-0.5 rounded bg-surface-container text-[11px] text-on-surface-variant border border-outline-variant/30"
                              >
                                {top.name}
                              </span>
                            ))}

                            {assigningResourceId === r.id ? (
                              <div className="flex flex-col sm:flex-row items-center gap-1 w-full sm:w-auto">
                                <select
                                  value={selectedTopicId}
                                  onChange={(e) =>
                                    setSelectedTopicId(e.target.value)
                                  }
                                  className="w-full sm:w-48 p-1.5 rounded bg-surface-container-high text-xs text-on-surface border border-outline-variant/40"
                                >
                                  <option value="">Choose Topic</option>
                                  {topics.map((t) => (
                                    <option key={t.id} value={t.id}>
                                      {t.name}
                                    </option>
                                  ))}
                                </select>
                                <Button
                                  size="sm"
                                  onClick={() =>
                                    handleAssignResource(
                                      r.id,
                                      selectedTopicId,
                                    )
                                  }
                                  disabled={!selectedTopicId}
                                >
                                  Save
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setAssigningResourceId(null)}
                                >
                                  ✕
                                </Button>
                              </div>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setAssigningResourceId(r.id)}
                                className="w-full sm:w-auto"
                              >
                                + Assign
                              </Button>
                            )}
                          </div>

                          <div className="flex items-center gap-2 w-full sm:w-auto">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                router.push(`/library?doc=${r.id}`);
                                setViewMode("workspace");
                              }}
                              className="w-full sm:w-auto"
                            >
                              View
                            </Button>
                            <Link
                              href={`/tutor?resourceId=${r.id}`}
                              className="p-2 rounded hover:bg-surface-container text-on-surface-variant hover:text-tertiary"
                              title="Ask Tutor"
                            >
                              <span className="material-symbols-outlined text-[20px]">
                                smart_toy
                              </span>
                            </Link>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </StudyShell>
  );
}

export default function LibraryPage() {
  return (
    <Suspense
      fallback={
        <StudyShell>
          <div className="flex items-center justify-center min-h-[50vh]">
            <span className="material-symbols-outlined text-[36px] text-primary animate-spin">
              progress_activity
            </span>
          </div>
        </StudyShell>
      }
    >
      <LibraryContent />
    </Suspense>
  );
}