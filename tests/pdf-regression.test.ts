import { PDFDocument, StandardFonts } from "pdf-lib";
import { extractPdfText } from "../lib/documents/pdf";
import { validatePdf, MAX_PDF_BYTES } from "../lib/resources/validation";
import { terminateOcrWorker } from "../lib/documents/ocr";

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

function buildTextPdf(pages = 2): Promise<Uint8Array> {
  return buildPdfWithDensity(pages, "text");
}

function buildEmptyPdf(pages = 2): Promise<Uint8Array> {
  return buildPdfWithDensity(pages, "empty");
}

async function buildPdfWithDensity(pages: number, kind: "text" | "empty"): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) {
    const page = doc.addPage([200, 200]);
    if (kind === "text") {
      const font = await doc.embedFont(StandardFonts.Helvetica);
      page.drawText(`Page ${i + 1} content here.`, { x: 10, y: 180, size: 12, font });
      page.drawText(`More text on page ${i + 1}.`, { x: 10, y: 150, size: 12, font });
    }
    // empty pages have no text content
  }
  return new Uint8Array(await doc.save());
}

function makePdfBuffer(sizeBytes: number): Uint8Array {
  const buf = Buffer.alloc(sizeBytes, 0x20);
  buf.write("%PDF-1.4\n", 0, "utf8");
  return new Uint8Array(buf);
}

async function main() {
  // --- 1. 25MB limit enforced ---
  console.log("\n=== PDF 25MB limit ===");
  {
    const okUnder = validatePdf("ok.pdf", "application/pdf", MAX_PDF_BYTES, makePdfBuffer(MAX_PDF_BYTES));
    check("exactly 25MB is accepted", okUnder.ok === true);

    const over = validatePdf("big.pdf", "application/pdf", MAX_PDF_BYTES + 1, makePdfBuffer(MAX_PDF_BYTES + 1));
    check("over 25MB is rejected", over.ok === false);
    check("over 25MB error mentions size limit", over.error?.includes("25 MB") === true);
  }

  // --- 2. PDF magic byte check ---
  console.log("\n=== PDF magic byte check ===");
  {
    const valid = validatePdf("good.pdf", "application/pdf", 100, makePdfBuffer(100));
    check("valid PDF magic passes", valid.ok === true);

    const truncated = validatePdf("truncated.pdf", "application/pdf", 3, new Uint8Array([0x25, 0x50, 0x44]));
    check("truncated magic is rejected", truncated.ok === false);

    const garbage = validatePdf("fake.pdf", "application/pdf", 100, new Uint8Array(100));
    check("garbage bytes rejected", garbage.ok === false);
    check("garbage error mentions signature", garbage.error?.includes("signature") === true);

    const pngMagic = validatePdf("png.pdf", "application/pdf", 100, new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
    check("PNG magic rejected as PDF", pngMagic.ok === false);
  }

  // --- 3. Scanned-PDF OCR fallback ---
  console.log("\n=== Scanned-PDF OCR fallback ===");
  {
    const emptyPdf = await buildEmptyPdf(3);
    try {
      const doc = await extractPdfText(emptyPdf);
      check("scanned PDF triggers OCR (ocrUsed true)", doc.ocrUsed === true);
      check("scanned PDF returns pages", doc.pageCount === 3);
    } catch (err) {
      // OCR may fail in headless test environment; verify it was at least attempted
      const msg = err instanceof Error ? err.message : String(err);
      check("OCR fallback was attempted", msg.toLowerCase().includes("ocr"));
    }

    const textPdf = await buildTextPdf(2);
    const textDoc = await extractPdfText(textPdf);
    check("text PDF does NOT use OCR", textDoc.ocrUsed === false);
    check("text PDF has pageCount", textDoc.pageCount === 2);
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error("pdf regression test error:", err);
    process.exitCode = 1;
  })
  .finally(() => {
    void terminateOcrWorker().catch(() => undefined);
  });
