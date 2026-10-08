import { z } from "zod";
import { embedPendingChunks, MAX_EMBEDDABLE_CHUNKS_PER_RESOURCE } from "../lib/resources/embeddings";

let passed = 0;
let failed = 0;

function check(name: string, actual: boolean) {
  if (actual) {
    passed++;
    console.log(`PASS: ${name}`);
  } else {
    failed++;
    console.log(`FAIL: ${name}`);
  }
}

const OLD_ENV = process.env;

function resetEnv() {
  process.env = { ...OLD_ENV };
}

check("MAX_EMBEDDABLE_CHUNKS_PER_RESOURCE defaults to 200", MAX_EMBEDDABLE_CHUNKS_PER_RESOURCE === 200);

async function runAsyncTests() {
  resetEnv();
  process.env.AI_EMBEDDING_MODEL = "";
  const emptyModelResult = await embedPendingChunks("user-1");
  check("embedPendingChunks returns completed when model unset", emptyModelResult.status === "completed" && emptyModelResult.embedded === 0);
}

resetEnv();
process.env.AI_EMBEDDING_MODEL = "test-model";
process.env.AI_EMBEDDING_API_KEY = "test-key";
process.env.AI_EMBEDDING_BASE_URL = "http://localhost:8080/v1";

const schema = z.object({
  userId: z.string().uuid(),
  resourceId: z.string().uuid().optional(),
  batchSize: z.number().int().positive().max(200).optional(),
  dailyBudget: z.number().int().positive().max(1000).optional(),
});

const parsed = schema.safeParse({ userId: "00000000-0000-0000-0000-000000000000" });
check("backfill schema validates userId", parsed.success === true);

const badParse = schema.safeParse({ userId: "not-a-uuid" });
check("backfill schema rejects invalid userId", badParse.success === false);

runAsyncTests()
  .then(() => {
    console.log(`\n${passed} passed, ${failed} failed`);
    if (failed > 0) process.exitCode = 1;
  })
  .catch((err) => {
    console.error("Async test error:", err);
    process.exitCode = 1;
  });
