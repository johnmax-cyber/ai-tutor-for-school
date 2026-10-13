import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();

  if (authError || !auth?.user) {
    return NextResponse.json({ enabled: false, error: "Unauthorized" }, { status: 401 });
  }

  const enabled = !!process.env.AI_EMBEDDING_MODEL;
  return NextResponse.json({ enabled });
}