import {
  buildDailySeries,
  summarizeEmbeddingUsage,
  type EmbeddingUsageRow,
} from "../lib/usage/analytics";

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

function row(overrides: Partial<EmbeddingUsageRow>): EmbeddingUsageRow {
  return {
    created_at: "2026-10-08T12:00:00.000Z",
    prompt_tokens: 0,
    chunk_count: 0,
    model: "gemini-embedding-001",
    status: "success",
    ...overrides,
  };
}

const NOW = new Date("2026-10-08T12:00:00.000Z");

// Empty input
const empty = summarizeEmbeddingUsage([]);
check(
  "empty rows -> all zero totals",
  empty.totalTokens === 0 && empty.totalChunks === 0 && empty.totalRequests === 0,
);
check(
  "empty rows -> byModel empty",
  empty.byModel.length === 0,
);
check(
  "empty rows -> byStatus has zero counts",
  empty.byStatus.every((s) => s.count === 0),
);

// Aggregation by model and status
const rows: EmbeddingUsageRow[] = [
  row({ prompt_tokens: 100, chunk_count: 5, model: "m-a", status: "success" }),
  row({ prompt_tokens: 300, chunk_count: 10, model: "m-b", status: "success" }),
  row({ prompt_tokens: 50, chunk_count: 2, model: "m-a", status: "error" }),
  row({ prompt_tokens: 20, chunk_count: 1, model: "m-a", status: "weird" }),
];
const summary = summarizeEmbeddingUsage(rows);
check("totalTokens sums all rows", summary.totalTokens === 470);
check("totalChunks sums all rows", summary.totalChunks === 18);
check("totalRequests counts rows", summary.totalRequests === 4);
check(
  "byModel groups and sorts by tokens desc",
  summary.byModel.map((m) => m.model).join(",") === "m-b,m-a",
);
check(
  "byModel m-a aggregates tokens/chunks/requests",
  summary.byModel[1].tokens === 170 &&
    summary.byModel[1].chunks === 8 &&
    summary.byModel[1].requests === 3,
);
check(
  "byStatus counts success/error",
  summary.byStatus.find((s) => s.status === "success")?.count === 2 &&
    summary.byStatus.find((s) => s.status === "error")?.count === 1,
);
check(
  "unknown status grouped as other",
  summary.byStatus.find((s) => s.status === "other")?.count === 1,
);

// Null-safety
const nullSummary = summarizeEmbeddingUsage([
  row({ prompt_tokens: null, chunk_count: null, model: null }),
]);
check("null tokens/chunks treated as 0", nullSummary.totalTokens === 0 && nullSummary.totalChunks === 0);
check("null model grouped as unknown", nullSummary.byModel[0].model === "unknown");
check("null row still counts as a request", nullSummary.totalRequests === 1);

// Daily series
const series = buildDailySeries([], 7, NOW);
check("series returns exactly N entries", series.length === 7);
check(
  "series is zero-filled",
  series.every((d) => d.tokens === 0 && d.chunks === 0 && d.requests === 0),
);
check(
  "series is oldest first and ends on today (UTC)",
  series[0].date === "2026-10-02" && series[6].date === "2026-10-08",
);

// UTC day boundaries
const boundary = buildDailySeries(
  [
    row({ created_at: "2026-10-07T23:59:00.000Z", prompt_tokens: 7 }),
    row({ created_at: "2026-10-08T00:01:00.000Z", prompt_tokens: 9 }),
  ],
  7,
  NOW,
);
check(
  "23:59 and 00:01 UTC land on different days",
  boundary[5].date === "2026-10-07" &&
    boundary[5].tokens === 7 &&
    boundary[6].date === "2026-10-08" &&
    boundary[6].tokens === 9,
);

// Rows outside the window are excluded
const outside = buildDailySeries(
  [row({ created_at: "2026-09-01T10:00:00.000Z", prompt_tokens: 999 })],
  7,
  NOW,
);
check(
  "row older than the window is excluded",
  outside.every((d) => d.tokens === 0),
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
