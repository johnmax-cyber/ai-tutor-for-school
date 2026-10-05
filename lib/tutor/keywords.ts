const STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "been", "but", "by", "can", "could",
  "did", "do", "does", "each", "explain", "for", "from", "get", "got", "has", "had",
  "have", "he", "her", "here", "him", "his", "how", "i", "if", "in", "into", "is",
  "it", "its", "just", "like", "make", "many", "me", "more", "my", "no", "not", "of",
  "on", "one", "or", "our", "out", "over", "put", "say", "see", "she", "so", "some",
  "than", "that", "the", "their", "them", "then", "there", "these", "they", "this",
  "those", "to", "up", "use", "was", "we", "were", "what", "when", "where", "which",
  "who", "why", "will", "with", "would", "you", "your",
]);

export function extractKeywords(question: string): { terms: string[]; tsQuery: string } {
  if (!question || !question.trim()) {
    return { terms: [], tsQuery: "" };
  }

  const tokens = question
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 0);

  const filtered = tokens
    .filter((token) => {
      if (STOPWORDS.has(token)) return false;
      if (token.length < 2 && !/^\d+$/.test(token)) return false;
      return true;
    })
    .filter((token, index, arr) => arr.indexOf(token) === index)
    .slice(0, 8);

  const tsQuery = filtered
    .map((term) => (term.length >= 4 ? `${term}:*` : term))
    .join(" | ");

  return { terms: filtered, tsQuery };
}