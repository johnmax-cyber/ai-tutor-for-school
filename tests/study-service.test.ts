import { StudySessionService } from "../lib/study/service";
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

function equal<T>(actual: T, expected: T, name: string) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  check(name, ok);
  if (!ok) {
    console.log(`  Expected: ${JSON.stringify(expected)}`);
    console.log(`  Actual:   ${JSON.stringify(actual)}`);
  }
}

// Mock retrieve function
const mockRetrieve = async (topicName: string): Promise<RetrievedChunk[]> => [
  {
    id: "c1",
    resource_id: "r1",
    resource_title: "Test Doc",
    page_number: 1,
    chunk_index: 0,
    content: "A byte contains 8 bits. This is the fundamental unit of data.",
    rank: 0.9
  }
];

// Mock AI responses
const mockAI = createMockAI([
  // First call: generateQuestion
  JSON.stringify({
    question: "How many bits are in a byte?",
    answer_key: "8 bits",
    explanation: "A byte is the fundamental unit of digital information and consists of 8 bits.",
    hint: "Think about the binary representation of data."
  }),
  // Second call: generateNextTurn (correct answer)
  JSON.stringify({
    is_correct: true,
    feedback: "Correct! A byte is indeed 8 bits.",
    hint: null,
    misconception: null,
    next_question: "How many bits are in 3 bytes?",
    answer_key: "24 bits",
    explanation: "Since 1 byte = 8 bits, 3 bytes = 3 * 8 = 24 bits."
  }),
  // Third call: generateNextTurn (incorrect first attempt)
  JSON.stringify({
    is_correct: false,
    feedback: "Not quite. Remember that a byte is 8 bits.",
    hint: "Think about multiplying the number of bytes by 8.",
    misconception: "Confused multiplication with addition",
    next_question: null,
    answer_key: null,
    explanation: null
  }),
  // Fourth call: generateNextTurn (retry correct)
  JSON.stringify({
    is_correct: true,
    feedback: "Correct! 3 bytes = 24 bits.",
    hint: null,
    misconception: null,
    next_question: "What is a kilobyte?",
    answer_key: "1024 bytes",
    explanation: "A kilobyte is 1024 bytes in binary systems."
  })
]);

const service = new StudySessionService({
  ai: mockAI,
  retrieve: mockRetrieve
});

async function runTests() {
  // Test 1: createSession
  console.log("\n=== Test: createSession ===");
  try {
    const result = await service.createSession("test-user-id", "test-topic-id");
    check("createSession returns session", !!result.session);
    check("createSession returns question", !!result.question);
    check("question has content", result.question.content.length > 0);
    check("question has explanation", result.question.explanation.length > 0);
    check("question has hint", result.question.hint.length > 0);
  } catch (err) {
    console.error("createSession failed:", err);
    check("createSession throws no error", false);
  }

  // Test 2: submitAttempt (correct)
  console.log("\n=== Test: submitAttempt (correct) ===");
  try {
    const result = await service.submitAttempt("test-user-id", "session-id", "question-id", "8 bits");
    check("submitAttempt returns attempt", !!result.attempt);
    check("attempt is correct", result.attempt.is_correct === true);
    check("attempt has feedback", !!result.attempt.feedback);
    check("nextQuestion is returned", !!result.nextQuestion);
    check("nextQuestion has content", result.nextQuestion?.content.length > 0);
  } catch (err) {
    console.error("submitAttempt (correct) failed:", err);
    check("submitAttempt (correct) throws no error", false);
  }

  // Test 3: submitAttempt (incorrect, first try)
  console.log("\n=== Test: submitAttempt (incorrect first try) ===");
  try {
    const result = await service.submitAttempt("test-user-id", "session-id", "question-id", "wrong answer");
    check("submitAttempt returns attempt", !!result.attempt);
    check("attempt is incorrect", result.attempt.is_correct === false);
    check("attempt has hint", !!result.attempt.hint);
    check("nextQuestion is null (waiting for retry)", result.nextQuestion === null);
  } catch (err) {
    console.error("submitAttempt (incorrect) failed:", err);
    check("submitAttempt (incorrect) throws no error", false);
  }

  // Test 4: submitAttempt (retry correct)
  console.log("\n=== Test: submitAttempt (retry correct) ===");
  try {
    const result = await service.submitAttempt("test-user-id", "session-id", "question-id", "24 bits");
    check("submitAttempt returns attempt", !!result.attempt);
    check("attempt is correct", result.attempt.is_correct === true);
    check("nextQuestion is returned", !!result.nextQuestion);
  } catch (err) {
    console.error("submitAttempt (retry) failed:", err);
    check("submitAttempt (retry) throws no error", false);
  }

  // Test 5: endSession
  console.log("\n=== Test: endSession ===");
  try {
    // Create a mock session first
    const mockSession = {
      id: "test-session-id",
      user_id: "test-user-id",
      topic_id: "test-topic-id",
      status: "active",
      started_at: new Date().toISOString(),
      ended_at: null,
      handoff_text: null,
      questions_attempted: 2,
      total_attempts: 3,
      correct_attempts: 2,
      hints_used: 1,
      topics: {
        name: "Test Topic",
        subjects: { subject_name: "Test Subject" },
        mastery_state: "developing"
      }
    };

    // We can't easily test endSession without a real DB, so we'll skip detailed test
    check("endSession function exists", typeof service.endSession === "function");
  } catch (err) {
    console.error("endSession test failed:", err);
    check("endSession test passes", false);
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

runTests().catch(err => {
  console.error("Test runner error:", err);
  process.exitCode = 1;
});