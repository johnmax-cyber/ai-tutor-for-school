import { StudySessionService } from "../lib/study/service";
import { createMockAI } from "../lib/ai/mock";
import { RetrievedChunk } from "../lib/tutor/retrieve";
import type { SupabaseClient } from "@supabase/supabase-js";

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

// Type definitions for mock database
type TopicRow = {
  id: string;
  name: string;
  subject_id: string | null;
  subjects: Array<{ name: string }>;
  mastery_state: string;
  total_attempts: number;
  correct_attempts: number;
  hints_used: number;
  retry_count: number;
  last_studied: string | null;
  next_review_at: string | null;
  user_id: string;
};

type SubjectRow = { id: string; name: string };
type ResourceRow = { id: string; user_id: string; status: string };
type ResourcesTopicRow = { resource_id: string; topic_id: string };
type StudySessionRow = Record<string, unknown>;
type QuestionRow = Record<string, unknown>;
type AttemptRow = Record<string, unknown>;
type MistakeRow = Record<string, unknown>;

type FilterOp = "eq" | "in" | "ilike";
type Filter = { col: string; op: FilterOp; val: unknown };

type SelectCols = string | { count?: string; head?: boolean };
type SelectOpts = { count?: string; head?: boolean };

type OrderBy = { column: string; ascending: boolean } | null;

interface QueryBuilderState {
  filters: Filter[];
  selectCols: SelectCols;
  singleMode: boolean;
  isHead: boolean;
  countExact: boolean;
  orderBy: OrderBy;
  limitVal: number | null;
  ilikePattern: string | null;
  isInsert: boolean;
  isUpdate: boolean;
  isDelete: boolean;
  insertData: unknown;
  updateData: unknown;
}

/**
 * Creates a realistic mock Supabase client for testing StudySessionService.
 * Tracks in-memory state and responds to the specific query patterns used by the service.
 */
