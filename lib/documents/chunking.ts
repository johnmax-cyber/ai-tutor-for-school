export const CHUNK_SIZE = 500;
export const CHUNK_OVERLAP = 50;

export interface PageChunk {
  chunk_index: number;
  page_number: number;
  char_start: number;
  char_end: number;
  content: string;
  token_count: number;
}

export interface ChunkingOptions {
  chunkSize?: number;
  overlap?: number;
}

export interface CoverageReport {
  page_number: number;
  page_text_length: number;
  chunk_count: number;
  is_complete: boolean;
  has_gap: boolean;
  first_gap_at: number | null;
  has_overlap: boolean;
}

export function estimateTokenCount(text: string): number {
  if (text.length === 0) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}

export function chunkPageText(
  text: string,
  pageNumber: number,
  options: ChunkingOptions = {},
): Omit<PageChunk, "chunk_index">[] {
  const chunkSize = options.chunkSize ?? CHUNK_SIZE;
  const overlap = options.overlap ?? CHUNK_OVERLAP;

  if (text.length === 0) {
    return [
      {
        page_number: pageNumber,
        char_start: 0,
        char_end: 0,
        content: "",
        token_count: 0,
      },
    ];
  }

  const safeOverlap = Math.min(overlap, chunkSize - 1);
  const chunks: Omit<PageChunk, "chunk_index">[] = [];
  let pos = 0;

  while (pos < text.length) {
    const end = Math.min(pos + chunkSize, text.length);
    const content = text.slice(pos, end);

    chunks.push({
      page_number: pageNumber,
      char_start: pos,
      char_end: end,
      content,
      token_count: estimateTokenCount(content),
    });

    if (end === text.length) {
      break;
    }

    const nextPos = end - safeOverlap;
    pos = nextPos > pos ? nextPos : end;
  }

  return chunks;
}

export interface ChunkedPage {
  pageNumber: number;
  text: string;
}

export function chunkDocument(
  pages: ChunkedPage[] | { pageNumber: number; text: string }[],
  options: ChunkingOptions = {},
): PageChunk[] {
  const result: PageChunk[] = [];
  let chunkIndex = 0;

  for (const page of pages) {
    const pageChunks = chunkPageText(page.text, page.pageNumber, options);

    for (const chunk of pageChunks) {
      result.push({
        chunk_index: chunkIndex,
        page_number: chunk.page_number,
        char_start: chunk.char_start,
        char_end: chunk.char_end,
        content: chunk.content,
        token_count: chunk.token_count,
      });
      chunkIndex++;
    }
  }

  return result;
}

export function verifyPageCoverage(
  text: string,
  chunks: Omit<PageChunk, "chunk_index">[],
): CoverageReport {
  const report: CoverageReport = {
    page_number: chunks.length > 0 ? chunks[0].page_number : 0,
    page_text_length: text.length,
    chunk_count: chunks.length,
    is_complete: false,
    has_gap: false,
    first_gap_at: null,
    has_overlap: false,
  };

  if (text.length === 0) {
    report.is_complete = chunks.length >= 1;
    return report;
  }

  if (chunks.length === 0) {
    report.has_gap = true;
    report.first_gap_at = 0;
    return report;
  }

  const sorted = [...chunks].sort((a, b) => a.char_start - b.char_start);

  report.is_complete = sorted[0].char_start === 0;
  if (sorted[0].char_start !== 0) {
    report.has_gap = true;
    report.first_gap_at = 0;
    return report;
  }

  let maxEnd = sorted[0].char_end;
  let hasOverlap = false;

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].char_start > maxEnd) {
      report.has_gap = true;
      report.first_gap_at = maxEnd;
      return report;
    }

    if (sorted[i].char_start < sorted[i - 1].char_end) {
      hasOverlap = true;
    }

    maxEnd = Math.max(maxEnd, sorted[i].char_end);
  }

  report.has_overlap = hasOverlap;

  if (maxEnd < text.length) {
    report.has_gap = true;
    report.first_gap_at = maxEnd;
    report.is_complete = false;
    return report;
  }

  report.is_complete = true;
  return report;
}

export function verifyDocumentCoverage(
  pages: { pageNumber: number; text: string }[],
  chunks: PageChunk[],
): CoverageReport[] {
  const reports: CoverageReport[] = [];

  for (const page of pages) {
    const pageChunks = chunks
      .filter((c) => c.page_number === page.pageNumber)
      .map((c) => ({
        page_number: c.page_number,
        char_start: c.char_start,
        char_end: c.char_end,
        content: c.content,
        token_count: c.token_count,
      }));

    reports.push(verifyPageCoverage(page.text, pageChunks));
  }

  return reports;
}
