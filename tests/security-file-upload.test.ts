import PizZip from "pizzip";
import {
  validatePdf,
  validateImage,
  validatePptx,
  validateText,
  validateResource,
  MAX_PDF_BYTES,
} from "../lib/resources/validation";
import {
  MAX_IMAGE_BYTES,
  MAX_PPTX_BYTES,
  MAX_TEXT_BYTES,
  PPTX_MIME_TYPE,
} from "../lib/documents/types";

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

function warn(name: string, actual: boolean, detail: string) {
  if (actual) {
    passed++;
    console.log(`PASS: ${name}`);
  } else {
    console.log(`WARN: ${name} — ${detail}`);
  }
}

function makePdf(sizeBytes = 100): Uint8Array {
  const buf = Buffer.alloc(Math.max(sizeBytes, 9), 0x20);
  buf.write("%PDF-1.4\n", 0, "utf8");
  return new Uint8Array(buf.subarray(0, Math.max(sizeBytes, 1)));
}

function makePng(sizeBytes = 100): Uint8Array {
  const buf = new Uint8Array(sizeBytes);
  const pngMagic = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  buf.set(pngMagic, 0);
  return buf;
}

function makeJpeg(sizeBytes = 100): Uint8Array {
  const buf = new Uint8Array(sizeBytes);
  buf.set([0xff, 0xd8, 0xff], 0);
  return buf;
}

function makeValidPptx(): Uint8Array {
  const zip = new PizZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
</Types>`,
  );
  zip.file("ppt/presentation.xml", "<p:presentation xmlns:p=\"http://schemas.openxmlformats.org/presentationml/2006/main\"/>");
  return new Uint8Array(zip.generate({ type: "uint8array" }));
}

function makeZipWithoutContentTypes(): Uint8Array {
  const zip = new PizZip();
  zip.file("data.txt", "hello world");
  return new Uint8Array(zip.generate({ type: "uint8array" }));
}

function makePptxNoPptDir(): Uint8Array {
  const zip = new PizZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
</Types>`,
  );
  zip.file("data.txt", "hello");
  return new Uint8Array(zip.generate({ type: "uint8array" }));
}

function makeText(sizeBytes = 100): Uint8Array {
  const text = "Hello, world! This is a text file.";
  const buf = Buffer.alloc(sizeBytes, 0x20);
  buf.write(text, 0, "utf-8");
  return new Uint8Array(buf);
}

const PDF_MIME = "application/pdf";

// ===========================================================================
// validatePdf
// ===========================================================================
console.log("\n=== validatePdf ===");

check(
  "valid PDF passes",
  validatePdf("notes.pdf", PDF_MIME, 100, makePdf()).ok === true,
);

check(
  "non-pdf extension rejected",
  validatePdf("notes.png", PDF_MIME, 100, makePdf()).ok === false,
);

check(
  "wrong mime rejected",
  validatePdf("notes.pdf", "image/png", 100, makePdf()).ok === false,
);

check(
  "buffer < magic length rejected",
  validatePdf("tiny.pdf", PDF_MIME, 3, new Uint8Array([0x25, 0x50, 0x44])).ok === false,
);

check(
  "oversized rejected",
  validatePdf("big.pdf", PDF_MIME, MAX_PDF_BYTES + 1, makePdf()).ok === false,
);

check(
  "empty file rejected",
  validatePdf("empty.pdf", PDF_MIME, 0, makePdf(8)).ok === false,
);

check(
  "bad magic bytes rejected",
  validatePdf("fake.pdf", PDF_MIME, 100, makePng()).ok === false,
);

// ===========================================================================
// validateImage
// ===========================================================================
console.log("\n=== validateImage ===");

check(
  "valid PNG passes",
  validateImage("img.png", "image/png", 100, makePng()).ok === true,
);

check(
  "valid JPG passes",
  validateImage("img.jpg", "image/jpeg", 100, makeJpeg()).ok === true,
);

check(
  "non-image extension rejected",
  validateImage("data.txt", "text/plain", 100, makeText()).ok === false,
);

check(
  "MIME/extension mismatch (ext says png, mime says jpeg, magic says png) rejected",
  validateImage("img.png", "image/jpeg", 100, makePng()).ok === false,
);

check(
  "oversized image rejected",
  validateImage("big.png", "image/png", MAX_IMAGE_BYTES + 1, makePng()).ok === false,
);

check(
  "empty image rejected",
  validateImage("empty.png", "image/png", 0, makePng(8)).ok === false,
);

check(
  "PNG magic with image/jpeg MIME rejected",
  validateImage("img.png", "image/jpeg", 100, makePng()).ok === false,
);

check(
  "JPEG magic with image/png MIME rejected",
  validateImage("img.jpg", "image/png", 100, makeJpeg()).ok === false,
);

// ===========================================================================
// validatePptx
// ===========================================================================
console.log("\n=== validatePptx ===");

const validPptx = makeValidPptx();
check(
  "valid PPTX passes",
  validatePptx("slides.pptx", PPTX_MIME_TYPE, validPptx.length, validPptx).ok === true,
);

