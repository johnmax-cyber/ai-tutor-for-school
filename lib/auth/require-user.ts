import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function requireUser() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    const redirectResp = new NextResponse("/login", {
      status: 307,
      headers: { "x-redirect-reason": "auth_required" },
    });
    throw { user: null, error, redirect: redirectResp };
  }

  return { user, error: null, redirect: null };
}