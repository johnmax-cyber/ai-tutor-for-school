import { NextResponse } from "next/server";
import { z } from "zod";
import {
  validateN8nWebhook,
  createServiceSupabase,
  verifyUserExists,
  verifyResourceOwnership,
} from "@/lib/automation/auth";
import { embedPendingChunks, MAX_EMBEDDABLE_CHUNKS_PER_RESOURCE } from "@/lib/resources/embeddings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const backfillEmbeddingsSchema = z.object({
  userId: z.string().uuid(),
  resourceId: z.string().uuid().optional(),
  batchSize: z.number().int().positive().max(200).optional(),
  dailyBudget: z.number().int().positive().max(1000).optional(),
});

function countTodayUsage(supabase: ReturnType<typeof createServiceSupabase>, userId: string): Promise<number> {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  async function count(): Promise<number> {
    const { count } = await supabase
      .from("embedding_usage_log")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", today.toISOString());
    return count ?? 0;
  }

  return count();
}

export async function POST(request: Request) {
  const { valid } = validateN8nWebhook(request);
  if (!valid) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const parsed = backfillEmbeddingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const supabase = createServiceSupabase();
  const { userId, resourceId, batchSize = 50, dailyBudget = 10 } = parsed.data;

  try {
    const userOk = await verifyUserExists(supabase, userId);
    if (!userOk) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    if (resourceId) {
      const resource = await verifyResourceOwnership(supabase, userId, resourceId);
      if (!resource) {
        return NextResponse.json({ error: "Resource not found." }, { status: 404 });
      }
    }

    const usedToday = await countTodayUsage(supabase, userId);
    const budgetRemaining = Math.max(0, dailyBudget - usedToday);

    if (budgetRemaining <= 0) {
      return NextResponse.json(
        { success: true, status: "budget_exhausted", budgetRemaining: 0, embedded: 0, skipped: 0, failed: 0 },
        { status: 200 },
      );
    }

    const effectiveBatchSize = Math.min(batchSize, MAX_EMBEDDABLE_CHUNKS_PER_RESOURCE);
    const result = await embedPendingChunks(userId, resourceId, effectiveBatchSize);

    const actualBudgetUsed = Math.ceil((result.embedded + result.skipped + result.failed) / effectiveBatchSize);
    const remainingAfter = Math.max(0, budgetRemaining - actualBudgetUsed);

    return NextResponse.json(
      {
        success: result.status !== "failed",
        status: result.status,
        embedded: result.embedded,
        skipped: result.skipped,
        failed: result.failed,
        nextCursor: result.nextCursor,
        budgetRemaining: remainingAfter,
        error: result.error,
      },
      { status: 200 },
    );
  } catch (err) {
    console.error("backfill-embeddings webhook error:", err);
    return NextResponse.json({ error: "Backfill failed." }, { status: 500 });
  }
}
