import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { UploadForm } from "@/components/upload-form";
import { SignOutButton } from "@/components/sign-out-button";
import type { Resource } from "@/lib/resources/types";

export const dynamic = "force-dynamic";

function statusColor(status: Resource["status"]) {
  switch (status) {
    case "ready":
      return "text-green-600";
    case "failed":
      return "text-red-600";
    case "processing":
      return "text-amber-600";
    default:
      return "text-zinc-600";
  }
}

export default async function LibraryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: resources, error } = await supabase
    .from("resources")
    .select(
      "id, user_id, title, original_filename, storage_path, mime_type, size_bytes, status, error_message, page_count, created_at, updated_at",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const list: Resource[] = error ? [] : ((resources ?? []) as Resource[]);

  return (
    <main className="mx-auto max-w-4xl space-y-8 px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">My Study Library</h1>
        <SignOutButton />
      </div>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Upload a PDF</h2>
        <UploadForm />
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Your documents</h2>
          <a
            href="/tutor"
            className="text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400"
          >
            Open Tutor
          </a>
        </div>
        {list.length === 0 ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            No documents yet. Upload a PDF to get started.
          </p>
        ) : (
          <table className="w-full table-auto text-left text-sm">
            <thead>
              <tr>
                <th className="pb-2 font-medium">Title</th>
                <th className="pb-2 font-medium">Status</th>
                <th className="pb-2 font-medium">Pages</th>
                <th className="pb-2 font-medium text-right">Size</th>
                <th className="pb-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.id} className="border-t border-zinc-200 dark:border-zinc-800">
                  <td className="py-2 align-top">{r.title || r.original_filename}</td>
                  <td className={`py-2 ${statusColor(r.status)}`}>{r.status}</td>
                  <td className="py-2">{r.page_count ?? "—"}</td>
                  <td className="py-2 text-right">
                    {(r.size_bytes / 1024 / 1024).toFixed(2)} MB
                  </td>
                  <td className="py-2 text-right">
                    {r.status === "ready" && (
                      <a
                        href={`/tutor?resourceId=${r.id}`}
                        className="text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400"
                      >
                        Study
                      </a>
                    )}
                  </td>
                </tr>
              ))}
              {list.some((r) => r.status === "failed") && (
                <>
                  {list
                    .filter((r) => r.status === "failed")
                    .map((r) => (
                      <tr key={`error-${r.id}`} className="border-t border-zinc-200 dark:border-zinc-800">
                        <td colSpan={5} className="py-2 text-sm text-red-600 dark:text-red-400">
                          {r.error_message}
                        </td>
                      </tr>
                    ))}
                </>
              )}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
