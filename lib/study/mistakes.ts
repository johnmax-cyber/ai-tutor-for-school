import { MistakePattern } from "@/types/study";

/**
 * Normalize a mistake description for comparison
 * Converts to lowercase and removes extra whitespace
 */
function normalizeDescription(description: string): string {
  return description
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Create or update a mistake record based on an incorrect attempt
 * 
 * @param existingMistake - Existing mistake record if found, null otherwise
 * @param attempt - The incorrect attempt that triggered this
 * @param aiMisconception - The misconception identified by AI (if any)
 * @returns Updated or new mistake record
 */
export function updateMistakeRecord(
  existingMistake: MistakePattern | null,
  attempt: string,
  aiMisconception: string | null
): MistakePattern {
  const description = aiMisconception ?? attempt.substring(0, 100); // Fallback to attempt text
  const normalized = normalizeDescription(description);

  if (existingMistake) {
    // Update existing mistake
    return {
      ...existingMistake,
      incorrect_count: existingMistake.incorrect_count + 1,
      last_seen: new Date().toISOString(),
      // Re-evaluate recurring status
      recurring:
        existingMistake.incorrect_count + 1 >= 2 &&
        existingMistake.correct_count < 2
    };
  } else {
    // Create new mistake
    return {
      id: "", // Will be filled by DB
      user_id: "", // Will be filled by DB
      topic_id: "", // Will be filled by DB
      concept_id: null,
      question_id: null,
      description,
      incorrect_count: 1,
      correct_count: 0,
      hint_count: 0,
      last_seen: new Date().toISOString(),
      recurring: false, // Starts as not recurring
    };
  }
}

/**
 * Update a mistake record when a correct attempt is made
 * 
 * @param mistake - Existing mistake record
 * @returns Updated mistake record
 */
export function updateMistakeOnCorrectAttempt(
  mistake: MistakePattern
): MistakePattern {
  return {
    ...mistake,
    correct_count: mistake.correct_count + 1,
    // Re-evaluate recurring status
    recurring:
      mistake.incorrect_count >= 2 &&
      mistake.correct_count + 1 < 2
  };
}

/**
 * Check if a mistake is recurring
 * A mistake is recurring if it has been seen incorrectly at least twice
 * and correctly fewer than two times
 */
export function isMistakeRecurring(mistake: MistakePattern): boolean {
  return mistake.incorrect_count >= 2 && mistake.correct_count < 2;
}