import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const enabled = !!process.env.AI_EMBEDDING_MODEL;
  return NextResponse.json({ enabled });
}
