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
      <div className="flex items-center justify-center rounded-md border border-dashed border-zinc-300 px-4 py-6 text-center dark:border-zinc-700">
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
          <span className="text-sm text-zinc-600 dark:text-zinc-400">
            {file ? file.name : "Choose a PDF file (max 25 MB)"}
          </span>
        </label>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={loading || !file}
        className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
      >
        {loading ? "Uploading..." : "Upload PDF"}
      </button>
    </form>
  );
}
