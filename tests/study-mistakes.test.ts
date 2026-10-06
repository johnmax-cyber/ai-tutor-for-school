import { updateMistakeRecord, updateMistakeOnCorrectAttempt, isMistakeRecurring } from "../lib/study/mistakes";
import { MistakePattern } from "@/types/study";

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

// Test creating a new mistake
const newMistake = updateMistakeRecord(null, "Student confused bits and bytes", "Confuses bits with bytes");
check("new mistake created", newMistake.incorrect_count === 1);
check("new mistake has correct description", newMistake.description === "Confuses bits with bytes");
check("new mistake is not recurring", newMistake.recurring === false);
check("new mistake has correct_count 0", newMistake.correct_count === 0);

// Test updating existing mistake (incorrect attempt)
const existingMistake: MistakePattern = {
  id: "m1",
  user_id: "u1",
  topic_id: "t1",
  concept_id: null,
  question_id: "q1",
  description: "Confuses bits with bytes",
  incorrect_count: 1,
  correct_count: 0,
  hint_count: 0,
  last_seen: "2026-01-05T10:00:00Z",
  recurring: false
};

const updatedMistake = updateMistakeRecord(existingMistake, "Another wrong answer", "Confuses bits with bytes");
check("incorrect count incremented", updatedMistake.incorrect_count === 2);
check("recurring set to true (2 incorrect, 0 correct)", updatedMistake.recurring === true);

// Test recurring with 3 incorrect, 1 correct
const recurringMistake: MistakePattern = {
  ...existingMistake,
  incorrect_count: 2,
  correct_count: 1,
  recurring: true
};

const stillRecurring = updateMistakeRecord(recurringMistake, "Another wrong answer", "Confuses bits with bytes");
check("still recurring (3 incorrect, 1 correct)", stillRecurring.recurring === true);

// Test correct attempt on existing mistake
const correctedMistake = updateMistakeOnCorrectAttempt(stillRecurring);
check("correct count incremented on correct attempt", correctedMistake.correct_count === 2);
check("no longer recurring (3 incorrect, 2 correct)", correctedMistake.recurring === false);

// Test isMistakeRecurring function
check("isMistakeRecurring returns true for recurring", isMistakeRecurring({ ...existingMistake, incorrect_count: 2, correct_count: 0, recurring: true }));
check("isMistakeRecurring returns false for non-recurring", isMistakeRecurring({ ...existingMistake, incorrect_count: 1, correct_count: 0, recurring: false }));
check("isMistakeRecurring returns false when corrected", isMistakeRecurring({ ...existingMistake, incorrect_count: 2, correct_count: 2, recurring: false }));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;