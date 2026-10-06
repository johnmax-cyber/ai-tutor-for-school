import { generateHandoff } from "../lib/study/handoff";
import { MistakePattern } from "@/types/study";
import { MasteryState } from "@/types/study";

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

function contains(text: string, substring: string, name: string) {
  const ok = text.includes(substring);
  check(name, ok);
  if (!ok) {
    console.log(`  Expected to contain: "${substring}"`);
    console.log(`  Actual: "${text}"`);
  }
}

const baseInput = {
  topicName: "Data Representation",
  subjectName: "Cybersecurity",
  questionsCount: 8,
  totalAttempts: 10,
  correctAttempts: 7,
  hintsUsed: 2,
  mistakes: [
    {
      description: "Confuses bits with bytes",
      incorrect_count: 2,
      correct_count: 0,
      hint_count: 1,
      last_seen: "2026-01-05T10:00:00Z",
      recurring: true
    }
  ] as MistakePattern[],
  masteryState: "developing" as MasteryState
};

// Test basic handoff structure
const handoff = generateHandoff(baseInput);
contains(handoff, "STUDY HANDOFF", "contains header");
contains(handoff, "Topic: Data Representation (Cybersecurity)", "contains topic and subject");
contains(handoff, "Completed:", "contains completed section");
contains(handoff, "Needs review:", "contains needs review section");
contains(handoff, "Last activity:", "contains last activity section");
contains(handoff, "Performance:", "contains performance section");
contains(handoff, "Next session:", "contains next session section");

// Test with no mistakes
const noMistakesInput = {
  ...baseInput,
  mistakes: [] as MistakePattern[]
};
const noMistakesHandoff = generateHandoff(noMistakesInput);
contains(noMistakesHandoff, "No specific review needed", "no mistakes shows no review needed");

// Test with low performance
const lowPerfInput = {
  ...baseInput,
  correctAttempts: 2,
  totalAttempts: 10
};
const lowPerfHandoff = generateHandoff(lowPerfInput);
contains(lowPerfHandoff, "Review recommended based on performance", "low performance shows review needed");

// Test strong mastery
const strongInput = {
  ...baseInput,
  masteryState: "strong" as MasteryState,
  correctAttempts: 9,
  totalAttempts: 10
};
const strongHandoff = generateHandoff(strongInput);
contains(strongHandoff, "Continue to advanced topics or related subjects", "strong mastery suggests advanced topics");

// Test review_needed state
const reviewInput = {
  ...baseInput,
  masteryState: "review_needed" as MasteryState
};
const reviewHandoff = generateHandoff(reviewInput);
contains(reviewHandoff, "Review the topics mentioned above", "review_needed suggests review first");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;