function createMockSupabase(): SupabaseClient {
  // In-memory database state
  const db = {
    topics: new Map<string, TopicRow>([
      ["test-topic-id", {
        id: "test-topic-id",
        name: "Test Topic",
        subject_id: "sub1",
        subjects: [{ name: "Test Subject" }],
        mastery_state: "not_started",
        total_attempts: 0,
        correct_attempts: 0,
        hints_used: 0,
        retry_count: 0,
        last_studied: null,
        next_review_at: null,
        user_id: "test-user-id"
      }]
    ]),
    subjects: new Map<string, SubjectRow>([["sub1", { id: "sub1", name: "Test Subject" }]]),
    resources: new Map<string, ResourceRow>([
      ["r1", { id: "r1", user_id: "test-user-id", status: "ready" }]
    ]),
    resources_topics: new Map<string, ResourcesTopicRow>([
      ["r1-test-topic-id", { resource_id: "r1", topic_id: "test-topic-id" }]
    ]),
    study_sessions: new Map<string, StudySessionRow>(),
    questions: new Map<string, QuestionRow>(),
    attempts: new Map<string, AttemptRow>(),
    mistakes: new Map<string, MistakeRow>(),
  };

  function createQueryBuilder(tableName: string) {
    const state: QueryBuilderState = {
      filters: [],
      selectCols: "*",
      singleMode: false,
      isHead: false,
      countExact: false,
      orderBy: null,
      limitVal: null,
      ilikePattern: null,
      isInsert: false,
      isUpdate: false,
      isDelete: false,
      insertData: null,
      updateData: null,
    };

    const builder = {
      select: (cols?: SelectCols, opts?: SelectOpts) => {
        if (typeof cols === "string") {
          state.selectCols = cols;
        } else if (cols && typeof cols === "object") {
          state.selectCols = "*";
          if (cols.count === "exact") state.countExact = true;
          if (cols.head === true) state.isHead = true;
        }
        if (opts) {
          if (opts.count === "exact") state.countExact = true;
          if (opts.head === true) state.isHead = true;
        }
        return builder;
      },
      eq: (col: string, val: unknown) => {
        state.filters.push({ col, op: "eq", val });
        return builder;
      },
      in: (col: string, vals: unknown[]) => {
        state.filters.push({ col, op: "in", val: vals });
        return builder;
      },
      ilike: (col: string, pattern: string) => {
        state.ilikePattern = pattern;
        state.filters.push({ col, op: "ilike", val: pattern });
        return builder;
      },
      order: (col: string, opts?: { ascending?: boolean }) => {
        state.orderBy = { column: col, ascending: opts?.ascending ?? true };
        return builder;
      },
      limit: (n: number) => {
        state.limitVal = n;
        return builder;
      },
      single: () => {
        state.singleMode = true;
        return builder;
      },
      insert: (data: unknown) => {
        state.isInsert = true;
        state.insertData = data;
        return builder;
      },
      update: (data: unknown) => {
        state.isUpdate = true;
        state.updateData = data;
        return builder;
      },
      delete: () => {
        state.isDelete = true;
        return builder;
      },
      then: (onFulfilled?: (value: unknown) => unknown) => {
        const result = executeQuery(tableName, state);
        return Promise.resolve(result).then(onFulfilled);
      },
      catch: (onRejected?: (reason: unknown) => unknown) => {
        return Promise.resolve().catch(onRejected);
      }
    };

    return builder;
  }

function executeQuery(tableName: string, state: QueryBuilderState) {
  const { filters, selectCols, singleMode, isHead, countExact, isInsert, isUpdate, isDelete, insertData, updateData, orderBy, limitVal } = state;
  const table = db[tableName as keyof typeof db] as Map<string, unknown> | undefined;

  function applyFilters(rows: unknown[]): unknown[] {
    return rows.filter(row => {
      const typedRow = row as Record<string, unknown>;
      for (const f of filters) {
        const rowVal = typedRow[f.col];
        if (f.op === "eq" && rowVal !== f.val) return false;
        if (f.op === "in" && !Array.isArray(f.val)) return false;
        if (f.op === "in" && Array.isArray(f.val) && !f.val.includes(rowVal)) return false;
        if (f.op === "ilike" && typeof rowVal === "string" && typeof f.val === "string") {
          const pattern = f.val.replace(/%/g, ".*");
          const regex = new RegExp(`^${pattern}$`, "i");
          if (!regex.test(rowVal)) return false;
        }
      }
      return true;
    });
  }

  function applyOrder(rows: unknown[]) {
      if (orderBy) {
        rows.sort((a, b) => {
          const av = (a as Record<string, unknown>)[orderBy.column];
          const bv = (b as Record<string, unknown>)[orderBy.column];
          const dir = orderBy.ascending ? 1 : -1;
          if (typeof av === "number" && typeof bv === "number") {
            if (av < bv) return -1 * dir;
            if (av > bv) return 1 * dir;
          } else if (typeof av === "string" && typeof bv === "string") {
            if (av < bv) return -1 * dir;
            if (av > bv) return 1 * dir;
          }
          return 0;
        });
      }
    }

    function applyLimit(rows: unknown[]) {
      if (limitVal) return rows.slice(0, limitVal);
      return rows;
    }

    // COUNT query (head + count exact)
    if (countExact && isHead) {
      let rows = Array.from(table?.values() || []);
      rows = applyFilters(rows);
      return Promise.resolve({ count: rows.length, error: null });
    }

    // INSERT
    if (isInsert) {
      const data = Array.isArray(insertData) ? insertData : [insertData];
      const inserted = data.map(d => {
        const id = (d as Record<string, unknown>).id as string || `mock-${Date.now()}-${Math.random()}`;
        const row = { ...(d as Record<string, unknown>), id };
        if (table) table.set(id, row);
        return row;
      });
      return Promise.resolve({ data: singleMode ? (inserted[0] || null) : inserted, error: null });
    }

    // UPDATE
    if (isUpdate) {
      let rows = Array.from(table?.values() || []);
      rows = applyFilters(rows);
      for (const row of rows) {
        Object.assign(row as object, updateData as object);
        if (table) table.set((row as Record<string, unknown>).id as string, row);
      }
      return Promise.resolve({ data: singleMode ? (rows[0] || null) : rows, error: null });
    }

    // DELETE
    if (isDelete) {
      let rows = Array.from(table?.values() || []);
      rows = applyFilters(rows);
      for (const row of rows) {
        table?.delete((row as Record<string, unknown>).id as string);
      }
      return Promise.resolve({ data: rows, error: null });
    }

    // SELECT
    let rows = Array.from(table?.values() || []);
    rows = applyFilters(rows);
    applyOrder(rows);
    applyLimit(rows);

    // Column selection
    if (typeof selectCols === "string" && selectCols !== "*") {
      const cols = selectCols.split(",").map((c: string) => c.trim());
      rows = rows.map(row => {
        const picked: Record<string, unknown> = {};
        const typedRow = row as Record<string, unknown>;
        for (const col of cols) {
          if (col.includes("(")) {
            const rel = col.split("(")[0].trim();
            picked[rel] = typedRow[rel];
            continue;
          }
          picked[col] = typedRow[col];
        }
        return picked;
      });
    }

    if (singleMode) {
      const data = rows[0] || null;
      return Promise.resolve({ data, error: data ? null : { message: "Not found", code: "PGRST116" } });
    }

    return Promise.resolve({ data: rows, error: null });
  }

  const client = {
    from: (table: string) => createQueryBuilder(table),
    auth: {
      getUser: () => Promise.resolve({ data: { user: { id: "test-user-id" } }, error: null })
    },
    rpc: (_fn: string, _params: unknown) => {
      if (_fn === "search_resource_chunks_by_topic") {
        return Promise.resolve({ data: [], error: null });
      }
      return Promise.resolve({ data: [], error: null });
    }
  } as unknown as SupabaseClient;

  return client;
}

