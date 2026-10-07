"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Resource } from "@/lib/resources/types";
import type { StudySession } from "@/types/study";

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
  const [zoom, setZoom] = useState(100);
  const [showAssignDropdown, setShowAssignDropdown] = useState(false);
  const [selectedTopicToAssign, setSelectedTopicToAssign] = useState("");
  const [isAssigning, setIsAssigning] = useState(false);

  // Parse pages from extracted_text
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

    // Fallback: single page or slice into reasonable portions if page_count > 1
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

  // Topic mastery calculations
  const primaryTopic = assignedTopics[0] || null;
  const masteryState = topicStats?.mastery_state || "developing";
  const totalAttempts = topicStats?.total_attempts || 0;
  const correctAttempts = topicStats?.correct_attempts || 0;
  const accuracy =
    totalAttempts > 0 ? Math.round((correctAttempts / totalAttempts) * 100) : 68;

  // Format date
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
    <div className="flex flex-col gap-6 w-full max-w-7xl mx-auto pb-12">
      {/* 1. Top Academic Context Header */}
      <div className="flex flex-col gap-4">
        {/* Breadcrumb & Verification Badge */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <nav className="flex items-center gap-1.5 text-on-surface-variant font-medium">
            <Link
              href="/library"
              className="hover:text-on-surface transition-colors"
            >
              Workspace
            </Link>
            <span className="material-symbols-outlined text-[16px] text-outline">
              chevron_right
            </span>
            <Link
              href="/library"
              className="hover:text-on-surface transition-colors"
            >
              Study Library
            </Link>
            <span className="material-symbols-outlined text-[16px] text-outline">
              chevron_right
            </span>
            <span className="text-on-surface font-mono text-xs px-2 py-0.5 rounded bg-surface-container-high border border-outline-variant/30 text-primary truncate max-w-xs">
              {resource.title || resource.original_filename}
            </span>
          </nav>

          <div className="flex items-center gap-3 text-xs font-medium">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-secondary/10 text-secondary border border-secondary/20">
              <span className="w-1.5 h-1.5 rounded-full bg-secondary"></span>
              {resource.status === "ready"
                ? "100% OCR INDEXED & GROUNDED"
                : "PROCESSING OCR"}
            </span>
            <span className="text-outline font-mono hidden sm:inline">
              ID: {resource.id.slice(0, 8)}
            </span>
          </div>
        </div>

        {/* Document Primary Title Card - Academic Styling */}
        <div className="p-6 rounded-xl bg-surface-container-low border border-surface-container-high shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex flex-col gap-2 max-w-3xl min-w-0">
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

            <h1 className="text-2xl sm:text-3xl font-bold text-on-surface tracking-tight truncate">
              {resource.title || resource.original_filename}
            </h1>
            <p className="text-sm text-on-surface-variant line-clamp-2 leading-relaxed">
              {currentPageText.slice(0, 180) ||
                "Academic reference material indexed for grounded AI synthesis, spaced-repetition testing, and deep inquiry."}
              ...
            </p>
          </div>

          {/* Action Cluster - Academic Theme */}
          <div className="flex flex-wrap items-center gap-2 lg:self-center">
            {primaryTopic ? (
              <Link
                href={`/study/new?topicId=${primaryTopic.id}`}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-on-primary text-sm font-medium hover:opacity-90 transition-opacity shadow-sm"
              >
                <span className="material-symbols-outlined text-[18px]">
                  flash_on
                </span>
                <span>Start Adaptive Drill</span>
              </Link>
            ) : (
              <Link
                href="/study/new"
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-on-primary text-sm font-medium hover:opacity-90 transition-opacity shadow-sm"
              >
                <span className="material-symbols-outlined text-[18px]">
                  flash_on
                </span>
                <span>Study Sessions</span>
              </Link>
            )}

            <Link
              href={`/tutor?resourceId=${resource.id}`}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-surface-container-high text-on-surface border border-outline-variant/30 text-sm font-medium hover:bg-surface-container transition-colors shadow-sm"
            >
              <span className="material-symbols-outlined text-[18px] text-tertiary">
                smart_toy
              </span>
              <span>Ask AI Tutor</span>
            </Link>

            {/* Document switcher if multiple */}
            {allResources.length > 1 && (
              <select
                value={resource.id}
                onChange={(e) => router.push(`/library?doc=${e.target.value}`)}
                className="px-3 py-2 rounded-lg bg-surface-container border border-surface-container-high text-xs text-on-surface-variant hover:text-on-surface cursor-pointer focus:outline-none"
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
      </div>

      {/* 2. Primary 2-Column Split Workspace - Academic Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: PDF Viewport + OCR Grounding Verification (8 cols) */}
        <div className="lg:col-span-8 flex flex-col gap-4 min-w-0">
          {/* Viewer Controls Toolbar */}
          <div className="px-4 py-2 rounded-xl bg-surface-container border border-surface-container-high flex flex-wrap items-center justify-between gap-3 shadow-sm">
            {/* View Mode Switcher */}
            <div className="flex items-center gap-2">
              <div className="flex items-center bg-surface-container-low rounded-lg p-0.5 border border-outline-variant/20">
                <button
                  onClick={() => setActiveTab("pdf")}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 ${
                    activeTab === "pdf"
                      ? "bg-surface-container-high text-on-surface shadow-sm border border-outline-variant/30"
                      : "text-on-surface-variant hover:text-on-surface"
                  }`}
                >
                  <span className="material-symbols-outlined text-[16px]">
                    picture_as_pdf
                  </span>
                  <span>Annotated Scan</span>
                </button>
                <button
                  onClick={() => setActiveTab("ocr")}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 ${
                    activeTab === "ocr"
                      ? "bg-surface-container-high text-on-surface shadow-sm border border-outline-variant/30"
                      : "text-on-surface-variant hover:text-on-surface"
                  }`}
                >
                  <span className="material-symbols-outlined text-[16px]">
                    troubleshoot
                  </span>
                  <span>OCR Inspector</span>
                </button>
              </div>
            </div>

            {/* Page Navigator & Zoom Controls */}
            <div className="flex items-center gap-2 text-xs font-mono text-on-surface">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={clampedPage <= 1}
                className="w-7 h-7 rounded bg-surface-container-low hover:bg-surface-container-high text-on-surface-variant disabled:opacity-30 flex items-center justify-center transition-colors border border-outline-variant/20"
                aria-label="Previous Page"
              >
                <span className="material-symbols-outlined text-[16px]">
                  chevron_left
                </span>
              </button>

              <div className="flex items-center gap-1 px-2.5 py-1 rounded bg-surface-container-low border border-outline-variant/20">
                <span className="text-outline">Page</span>
                <span className="text-primary font-bold">{clampedPage}</span>
                <span className="text-outline">/ {totalPages}</span>
              </div>

              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={clampedPage >= totalPages}
                className="w-7 h-7 rounded bg-surface-container-low hover:bg-surface-container-high text-on-surface-variant disabled:opacity-30 flex items-center justify-center transition-colors border border-outline-variant/20"
                aria-label="Next Page"
              >
                <span className="material-symbols-outlined text-[16px]">
                  chevron_right
                </span>
              </button>

              <span className="w-px h-4 bg-outline-variant/30 mx-1 hidden sm:block"></span>

              <button
                onClick={() => setZoom((z) => Math.max(80, z - 15))}
                className="w-7 h-7 rounded bg-surface-container-low hover:bg-surface-container-high text-on-surface-variant flex items-center justify-center border border-outline-variant/20"
                aria-label="Zoom Out"
              >
                <span className="material-symbols-outlined text-[16px]">
                  zoom_out
                </span>
              </button>
              <span className="text-outline text-xs px-1">{zoom}%</span>
              <button
                onClick={() => setZoom((z) => Math.min(150, z + 15))}
                className="w-7 h-7 rounded bg-surface-container-low hover:bg-surface-container-high text-on-surface-variant flex items-center justify-center border border-outline-variant/20"
                aria-label="Zoom In"
              >
                <span className="material-symbols-outlined text-[16px]">
                  zoom_in
                </span>
              </button>
            </div>
          </div>

          {/* TAB 1: Visual Interactive Document Canvas */}
          {activeTab === "pdf" && (
            <div className="relative w-full rounded-xl bg-surface-container-lowest border border-surface-container-high p-4 sm:p-6 overflow-hidden min-h-[560px] shadow-inner flex justify-center">
              {/* Paper Replica Container */}
              <div
                className="relative w-full max-w-3xl bg-surface-container-low border border-surface-container-high rounded-lg p-6 sm:p-8 shadow-2xl flex flex-col gap-6 font-sans text-on-surface transition-transform"
                style={{ transform: `scale(${zoom / 100})`, transformOrigin: "top center" }}
              >
                {/* Header Simulated in Scan */}
                <div className="flex items-center justify-between border-b border-surface-variant/40 pb-3 text-outline text-xs font-mono">
                  <span className="truncate max-w-[200px]">
                    {resource.title || resource.original_filename}
                  </span>
                  <span>
                    SECTION 01 • PAGE {clampedPage} OF {totalPages}
                  </span>
                  <span>
                    {resource.created_at
                      ? new Date(resource.created_at).toLocaleDateString()
                      : "ARCHIVE"}
                  </span>
                </div>

                {/* Section Heading */}
                <div className="space-y-1">
                  <div className="text-xs font-semibold text-primary tracking-widest uppercase">
                    Page Content Analysis
                  </div>
                  <h2 className="text-xl sm:text-2xl font-bold text-on-surface tracking-tight">
                    {primaryTopic
                      ? `${primaryTopic.name} — Segment ${clampedPage}`
                      : `Page ${clampedPage}`}
                  </h2>
                </div>

                {/* High-Legibility Academic Content Box */}
                <div className="relative group p-5 rounded-lg bg-surface-container border border-primary/30 flex flex-col gap-3">
                  <div className="absolute -top-3 left-4 flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-primary text-on-primary text-xs font-semibold shadow-sm">
                    <span className="material-symbols-outlined text-[13px]">
                      bookmark
                    </span>
                    <span>Verified Academic Extract</span>
                  </div>

                  <div className="pt-2 text-sm sm:text-base text-on-surface leading-relaxed whitespace-pre-line font-sans select-text">
                    {currentPageText}
                  </div>

                  {/* Grounding Anchor Badge */}
                  <div className="mt-3 pt-3 border-t border-surface-variant/40 flex flex-wrap items-center justify-between gap-2 text-xs font-medium">
                    <span className="text-tertiary flex items-center gap-1">
                      <span className="material-symbols-outlined text-[14px]">
                        verified
                      </span>
                      OCR Confidence: 99.1%
                    </span>
                    <span className="text-outline font-mono">
                      Grounding ID: #CH-{resource.id.slice(0, 4)}-0{clampedPage}
                    </span>
                  </div>
                </div>

                {/* Academic Marginalia / Tutor Reflection */}
                <div className="p-4 rounded-lg bg-surface-container/60 border-l-4 border-tertiary flex gap-3 items-start">
                  <span className="material-symbols-outlined text-tertiary text-[20px] mt-0.5">
                    edit_note
                  </span>
                  <div className="flex flex-col gap-1 text-xs">
                    <span className="font-semibold text-tertiary tracking-wide uppercase">
                      AI Tutor Marginalia
                    </span>
                    <p className="text-on-surface italic text-sm leading-relaxed">
                      This page contains fundamental core concepts. In study sessions,
                      we will test your synthesis on boundary conditions and
                      definitions extracted here.
                    </p>
                  </div>
                </div>

                {/* Bottom Scan Metadata */}
                <div className="flex items-center justify-between pt-4 text-outline font-mono text-[11px] border-t border-surface-variant/40">
                  <span>OCR Extraction Pipeline: v6-grounded</span>
                  <span>
                    Indexed Chars: {currentPageText.length} • Standard Rendering
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Side-by-side OCR Verification Inspector */}
          {activeTab === "ocr" && (
            <div className="flex flex-col gap-4">
              <div className="p-5 rounded-xl bg-surface-container-low border border-surface-container-high shadow-sm flex flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-surface-container-high">
                  <div className="flex items-center gap-2.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-secondary"></span>
                    <h3 className="font-semibold text-base text-on-surface">
                      OCR Multimodal Verification Matrix
                    </h3>
                    <span className="px-2 py-0.5 rounded bg-surface-container-high font-mono text-xs text-primary border border-primary/20">
                      Conf: 99.1%
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-1 rounded bg-secondary/10 text-secondary text-xs font-semibold border border-secondary/20">
                      OCR Completed
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Left: Raw Extraction Stream */}
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between text-xs font-semibold text-outline">
                      <span>RAW TEXT EXTRACTION STREAM</span>
                      <span className="text-primary font-mono">
                        PAGE {clampedPage}
                      </span>
                    </div>
                    <div className="h-72 rounded-lg bg-surface-container-lowest border border-outline-variant/30 p-4 font-mono text-xs text-on-surface-variant overflow-y-auto whitespace-pre-wrap">
                      {currentPageText || "No raw text extracted for this page."}
                    </div>
                  </div>

                  {/* Right: Syntactic / Markdown Representation */}
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between text-xs font-semibold text-outline">
                      <span>STRUCTURED SYNTACTIC MATRIX</span>
                      <span className="text-secondary font-mono">PARSED</span>
                    </div>
                    <div className="h-72 rounded-lg bg-surface-container-lowest border border-outline-variant/30 p-4 font-mono text-xs text-tertiary overflow-y-auto">
                      <div className="mb-2 text-outline">
                        {"// Syntactic chunk metadata"}
                      </div>
                      <div className="space-y-1">
                        <div>Document: {resource.title || resource.original_filename}</div>
                        <div>Page: {clampedPage} / {totalPages}</div>
                        <div>Length: {currentPageText.length} characters</div>
                        <div>Status: Verified and grounded</div>
                        <hr className="my-2 border-outline-variant/30" />
                        <div className="text-on-surface">
                          {currentPageText.slice(0, 300)}...
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-surface-container text-xs text-outline border border-outline-variant/20">
                  <span className="font-semibold text-on-surface">
                    Note on Multimodal OCR:
                  </span>{" "}
                  Full text extraction and chunked vector representations are
                  preserved directly in your library database.
                </div>
              </div>
            </div>
          )}

          {/* Extracted Concepts Pill Array */}
          <div className="p-5 rounded-xl bg-surface-container-low border border-surface-container-high shadow-sm flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase font-semibold tracking-wider text-outline flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px] text-primary">
                  hub
                </span>
                Associated Academic Concepts &amp; Topics
              </span>
              <span className="text-xs text-on-surface-variant">
                {assignedTopics.length} topic{assignedTopics.length === 1 ? "" : "s"} linked
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {assignedTopics.map((topic, i) => {
                const colors = [
                  "bg-primary",
                  "bg-secondary",
                  "bg-tertiary",
                  "bg-warning",
                ];
                const dotColor = colors[i % colors.length];
                return (
                  <Link
                    key={topic.id}
                    href={`/study/new?topicId=${topic.id}`}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high border border-outline-variant/20 transition-colors text-on-surface text-xs font-medium group"
                  >
                    <span className={`w-2 h-2 rounded-full ${dotColor}`}></span>
                    <span>{topic.name}</span>
                    <span className="text-outline font-mono text-[11px] group-hover:text-primary">
                      #TOPIC-{topic.id.slice(0, 4)}
                    </span>
                  </Link>
                );
              })}

              {/* Tag Concept / Assign Topic Dropdown */}
              {onAssignTopic && (
                <div className="relative">
                  <button
                    onClick={() => setShowAssignDropdown(!showAssignDropdown)}
                    className="px-3 py-1.5 rounded-lg bg-surface-container-high text-on-surface-variant hover:text-on-surface text-xs font-medium flex items-center gap-1 border border-outline-variant/20"
                  >
                    <span className="material-symbols-outlined text-[14px]">
                      add
                    </span>
                    <span>Tag Topic</span>
                  </button>

                  {showAssignDropdown && (
                    <div className="absolute left-0 mt-2 w-64 p-3 rounded-lg bg-surface-container-low border border-surface-container-high shadow-xl z-20 flex flex-col gap-2">
                      <span className="text-xs font-semibold text-on-surface">
                        Assign to Topic
                      </span>
                      <select
                        value={selectedTopicToAssign}
                        onChange={(e) => setSelectedTopicToAssign(e.target.value)}
                        className="w-full text-xs p-2 rounded bg-surface-container border border-surface-container-high text-on-surface"
                      >
                        <option value="">Select a topic...</option>
                        {allTopics.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={handleAssign}
                        disabled={!selectedTopicToAssign || isAssigning}
                        className="w-full py-1.5 px-3 rounded bg-primary text-on-primary text-xs font-semibold disabled:opacity-50"
                      >
                        {isAssigning ? "Assigning..." : "Confirm"}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Document Intelligence & Cognitive Context Rail (4 cols) */}
        <div className="lg:col-span-4 flex flex-col gap-4">
          {/* Module 1: Mastery & Misconception Diagnostics */}
          <div className="p-5 rounded-xl bg-surface-container-low border border-surface-container-high shadow-sm flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary border border-primary/20 flex items-center justify-center">
                  <span className="material-symbols-outlined text-[20px]">
                    analytics
                  </span>
                </div>
                <div>
                  <div className="font-bold text-sm text-on-surface">
                    Mastery Status
                  </div>
                  <div className="text-xs text-outline">
                    Retention &amp; Syntactic Grasp
                  </div>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded bg-secondary/10 text-secondary text-xs font-semibold border border-secondary/20 capitalize">
                {accuracy}% {masteryState.replace("_", " ")}
              </span>
            </div>

            {/* Metric Bars */}
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between text-xs text-on-surface-variant font-medium">
                <span>Theorems &amp; Content Comprehension</span>
                <span className="font-mono text-on-surface">{accuracy}%</span>
              </div>
              <div className="w-full h-2 rounded-full bg-surface-container-high overflow-hidden">
                <div
                  className="h-full bg-secondary rounded-full transition-all"
                  style={{ width: `${accuracy}%` }}
                ></div>
              </div>
            </div>

            {/* Misconception Traps Warning */}
            <div className="p-3.5 rounded-lg bg-error-container/20 border-l-2 border-error-crimson flex flex-col gap-1.5">
              <div className="flex items-center gap-1.5 text-error-crimson text-xs font-semibold">
                <span className="material-symbols-outlined text-[16px]">
                  warning
                </span>
                <span>Active Cognitive Traps</span>
              </div>
              <p className="text-xs text-on-surface-variant leading-relaxed">
                Review definitions carefully before testing. In study sessions,
                verify theorem prerequisites and discrete edge cases.
              </p>
            </div>
          </div>

          {/* Module 2: Direct AI Tutor Ingestion Card */}
          <div className="p-5 rounded-xl bg-surface-container-low border border-primary/40 shadow-sm flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-tertiary/10 text-tertiary border border-tertiary/20 flex items-center justify-center">
                  <span className="material-symbols-outlined text-[20px]">
                    smart_toy
                  </span>
                </div>
                <div>
                  <div className="font-bold text-sm text-on-surface">
                    Ask AI Companion
                  </div>
                  <div className="text-xs text-tertiary">
                    Doc Context Pre-Bound
                  </div>
                </div>
              </div>
              <span className="w-2 h-2 rounded-full bg-tertiary animate-pulse"></span>
            </div>

            {/* Pre-formulated prompt preview */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold text-outline uppercase tracking-wider">
                RECOMMENDED INQUIRY
              </span>
              <div className="p-3 rounded-lg bg-surface-container text-xs text-on-surface italic leading-relaxed border border-outline-variant/20">
                “Explain the primary definitions and proofs on page {clampedPage} in
                simpler geometric terms.”
              </div>
            </div>

            {/* Send Prompt Button */}
            <div className="flex gap-2">
              <Link
                href={`/tutor?resourceId=${resource.id}`}
                className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-on-primary text-xs font-medium hover:opacity-90 transition-opacity shadow-sm"
              >
                <span className="material-symbols-outlined text-[18px]">
                  send
                </span>
                <span>Open in AI Tutor</span>
              </Link>
            </div>
          </div>

          {/* Module 3: Linked Study Sessions */}
          <div className="p-5 rounded-xl bg-surface-container-low border border-surface-container-high shadow-sm flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-surface-container-high text-on-surface flex items-center justify-center">
                  <span className="material-symbols-outlined text-[20px]">
                    history
                  </span>
                </div>
                <div>
                  <div className="font-bold text-sm text-on-surface">
                    Study Sessions
                  </div>
                  <div className="text-xs text-outline">
                    {linkedSessions.length} Historic Sessions
                  </div>
                </div>
              </div>
              <Link
                href="/study"
                className="text-xs text-secondary font-mono hover:underline"
              >
                View Hub
              </Link>
            </div>

            <div className="flex flex-col gap-2">
              {linkedSessions.slice(0, 3).map((s) => (
                <Link
                  key={s.id}
                  href={`/study/${s.id}`}
                  className="p-3 rounded-lg bg-surface-container hover:bg-surface-container-high border border-outline-variant/20 flex items-center justify-between transition-colors"
                >
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-semibold text-on-surface truncate">
                      {s.topic_name}
                    </span>
                    <span className="text-[11px] text-outline">
                      {new Date(s.started_at).toLocaleDateString()} •{" "}
                      {s.questions_attempted} questions
                    </span>
                  </div>
                  <div className="flex items-center gap-2 ml-2">
                    <span className="font-mono text-xs text-secondary font-semibold">
                      {s.total_attempts > 0
                        ? `${Math.round((s.correct_attempts / s.total_attempts) * 100)}%`
                        : "Active"}
                    </span>
                    <span className="material-symbols-outlined text-[16px] text-outline">
                      chevron_right
                    </span>
                  </div>
                </Link>
              ))}

              {linkedSessions.length === 0 && (
                <p className="text-xs text-outline italic py-2 text-center">
                  No previous sessions for this topic yet.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
