import {
  selectReviewTopics,
  selectDailyMissionTopic,
  generateDailyMission,
  buildWeeklySummaryPrompt,
} from "../lib/missions/generation";
import { MissionService } from "../lib/missions/service";
import { createMockSupabase } from "./supabase-mock";
import type { MissionTopic, WeeklySessionSummary } from "../lib/missions/types";

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

const NOW = new Date("2026-10-07T12:00:00Z");

function topic(
  overrides: Partial<MissionTopic> = {},
): MissionTopic {
  return {
    id: "t1",
    name: "Bits and Bytes",
    subject_name: "Computer Fundamentals",
    mastery_state: "review_needed",
    next_review_at: "2026-10-01T09:00:00Z",
    last_studied: "2026-09-20T09:00:00Z",
    resource_count: 1,
    ...overrides,
  };
}

// ---- selectReviewTopics ----

check(
  "selectReviewTopics includes overdue topics with resources",
  selectReviewTopics([topic({ id: "t1", next_review_at: "2026-10-01T09:00:00Z", resource_count: 1 })], NOW).length === 1,
);

check(
  "selectReviewTopics excludes not_started topics",
  selectReviewTopics([topic({ id: "t1", mastery_state: "not_started" })], NOW).length === 0,
);

check(
  "selectReviewTopics excludes topics with no resources",
  selectReviewTopics([topic({ id: "t1", resource_count: 0 })], NOW).length === 0,
);

check(
  "selectReviewTopics excludes topics with null next_review_at",
  selectReviewTopics([topic({ id: "t1", next_review_at: null })], NOW).length === 0,
);

check(
  "selectReviewTopics excludes topics due in the future",
  selectReviewTopics([topic({ id: "t1", next_review_at: "2026-10-20T09:00:00Z" })], NOW).length === 0,
);

// ---- selectDailyMissionTopic ----

check(
  "selectDailyMissionTopic prioritizes review_needed over learning",
  selectDailyMissionTopic([
    topic({ id: "r", mastery_state: "review_needed", next_review_at: "2026-10-03T09:00:00Z" }),
    topic({ id: "l", mastery_state: "learning", next_review_at: "2026-10-01T09:00:00Z" }),
  ])?.id === "r",
);

check(
  "selectDailyMissionTopic prioritizes learning over developing",
  selectDailyMissionTopic([
    topic({ id: "d", mastery_state: "developing", next_review_at: "2026-10-01T09:00:00Z" }),
    topic({ id: "l", mastery_state: "learning", next_review_at: "2026-10-01T09:00:00Z" }),
  ])?.id === "l",
);

check(
  "selectDailyMissionTopic picks most overdue next_review_at among same mastery",
  selectDailyMissionTopic([
    topic({ id: "a", mastery_state: "review_needed", next_review_at: "2026-10-05T09:00:00Z" }),
    topic({ id: "b", mastery_state: "review_needed", next_review_at: "2026-10-01T09:00:00Z" }),
  ])?.id === "b",
);

check(
  "selectDailyMissionTopic breaks ties by oldest last_studied",
  selectDailyMissionTopic([
    topic({ id: "a", mastery_state: "review_needed", next_review_at: "2026-10-01T09:00:00Z", last_studied: "2026-09-15T09:00:00Z" }),
    topic({ id: "b", mastery_state: "review_needed", next_review_at: "2026-10-01T09:00:00Z", last_studied: "2026-09-01T09:00:00Z" }),
  ])?.id === "b",
);

check(
  "selectDailyMissionTopic returns null when no candidates have resources",
  selectDailyMissionTopic([topic({ id: "t", resource_count: 0 })]) === null,
);

check(
  "selectDailyMissionTopic returns null when no candidates (only not_started)",
  selectDailyMissionTopic([topic({ id: "t", mastery_state: "not_started" })]) === null,
);

check(
  "selectDailyMissionTopic ranks strong below developing",
  selectDailyMissionTopic([
    topic({ id: "s", mastery_state: "strong", next_review_at: "2026-10-01T09:00:00Z" }),
    topic({ id: "d", mastery_state: "developing", next_review_at: "2026-10-01T09:00:00Z" }),
  ])?.id === "d",
);

// ---- generateDailyMission ----

