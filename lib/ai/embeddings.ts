export interface EmbeddingModelConfig {
  model: string;
  dimensions: number;
  baseURL: string | null;
  apiKey: string;
}

export interface ShouldReembedParams {
  contentHash: string | null;
  embeddingModel: string | null;
  embeddingDim: number | null;
  currentModel: string;
  currentDim: number;
  embeddingSkipped: boolean;
}

export interface RrfItem {
  id: string;
  score: number;
}

export interface MergeRrfParams {
  ftsResults: Array<{ id: string }>;
  vectorResults: Array<{ id: string }>;
  weight: number;
  limit: number;
}

export function getEmbeddingModelConfig(): EmbeddingModelConfig | null {
  const model = process.env.AI_EMBEDDING_MODEL;
  if (!model) {
    return null;
  }

  const dimensions = parseInt(process.env.AI_EMBEDDING_DIMENSIONS ?? "768", 10);
  if (!Number.isFinite(dimensions) || dimensions <= 0) {
    throw new Error(`AI_EMBEDDING_DIMENSIONS must be a positive integer; got ${process.env.AI_EMBEDDING_DIMENSIONS}`);
  }

  const baseURL = process.env.AI_EMBEDDING_BASE_URL ?? process.env.AI_BASE_URL ?? null;
  const apiKey = process.env.AI_EMBEDDING_API_KEY ?? process.env.AI_API_KEY;

  if (!apiKey) {
    throw new Error("AI_EMBEDDING_API_KEY or AI_API_KEY not configured");
  }

  return { model, dimensions, baseURL, apiKey };
}

export function shouldReembedChunk({
  contentHash,
  embeddingModel,
  embeddingDim,
  currentModel,
  currentDim,
  embeddingSkipped,
}: ShouldReembedParams): boolean {
  if (embeddingSkipped) {
    return false;
  }

  if (!contentHash || embeddingModel == null || embeddingDim == null) {
    return true;
  }

  return embeddingModel !== currentModel || embeddingDim !== currentDim;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vector length mismatch: ${a.length} vs ${b.length}`);
  }

  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }

  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  if (denom === 0) return 0;

  return dot / denom;
}

export function mergeRrf({ ftsResults, vectorResults, weight, limit }: MergeRrfParams): RrfItem[] {
  const k = 60;
  const scores = new Map<string, number>();

  for (let i = 0; i < ftsResults.length; i++) {
    const item = ftsResults[i];
    const rrfScore = 1 / (k + i + 1);
    const prev = scores.get(item.id) ?? 0;
    scores.set(item.id, prev + (1 - weight) * rrfScore);
  }

  for (let i = 0; i < vectorResults.length; i++) {
    const item = vectorResults[i];
    const rrfScore = 1 / (k + i + 1);
    const prev = scores.get(item.id) ?? 0;
    scores.set(item.id, prev + weight * rrfScore);
  }

  return Array.from(scores.entries())
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, limit);
}