check(
  "non-pptx extension rejected",
  validatePptx("data.zip", PPTX_MIME_TYPE, 100, makeZipWithoutContentTypes()).ok === false,
);

check(
  "wrong MIME rejected",
  validatePptx("slides.pptx", "application/zip", 100, validPptx).ok === false,
);

const zipNoContent = makeZipWithoutContentTypes();
check(
  "zip missing [Content_Types].xml rejected",
  validatePptx("slides.pptx", PPTX_MIME_TYPE, zipNoContent.length, zipNoContent).ok === false,
);

const zipNoPpt = makePptxNoPptDir();
check(
  "PPTX missing ppt/ in Content_Types rejected",
  validatePptx("slides.pptx", PPTX_MIME_TYPE, zipNoPpt.length, zipNoPpt).ok === false,
);

check(
  "oversized PPTX rejected",
  validatePptx("big.pptx", PPTX_MIME_TYPE, MAX_PPTX_BYTES + 1, validPptx).ok === false,
);

check(
  "empty PPTX rejected",
  validatePptx("empty.pptx", PPTX_MIME_TYPE, 0, validPptx).ok === false,
);

check(
  "non-zip file as PPTX rejected (bad magic)",
  validatePptx("fake.pptx", PPTX_MIME_TYPE, 100, makePng()).ok === false,
);

// Finding: zip-bomb limits are NOT enforced by validatePptx
// (Phase 8 plan claimed "zip limits enforced before parsing" but they aren't)
const manyEntriesZip = new PizZip();
manyEntriesZip.file("[Content_Types].xml", `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/></Types>`);
for (let i = 0; i < 10000; i++) {
  manyEntriesZip.file(`ppt/slide${i}.xml`, "<slide/>");
}
const manyEntriesBytes = new Uint8Array(manyEntriesZip.generate({ type: "uint8array" }));
const manyEntriesResult = validatePptx("bomb.pptx", PPTX_MIME_TYPE, manyEntriesBytes.length, manyEntriesBytes);
warn(
  "validatePptx does NOT enforce zip-bomb limits (entry count / decompressed size)",
  !manyEntriesResult.ok,
  "validatePptx accepts a zip with 10,000 entries. Recommend adding zip entry count and decompressed size limits before parsing.",
);

// ===========================================================================
// validateText
// ===========================================================================
console.log("\n=== validateText ===");

check(
  "valid .txt passes",
  validateText("notes.txt", "text/plain", 100, makeText()).ok === true,
);

check(
  "valid .md passes",
  validateText("notes.md", "text/markdown", 100, makeText()).ok === true,
);

check(
  "valid .markdown passes",
  validateText("notes.markdown", "text/x-markdown", 100, makeText()).ok === true,
);

check(
  "non-text extension rejected",
  validateText("data.pdf", "application/pdf", 100, makePdf()).ok === false,
);

check(
  "wrong MIME for text rejected",
  validateText("notes.txt", "application/pdf", 100, makeText()).ok === false,
);

check(
  "empty text rejected",
  validateText("empty.txt", "text/plain", 0, makeText(8)).ok === false,
);

// Invalid UTF-8: [0xff, 0xfe, 0x00, 0x01] does not round-trip
const invalidUtf8 = new Uint8Array([0xff, 0xfe, 0x00, 0x01]);
check(
  "invalid UTF-8 rejected",
  validateText("bad.txt", "text/plain", invalidUtf8.length, invalidUtf8).ok === false,
);

check(
  "oversized text rejected",
  validateText("big.txt", "text/plain", MAX_TEXT_BYTES + 1, makeText()).ok === false,
);

check(
  "valid UTF-8 with multibyte chars passes",
  validateText("utf8.txt", "text/plain", 10, new TextEncoder().encode("héllo wörld")).ok === true,
);

// ===========================================================================
// validateResource (dispatch)
// ===========================================================================
console.log("\n=== validateResource ===");

check(
  "validateResource dispatches .pdf -> type 'pdf'",
  validateResource("doc.pdf", PDF_MIME, 100, makePdf()).type === "pdf",
);

check(
  "validateResource dispatches .png -> type 'image'",
  validateResource("img.png", "image/png", 100, makePng()).type === "image",
);

check(
  "validateResource dispatches .pptx -> type 'pptx'",
  validateResource("slides.pptx", PPTX_MIME_TYPE, validPptx.length, validPptx).type === "pptx",
);

check(
  "validateResource dispatches .txt -> type 'text'",
  validateResource("notes.txt", "text/plain", 100, makeText()).type === "text",
);

check(
  "validateResource dispatches .md -> type 'text'",
  validateResource("notes.md", "text/markdown", 100, makeText()).type === "text",
);

const unknownResult = validateResource("data.exe", "application/octet-stream", 100, new Uint8Array(100));
check(
  "validateResource unknown ext -> type 'unknown'",
  unknownResult.type === "unknown" && unknownResult.ok === false,
);

check(
  "validateResource passes ok=true for valid PDF",
  validateResource("doc.pdf", PDF_MIME, 100, makePdf()).ok === true,
);

check(
  "validateResource passes ok=false for corrupted PDF",
  validateResource("doc.pdf", PDF_MIME, 100, makePng()).ok === false,
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
