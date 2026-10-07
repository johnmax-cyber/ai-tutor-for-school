import { PerformanceTrend, StudyTip, CommonMistake, TopicInsights, SessionAnalytics } from "./types";

/**
 * Input for computing performance trend from session data
 */
export interface SessionAccuracy {
  sessionId: string;
  accuracy: number;
}

/**
 * Compute performance trend using simple linear regression on last N sessions
 */
export function computePerformanceTrend(
  sessions: SessionAccuracy[],
  threshold: number = 0.05
): PerformanceTrend {
  if (sessions.length < 2) {
    return "insufficient_data";
  }

  const n = sessions.length;
  const xValues = sessions.map((_, i) => i);
  const yValues = sessions.map((s) => s.accuracy);

  const meanX = xValues.reduce((sum, x) => sum + x, 0) / n;
  const meanY = yValues.reduce((sum, y) => sum + y, 0) / n;

  let numerator = 0;
  let denominator = 0;

  for (let i = 0; i < n; i++) {
    const dx = xValues[i] - meanX;
    const dy = yValues[i] - meanY;
    numerator += dx * dy;
    denominator += dx * dx;
  }

  const slope = denominator === 0 ? 0 : numerator / denominator;

  if (slope > threshold) {
    return "improving";
  }
  if (slope < -threshold) {
    return "declining";
  }
  return "stable";
}

/**
 * Input for computing study tips
 */
export interface StudyTipInput {
  accuracy: number;
  avgHintsPerQuestion: number;
  recurringMistakes: string[];
  totalAttempts: number;
}

/**
 * Generate rule-based study tips from performance data
 */
export function computeStudyTips(input: StudyTipInput): StudyTip[] {
  const tips: StudyTip[] = [];

  if (input.totalAttempts === 0) {
    return tips;
  }

  if (input.accuracy < 0.5) {
    tips.push({
      message: "Consider reviewing the foundational concepts before continuing.",
      category: "accuracy",
    });
  }

  if (input.avgHintsPerQuestion > 0.5) {
    tips.push({
      message: "You're using hints more than average. Try to recall before hinting.",
      category: "hints",
    });
  }

  if (input.recurringMistakes.length > 0) {
    const mistakeList = input.recurringMistakes.slice(0, 2).join(", ");
    tips.push({
      message: `Focus on: ${mistakeList}`,
      category: "mistakes",
    });
  }

  if (input.accuracy >= 0.9 && input.avgHintsPerQuestion < 0.2) {
    tips.push({
      message: "Excellent work! Consider advancing to more challenging material.",
      category: "progress",
    });
  }

  return tips;
}

/**
 * Compute session analytics from raw session and attempt data
 */
export function computeSessionAnalytics(input: {
  sessionId: string;
  topicId: string;
  totalAttempts: number;
  correctAttempts: number;
  hintsUsed: number;
  questionsCount: number;
  mistakes: CommonMistake[];
  sessionAccuracies: SessionAccuracy[];
}): SessionAnalytics {
  const accuracy = input.totalAttempts > 0 ? input.correctAttempts / input.totalAttempts : 0;
  const avgHintsPerQuestion = input.questionsCount > 0 ? input.hintsUsed / input.questionsCount : 0;
  const performanceTrend = computePerformanceTrend(input.sessionAccuracies);
  const studyTips = computeStudyTips({
    accuracy,
    avgHintsPerQuestion,
    recurringMistakes: input.mistakes.map((m) => m.description),
    totalAttempts: input.totalAttempts,
  });

  return {
    sessionId: input.sessionId,
    topicId: input.topicId,
    totalAttempts: input.totalAttempts,
    correctAttempts: input.correctAttempts,
    accuracy,
    hintsUsed: input.hintsUsed,
    avgHintsPerQuestion,
    studyTips,
    performanceTrend,
    commonMistakes: input.mistakes,
  };
}

/**
 * Compute topic insights from raw topic, session, and attempt data
 */
export function computeTopicInsights(input: {
  topicId: string;
  topicName: string;
  masteryState: "not_started" | "learning" | "developing" | "strong" | "review_needed";
  nextReviewAt: string | null;
  totalSessions: number;
  totalAttempts: number;
  correctAttempts: number;
  hintsUsed: number;
  questionsCount: number;
  mistakes: CommonMistake[];
  sessionAccuracies: SessionAccuracy[];
}): TopicInsights {
  const accuracy = input.totalAttempts > 0 ? input.correctAttempts / input.totalAttempts : 0;
  const avgHintsPerQuestion = input.questionsCount > 0 ? input.hintsUsed / input.questionsCount : 0;
  const performanceTrend = computePerformanceTrend(input.sessionAccuracies);
  const studyTips = computeStudyTips({
    accuracy,
    avgHintsPerQuestion,
    recurringMistakes: input.mistakes.map((m) => m.description),
    totalAttempts: input.totalAttempts,
  });

  return {
    topicId: input.topicId,
    topicName: input.topicName,
    masteryState: input.masteryState,
    nextReviewAt: input.nextReviewAt,
    totalSessions: input.totalSessions,
    totalAttempts: input.totalAttempts,
    correctAttempts: input.correctAttempts,
    accuracy,
    avgHintsPerQuestion,
    commonMistakes: input.mistakes,
    studyTips,
    performanceTrend,
  };
}
