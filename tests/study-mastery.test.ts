import { calculateMasteryState, calculateReviewDate, TopicStats } from "../lib/study/mastery";

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

function equal<T>(actual: T, expected: T, name: string) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  check(name, ok);
  if (!ok) {
    console.log(`  Expected: ${JSON.stringify(expected)}`);
    console.log(`  Actual:   ${JSON.stringify(actual)}`);
  }
}

// Test not_started state
const notStarted: TopicStats = {
  totalAttempts: 0,
  correctAttempts: 0,
  correctRate: 0,
  last5Accuracy: 0,
  last3AllCorrect: false,
  hasRecurringMistakes: false,
  lastStudied: null
};
check("not_started -> not_started", calculateMasteryState(notStarted) === "not_started");
equal(calculateReviewDate("not_started", new Date("2026-01-01")), null, "not_started review date is null");

// Test learning state
const learning: TopicStats = {
  totalAttempts: 5,
  correctAttempts: 2,
  correctRate: 0.4,
  last5Accuracy: 0.4,
  last3AllCorrect: false,
  hasRecurringMistakes: false,
  lastStudied: new Date("2026-01-05")
};
check("learning -> learning", calculateMasteryState(learning) === "learning");
equal(
  calculateReviewDate("learning", new Date("2026-01-05")).toISOString(),
  new Date("2026-01-08").toISOString(),
  "learning review date +3 days"
);

// Test developing state
const developing: TopicStats = {
  totalAttempts: 10,
  correctAttempts: 7,
  correctRate: 0.7,
  last5Accuracy: 0.8,
  last3AllCorrect: false,
  hasRecurringMistakes: false,
  lastStudied: new Date("2026-01-05")
};
check("developing -> developing", calculateMasteryState(developing) === "developing");
equal(
  calculateReviewDate("developing", new Date("2026-01-05")).toISOString(),
  new Date("2026-01-12").toISOString(),
  "developing review date +7 days"
);

// Test strong state
const strong: TopicStats = {
  totalAttempts: 20,
  correctAttempts: 18,
  correctRate: 0.9,
  last5Accuracy: 1.0,
  last3AllCorrect: true,
  hasRecurringMistakes: false,
  lastStudied: new Date("2026-01-05")
};
check("strong -> strong", calculateMasteryState(strong) === "strong");
equal(
  calculateReviewDate("strong", new Date("2026-01-05")).toISOString(),
  new Date("2026-02-04").toISOString(),
  "strong review date +30 days"
);

// Test review_needed due to low recent accuracy
const reviewNeededLowAccuracy: TopicStats = {
  totalAttempts: 10,
  correctAttempts: 6,
  correctRate: 0.6,
  last5Accuracy: 0.3, // below 0.5
  last3AllCorrect: false,
  hasRecurringMistakes: false,
  lastStudied: new Date("2026-01-05")
};
check("low recent accuracy -> review_needed", calculateMasteryState(reviewNeededLowAccuracy) === "review_needed");
equal(
  calculateReviewDate("review_needed", new Date("2026-01-05")).toISOString(),
  new Date("2026-01-06").toISOString(),
  "review_needed review date +1 day"
);

// Test review_needed due to recurring mistakes
const reviewNeededMistakes: TopicStats = {
  totalAttempts: 20,
  correctAttempts: 15,
  correctRate: 0.75,
  last5Accuracy: 0.8,
  last3AllCorrect: true,
  hasRecurringMistakes: true,
  lastStudied: new Date("2026-01-05")
};
check("recurring mistakes -> review_needed", calculateMasteryState(reviewNeededMistakes) === "review_needed");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;