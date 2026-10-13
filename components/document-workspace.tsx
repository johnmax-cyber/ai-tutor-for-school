"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Resource } from "@/lib/resources/types";
import type { StudySession } from "@/types/study";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface DocumentWorkspaceProps {
  resource: Resource;
  allResources?: { id: string; title?: string; original_filename?: string }[];
  assignedTopics?: { id: string; name: string }[];
  allTopics?: { id: string; name: string }[];
  onAssignTopic?: (resourceId: string, topicId: string) => Promise<void>;
  linkedSessions?: StudySession[];
  topicStats?: {
    mastery_state?: string;
    total_attempts?: number;
    correct_attempts?: number;
  };
}

export function DocumentWorkspace({
  resource,
  allResources = [],
  assignedTopics = [],
  allTopics = [],
  onAssignTopic,
  linkedSessions = [],
  topicStats,
}: DocumentWorkspaceProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"pdf" | "ocr">("pdf");
  const [currentPage, setCurrentPage] = useState(1);
  const [showAssignDropdown, setShowAssignDropdown] = useState(false);
  const [selectedTopicToAssign, setSelectedTopicToAssign] = useState("");
  const [isAssigning, setIsAssigning] = useState(false);

  const pages = useMemo(() => {
    const raw = resource.extracted_text || "";
    if (!raw.trim()) {
      return ["No extracted text available for this document."];
    }

    const pageMarkerRegex = /=== Page (\d+) ===\n/g;
    const matches = Array.from(raw.matchAll(pageMarkerRegex));

    if (matches.length > 0) {
      const parsed: string[] = [];
      for (let i = 0; i < matches.length; i++) {
        const start = matches[i].index! + matches[i][0].length;
        const end =
          i + 1 < matches.length ? matches[i + 1].index! : raw.length;
        parsed.push(raw.slice(start, end).trim());
      }
      return parsed;
    }

    const total = resource.page_count || 1;
    if (total > 1) {
      const chunkSize = Math.ceil(raw.length / total);
      const chunks: string[] = [];
      for (let i = 0; i < total; i++) {
        chunks.push(raw.slice(i * chunkSize, (i + 1) * chunkSize).trim());
      }
      return chunks;
    }

    return [raw.trim()];
  }, [resource.extracted_text, resource.page_count]);

  const totalPages = Math.max(pages.length, resource.page_count || 1);
  const clampedPage = Math.min(Math.max(currentPage, 1), totalPages);
  const currentPageText = pages[clampedPage - 1] || "";

  const primaryTopic = assignedTopics[0] || null;
  const masteryState = topicStats?.mastery_state || "developing";
  const totalAttempts = topicStats?.total_attempts || 0;
  const correctAttempts = topicStats?.correct_attempts || 0;
  const accuracy =
    totalAttempts > 0 ? Math.round((correctAttempts / totalAttempts) * 100) : 68;

  const formattedDate = resource.created_at
    ? new Date(resource.created_at).toLocaleDateString()
    : "Recent";

  const handleAssign = async () => {
    if (!selectedTopicToAssign || !onAssignTopic) return;
    setIsAssigning(true);
    try {
      await onAssignTopic(resource.id, selectedTopicToAssign);
      setShowAssignDropdown(false);
      setSelectedTopicToAssign("");
    } finally {
      setIsAssigning(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 w-full max-w-7xl mx-auto pb-20 md:pb-12">
      <Card variant="default" padding="lg" className="w-full">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div className="flex flex-col gap-2 flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 text-xs font-semibold uppercase tracking-wider">
                {primaryTopic ? primaryTopic.name : "Study Material"}
              </span>
              {assignedTopics.length > 1 && (
                <span className="px-2 py-0.5 rounded bg-surface-container-high text-on-surface-variant text-xs">
                  +{assignedTopics.length - 1} topics
                </span>
              )}
              <span className="px-2 py-0.5 rounded bg-surface-container-high text-outline text-xs flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">
                  calendar_today
                </span>
                {formattedDate}
              </span>
              <span className="px-2 py-0.5 rounded bg-surface-container-high text-outline text-xs">
                {(resource.size_bytes / (1024 * 1024)).toFixed(2)} MB •{" "}
                {totalPages} Pages
              </span>
            </div>

            <h1 className="text-xl md:text-2xl lg:text-3xl font-bold text-on-surface tracking-tight break-words">
              {resource.title || resource.original_filename}
            </h1>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto lg:flex-col xl:flex-row">
            {primaryTopic ? (
            <Button
              variant="primary"
              className="w-full sm:w-auto lg:w-full xl:w-auto"
              onClick={() => {
                router.push(`/study/new?topicId=${primaryTopic.id}`);
              }}
            >
              <span className="material-symbols-outlined text-[18px]">
                flash_on
              </span>
              <span className="hidden md:inline">Start Adaptive Drill</span>
              <span className="md:hidden">Study</span>
            </Button>
          ) : (
            <Button
              variant="primary"
              className="w-full sm:w-auto lg:w-full xl:w-auto"
              onClick={() => {
                router.push("/study/new");
              }}
            >
              <span className="material-symbols-outlined text-[18px]">
                flash_on
              </span>
              <span>Study</span>
            </Button>
          )}

          <Button
            variant="outline"
            className="w-full sm:w-auto lg:w-full xl:w-auto"
            onClick={() => {
              router.push(`/tutor?resourceId=${resource.id}`);
            }}
          >
            <span className="material-symbols-outlined text-[18px]">
              smart_toy
            </span>
            <span className="hidden md:inline">Ask AI Tutor</span>
            <span className="md:hidden">Tutor</span>
          </Button>

            {allResources.length > 1 && (
              <select
                value={resource.id}
                onChange={(e) => router.push(`/library?doc=${e.target.value}`)}
                className="px-3 py-2 rounded-lg bg-surface-container border border-surface-container-high text-xs text-on-surface-variant hover:text-on-surface cursor-pointer focus:outline-none w-full sm:w-auto lg:w-full xl:w-auto"
                title="Switch Document"
              >
                {allResources.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title || r.original_filename}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
      </Card>

      <div className="px-3 md:px-0">
        <div className="flex items-center gap-2 mb-2">
          <Button
            variant={activeTab === "pdf" ? "primary" : "outline"}
            size="sm"
            onClick={() => setActiveTab("pdf")}
            className="flex-1 md:flex-auto"
          >
            <span className="material-symbols-outlined text-[16px]">
              menu_book
            </span>
            <span>Text</span>
          </Button>
          <Button
            variant={activeTab === "ocr" ? "primary" : "outline"}
            size="sm"
            onClick={() => setActiveTab("ocr")}
            className="flex-1 md:flex-auto"
          >
            <span className="material-symbols-outlined text-[16px]">
              troubleshoot
            </span>
            <span>Inspector</span>
          </Button>
        </div>
      </div>

      {activeTab === "pdf" && (
        <Card variant="default" padding="lg" className="w-full">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={clampedPage <= 1}
              >
                <span className="material-symbols-outlined text-[16px]">
                  chevron_left
                </span>
              </Button>
              <span className="text-sm font-mono text-on-surface px-2">
                Page {clampedPage} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={clampedPage >= totalPages}
              >
                <span className="material-symbols-outlined text-[16px]">
                  chevron_right
                </span>
              </Button>
            </div>
          </div>
          <div className="p-4 bg-surface-container-lowest border border-surface-container-high rounded-lg max-h-[60vh] md:max-h-[70vh] overflow-y-auto">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-on-surface">
              {currentPageText}
            </p>
          </div>
        </Card>
      )}

      {activeTab === "ocr" && (
        <Card variant="default" padding="lg" className="w-full">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">
                verified
              </span>
              <h3 className="font-semibold text-on-surface">
                OCR Verification
              </h3>
            </div>
            <span className="text-xs font-mono text-on-surface-variant">
              Page {clampedPage} / {totalPages}
            </span>
          </div>
          <div className="p-4 bg-surface-container-lowest border border-surface-container-high rounded-lg max-h-[60vh] md:max-h-[70vh] overflow-y-auto">
            <pre className="text-xs font-mono whitespace-pre-wrap text-on-surface-variant">
              {currentPageText || "No raw text extracted for this page."}
            </pre>
          </div>
        </Card>
      )}

      <Card variant="default" padding="lg" className="w-full">
        <h3 className="text-base font-semibold text-on-surface mb-3">
          Associated Topics
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          {assignedTopics.map((topic) => (
            <Link
              key={topic.id}
              href={`/study/new?topicId=${topic.id}`}
              className="px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm hover:bg-primary/20 transition-colors"
            >
              {topic.name}
            </Link>
          ))}

          {onAssignTopic && (
            <div className="relative">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAssignDropdown(!showAssignDropdown)}
              >
                <span className="material-symbols-outlined text-[16px]">
                  add
                </span>
                Assign Topic
              </Button>

              {showAssignDropdown && (
                <div className="absolute left-0 mt-2 w-64 p-3 rounded-lg bg-surface-container-low border border-surface-container-high shadow-xl z-20 flex flex-col gap-2">
                  <select
                    value={selectedTopicToAssign}
                    onChange={(e) => setSelectedTopicToAssign(e.target.value)}
                    className="w-full text-sm p-2 rounded bg-surface-container border border-surface-container-high text-on-surface"
                  >
                    <option value="">Select a topic...</option>
                    {allTopics.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={handleAssign}
                      disabled={!selectedTopicToAssign || isAssigning}
                      className="flex-1"
                    >
                      {isAssigning ? "Assigning..." : "Confirm"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowAssignDropdown(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </Card>

      <Card variant="default" padding="lg" className="w-full">
        <h3 className="text-base font-semibold text-on-surface mb-3">
          Mastery Status
        </h3>
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-on-surface-variant">Accuracy</span>
            <span className="text-on-surface font-medium">{accuracy}%</span>
          </div>
          <div className="w-full h-2 rounded-full bg-surface-container-high">
            <div
              className="h-full bg-primary rounded-full transition-all"
              style={{ width: `${accuracy}%` }}
            />
          </div>
          <p className="text-sm text-on-surface-variant capitalize">
            {masteryState.replace("_", " ")}
          </p>
        </div>
      </Card>

      {linkedSessions.length > 0 && (
        <Card variant="default" padding="lg" className="w-full">
          <h3 className="text-base font-semibold text-on-surface mb-3">
            Study Sessions
          </h3>
          <div className="space-y-2">
            {linkedSessions.slice(0, 3).map((s) => (
              <Link
                key={s.id}
                href={`/study/${s.id}`}
                className="flex items-center justify-between p-3 rounded-lg bg-surface-container hover:bg-surface-container-high transition-colors"
              >
                <div className="min-w-0">
                  <p className="font-medium text-on-surface truncate">{s.topic_name}</p>
                  <p className="text-sm text-on-surface-variant">
                    {new Date(s.started_at).toLocaleDateString()}
                  </p>
                </div>
                <span className="text-primary text-sm font-medium ml-2 flex-shrink-0">
                  View
                </span>
              </Link>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}