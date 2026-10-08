import { Buffer } from "node:buffer";
import { extractText } from "../lib/documents/text";
import { validateText } from "../lib/resources/validation";

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

const SAMPLE =
  "Hello Study Agent.\nThis is a sample markdown document.\n\nA byte is the fundamental unit of digital information.";

async function main() {
  console.log("=== validateText ===");
  check(
    "valid .txt passes",
    validateText("notes.txt", "text/plain", SAMPLE.length, Buffer.from(SAMPLE, "utf8")).ok === true,
  );
  check(
    "valid .md passes",
    validateText("notes.md", "text/markdown", SAMPLE.length, Buffer.from(SAMPLE, "utf8")).ok === true,
  );
  check(
    "wrong extension rejected",
    validateText("notes.exe", "text/plain", 10, Buffer.from("hi")).ok === false,
  );
  check(
    "wrong mime rejected",
    validateText("notes.txt", "application/pdf", 10, Buffer.from("hi")).ok === false,
  );
  check(
    "empty rejected",
    validateText("empty.txt", "text/plain", 0, Buffer.from("")).ok === false,
  );
  check(
    "oversized rejected (size only)",
    validateText("big.txt", "text/plain", 6 * 1024 * 1024, Buffer.from("a")).ok === false,
  );
  check(
    "bad utf-8 rejected",
    validateText("bad.txt", "text/plain", 5, new Uint8Array([0xff, 0xfe, 0xfd, 0xfc, 0xfb])).ok === false,
  );

  console.log("\n=== extractText ===");
  const doc = await extractText(Buffer.from(SAMPLE, "utf8"));
  check("single page", doc.pageCount === 1);
  check("page 1", doc.pages.length === 1 && doc.pages[0].pageNumber === 1);
  check("text content matches", doc.text === SAMPLE);
  check("ocrUsed false for text", doc.ocrUsed === false);

  const emptyDoc = await extractText(Buffer.from("", "utf8"));
  check("empty text pageCount 1", emptyDoc.pageCount === 1);
  check("empty text text empty", emptyDoc.text === "");

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error("text test error:", err);
  process.exitCode = 1;
});
