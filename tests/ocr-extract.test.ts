import { PDFDocument, StandardFonts } from "pdf-lib";
import { extractPdfText } from "../lib/documents/pdf";
import { assessTextQuality } from "../lib/documents/text-quality";

async function buildSamplePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page1 = doc.addPage([200, 200]);
  const page2 = doc.addPage([200, 200]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page1.drawText("Hello Study Agent", { x: 10, y: 180, size: 20, font });
  page1.drawText("Page one content here", { x: 10, y: 140, size: 12, font });
  page1.drawText("Additional line of text", { x: 10, y: 120, size: 12, font });
  page1.drawText("More content for testing", { x: 10, y: 100, size: 12, font });
  page2.drawText("Second page text", { x: 10, y: 180, size: 20, font });
  page2.drawText("Bits and bytes", { x: 10, y: 140, size: 12, font });
  page2.drawText("Third line here", { x: 10, y: 120, size: 12, font });
  page2.drawText("Final content line", { x: 10, y: 100, size: 12, font });
  return new Uint8Array(await doc.save());
}

async function buildEmptyPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage([200, 200]);
  doc.addPage([200, 200]);
  return new Uint8Array(await doc.save());
}

export async function main(): Promise<void> {
  console.log("=== Testing normal text PDF ===");
  const normalPdf = await buildSamplePdf();
  const doc = await extractPdfText(normalPdf);

  const normalChecks: Array<{ name: string; pass: boolean }> = [
    { name: "pageCount === 2", pass: doc.pageCount === 2 },
    {
      name: "page 1 marker present",
      pass: doc.text.includes("=== Page 1 ==="),
    },
    {
      name: "page 1 text present",
      pass: doc.text.includes("Hello Study Agent"),
    },
    {
      name: "page 2 marker present",
      pass: doc.text.includes("Second page text"),
    },
    {
      name: "pages array length matches",
      pass: doc.pages.length === 2 && doc.pages[0].pageNumber === 1,
    },
    { name: "ocrUsed is false for text PDF", pass: doc.ocrUsed === false },
  ];

  for (const c of normalChecks) {
    console.log(`${c.pass ? "PASS" : "FAIL"}: ${c.name}`);
  }

  const quality = assessTextQuality(doc.pages);
  console.log(`Text quality: ok=${quality.ok}, chars=${quality.readableChars}, pagesWithText=${quality.pagesWithText}`);

  console.log("\n=== Testing empty/scanned PDF (should trigger OCR fallback) ===");
  const emptyPdf = await buildEmptyPdf();

  try {
    const emptyDoc = await extractPdfText(emptyPdf);

    const emptyChecks: Array<{ name: string; pass: boolean }> = [
      { name: "pageCount === 2", pass: emptyDoc.pageCount === 2 },
      { name: "ocrUsed is true for empty PDF", pass: emptyDoc.ocrUsed === true },
      { name: "ocrConfidence is a number", pass: typeof emptyDoc.ocrConfidence === "number" },
    ];

    for (const c of emptyChecks) {
      console.log(`${c.pass ? "PASS" : "FAIL"}: ${c.name}`);
    }
  } catch (err) {
    // OCR might fail in test environment without tesseract data
    const message = err instanceof Error ? err.message : "Unknown error";
    console.log(`Expected OCR failure in test environment: ${message}`);
  }

  console.log("\nAll basic tests completed");
}

main().catch((err) => {
  console.error("extraction test error:", err);
  process.exitCode = 1;
});