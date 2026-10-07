import { MasteryState } from "@/types/study";

/**
 * Calculate mastery state based on topic statistics
 */
export function calculateMasteryState(stats: TopicStats): MasteryState {
  // No attempts yet - not started
  if (stats.totalAttempts === 0) {
    return "not_started";
  }

  // Has recurring mistakes - overrides all other states
  if (stats.hasRecurringMistakes) {
    return "review_needed";
  }

  // Check recent performance (last 5 attempts)
  if (stats.last5Accuracy < 0.5) {
    return "review_needed";
  }

  // Check if strong: high accuracy + recent consistency + no recurring mistakes
  if (
    stats.correctRate > 0.85 &&
    stats.last3AllCorrect &&
    !stats.hasRecurringMistakes
  ) {
    return "strong";
  }

  // Check developing range
  if (stats.correctRate >= 0.60) {
    return "developing";
  }

  // Otherwise learning (if has attempts)
  return "learning";
}

/**
 * Calculate next review date based on mastery state
 */
export function calculateReviewDate(state: MasteryState, now: Date = new Date()): Date | null {
  switch (state) {
    case "strong":
      return new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // +30 days
    case "developing":
      return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // +7 days
    case "learning":
      return new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000); // +3 days
    case "review_needed":
      return new Date(now.getTime() + 24 * 60 * 60 * 1000); // +1 day
    case "not_started":
      return null; // No review needed until started
  }
}

/**
 * Topic statistics used for mastery calculation
 */
export interface TopicStats {
  totalAttempts: number;
  correctAttempts: number;
  correctRate: number; // correctAttempts / totalAttempts (0 if totalAttempts = 0)
  last5Accuracy: number; // accuracy of last 5 attempts
  last3AllCorrect: boolean; // whether last 3 attempts were all correct
  hasRecurringMistakes: boolean; // whether topic has any recurring mistakes
  lastStudied: Date | null; // timestamp of last attempt
}

/**
 * Attempt information for SM-2 spaced repetition calculation
 */
export interface Sm2Attempt {
  is_correct: boolean;
  hint_used: boolean;
}

/**
 * Calculate next review date using lightweight SM-2 spaced repetition
 * 
 * Rules:
 * - Correct answer without hint: interval doubles
 * - Incorrect answer or hint used: interval resets to 1 day
 * - No attempts: returns null
 */
export function calculateNextReview(
  attempts: Sm2Attempt[],
  now: Date = new Date()
): Date | null {
  if (attempts.length === 0) {
    return null;
  }

  let intervalDays = 1;
  for (const attempt of attempts) {
    if (attempt.is_correct && !attempt.hint_used) {
      intervalDays = intervalDays * 2;
    } else {
      intervalDays = 1;
    }
  }

  return new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000);
}