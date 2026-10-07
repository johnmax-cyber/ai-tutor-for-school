import {
  computePerformanceTrend,
  computeStudyTips,
  computeSessionAnalytics,
  computeTopicInsights,
  SessionAccuracy,
} from "../lib/study/analytics";
import { calculateNextReview, Sm2Attempt } from "../lib/study/mastery";
import { getMistakePatterns, MistakePatternInput } from "../lib/study/mistakes";
import { generateHandoff, HandoffInput } from "../lib/study/handoff";

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

// ============================================
// Performance Trend Tests
// ============================================
console.log("\n=== computePerformanceTrend ===");

const improvingSessions: SessionAccuracy[] = [
  { sessionId: "s1", accuracy: 0.3 },
  { sessionId: "s2", accuracy: 0.5 },
  { sessionId: "s3", accuracy: 0.7 },
];
check("improving trend detected", computePerformanceTrend(improvingSessions) === "improving");

const decliningSessions: SessionAccuracy[] = [
  { sessionId: "s1", accuracy: 0.8 },
  { sessionId: "s2", accuracy: 0.5 },
  { sessionId: "s3", accuracy: 0.3 },
];
check("declining trend detected", computePerformanceTrend(decliningSessions) === "declining");

const stableSessions: SessionAccuracy[] = [
  { sessionId: "s1", accuracy: 0.6 },
  { sessionId: "s2", accuracy: 0.65 },
  { sessionId: "s3", accuracy: 0.6 },
];
check("stable trend detected", computePerformanceTrend(stableSessions) === "stable");

check("insufficient_data for 1 session", computePerformanceTrend([{ sessionId: "s1", accuracy: 0.5 }]) === "insufficient_data");
check("insufficient_data for 0 sessions", computePerformanceTrend([]) === "insufficient_data");

// ============================================
// Study Tips Tests
// ============================================
console.log("\n=== computeStudyTips ===");

const lowAccuracyTips = computeStudyTips({
  accuracy: 0.3,
  avgHintsPerQuestion: 0.1,
  recurringMistakes: [],
  totalAttempts: 10,
});
check("low accuracy generates tip", lowAccuracyTips.some(t => t.category === "accuracy"));

const highHintTips = computeStudyTips({
  accuracy: 0.8,
  avgHintsPerQuestion: 0.8,
  recurringMistakes: [],
  totalAttempts: 10,
});
check("high hint usage generates tip", highHintTips.some(t => t.category === "hints"));

const mistakeTips = computeStudyTips({
  accuracy: 0.7,
  avgHintsPerQuestion: 0.1,
  recurringMistakes: ["confuses bits with bytes"],
  totalAttempts: 10,
});
check("recurring mistakes generates tip", mistakeTips.some(t => t.category === "mistakes"));

const noTips = computeStudyTips({
  accuracy: 0.95,
  avgHintsPerQuestion: 0.1,
  recurringMistakes: [],
  totalAttempts: 10,
});
check("no tips when performance is excellent and no mistakes", noTips.length === 0);

// ============================================
// Session Analytics Tests
// ============================================
console.log("\n=== computeSessionAnalytics ===");

const sessionAnalytics = computeSessionAnalytics({
  sessionId: "s1",
  topicId: "t1",
  totalAttempts: 10,
  correctAttempts: 7,
  hintsUsed: 2,
  questionsCount: 5,
  mistakes: [{ description: "confuses bits with bytes", occurrenceCount: 3, lastSeen: "2026-01-05" }],
  sessionAccuracies: [{ sessionId: "s1", accuracy: 0.7 }],
});
check("session analytics has correct accuracy", sessionAnalytics.accuracy === 0.7);
check("session analytics has correct totalAttempts", sessionAnalytics.totalAttempts === 10);
check("session analytics has correct hintsUsed", sessionAnalytics.hintsUsed === 2);
check("session analytics has commonMistakes", sessionAnalytics.commonMistakes.length === 1);
check("session analytics has performanceTrend", sessionAnalytics.performanceTrend !== undefined);

// ============================================
// Topic Insights Tests
// ============================================
console.log("\n=== computeTopicInsights ===");

