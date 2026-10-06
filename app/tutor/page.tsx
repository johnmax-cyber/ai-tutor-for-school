import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "@/components/sign-out-button";
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

  const readyResources = error ? [] : ((resources ?? []) as { id: string; title: string }[]);

  return (
    <main className="mx-auto max-w-4xl space-y-8 px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">AI Tutor</h1>
        <div className="flex items-center space-x-2">
          <a
            href="/study"
            className="text-sm font-medium text-green-600 hover:text-green-700"
          >
            Study Sessions
          </a>
          <SignOutButton />
        </div>
      </div>

      {readyResources.length === 0 ? (
        <section className="space-y-4">
          <p className="text-zinc-600 dark:text-zinc-400">
            You&apos;ve don&apos;t have any ready documents yet.
          </p>
          <a
            href="/library"
            className="inline-block rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Upload a PDF
          </a>
        </section>
      ) : (
        <TutorChat
          resources={readyResources}
          initialResourceId={resourceId}
        />
      )}
    </main>
  );
}