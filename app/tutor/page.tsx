import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { StudyShell } from "@/components/study-shell";
import { TutorChat } from "@/components/tutor-chat";

export const dynamic = "force-dynamic";

export default async function TutorPage({
  searchParams,
}: {
  searchParams: Promise<{ resourceId?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { resourceId } = await searchParams;

  const { data: resources, error } = await supabase
    .from("resources")
    .select("id, title")
    .eq("user_id", user.id)
    .eq("status", "ready")
    .order("created_at", { ascending: false });

  const readyResources = error
    ? []
    : ((resources ?? []) as { id: string; title: string }[]);

  // Fetch image resources (images and slides with images)
  const { data: imageResources } = await supabase
    .from("resources")
    .select("id, title, mime_type, page_count")
    .eq("user_id", user.id)
    .eq("status", "ready")
    .in("mime_type", [
      "image/png",
      "image/jpeg",
      "image/jpg",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ])
    .order("created_at", { ascending: false });

  const visionConfigured = Boolean(
    process.env.AI_VISION_MODEL && (process.env.AI_VISION_API_KEY || process.env.AI_API_KEY)
  );

  const activeDoc = readyResources.find((r) => r.id === resourceId);

  return (
    <StudyShell
      breadcrumbs={[
        { label: "AI Tutor", href: "/tutor" },
        ...(activeDoc ? [{ label: activeDoc.title }] : []),
      ]}
    >
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-surface-container-high">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-on-surface flex items-center gap-2.5">
              <span className="material-symbols-outlined text-primary text-[28px]">
                smart_toy
              </span>
              <span>AI Academic Companion</span>
            </h1>
            <p className="text-xs sm:text-sm text-on-surface-variant mt-1">
              Grounded multimodal reasoning engine tied strictly to your ingested library materials.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/study"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-xs font-medium text-secondary border border-surface-container-high transition-colors"
            >
              <span className="material-symbols-outlined text-[16px]">timer</span>
              <span>Study Sessions</span>
            </Link>
            <Link
              href="/library"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-xs font-medium text-on-surface-variant transition-colors"
            >
              <span className="material-symbols-outlined text-[16px]">
                local_library
              </span>
              <span>Library</span>
            </Link>
          </div>
        </div>

        {readyResources.length === 0 ? (
          <div className="p-8 rounded-xl bg-surface-container-low border border-dashed border-surface-container-high text-center flex flex-col items-center gap-4">
            <span className="material-symbols-outlined text-[48px] text-outline">
              auto_stories
            </span>
            <div>
              <h2 className="text-lg font-semibold text-on-surface">
                No ready documents found
              </h2>
              <p className="text-sm text-outline mt-1 max-w-md">
                The AI Tutor requires indexed documents to answer questions with verifiable citations.
              </p>
            </div>
            <Link
              href="/library"
              className="px-4 py-2 rounded-lg bg-primary text-on-primary text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Upload PDF in Library
            </Link>
          </div>
        ) : (
          <TutorChat
            resources={readyResources}
            imageResources={imageResources ?? []}
            initialResourceId={resourceId}
            visionConfigured={visionConfigured}
          />
        )}
      </div>
    </StudyShell>
  );
}