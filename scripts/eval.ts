import { retrieveChunks } from "@/lib/tutor/retrieve";
import type { RetrievedChunk } from "@/lib/tutor/retrieve";

interface EvalQuestion {
  question: string;
  expected_resource_title: string;
  expected_pages: number[];
}

interface EvalResult {
  question: string;
  ftsRecall5: number;
  hybridRecall5: number;
  ftsMrr: number;
  hybridMrr: number;
  ftsGrounded: boolean;
  hybridGrounded: boolean;
}

async function loadQuestions(): Promise<EvalQuestion[]> {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const fixturePath = path.join(process.cwd(), "tests", "fixtures", "eval-questions.json");
  const raw = fs.readFileSync(fixturePath, "utf8");
  return JSON.parse(raw) as EvalQuestion[];
}

function computeRecallAt5(chunks: RetrievedChunk[], expectedPages: number[]): number {
  if (expectedPages.length === 0) return 0;
  const top5 = chunks.slice(0, 5);
  const hits = top5.filter((c: RetrievedChunk) => expectedPages.includes(c.page_number)).length;
  return hits / Math.min(5, expectedPages.length);
}

function computeMrr(chunks: RetrievedChunk[], expectedPages: number[]): number {
  for (let i = 0; i < chunks.length; i++) {
    if (expectedPages.includes(chunks[i].page_number)) {
      return 1 / (i + 1);
    }
  }
  return 0;
}

async function runEval(): Promise<void> {
  const questions = await loadQuestions();
  const results: EvalResult[] = [];

  const OLD_MODEL = process.env.AI_EMBEDDING_MODEL;

  for (const q of questions) {
    console.error(`Evaluating: ${q.question.slice(0, 60)}...`);

    const ftsChunks = await retrieveChunks(q.question);

    if (OLD_MODEL) {
      delete process.env.AI_EMBEDDING_MODEL;
    }

    const hybridChunks = await retrieveChunks(q.question);

    if (OLD_MODEL) {
      process.env.AI_EMBEDDING_MODEL = OLD_MODEL;
    }

    results.push({
      question: q.question,
      ftsRecall5: computeRecallAt5(ftsChunks, q.expected_pages),
      hybridRecall5: computeRecallAt5(hybridChunks, q.expected_pages),
      ftsMrr: computeMrr(ftsChunks, q.expected_pages),
      hybridMrr: computeMrr(hybridChunks, q.expected_pages),
      ftsGrounded: ftsChunks.some((c: RetrievedChunk) => q.expected_pages.includes(c.page_number)),
      hybridGrounded: hybridChunks.some((c: RetrievedChunk) => q.expected_pages.includes(c.page_number)),
    });
  }

  const avgFtsRecall = results.reduce((s, r) => s + r.ftsRecall5, 0) / results.length;
  const avgHybridRecall = results.reduce((s, r) => s + r.hybridRecall5, 0) / results.length;
  const avgFtsMrr = results.reduce((s, r) => s + r.ftsMrr, 0) / results.length;
  const avgHybridMrr = results.reduce((s, r) => s + r.hybridMrr, 0) / results.length;
  const ftsGroundedCount = results.filter((r) => r.ftsGrounded).length;
  const hybridGroundedCount = results.filter((r) => r.hybridGrounded).length;

  const lines: string[] = [];
  lines.push("# Phase 9 Eval Report");
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Questions: ${results.length}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push("| Metric | FTS-only | Hybrid |");
  lines.push("|--------|----------|--------|");
  lines.push(`| recall@5 | ${avgFtsRecall.toFixed(3)} | ${avgHybridRecall.toFixed(3)} |`);
  lines.push(`| MRR | ${avgFtsMrr.toFixed(3)} | ${avgHybridMrr.toFixed(3)} |`);
  lines.push(`| grounded rate | ${(ftsGroundedCount / results.length).toFixed(3)} | ${(hybridGroundedCount / results.length).toFixed(3)} |`);
  lines.push("");
  lines.push("## Per-question results");
  lines.push("");
  lines.push("| # | Question | FTS recall@5 | Hybrid recall@5 | FTS MRR | Hybrid MRR |");
  lines.push("|---|----------|--------------|-----------------|---------|------------|");
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    lines.push(
      `| ${i + 1} | ${r.question.slice(0, 50)} | ${r.ftsRecall5.toFixed(2)} | ${r.hybridRecall5.toFixed(2)} | ${r.ftsMrr.toFixed(2)} | ${r.hybridMrr.toFixed(2)} |`,
    );
  }

  console.log(lines.join("\n"));
}

runEval().catch((err) => {
  console.error("Eval failed:", err);
  process.exitCode = 1;
});
