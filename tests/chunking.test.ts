import {
  chunkPageText,
  chunkDocument,
  verifyPageCoverage,
  verifyDocumentCoverage,
  estimateTokenCount,
  CHUNK_SIZE,
  CHUNK_OVERLAP,
} from "../lib/documents/chunking";

let passed = 0;
let failed = 0;

function check(name: string, actual: boolean, detail?: string) {
  if (actual) {
    passed++;
    console.log(`PASS: ${name}`);
  } else {
    failed++;
    console.log(`FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function makeText(length: number, content = "A"): string {
  if (length === 0) return "";
  return content.repeat(Math.ceil(length / content.length)).slice(0, length);
}

const page1Text = makeText(1200, "Lorem ipsum dolor sit amet, consectetur adipiscing elit. ");
const page2Text = makeText(800, "Second page text content here for testing purposes. ");
const pages = [
  { pageNumber: 1, text: page1Text },
  { pageNumber: 2, text: page2Text },
];

const chunks = chunkDocument(pages);

check("chunkDocument produces chunks", chunks.length > 0);
check("all chunks have sequential chunk_index", chunks.every((c, i) => c.chunk_index === i));
check("all page 1 chunks are on page 1", chunks.filter((c) => c.page_number === 1).length > 0);
check("all page 2 chunks are on page 2", chunks.filter((c) => c.page_number === 2).length > 0);

let allCover: boolean;
{
  const reports = verifyDocumentCoverage(pages, chunks);
  allCover = reports.every((r) => r.is_complete && r.has_overlap || r.page_text_length === 0);
  check("all pages have complete coverage", allCover, JSON.stringify(reports));
  check("page 1 is complete", reports[0].is_complete, JSON.stringify(reports[0]));
  check("page 2 is complete", reports[1].is_complete, JSON.stringify(reports[1]));
  check("page 1 has overlap", reports[0].has_overlap || reports[0].chunk_count === 1, JSON.stringify(reports[0]));
  check("page 2 has overlap", reports[1].has_overlap || reports[1].chunk_count === 1, JSON.stringify(reports[1]));
}

check("char_end never exceeds page text length (page 1)", chunks.filter((c) => c.page_number === 1).every((c) => c.char_end <= page1Text.length));
check("char_end never exceeds page text length (page 2)", chunks.filter((c) => c.page_number === 2).every((c) => c.char_end <= page2Text.length));
check("chunks do not cross page boundaries", chunks.every((c) => c.page_number === 1 ? c.char_end <= page1Text.length : c.char_end <= page2Text.length));

const emptyChunks = chunkDocument([{ pageNumber: 1, text: "" }]);
check("empty page produces one chunk", emptyChunks.length === 1);
check("empty page chunk has empty content", emptyChunks[0].content === "");
check("empty page chunk has char_start 0", emptyChunks[0].char_start === 0);
check("empty page chunk has char_end 0", emptyChunks[0].char_end === 0);

const shortText = "Hello";
const shortChunks = chunkPageText(shortText, 1);
check("short text produces one chunk", shortChunks.length === 1);
check("short text chunk spans full range", shortChunks[0].char_start === 0 && shortChunks[0].char_end === shortText.length);

const longText = makeText(2000);
const longChunks = chunkPageText(longText, 1);
check("long text produces multiple chunks", longChunks.length > 1);
const longReport = verifyPageCoverage(longText, longChunks);
check("long text has complete coverage", longReport.is_complete, JSON.stringify(longReport));
check("long text has no gaps", !longReport.has_gap, JSON.stringify(longReport));
check("long text has overlap between chunks", longReport.has_overlap || longChunks.length === 1, JSON.stringify(longReport));

const gapCheck = verifyPageCoverage("abcdefghij", [{ char_start: 0, char_end: 5, content: "abcde", page_number: 1, token_count: 2 }, { char_start: 6, char_end: 10, content: "fghij", page_number: 1, token_count: 2 }]);
check("gap detection: has_gap is true for uncovered range", gapCheck.has_gap, JSON.stringify(gapCheck));
check("gap detection: first_gap_at points to the gap", gapCheck.first_gap_at === 5, JSON.stringify(gapCheck));

const fullCoverage = verifyPageCoverage("abcdefghij", [{ char_start: 0, char_end: 7, content: "abcdefg", page_number: 1, token_count: 2 }, { char_start: 3, char_end: 10, content: "defghij", page_number: 1, token_count: 2 }]);
check("full coverage: is_complete is true", fullCoverage.is_complete, JSON.stringify(fullCoverage));
check("full coverage: has_overlap is true", fullCoverage.has_overlap, JSON.stringify(fullCoverage));
check("full coverage: no gaps", !fullCoverage.has_gap, JSON.stringify(fullCoverage));

const noStart = verifyPageCoverage("abcdefghij", [{ char_start: 1, char_end: 10, content: "bcdefghij", page_number: 1, token_count: 2 }]);
check("missing start: has_gap true", noStart.has_gap, JSON.stringify(noStart));
check("missing start: is_complete false", !noStart.is_complete, JSON.stringify(noStart));
check("missing start: first_gap_at is 0", noStart.first_gap_at === 0);

const noEnd = verifyPageCoverage("abcdefghij", [{ char_start: 0, char_end: 9, content: "abcdefghi", page_number: 1, token_count: 2 }]);
check("missing end: has_gap true", noEnd.has_gap, JSON.stringify(noEnd));
check("missing end: is_complete false", !noEnd.is_complete, JSON.stringify(noEnd));

check("estimateTokenCount for empty string is 0", estimateTokenCount("") === 0);
check("estimateTokenCount for 4 chars is 1", estimateTokenCount("abcd") === 1);
check("estimateTokenCount for 8 chars is 2", estimateTokenCount("abcdefgh") === 2);

check("page 1 chunks sorted by char_start", chunks.filter((c) => c.page_number === 1).every((c, i, arr) => i === 0 || c.char_start >= arr[i - 1].char_end - CHUNK_OVERLAP));
check("chunk content matches sliced page text (page 1)", chunks.filter((c) => c.page_number === 1).every((c) => page1Text.slice(c.char_start, c.char_end) === c.content));
check("chunk content matches sliced page text (page 2)", chunks.filter((c) => c.page_number === 2).every((c) => page2Text.slice(c.char_start, c.char_end) === c.content));

check("CHUNK_SIZE is 500", CHUNK_SIZE === 500);
check("CHUNK_OVERLAP is 50", CHUNK_OVERLAP === 50);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
