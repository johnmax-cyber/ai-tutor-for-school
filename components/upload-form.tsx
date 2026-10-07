"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";

export function UploadForm() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file) return;

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
            accept="application/pdf"
            required
            disabled={loading}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="sr-only"
          />
          <div className="flex flex-col items-center gap-1">
            <span className="text-sm font-medium text-on-surface">
              {file ? file.name : "Click to select a PDF document"}
            </span>
            <span className="text-xs text-outline">
              Standard PDF or Scanned Notes (Max 25 MB)
            </span>
          </div>
        </label>
      </div>

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
        <span>{loading ? "Processing Document & OCR..." : "Upload & Ingest Document"}</span>
      </button>
    </form>
  );
}
