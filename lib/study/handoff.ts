import { MasteryState } from "@/types/study";
import { MistakePattern } from "@/types/study";

/**
 * Generate a study handoff text summarizing a completed session
 */
export function generateHandoff(input: HandoffInput): string {
  const lines: string[] = [];
  
  // Header
  lines.push("STUDY HANDOFF");
  lines.push("");
  
  // Topic line
  const topicDisplay = input.subjectName 
    ? `${input.topicName} (${input.subjectName})`
    : input.topicName;
  lines.push(`Topic: ${topicDisplay}`);
  lines.push("");
  
  // Completed concepts (simplified - in future could list specific concepts)
  lines.push("Completed:");
  if (input.questionsCount > 0) {
    // In a real implementation, we would list specific concepts mastered
    // For MVP, we show a generic message based on performance
    const masteredCount = Math.round(input.correctAttempts * 0.7); // Simplified
    if (masteredCount > 0) {
      lines.push(`- ${input.questionsCount} questions covered`);
      lines.push(`- ${masteredCount} concepts demonstrated proficiency`);
    } else {
      lines.push("- Session initiated, no concepts mastered yet");
    }
  } else {
    lines.push("- No questions attempted");
  }
  lines.push("");
  
  // Needs review section
  lines.push("Needs review:");
  const hasMistakes = input.mistakes.length > 0;
  const lowPerformance = input.correctAttempts / Math.max(1, input.totalAttempts) < 0.6;
  
  if (hasMistakes) {
    // List specific mistakes
    for (const mistake of input.mistakes) {
      lines.push(`- ${mistake.description} (${mistake.incorrect_count} incorrect attempts)`);
    }
  } else if (lowPerformance) {
    lines.push("- Review recommended based on performance");
  } else {
    lines.push("- No specific review needed");
  }
  lines.push("");
  
  // Last activity
  lines.push("Last activity:");
  lines.push(
    `Answered ${input.totalAttempts} questions. ` +
    `${input.correctAttempts} correct. ${input.hintsUsed} hints used.`
  );
  lines.push("");
  
  // Performance
  const accuracy = input.totalAttempts > 0 
    ? (input.correctAttempts / input.totalAttempts) * 100 
    : 0;
  lines.push(`Performance: ${accuracy.toFixed(0)}% accuracy (${input.correctAttempts}/${input.totalAttempts}).`);
  lines.push("");
  
  // Next session suggestion
  lines.push("Next session:");
  if (input.masteryState === "review_needed") {
    lines.push(`Review the topics mentioned above, then continue to related material.`);
  } else if (input.masteryState === "strong") {
    lines.push(`Continue to advanced topics or related subjects.`);
  } else {
    lines.push(`Continue reviewing current material, then progress to next topic.`);
  }
  
  return lines.join("\n");
}

export interface HandoffInput {
  topicName: string;
  subjectName: string | null;
  questionsCount: number;
  totalAttempts: number;
  correctAttempts: number;
  hintsUsed: number;
  mistakes: MistakePattern[];
  masteryState: MasteryState;
}