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
    .select("id, title, mime_type, page_count")
    .eq("user_id", user.id)
    .eq("status", "ready")
    .order("created_at", { ascending: false });

  const readyResources = error ? [] : ((resources ?? []) as { id: string; title: string; mime_type: string; page_count: number | null }[]);

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
  const resourceToUse = activeDoc || readyResources[0];

  // If no resources, show the existing empty state
  if (readyResources.length === 0) {
    return (
      <StudyShell
        breadcrumbs={[
          { label: "AI Tutor", href: "/tutor" },
        ]}
      >
        <div className="max-w-4xl mx-auto space-y-6">
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
        </div>
      </StudyShell>
    );
  }

  return (
    <StudyShell
      breadcrumbs={[
        { label: "AI Tutor", href: "/tutor" },
        ...(activeDoc ? [{ label: activeDoc.title }] : []),
      ]}
    >
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 pb-4 border-b border-surface-container-high">
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

        {/* Three column layout */}
        <div className="flex-1 grid grid-cols-[240px_1fr_240px] gap-6 overflow-hidden">
          {/* Left Panel: Resource Context */}
          <aside className="left-panel p-4 overflow-y-auto">
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0">
                  {/* Resource icon based on mime_type */}
                  <span className="material-symbols-outlined text-[36px]">
                    {resourceToUse.mime_type === "application/pdf"
                      ? "picture_as_pdf"
                      : resourceToUse.mime_type.startsWith("image/")
                        ? "image"
                        : "insert_drive_file"}
                  </span>
                </div>
                <div className="flex-1">
                  <h2 className="text-lg font-semibold text-on-surface mb-1">
                    {resourceToUse.title}
                  </h2>
                  <p className="text-sm text-on-surface-variant">
                    {resourceToUse.mime_type === "application/pdf"
                      ? "PDF"
                      : resourceToUse.mime_type.startsWith("image/")
                        ? "Image"
                        : "Document"}
                    {resourceToUse.page_count ? (
                      <>
                        <span> • </span>
                        <span>{resourceToUse.page_count} pages</span>
                      </>
                    ) : (
                      <>
                        <span> • </span>
                        <span>Page count unavailable</span>
                      </>
                    )}
                  </p>
                </div>
              </div>

              {/* Optional: Show a preview if it's an image */}
              {resourceToUse.mime_type.startsWith("image/") && (
                <div className="mt-4">
                  {/* We don't have the actual image URL, so we show a placeholder */}
                  <div className="aspect-w-16 aspect-h-9 bg-surface-container-low rounded-lg">
                    <span className="flex h-full items-center justify-center text-on-surface-variant">
                      Image preview
                    </span>
                  </div>
                  <p className="text-xs text-on-surface-variant mt-2">
                    {resourceToUse.title}
                  </p>
                </div>
              )}
            </div>
          </aside>

          {/* Center Panel: Tutor Conversation */}
          <section className="center-panel p-4 overflow-y-auto">
            {/* We keep the TutorChat component as is, but we wrap it in a container to match its expected layout if needed */}
            <div className="max-w-2xl mx-auto">
              <TutorChat
                resources={readyResources}
                imageResources={imageResources ?? []}
                initialResourceId={resourceId}
                visionConfigured={visionConfigured}
              />
            </div>
          </section>

          {/* Right Panel: Learning Context / Actions */}
          <aside className="right-panel p-4 overflow-y-auto">
            <div className="space-y-4">
              {/* Learning Context */}
              <div className="space-y-3">
                <div className="border border-surface-container-high rounded-lg p-4">
                  <div className="space-y-2">
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0">
                        <span className="material-symbols-outiled text-[24px] text-primary">
                          psychology_alt
                        </span>
                      </div>
                      <div className="flex-1">
                        <h3 className="text-base font-semibold text-on-surface mb-1">
                          Current Concept
                        </h3>
                        <p className="text-sm text-on-surface-variant">
                          {resourceToUse.title}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0">
                        <span className="material-symbols-outlined text-[24px] text-secondary">
                          emoji_events
                        </span>
                      </div>
                      <div className="flex-1">
                        <h3 className="text-base font-semibold text-on-surface mb-1">
                          Mastery
                        </h3>
                        <p className="text-sm text-on-surface-variant">
                          N/A
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0">
                        <span className="material-symbols-outlined text-[24px] text-secondary">
                          psychology
                        </span>
                      </div>
                      <div className="flex-1">
                        <h3 className="text-base font-semibold text-on-surface mb-1">
                          Mode
                        </h3>
                        {/* Mode selector - placeholder */}
                        <select
                          className="w-full p-2 rounded bg-surface-container-low border border-surface-container-high text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/50"
                          onChange={(e) => {
                            console.log("Mode selected:", e.target.value);
                            // Placeholder: no actual mode change yet
                          }}
                        >
                          <option value="explain">Explain</option>
                          <option value="teach">Teach me</option>
                          <option value="practice">Practice</option>
                          <option value="quiz">Quiz me</option>
                          <option value="exam">Exam preparation</option>
                          <option value="review">Review mistakes</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Suggested Actions */}
              <div className="space-y-3">
                <div className="border border-surface-container-high rounded-lg p-4">
                  <div className="space-y-2">
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0">
                        <span className="material-symbols-outiled text-[24px] text-primary">
                          lightbulb
                        </span>
                      </div>
                      <div className="flex-1">
                        <h3 className="text-base font-semibold text-on-surface mb-1">
                          Suggested Actions
                        </h3>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-2">
                        <button
                          disabled
                          className="px-3 py-1.5 rounded bg-surface-container-low border border-surface-container-high text-on-surface hover:bg-surface-container/hover:text-on-surface hover:opacity-90 transition-colors"
                        >
                          Explain simpler
                        </button>
                        <button
                          disabled
                          className="px-3 py-1.5 rounded bg-surface-container-low border border-surface-container-high text-on-surface hover:bg-surface-container/hover:text-on-surface hover:opacity-90 transition-colors"
                        >
                          Give an example
                        </button>
                        <button
                          disabled
                          className="px-3 py-1.5 rounded bg-surface-container-low border border-surface-container-high text-on-surface hover:bg-surface-container/hover:text-on-surface hover:opacity-90 transition-colors"
                        >
                          Quiz me
                        </button>
                        <button
                          disabled
                          className="px-3 py-1.5 rounded bg-surface-container-low border border-surface-container-high text-on-surface hover:bg-surface-container/hover:text-on-surface hover:opacity-90 transition-colors"
                        >
                          Practice this
                        </button>
                        <button
                          disabled
                          className="px-3 py-1.5 rounded bg-surface-container-low border border-surface-container-high text-on-surface hover:bg-surface-container/hover:text-on-surface hover:opacity-90 transition-colors"
                        >
                          Show source
                        </button>
                        <button
                          disabled
                          className="px-3 py-1.5 rounded bg-surface-container-low border border-surface-container-high text-on-surface hover:bg-surface-container/hover:text-on-surface hover:opacity-90 transition-colors"
                        >
                          Continue
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </StudyShell>
  );
}