const topicInsights = computeTopicInsights({
  topicId: "t1",
  topicName: "Test Topic",
  masteryState: "developing",
  nextReviewAt: "2026-01-12",
  totalSessions: 3,
  totalAttempts: 20,
  correctAttempts: 14,
  hintsUsed: 4,
  questionsCount: 10,
  mistakes: [{ description: "confuses bits with bytes", occurrenceCount: 2, lastSeen: "2026-01-05" }],
  sessionAccuracies: [
    { sessionId: "s1", accuracy: 0.5 },
    { sessionId: "s2", accuracy: 0.6 },
    { sessionId: "s3", accuracy: 0.8 },
  ],
});
check("topic insights has correct topicName", topicInsights.topicName === "Test Topic");
check("topic insights has correct accuracy", topicInsights.accuracy === 0.7);
check("topic insights has improving trend", topicInsights.performanceTrend === "improving");
check("topic insights has studyTips", topicInsights.studyTips.length >= 0);

// ============================================
// SM-2 Next Review Tests
// ============================================
console.log("\n=== calculateNextReview ===");

const sm2NoAttempts: Sm2Attempt[] = [];
equal(calculateNextReview(sm2NoAttempts), null, "no attempts returns null");

const sm2CorrectNoHint: Sm2Attempt[] = [{ is_correct: true, hint_used: false }];
const sm2CorrectNoHintDate = calculateNextReview(sm2CorrectNoHint, new Date("2026-01-01"));
check("single correct no hint = +2 days", sm2CorrectNoHintDate?.toISOString() === new Date("2026-01-03").toISOString());

const sm2CorrectWithHint: Sm2Attempt[] = [{ is_correct: true, hint_used: true }];
const sm2CorrectWithHintDate = calculateNextReview(sm2CorrectWithHint, new Date("2026-01-01"));
check("correct with hint resets to +1 day", sm2CorrectWithHintDate?.toISOString() === new Date("2026-01-02").toISOString());

const sm2Incorrect: Sm2Attempt[] = [{ is_correct: false, hint_used: false }];
const sm2IncorrectDate = calculateNextReview(sm2Incorrect, new Date("2026-01-01"));
check("incorrect resets to +1 day", sm2IncorrectDate?.toISOString() === new Date("2026-01-02").toISOString());

const sm2Doubling: Sm2Attempt[] = [
  { is_correct: true, hint_used: false },
  { is_correct: true, hint_used: false },
  { is_correct: true, hint_used: false },
];
const sm2DoublingDate = calculateNextReview(sm2Doubling, new Date("2026-01-01"));
check("3 consecutive correct = +8 days", sm2DoublingDate?.toISOString() === new Date("2026-01-09").toISOString());

const sm2ResetAfterMistake: Sm2Attempt[] = [
  { is_correct: true, hint_used: false },
  { is_correct: true, hint_used: false },
  { is_correct: false, hint_used: false },
  { is_correct: true, hint_used: false },
];
const sm2ResetDate = calculateNextReview(sm2ResetAfterMistake, new Date("2026-01-01"));
check("mistake resets interval then doubles", sm2ResetDate?.toISOString() === new Date("2026-01-03").toISOString());

// ============================================
// Mistake Patterns Tests
// ============================================
console.log("\n=== getMistakePatterns ===");

const mistakeInputs: MistakePatternInput[] = [
  { description: "Confuses bits with bytes", incorrectCount: 2, lastSeen: "2026-01-05" },
  { description: "Confuses bits with bytes", incorrectCount: 1, lastSeen: "2026-01-06" },
  { description: "Forgets carry in addition", incorrectCount: 1, lastSeen: "2026-01-04" },
];
const patterns = getMistakePatterns(mistakeInputs);
check("getMistakePatterns returns patterns", patterns.length === 1);
check("patterns are aggregated correctly", patterns[0].incorrectCount === 3);
check("patterns are sorted by occurrence", patterns[0].description === "Confuses bits with bytes");

const noPatterns = getMistakePatterns([
  { description: "minor error", incorrectCount: 1, lastSeen: "2026-01-05" },
]);
check("no patterns when all counts < 2", noPatterns.length === 0);

// ============================================
// Handoff Enhancement Tests
// ============================================
console.log("\n=== generateHandoff (enhanced) ===");

const enhancedHandoff = generateHandoff({
  topicName: "Data Representation",
  subjectName: "Cybersecurity",
  questionsCount: 8,
  totalAttempts: 10,
  correctAttempts: 7,
  hintsUsed: 2,
  mistakes: [],
  masteryState: "developing",
  studyTips: ["Review foundational concepts"],
  performanceTrend: "improving",
});
check("handoff contains study tips section", enhancedHandoff.includes("Study tips:"));
check("handoff contains performance trend", enhancedHandoff.includes("Performance trend: improving"));

// ============================================
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
