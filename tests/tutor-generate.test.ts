import { generateQuestion, generateNextTurn } from "../lib/tutor/generate";
import { createMockAI } from "../lib/ai/mock";
import { RetrievedChunk } from "../lib/tutor/retrieve";

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

const mockChunks: RetrievedChunk[] = [
  {
    id: "c1",
    resource_id: "r1",
    resource_title: "Data Basics",
    page_number: 1,
    chunk_index: 0,
    content: "A byte contains 8 bits. This is the fundamental unit of digital information.",
    rank: 0.9
  },
  {
    id: "c2",
    resource_id: "r1",
    resource_title: "Data Basics",
    page_number: 2,
    chunk_index: 1,
    content: "A kilobyte is 1024 bytes. A megabyte is 1024 kilobytes.",
    rank: 0.8
  }
];

// Mock AI for generateQuestion
const mockAIQuestion = createMockAI([
  JSON.stringify({
    question: "How many bits are in a byte?",
    answer_key: "8 bits",
    explanation: "A byte is the fundamental unit of digital information and consists of 8 bits.",
    hint: "Think about the binary representation of data."
  })
]);

// Mock AI for generateNextTurn (correct)
const mockAICorrect = createMockAI([
  JSON.stringify({
    is_correct: true,
    feedback: "Correct! A byte is indeed 8 bits.",
    hint: null,
    misconception: null,
    next_question: "How many bits are in 3 bytes?",
    answer_key: "24 bits",
    explanation: "Since 1 byte = 8 bits, 3 bytes = 3 * 8 = 24 bits."
  })
]);

// Mock AI for generateNextTurn (incorrect)
const mockAIIncorrect = createMockAI([
  JSON.stringify({
    is_correct: false,
    feedback: "Not quite. Remember that a byte is 8 bits.",
    hint: "Think about multiplying the number of bytes by 8.",
    misconception: "Confused multiplication with addition",
    next_question: null,
    answer_key: null,
    explanation: null
  })
]);

async function runTests() {
  // Test generateQuestion
  console.log("\n=== Test: generateQuestion ===");
  try {
    const result = await generateQuestion(mockChunks, "Data Representation", mockAIQuestion);
    check("generateQuestion returns question", !!result.question);
    check("question has content", result.question.length > 0);
    check("generateQuestion returns answer_key", !!result.answer_key);
    check("generateQuestion returns explanation", !!result.explanation);
    check("generateQuestion returns hint", !!result.hint);
    equal(result.question, "How many bits are in a byte?", "question matches expected");
    equal(result.answer_key, "8 bits", "answer_key matches expected");
  } catch (err) {
    console.error("generateQuestion failed:", err);
    check("generateQuestion throws no error", false);
  }

  // Test generateNextTurn (correct)
  console.log("\n=== Test: generateNextTurn (correct) ===");
  try {
    const question = {
      content: "How many bits are in a byte?",
      answer_key: "8 bits",
      explanation: "A byte is 8 bits.",
      hint: "Think about binary."
    };
    const result = await generateNextTurn(question, "8 bits", mockChunks, mockAICorrect);
    check("generateNextTurn returns is_correct true", result.is_correct === true);
    check("generateNextTurn returns feedback", !!result.feedback);
    check("generateNextTurn returns next_question", !!result.next_question);
    equal(result.is_correct, true, "is_correct is true");
    equal(result.hint, null, "hint is null when correct");
  } catch (err) {
    console.error("generateNextTurn (correct) failed:", err);
    check("generateNextTurn (correct) throws no error", false);
  }

  // Test generateNextTurn (incorrect)
  console.log("\n=== Test: generateNextTurn (incorrect) ===");
  try {
    const question = {
      content: "How many bits are in 3 bytes?",
      answer_key: "24 bits",
      explanation: "3 * 8 = 24",
      hint: "Multiply by 8."
    };
    const result = await generateNextTurn(question, "wrong", mockChunks, mockAIIncorrect);
    check("generateNextTurn returns is_correct false", result.is_correct === false);
    check("generateNextTurn returns hint", !!result.hint);
    check("generateNextTurn returns next_question null", result.next_question === null);
    equal(result.is_correct, false, "is_correct is false");
    equal(result.misconception, "Confused multiplication with addition", "misconception captured");
  } catch (err) {
    console.error("generateNextTurn (incorrect) failed:", err);
    check("generateNextTurn (incorrect) throws no error", false);
  }

  // Test malformed JSON rejection
  console.log("\n=== Test: malformed JSON rejection ===");
  const badAI = createMockAI(["not json", "also not json"]);
  try {
    await generateQuestion(mockChunks, "Test", badAI);
    check("generateQuestion rejects malformed JSON", false);
  } catch (err) {
    check("generateQuestion throws on malformed JSON", true);
  }

  // Test JSON with missing fields
  const incompleteAI = createMockAI([
    JSON.stringify({ question: "test" }) // missing answer_key, explanation, hint
  ]);
  try {
    await generateQuestion(mockChunks, "Test", incompleteAI);
    check("generateQuestion rejects incomplete JSON", false);
  } catch (err) {
    check("generateQuestion throws on incomplete JSON", true);
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

function equal<T>(actual: T, expected: T, name: string) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  check(name, ok);
  if (!ok) {
    console.log(`  Expected: ${JSON.stringify(expected)}`);
    console.log(`  Actual:   ${JSON.stringify(actual)}`);
  }
}

runTests().catch(err => {
  console.error("Test runner error:", err);
  process.exitCode = 1;
});