import { createCanvas } from "canvas";
import { extractImageText, detectImageMime } from "../lib/documents/images";
import { validateImage } from "../lib/resources/validation";
import { MAX_IMAGE_BYTES } from "../lib/documents/types";
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

function makePng(opts: { width: number; height: number; text?: string }): Uint8Array {
  const { width, height, text = "" } = opts;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, width, height);
  if (text) {
    ctx.fillStyle = "black";
    ctx.textBaseline = "top";
    ctx.font = `${Math.round(Math.min(width, height) / 4)}px sans-serif`;
    ctx.fillText(text, 5, 5);
  }
  return new Uint8Array(canvas.toBuffer("image/png"));
}

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
function makeFakeJpegMagic(): Uint8Array {
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
}

async function main() {
  console.log("=== detectImageMime ===");
  check(
    "detectImageMime recognizes PNG",
    detectImageMime(makePng({ width: 10, height: 10 })) === "image/png",
  );
  check(
    "detectImageMime recognizes JPEG magic",
    detectImageMime(makeFakeJpegMagic()) === "image/jpeg",
  );
  check("detectImageMime rejects garbage", detectImageMime(new Uint8Array([1, 2, 3])) === null);

  console.log("\n=== validateImage ===");
  const validPng = makePng({ width: 10, height: 10 });
  check(
    "valid PNG passes",
    validateImage("photo.png", "image/png", validPng.length, validPng).ok === true,
  );

  check(
    "wrong extension rejected",
    validateImage("photo.exe", "image/png", validPng.length, validPng).ok === false,
  );

  check(
    "wrong mime rejected",
    validateImage("photo.png", "image/jpeg", validPng.length, validPng).ok === false,
  );

  check(
    "oversized rejected",
    validateImage("big.png", "image/png", MAX_IMAGE_BYTES + 1, validPng).ok === false,
  );

  check(
    "empty rejected",
    validateImage("empty.png", "image/png", 0, new Uint8Array(PNG_MAGIC)).ok === false,
  );

  check(
    "bad magic bytes rejected",
    validateImage("fake.png", "image/png", 100, new Uint8Array(100)).ok === false,
  );

  check(
    "size mismatch: PNG magic but jpeg mime rejected",
    validateImage("photo.png", "image/jpeg", validPng.length, validPng).ok === false,
  );

  check(
    "jpg extension accepted",
    validateImage("photo.jpg", "image/jpeg", 100, makeFakeJpegMagic()).ok === true,
  );

  console.log("\n=== extractImageText ===");
  const doc = await extractImageText(validPng);
  check("extractImageText returns page 1", doc.pages.length === 1 && doc.pages[0].pageNumber === 1);
  check("extractImageText ocrUsed true", doc.ocrUsed === true);
  check(
    "extractImageText ocrConfidence is number",
    typeof doc.ocrConfidence === "number",
  );
  check("extractImageText pageCount 1", doc.pageCount === 1);

  // Large image is downscaled to long edge <= 2000px before OCR.
  const bigPng = makePng({ width: 4000, height: 100 });
  const bigDoc = await extractImageText(bigPng);
  check(
    "downscaled image still recognized as page 1",
    bigDoc.pages.length === 1 && bigDoc.ocrUsed === true,
  );

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error("images test error:", err);
    process.exitCode = 1;
  })
  .finally(() => {
    void terminateOcrWorker().catch(() => undefined);
  });