{
  const { title, description } = generateDailyMission(
    topic({ id: "t", name: "Binary Conversion", subject_name: "Computer Fundamentals" }),
  );
  check("generateDailyMission title includes subject and topic", title === "Computer Fundamentals: Binary Conversion");
  check("generateDailyMission title lacks subject when absent", generateDailyMission(topic({ id: "t", name: "X", subject_name: null })).title === "X");
  check("generateDailyMission description contains topic name", description.includes("Binary Conversion"));
  check("generateDailyMission description contains subject", description.includes("Computer Fundamentals"));
  check("generateDailyMission description contains estimated time", description.includes("20 minutes"));
  check("generateDailyMission description contains mastery state", description.includes("review needed"));
}

// ---- buildWeeklySummaryPrompt ----

{
  const sessions: WeeklySessionSummary[] = [
    { sessionId: "s1", topicName: "Bits and Bytes", subjectName: "Comp Fundamentals", accuracy: 0.8, totalAttempts: 10, correctAttempts: 8, hintsUsed: 2, durationMinutes: 15 },
    { sessionId: "s2", topicName: "Binary Conversion", subjectName: null, accuracy: 0.5, totalAttempts: 10, correctAttempts: 5, hintsUsed: 4, durationMinutes: 20 },
  ];
  const prompt = buildWeeklySummaryPrompt(sessions);
  check("buildWeeklySummaryPrompt mentions topic names", prompt.includes("Bits and Bytes") && prompt.includes("Binary Conversion"));
  check("buildWeeklySummaryPrompt mentions accuracy", prompt.includes("80%") && prompt.includes("50%"));
  check("buildWeeklySummaryPrompt mentions attempts", prompt.includes("Attempts: 10"));
  check("buildWeeklySummaryPrompt mentions subject", prompt.includes("Comp Fundamentals"));
  check("buildWeeklySummaryPrompt is non-empty", prompt.length > 0);
}

// ---- MissionService (mock Supabase client) ----

async function runServiceTests() {
  const mockSupabase = createMockSupabase({
    study_missions: [
      {
        id: "m1",
        user_id: "user-a",
        type: "daily_review",
        topic_id: "t1",
        title: "Review Topic A",
        description: null,
        scheduled_for: "2026-10-07",
        completed: false,
        created_at: "2026-10-07T00:00:00Z",
        updated_at: "2026-10-07T00:00:00Z",
      },
      {
        id: "m2",
        user_id: "user-b",
        type: "daily_review",
        topic_id: "t2",
        title: "Review Topic B",
        description: null,
        scheduled_for: "2026-10-07",
        completed: false,
        created_at: "2026-10-07T00:00:00Z",
        updated_at: "2026-10-07T00:00:00Z",
      },
    ],
  });

  const service = new MissionService(mockSupabase);

  // create
  try {
    const mission = await service.create({
      user_id: "user-a",
      type: "daily_review",
      topic_id: "t3",
      title: "New Mission",
      description: "desc",
      scheduled_for: "2026-10-08",
    });
    check("MissionService.create returns a mission", !!mission && mission.title === "New Mission");
    check("MissionService.create assigns id", !!mission.id);
  } catch (err) {
    check(`MissionService.create: ${(err as Error).message}`, false);
  }

  // listForUser ownership
  try {
    const aMissions = await service.listForUser("user-a");
    check("MissionService.listForUser returns only own missions", aMissions.every((m) => m.user_id === "user-a"));
    check("MissionService.listForUser returns 2 for user-a", aMissions.length === 2);
  } catch (err) {
    check(`MissionService.listForUser ownership: ${(err as Error).message}`, false);
  }

  // completeMission ownership (cannot complete another user's mission)
  try {
    await service.completeMission("m2", "user-a");
    const bMission = (await service.listForUser("user-b"))[0];
    check("MissionService.completeMission does not complete other user's mission", bMission.completed === false);
  } catch (err) {
    check(`MissionService.completeMission cross-user: ${(err as Error).message}`, false);
  }

  try {
    await service.completeMission("m1", "user-a");
    const aMission = (await service.listForUser("user-a", { completed: true }))[0];
    check("MissionService.completeMission marks own mission completed", aMission.completed === true);
  } catch (err) {
    check(`MissionService.completeMission owned: ${(err as Error).message}`, false);
  }
}

runServiceTests()
  .then(() => {
    console.log(`\n${passed} passed, ${failed} failed`);
    if (failed > 0) process.exitCode = 1;
  })
  .catch((err) => {
    console.error("Test runner error:", err);
    process.exitCode = 1;
  });
