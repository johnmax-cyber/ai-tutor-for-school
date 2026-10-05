import { handleTutorQuestion } from "../lib/tutor/service";
import { createMockAI } from "../lib/ai/mock";
import { TutorAnswer } from "@/types/tutor";
import { NOT_FOUND } from "../lib/tutor/prompt";
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

const sampleChunks: RetrievedChunk[] = [
  {
    id: "c1",
    resource_id: "r1",
    resource_title: "TCP Guide",
    page_number: 2,
    chunk_index: 0,
    content: "A byte contains 8 bits.",
    rank: 0.9,
  },
  {
    id: "c2",
    resource_id: "r1",
    resource_title: "TCP Guide",
    page_number: 3,
    chunk_index: 1,
    content: "TCP uses a three-way handshake.",
    rank: 0.8,
  },
];

// Test 1: zero chunks -> AI never called
async function testZeroChunks() {
  let aiCallCount = 0;
  const mockAI = createMockAI(["test"]);
  const originalChat = mockAI.chat.bind(mockAI);
  mockAI.chat = async (...args) => {
    aiCallCount++;
    return originalChat(...args);
  };

  const retrieveMock = async () => [] as RetrievedChunk[];

  const answer = await handleTutorQuestion(
    { ai: mockAI, retrieve: retrieveMock },
    { question: "What is TCP?", resourceId: undefined, history: [] }
  );

  check("zero chunks -> NOT_FOUND", answer.answer === NOT_FOUND);
  check("zero chunks -> AI never called", aiCallCount === 0);
}

// Test 2: uncited answer -> NOT_FOUND
async function testUncitedAnswer() {
  const mockAI = createMockAI(['{"answer": "I do not know.", "insufficient_context": false}']);
  let retrieveCalled = false;

  const retrieveMock = async () => {
    retrieveCalled = true;
    return sampleChunks;
  };

  const answer = await handleTutorQuestion(
    { ai: mockAI, retrieve: retrieveMock },
    { question: "What is TCP?", resourceId: undefined, history: [] }
  );

  check("uncited -> NOT_FOUND", answer.answer === NOT_FOUND);
  check("uncited -> not grounded", answer.grounded === false);
  check("retrieve was called", retrieveCalled);
}

// Test 3: first reply invalid JSON then valid -> works
async function testRetrySuccess() {
  const mockAI = createMockAI([
    "This is not JSON",
    '{"answer": "A byte is 8 bits [1].", "insufficient_context": false}',
  ]);
  let retrieveCalled = false;

  const retrieveMock = async () => {
    retrieveCalled = true;
    return sampleChunks;
  };

  const answer = await handleTutorQuestion(
    { ai: mockAI, retrieve: retrieveMock },
    { question: "What is a byte?", resourceId: undefined, history: [] }
  );

  check("retry success -> grounded", answer.grounded === true);
  check("retry success -> has citation", answer.citations.length === 1);
  equal(answer.citations[0].ref, 1, "citation ref is 1");
  check("retrieve was called", retrieveCalled);
}

// Test 4: two bad replies -> still returns safely (NOT_FOUND)
async function testTwoBadReplies() {
  const mockAI = createMockAI(["bad json 1", "bad json 2"]);
  let retrieveCalled = false;

  const retrieveMock = async () => {
    retrieveCalled = true;
    return sampleChunks;
  };

  const answer = await handleTutorQuestion(
    { ai: mockAI, retrieve: retrieveMock },
    { question: "What is TCP?", resourceId: undefined, history: [] }
  );

  check("two bad -> NOT_FOUND", answer.answer === NOT_FOUND);
  check("two bad -> not grounded", answer.grounded === false);
  check("retrieve was called", retrieveCalled);
}

// Run all tests
async function runTests() {
  await testZeroChunks();
  await testUncitedAnswer();
  await testRetrySuccess();
  await testTwoBadReplies();

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

runTests();