// Mock retrieve function
const mockRetrieve = async (_topicName: string): Promise<RetrievedChunk[]> => [
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

// Mock AI responses - enough for all test calls
const mockAI = createMockAI([
  // Test 1: createSession -> generateQuestion
  JSON.stringify({
    question: "How many bits are in a byte?",
    answer_key: "8 bits",
    explanation: "A byte is the fundamental unit of digital information and consists of 8 bits.",
    hint: "Think about the binary representation of data."
  }),
  // Test 2: createSession -> generateQuestion
  JSON.stringify({
    question: "How many bits are in a byte?",
    answer_key: "8 bits",
    explanation: "A byte is the fundamental unit of digital information and consists of 8 bits.",
    hint: "Think about the binary representation of data."
  }),
  // Test 2: submitAttempt -> generateNextTurn (correct answer)
  JSON.stringify({
    is_correct: true,
    feedback: "Correct! A byte is indeed 8 bits.",
    hint: null,
    misconception: null,
    next_question: "How many bits are in 3 bytes?",
    answer_key: "24 bits",
    explanation: "Since 1 byte = 8 bits, 3 bytes = 3 * 8 = 24 bits."
  }),
  // Test 3: createSession -> generateQuestion
  JSON.stringify({
    question: "How many bits are in a byte?",
    answer_key: "8 bits",
    explanation: "A byte is the fundamental unit of digital information and consists of 8 bits.",
    hint: "Think about the binary representation of data."
  }),
  // Test 3: submitAttempt -> generateNextTurn (incorrect first attempt)
  JSON.stringify({
    is_correct: false,
    feedback: "Not quite. Remember that a byte is 8 bits.",
    hint: "Think about multiplying the number of bytes by 8.",
    misconception: "Confused multiplication with addition",
    next_question: null,
    answer_key: null,
    explanation: null
  }),
  // Test 4: createSession -> generateQuestion
  JSON.stringify({
    question: "How many bits are in a byte?",
    answer_key: "8 bits",
    explanation: "A byte is the fundamental unit of digital information and consists of 8 bits.",
    hint: "Think about the binary representation of data."
  }),
  // Test 4: submitAttempt 1 -> generateNextTurn (incorrect retry attempt)
  JSON.stringify({
    is_correct: false,
    feedback: "Not quite. Try again.",
    hint: "Think about binary representation.",
    misconception: "Still confused",
    next_question: null,
    answer_key: null,
    explanation: null
  }),
  // Test 4: submitAttempt 2 -> generateNextTurn (retry correct)
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

const mockSupabase = createMockSupabase();

const service = new StudySessionService({
  ai: mockAI,
  retrieve: mockRetrieve,
  getSupabase: () => Promise.resolve(mockSupabase)
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
    check("session has correct topic_id", result.session.topic_id === "test-topic-id");
    check("session status is active", result.session.status === "active");
    check("session has subject_name", !!result.session.subject_name);
    check("session has subject_id", !!result.session.subject_id);
  } catch (err) {
    console.error("createSession failed:", err);
    check("createSession throws no error", false);
  }

  // Test 2: submitAttempt (correct)
  console.log("\n=== Test: submitAttempt (correct) ===");
  try {
    const sessionResult = await service.createSession("test-user-id", "test-topic-id");
    const sessionId = sessionResult.session.id;
    const questionId = sessionResult.question.id;

    const result = await service.submitAttempt("test-user-id", sessionId, questionId, "8 bits");
    check("submitAttempt returns attempt", !!result.attempt);
    check("attempt is correct", result.attempt.is_correct === true);
    check("attempt has feedback", !!result.attempt.feedback);
    check("nextQuestion is returned", !!result.nextQuestion);
    check("nextQuestion has content", result.nextQuestion!.content.length > 0);
  } catch (err) {
    console.error("submitAttempt (correct) failed:", err);
    check("submitAttempt (correct) throws no error", false);
  }

  // Test 3: submitAttempt (incorrect, first try)
  console.log("\n=== Test: submitAttempt (incorrect first try) ===");
  try {
    const sessionResult = await service.createSession("test-user-id", "test-topic-id");
    const sessionId = sessionResult.session.id;
    const questionId = sessionResult.question.id;

    const result = await service.submitAttempt("test-user-id", sessionId, questionId, "wrong answer");
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
    const sessionResult = await service.createSession("test-user-id", "test-topic-id");
    const sessionId = sessionResult.session.id;
    const questionId = sessionResult.question.id;

    // First attempt: incorrect
    await service.submitAttempt("test-user-id", sessionId, questionId, "wrong answer");
    // Second attempt: correct retry
    const result = await service.submitAttempt("test-user-id", sessionId, questionId, "24 bits");
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
    check("endSession function exists", typeof service.endSession === "function");
  } catch (err) {
    console.error("endSession test failed:", err);
    check("endSession test passes", false);
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

runTests().catch((err) => {
  console.error("Test runner error:", err);
  process.exitCode = 1;
});