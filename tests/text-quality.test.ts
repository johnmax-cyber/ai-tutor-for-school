import { assessTextQuality } from "../lib/documents/text-quality";

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

function equal<T>(actual: T, expected: T, name: string) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  check(name, ok);
  if (!ok) {
    console.log(`  Expected: ${JSON.stringify(expected)}`);
    console.log(`  Actual:   ${JSON.stringify(actual)}`);
  }
}

// all-empty pages -> not ok
const emptyPages = Array.from({ length: 5 }, (_, i) => ({
  pageNumber: i + 1,
  text: "",
}));
const r1 = assessTextQuality(emptyPages);
check("all empty pages -> not ok", r1.ok === false);
equal(r1.readableChars, 0, "empty readable chars");
equal(r1.pagesWithText, 0, "empty pages with text");

// 5 pages with 1 sentence each -> ok
const sentencePages = Array.from({ length: 5 }, (_, i) => ({
  pageNumber: i + 1,
  text: "This is a sentence with enough readable characters.",
}));
const r2 = assessTextQuality(sentencePages);
check("5 pages with sentences -> ok", r2.ok === true);
check("readable chars >= 150", r2.readableChars >= 150);
equal(r2.pagesWithText, 5, "5 pages with text");

// 1000 empty pages + 1 page -> not ok
const manyEmptyPlusOne = [
  ...Array.from({ length: 1000 }, (_, i) => ({
    pageNumber: i + 1,
    text: "",
  })),
  { pageNumber: 1001, text: "One page with text." },
];
const r3 = assessTextQuality(manyEmptyPlusOne);
check("1000 empty + 1 page -> not ok", r3.ok === false);
equal(r3.pagesWithText, 1, "only 1 page with text");
check("readable chars < 30 * 1001", r3.readableChars < 30 * 1001);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;