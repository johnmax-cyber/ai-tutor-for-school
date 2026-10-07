"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const router = useRouter();
  const supabase = createClient();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container border border-surface-container-high text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high text-xs sm:text-sm font-medium transition-colors"
    >
      <span className="material-symbols-outlined text-[16px]">logout</span>
      <span>Sign out</span>
    </button>
  );
}
