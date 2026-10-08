"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";

const ACCEPTED_TYPES = {
  "application/pdf": { ext: ".pdf", label: "PDF", maxMB: 25 },
  "image/png": { ext: ".png", label: "PNG", maxMB: 10 },
  "image/jpeg": { ext: ".jpg", label: "JPG", maxMB: 10 },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": { ext: ".pptx", label: "PPTX", maxMB: 50 },
  "text/plain": { ext: ".txt", label: "TXT", maxMB: 5 },
  "text/markdown": { ext: ".md", label: "MD", maxMB: 5 },
} as const;

type MimeType = keyof typeof ACCEPTED_TYPES;

function getMimeType(file: File): MimeType {
  const mime = file.type as MimeType;
  if (mime in ACCEPTED_TYPES) return mime;
  const ext = file.name.toLowerCase().split(".").pop();
  switch (ext) {
    case "pdf": return "application/pdf";
    case "png": return "image/png";
    case "jpg":
    case "jpeg": return "image/jpeg";
    case "pptx": return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    case "txt": return "text/plain";
    case "md":
    case "markdown": return "text/markdown";
    default: return "application/pdf";
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function UploadForm({ embeddingsEnabled = false }: { embeddingsEnabled?: boolean }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const showEmbeddingNotice = embeddingsEnabled;

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file) return;

    const mime = getMimeType(file);
    const limits = ACCEPTED_TYPES[mime];
    if (file.size > limits.maxMB * 1024 * 1024) {
      setError(`${limits.label} must be ${limits.maxMB} MB or smaller.`);
      return;
    }

    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/resources", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        let message = "Upload failed.";
        try {
          const body = await res.json();
          message = body.error || message;
        } catch {
          // keep default message
        }
        throw new Error(message);
      }

      setFile(null);
      (e.target as HTMLFormElement).reset();
      router.push("/library");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setLoading(false);
    }
  }

  const hint = file
    ? (() => {
        const mime = getMimeType(file);
        const limits = ACCEPTED_TYPES[mime];
        return `${limits.label} • ${formatSize(file.size)} / ${limits.maxMB} MB max`;
      })()
    : Object.entries(ACCEPTED_TYPES)
        .map(([mime, info]) => `${info.label} (${info.maxMB} MB)`)
        .join(", ");

  const acceptAttr = Object.keys(ACCEPTED_TYPES).join(",");

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-outline-variant/60 bg-surface-container/40 hover:bg-surface-container/70 px-4 py-8 text-center transition-colors">
        <span className="material-symbols-outlined text-[36px] text-primary mb-2">
          cloud_upload
        </span>
        <label htmlFor="file" className="block w-full cursor-pointer">
          <input
            id="file"
            type="file"
            accept={acceptAttr}
            required
            disabled={loading}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="sr-only"
          />
          <div className="flex flex-col items-center gap-1">
            <span className="text-sm font-medium text-on-surface">
              {file ? file.name : "Click to select a document"}
            </span>
            <span className="text-xs text-outline">
              {hint}
            </span>
          </div>
        </label>
      </div>

      <div className="p-2 rounded-lg bg-tertiary/5 border border-tertiary/20 text-xs text-on-surface-variant text-center">
        <span className="material-symbols-outlined align-middle text-[14px] me-1">
          info
        </span>
        Images and slides may be sent to an external AI provider when vision is enabled for diagram understanding and image Q&A.
      </div>

      {showEmbeddingNotice && (
        <div className="p-2 rounded-lg bg-tertiary/5 border border-tertiary/20 text-xs text-on-surface-variant text-center">
          <span className="material-symbols-outlined align-middle text-[14px] me-1">
            info
          </span>
          Embeddings are enabled. Chunk text is sent to an external provider for semantic search.
        </div>
      )}

      {error && (
        <div className="p-3 rounded-lg bg-error-container/20 border border-error/30 text-error-crimson text-sm flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px]">error</span>
          <span>{error}</span>
        </div>
      )}

      <button
        type="submit"
        disabled={loading || !file}
        className="w-full flex items-center justify-center gap-2 rounded-lg bg-primary text-on-primary py-2.5 px-4 text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
      >
        <span className="material-symbols-outlined text-[18px]">
          {loading ? "hourglass_empty" : "upload"}
        </span>
        <span>{loading ? "Processing Document..." : "Upload & Ingest Document"}</span>
      </button>
    </form>
  );
}