import { validatePdf, MAX_PDF_BYTES } from "../lib/resources/validation";
import { Buffer } from "node:buffer";

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

function makePdf(sizeBytes = 100) {
  const buf = Buffer.alloc(sizeBytes, 0x20);
  buf.write("%PDF-1.4\n", 0, "utf8");
  return new Uint8Array(buf);
}

function makeNonPdf() {
  const buf = Buffer.from("PNG\r\n\x1a\n");
  buf.write("\x89PNG\r\n", 0, "binary");
  return new Uint8Array(buf);
}

check(
  "valid PDF passes",
  validatePdf("notes.pdf", "application/pdf", 100, makePdf()).ok === true,
);

check(
  "non-pdf extension rejected",
  validatePdf("notes.png", "application/pdf", 100, makePdf()).ok === false,
);

check(
  "wrong mime rejected",
  validatePdf("notes.pdf", "image/png", 100, makePdf()).ok === false,
);

check(
  "oversized rejected",
  validatePdf("big.pdf", "application/pdf", MAX_PDF_BYTES + 1, makePdf(MAX_PDF_BYTES + 1)).ok === false,
);

check(
  "bad magic bytes rejected",
  validatePdf("fake.pdf", "application/pdf", 100, makeNonPdf()).ok === false,
);

check(
  "empty file rejected",
  validatePdf("empty.pdf", "application/pdf", 0, makePdf(8)).ok === false,
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
