"use client";

import { useState, useEffect } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { UploadForm } from "@/components/upload-form";
import { SignOutButton } from "@/components/sign-out-button";
import type { Resource } from "@/lib/resources/types";

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

export default function LibraryPage() {
  const [user, setUser] = useState<{ id: string } | null>(null);
  const [resources, setResources] = useState<Resource[]>([]);
  const [topics, setTopics] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [assigningResource, setAssigningResource] = useState<{ resourceId: string; topicId: string | null } | null>(null);

  useEffect(() => {
    async function loadData() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        redirect("/login");
      }
      
      setUser(user);

      // Load resources
      const { data: resourcesData } = await supabase
        .from("resources")
        .select("id, user_id, title, original_filename, storage_path, mime_type, size_bytes, status, error_message, page_count, created_at, updated_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      setResources(resourcesData || []);

      // Load topics
      const { data: topicsData } = await supabase
        .from("topics")
        .select("id, name")
        .eq("user_id", user.id)
        .order("name", { ascending: true });

      setTopics(topicsData || []);
      setLoading(false);
    }
    loadData();
  }, []);

  const handleAssignResource = async (resourceId: string, topicId: string) => {
    const supabase = createClient();
    const { error } = await supabase
      .from("resources_topics")
      .insert({
        resource_id: resourceId,
        topic_id: topicId
      });

    if (error) {
      console.error("Failed to assign resource:", error);
      return;
    }

    setAssigningResource(null);
    // In a real app, show success feedback
  };

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  if (!user) {
    return null;
  }

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
          <div className="flex items-center space-x-2">
            <a
              href="/tutor"
              className="text-sm font-medium text-blue-600 hover:text-blue-700"
            >
              Open Tutor
            </a>
            <a
              href="/study"
              className="text-sm font-medium text-green-600 hover:text-green-700"
            >
              Study Sessions
            </a>
          </div>
        </div>
        {resources.length === 0 ? (
          <p className="text-sm text-zinc-600">
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
                <th className="pb-2 font-medium">Topic</th>
                <th className="pb-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {resources.map((r) => (
                <tr key={r.id} className="border-t border-zinc-200 dark:border-zinc-800">
                  <td className="py-2 align-top">{r.title || r.original_filename}</td>
                  <td className={`py-2 ${statusColor(r.status)}`}>{r.status}</td>
                  <td className="py-2">{r.page_count ?? "—"}</td>
                  <td className="py-2 text-right">
                    {(r.size_bytes / 1024 / 1024).toFixed(2)} MB
                  </td>
                  <td className="py-2">
                    {r.status === "ready" ? (
                      <div className="relative">
                        <select
                          value={assigningResource?.resourceId === r.id ? assigningResource?.topicId || "" : ""}
                          onChange={(e) => {
                            setAssigningResource(prev => {
                              if (e.target.value === "") {
                                return null;
                              }
                              return { resourceId: r.id, topicId: e.target.value };
                            });
                          }}
                          className="block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">Select Topic</option>
                          {topics.map(topic => (
                            <option key={topic.id} value={topic.id}>
                              {topic.name}
                            </option>
                          ))}
                        </select>
                        {assigningResource?.resourceId === r.id && assigningResource?.topicId && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 rounded">
                            <button
                              onClick={() => handleAssignResource(r.id, assigningResource.topicId!)}
                              className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                            >
                              Assign
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-500">No topic</span>
                    )}
                  </td>
                  <td className="py-2 text-right">
                    {r.status === "ready" && (
                      <a
                        href={`/tutor?resourceId=${r.id}`}
                        className="text-sm font-medium text-blue-600 hover:text-blue-700"
                      >
                        Study
                      </a>
                    )}
                  </td>
                </tr>
              ))}
              {resources.some((r) => r.status === "failed") && (
                <>
                  {resources
                    .filter((r) => r.status === "failed")
                    .map((r) => (
                      <tr key={`error-${r.id}`} className="border-t border-zinc-200 dark:border-zinc-800">
                        <td colSpan={6} className="py-2 text-sm text-red-600">
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