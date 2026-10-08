import { Buffer } from "node:buffer";
import { createCanvas } from "canvas";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { extractResource } from "../lib/documents/extract";
import { UnsupportedMediaError } from "../lib/documents/extract";
import { PPTX_MIME_TYPE } from "../lib/documents/types";
import { terminateOcrWorker } from "../lib/documents/ocr";

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

function makePng(): Uint8Array {
  const canvas = createCanvas(120, 60);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, 120, 60);
  ctx.fillStyle = "black";
  ctx.font = "20px sans-serif";
  ctx.fillText("Hi", 5, 30);
  return new Uint8Array(canvas.toBuffer("image/png"));
}

function makeJpeg(): Uint8Array {
  const canvas = createCanvas(120, 60);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, 120, 60);
  ctx.fillStyle = "black";
  ctx.font = "20px sans-serif";
  ctx.fillText("Hi", 5, 30);
  return new Uint8Array(canvas.toBuffer("image/jpeg"));
}

async function makePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([200, 200]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText("Hello Study Agent", { x: 10, y: 180, size: 20, font });
  return new Uint8Array(await doc.save());
}

async function main() {
  const pdfBytes = await makePdf();
  const pngBytes = makePng();
  const txt = Buffer.from("hello world\n", "utf8");
  const jpeg = makeJpeg();

  console.log("=== extractResource dispatch ===");

  const pdfOut = await extractResource(pdfBytes, "application/pdf", "doc.pdf");
  check("pdf dispatch sourceKind", pdfOut.sourceKind === "pdf");
  check("pdf dispatch has document", typeof pdfOut.document === "object");
  check("pdf dispatch no images", pdfOut.images.length === 0);
  check("pdf dispatch pageCount 1", pdfOut.document.pageCount === 1);

  const imgOut = await extractResource(pngBytes, "image/png", "img.png");
  check("png dispatch sourceKind image", imgOut.sourceKind === "image");
  check("png dispatch ocrUsed true", imgOut.document.ocrUsed === true);

  const jpgOut = await extractResource(jpeg, "image/jpeg", "img.jpg");
  check("jpg dispatch sourceKind image", jpgOut.sourceKind === "image");

  const txtOut = await extractResource(txt, "text/plain", "notes.txt");
  check("txt dispatch sourceKind text", txtOut.sourceKind === "text");
  check("txt dispatch text content", txtOut.document.text === "hello world\n");

  const mdOut = await extractResource(txt, "text/markdown", "notes.md");
  check("md dispatch sourceKind text", mdOut.sourceKind === "text");

  console.log("\n=== unsupported / pptx ===");

  try {
    await extractResource(txt, "application/octet-stream", "unknown.exe");
    check("unsupported mime throws", false);
  } catch (err) {
    check(
      "unsupported mime throws UnsupportedMediaError",
      err instanceof UnsupportedMediaError &&
        /Unsupported file type/.test((err as Error).message),
    );
  }

  try {
    await extractResource(pngBytes, PPTX_MIME_TYPE, "slides.pptx");
    check("pptx throws not supported yet", false);
  } catch (err) {
    check(
      "pptx now requires opts (not unsupported)",
      err instanceof UnsupportedMediaError &&
        /requires supabase client, userId, and resourceId/.test((err as Error).message),
    );
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error("processing-types test error:", err);
    process.exitCode = 1;
  })
  .finally(() => {
    void terminateOcrWorker().catch(() => undefined);
  });
