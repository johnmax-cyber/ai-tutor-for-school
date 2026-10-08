import { mergeRrf } from "../lib/ai/embeddings";

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

check("mergeRrf weight 0.0 preserves FTS order", mergeRrf({
  ftsResults: [{ id: "a" }, { id: "b" }, { id: "c" }],
  vectorResults: [{ id: "c" }, { id: "a" }],
  weight: 0,
  limit: 3,
})[0].id === "a");

check("mergeRrf weight 1.0 preserves vector order", mergeRrf({
  ftsResults: [{ id: "a" }, { id: "b" }],
  vectorResults: [{ id: "b" }, { id: "a" }],
  weight: 1,
  limit: 2,
})[0].id === "b");

check("mergeRrf with no results returns empty", mergeRrf({
  ftsResults: [],
  vectorResults: [],
  weight: 0.5,
  limit: 12,
}).length === 0);

check("mergeRrf respects limit", mergeRrf({
  ftsResults: [{ id: "a" }, { id: "b" }, { id: "c" }],
  vectorResults: [{ id: "d" }],
  weight: 0.5,
  limit: 2,
}).length === 2);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
