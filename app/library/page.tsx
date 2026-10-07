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

function statusBadge(status: Resource["status"]) {
  switch (status) {
    case "ready":
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-secondary/10 text-secondary border border-secondary/20">
          <span className="w-1.5 h-1.5 rounded-full bg-secondary"></span>
          Ready &amp; Indexed
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
          OCR Processing
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-surface-container text-on-surface-variant">
          Pending
        </span>
      );
  }
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

      // 1. Resources
      const { data: resourcesData } = await supabase
        .from("resources")
        .select(
          "id, user_id, title, original_filename, storage_path, mime_type, size_bytes, char_count, status, error_message, extracted_text, page_count, created_at, updated_at",
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      const loadedResources = (resourcesData || []) as Resource[];
      setResources(loadedResources);

      // 2. Topics
      const { data: topicsData } = await supabase
        .from("topics")
        .select("id, name, mastery_state, total_attempts, correct_attempts")
        .eq("user_id", user.id)
        .order("name", { ascending: true });

      setTopics(topicsData || []);

      // 3. Resources Topics
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

      // 4. Study Sessions
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

  // Determine active resource for Workspace view
  const activeResource =
    (docIdParam
      ? resources.find((r) => r.id === docIdParam)
      : resources.find((r) => r.status === "ready") || resources[0]) || null;

  // Active resource's assigned topics
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
            Loading study materials &amp; indexing state...
          </p>
        </div>
      </StudyShell>
    );
  }

  return (
    <StudyShell
      breadcrumbs={[
        { label: "Study Library", href: "/library" },
        ...(activeResource && viewMode === "workspace"
          ? [
              {
                label: activeResource.title || activeResource.original_filename,
              },
            ]
          : []),
      ]}
      activeTopicName={assignedTopics[0]?.name}
    >
      {/* View Switcher Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6 pb-4 border-b border-surface-container-high">
        <div className="flex items-center gap-2 bg-surface-container-low p-1 rounded-lg border border-surface-container-high">
          <button
            onClick={() => setViewMode("workspace")}
            disabled={!activeResource}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all ${
              viewMode === "workspace"
                ? "bg-surface-container-high text-on-surface shadow-sm border border-outline-variant/30"
                : "text-on-surface-variant hover:text-on-surface disabled:opacity-40"
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">
              menu_book
            </span>
            <span>Document Workspace</span>
          </button>

          <button
            onClick={() => setViewMode("catalog")}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all ${
              viewMode === "catalog"
                ? "bg-surface-container-high text-on-surface shadow-sm border border-outline-variant/30"
                : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">
              inventory_2
            </span>
            <span>Document Catalog ({resources.length})</span>
          </button>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/tutor"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface border border-surface-container-high text-xs font-medium transition-colors"
          >
            <span className="material-symbols-outlined text-[16px] text-tertiary">
              smart_toy
            </span>
            <span>Ask AI Tutor</span>
          </Link>
          <Link
            href="/study"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface border border-surface-container-high text-xs font-medium transition-colors"
          >
            <span className="material-symbols-outlined text-[16px] text-secondary">
              timer
            </span>
            <span>Study Hub</span>
          </Link>
        </div>
      </div>

      {/* Main Mode 1: Document Workspace */}
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

      {/* Main Mode 2: Document Catalog or Empty State */}
      {(viewMode === "catalog" || !activeResource) && (
        <div className="space-y-8 max-w-5xl mx-auto">
          {/* Upload Card */}
          <div className="p-6 rounded-xl bg-surface-container-low border border-surface-container-high shadow-sm">
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
            <UploadForm />
          </div>

          {/* Documents Table */}
          <div className="p-6 rounded-xl bg-surface-container-low border border-surface-container-high shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-on-surface flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary text-[20px]">
                  library_books
                </span>
                <span>Ingested Documents &amp; OCR Index</span>
              </h2>
              <span className="text-xs text-outline font-mono">
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
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-surface-container-high text-outline font-mono">
                      <th className="pb-3 font-semibold uppercase tracking-wider">
                        Document
                      </th>
                      <th className="pb-3 font-semibold uppercase tracking-wider">
                        Status
                      </th>
                      <th className="pb-3 font-semibold uppercase tracking-wider">
                        Pages
                      </th>
                      <th className="pb-3 font-semibold uppercase tracking-wider">
                        Size
                      </th>
                      <th className="pb-3 font-semibold uppercase tracking-wider">
                        Assigned Topics
                      </th>
                      <th className="pb-3 font-semibold uppercase tracking-wider text-right">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-container-high">
                    {resources.map((r) => {
                      const rAssigned = (resourceTopicsMap[r.id] || [])
                        .map((tid) => topics.find((t) => t.id === tid))
                        .filter((t): t is { id: string; name: string } =>
                          Boolean(t),
                        );

                      return (
                        <tr
                          key={r.id}
                          className="hover:bg-surface-container/50 transition-colors group"
                        >
                          <td className="py-3.5 pr-4 min-w-[200px]">
                            <button
                              onClick={() => {
                                router.push(`/library?doc=${r.id}`);
                                setViewMode("workspace");
                              }}
                              className="font-medium text-on-surface hover:text-primary transition-colors text-left flex flex-col"
                            >
                              <span className="truncate max-w-sm">
                                {r.title || r.original_filename}
                              </span>
                              <span className="text-[11px] text-outline font-mono">
                                ID: {r.id.slice(0, 8)}
                              </span>
                            </button>
                          </td>

                          <td className="py-3.5 pr-4 whitespace-nowrap">
                            {statusBadge(r.status)}
                          </td>

                          <td className="py-3.5 pr-4 font-mono text-on-surface-variant">
                            {r.page_count ?? "—"}
                          </td>

                          <td className="py-3.5 pr-4 font-mono text-outline">
                            {(r.size_bytes / (1024 * 1024)).toFixed(2)} MB
                          </td>

                          <td className="py-3.5 pr-4">
                            <div className="flex flex-wrap items-center gap-1.5">
                              {rAssigned.map((top) => (
                                <span
                                  key={top.id}
                                  className="px-2 py-0.5 rounded bg-surface-container text-[11px] text-on-surface-variant border border-outline-variant/30"
                                >
                                  {top.name}
                                </span>
                              ))}

                              {/* Assign select */}
                              {assigningResourceId === r.id ? (
                                <div className="flex items-center gap-1">
                                  <select
                                    value={selectedTopicId}
                                    onChange={(e) =>
                                      setSelectedTopicId(e.target.value)
                                    }
                                    className="p-1 rounded bg-surface-container-high text-xs text-on-surface border border-outline-variant/40"
                                  >
                                    <option value="">Choose Topic</option>
                                    {topics.map((t) => (
                                      <option key={t.id} value={t.id}>
                                        {t.name}
                                      </option>
                                    ))}
                                  </select>
                                  <button
                                    onClick={() =>
                                      handleAssignResource(
                                        r.id,
                                        selectedTopicId,
                                      )
                                    }
                                    className="px-2 py-1 rounded bg-primary text-on-primary text-[11px] font-semibold"
                                  >
                                    Save
                                  </button>
                                  <button
                                    onClick={() => setAssigningResourceId(null)}
                                    className="px-2 py-1 rounded bg-surface-container text-on-surface-variant text-[11px]"
                                  >
                                    ✕
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setAssigningResourceId(r.id)}
                                  className="px-2 py-0.5 rounded hover:bg-surface-container text-outline hover:text-on-surface text-[11px] border border-dashed border-outline-variant/40"
                                >
                                  + Assign
                                </button>
                              )}
                            </div>
                          </td>

                          <td className="py-3.5 pl-4 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => {
                                  router.push(`/library?doc=${r.id}`);
                                  setViewMode("workspace");
                                }}
                                className="px-2.5 py-1 rounded bg-surface-container-high hover:bg-primary hover:text-on-primary text-on-surface text-xs font-medium transition-colors"
                              >
                                View Workspace
                              </button>
                              <Link
                                href={`/tutor?resourceId=${r.id}`}
                                className="p-1 rounded hover:bg-surface-container text-on-surface-variant hover:text-tertiary"
                                title="Ask Tutor"
                              >
                                <span className="material-symbols-outlined text-[18px]">
                                  smart_toy
                                </span>
                              </Link>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
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
