import {
  getEmbeddingModelConfig,
  shouldReembedChunk,
  cosineSimilarity,
  mergeRrf,
} from "../lib/ai/embeddings";

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

function checkEqual(name: string, actual: number, expected: number) {
  check(name, Math.abs(actual - expected) < 1e-9);
}

const OLD_ENV = process.env;

function resetEnv() {
  process.env = { ...OLD_ENV };
}

check("getEmbeddingModelConfig returns null when model unset", getEmbeddingModelConfig() === null);

resetEnv();
process.env.AI_EMBEDDING_MODEL = "test-model";
process.env.AI_EMBEDDING_API_KEY = "test-key";
process.env.AI_EMBEDDING_BASE_URL = "http://localhost:8080/v1";

const config = getEmbeddingModelConfig();
check("getEmbeddingModelConfig returns config when set", config !== null && config.model === "test-model" && config.dimensions === 768);

resetEnv();
process.env.AI_EMBEDDING_MODEL = "test-model";
process.env.AI_EMBEDDING_DIMENSIONS = "384";
process.env.AI_EMBEDDING_API_KEY = "test-key";
process.env.AI_EMBEDDING_BASE_URL = "http://localhost:8080/v1";
const config384 = getEmbeddingModelConfig();
check("getEmbeddingModelConfig respects custom dimensions", config384 !== null && config384.dimensions === 384);

resetEnv();
process.env.AI_EMBEDDING_MODEL = "test-model";
process.env.AI_API_KEY = "fallback-key";
process.env.AI_BASE_URL = "http://localhost:8080/v1";
const fallbackConfig = getEmbeddingModelConfig();
check("getEmbeddingModelConfig falls back to chat env vars", fallbackConfig !== null && fallbackConfig.apiKey === "fallback-key");

check("shouldReembedChunk returns true when no hash", shouldReembedChunk({
  contentHash: null,
  embeddingModel: "m1",
  embeddingDim: 768,
  currentModel: "m1",
  currentDim: 768,
  embeddingSkipped: false,
}));

check("shouldReembedChunk returns true on model change", shouldReembedChunk({
  contentHash: "abc",
  embeddingModel: "m2",
  embeddingDim: 768,
  currentModel: "m1",
  currentDim: 768,
  embeddingSkipped: false,
}));

check("shouldReembedChunk returns true on dim change", shouldReembedChunk({
  contentHash: "abc",
  embeddingModel: "m1",
  embeddingDim: 384,
  currentModel: "m1",
  currentDim: 768,
  embeddingSkipped: false,
}));

check("shouldReembedChunk returns false when matching", !shouldReembedChunk({
  contentHash: "abc",
  embeddingModel: "m1",
  embeddingDim: 768,
  currentModel: "m1",
  currentDim: 768,
  embeddingSkipped: false,
}));

check("shouldReembedChunk returns false when skipped", !shouldReembedChunk({
  contentHash: "abc",
  embeddingModel: "m1",
  embeddingDim: 768,
  currentModel: "m1",
  currentDim: 768,
  embeddingSkipped: true,
}));

checkEqual("cosineSimilarity identical vectors", cosineSimilarity([1, 0, 0], [1, 0, 0]), 1);
checkEqual("cosineSimilarity orthogonal vectors", cosineSimilarity([1, 0], [0, 1]), 0);
checkEqual("cosineSimilarity opposite vectors", cosineSimilarity([1, 0], [-1, 0]), -1);
checkEqual("cosineSimilarity scaled identical", cosineSimilarity([2, 0], [1, 0]), 1);

const rrfResult = mergeRrf({
  ftsResults: [{ id: "a" }, { id: "b" }, { id: "c" }],
  vectorResults: [{ id: "b" }, { id: "d" }],
  weight: 0.5,
  limit: 4,
});
check("mergeRrf returns 4 results", rrfResult.length === 4);
check("mergeRrf weight 0.0 preserves FTS order", mergeRrf({
  ftsResults: [{ id: "a" }, { id: "b" }],
  vectorResults: [{ id: "b" }, { id: "a" }],
  weight: 0,
  limit: 2,
})[0].id === "a");
check("mergeRrf weight 1.0 preserves vector order", mergeRrf({
  ftsResults: [{ id: "a" }, { id: "b" }],
  vectorResults: [{ id: "b" }, { id: "a" }],
  weight: 1,
  limit: 2,
})[0].id === "b");
check("mergeRrf limits results", mergeRrf({
  ftsResults: [{ id: "a" }, { id: "b" }, { id: "c" }],
  vectorResults: [{ id: "d" }],
  weight: 0.5,
  limit: 2,
}).length === 2);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
