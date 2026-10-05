import { writeFileSync } from "node:fs";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { extractPdfText } from "../lib/documents/pdf";

async function buildSamplePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page1 = doc.addPage([200, 200]);
  const page2 = doc.addPage([200, 200]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page1.drawText("Hello Study Agent", { x: 10, y: 180, size: 20, font });
  page1.drawText("Page one content here", { x: 10, y: 140, size: 12, font });
  page2.drawText("Second page text", { x: 10, y: 180, size: 20, font });
  page2.drawText("Bits and bytes", { x: 10, y: 140, size: 12, font });
  return new Uint8Array(await doc.save());
}

export async function main(): Promise<void> {
  const bytes = await buildSamplePdf();
  writeFileSync("/tmp/sample.pdf", bytes);

  const doc = await extractPdfText(bytes);

  const checks: Array<{ name: string; pass: boolean }> = [
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
      pass: doc.text.includes("=== Page 2 ==="),
    },
    {
      name: "page 2 text present",
      pass: doc.text.includes("Second page text"),
    },
    {
      name: "pages array length matches",
      pass: doc.pages.length === 2 && doc.pages[0].pageNumber === 1,
    },
  ];

  for (const c of checks) {
    console.log(`${c.pass ? "PASS" : "FAIL"}: ${c.name}`);
  }

  const allPass = checks.every((c) => c.pass);
  console.log(allPass ? "\nALL CHECKS PASSED" : "\nSOME CHECKS FAILED");
  if (!allPass) process.exitCode = 1;
}

main().catch((err) => {
  console.error("extraction test error:", err);
  process.exitCode = 1;
});
