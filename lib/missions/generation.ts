import type { MasteryState } from "@/types/study";
import type { MissionTopic, WeeklySessionSummary } from "./types";

const MASTERY_PRIORITY: Record<MasteryState, number> = {
  not_started: 4,
  review_needed: 1,
  learning: 2,
  developing: 3,
  strong: 4,
};

function compareMastery(a: MasteryState, b: MasteryState): number {
  return MASTERY_PRIORITY[a] - MASTERY_PRIORITY[b];
}

function compareTimestamps(
  a: string | null,
  b: string | null,
): number {
  if (a && b) {
    return new Date(a).getTime() - new Date(b).getTime();
  }
  if (a && !b) return -1;
  if (!a && b) return 1;
  return 0;
}

export function selectReviewTopics(
  topics: MissionTopic[],
  now: Date = new Date(),
): MissionTopic[] {
  const nowMs = now.getTime();
  return topics.filter((topic) => {
    if (topic.mastery_state === "not_started") {
      return false;
    }
    if (topic.resource_count < 1) {
      return false;
    }
    if (!topic.next_review_at) {
      return false;
    }
    return new Date(topic.next_review_at).getTime() <= nowMs;
  });
}

export function selectDailyMissionTopic(
  topics: MissionTopic[],
): MissionTopic | null {
  const candidates = topics.filter(
    (topic) =>
      topic.resource_count >= 1 && topic.mastery_state !== "not_started",
  );
  if (candidates.length === 0) {
    return null;
  }

  const sorted = [...candidates].sort((a, b) => {
    const masteryCmp = compareMastery(a.mastery_state, b.mastery_state);
    if (masteryCmp !== 0) {
      return masteryCmp;
    }
    const reviewCmp = compareTimestamps(a.next_review_at, b.next_review_at);
    if (reviewCmp !== 0) {
      return reviewCmp;
    }
    return compareTimestamps(a.last_studied, b.last_studied);
  });

  return sorted[0];
}

export function generateDailyMission(
  topic: MissionTopic,
): { title: string; description: string } {
  const subjectPrefix = topic.subject_name
    ? `${topic.subject_name}: `
    : "";
  const title = `${subjectPrefix}${topic.name}`;
  const masteryLabel = topic.mastery_state.replace("_", " ");
  const description = [
    `Today's Study Mission`,
    `Topic: ${topic.name}`,
    topic.subject_name ? `Subject: ${topic.subject_name}` : "",
    `Mastery: ${masteryLabel}`,
    `Estimated time: 20 minutes`,
    `Review "${topic.name}" to strengthen your understanding.`,
  ]
    .filter(Boolean)
    .join("\n");
  return { title, description };
}

export function buildWeeklySummaryPrompt(
  sessions: WeeklySessionSummary[],
): string {
  const sessionLines = sessions
    .map((s) => {
      const accuracyPct = Math.round(s.accuracy * 100);
      const subject = s.subjectName ? ` (${s.subjectName})` : "";
      return `- Topic: ${s.topicName}${subject}, Accuracy: ${accuracyPct}%, Attempts: ${s.totalAttempts}, Correct: ${s.correctAttempts}, Hints: ${s.hintsUsed}, Duration: ${s.durationMinutes ?? "unknown"} min`;
    })
    .join("\n");

  return `You are a study coach. The student studied the following sessions in the past week. Write a concise weekly summary that highlights what went well and what needs more review. Reference concrete numbers.

Sessions:
${sessionLines}

Return your summary.`;
}
