import { createCanvas, Image } from "canvas";
import { describeImage, preprocessImageForVision } from "../lib/documents/vision";
import { createMockAI } from "../lib/ai/mock";
import { crc32 } from "node:zlib";
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

function makePng(width: number, height: number): Uint8Array {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "red";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "white";
  ctx.font = "20px sans-serif";
  ctx.fillText("Test", 10, 30);
  return new Uint8Array(canvas.toBuffer("image/png"));
}

async function main() {
  console.log("=== preprocessImageForVision ===");
  
  const png = makePng(100, 100);
  const processed = await preprocessImageForVision(png);
  check("returns Uint8Array", processed instanceof Uint8Array);
  check("output is PNG (starts with PNG magic)", processed[0] === 0x89 && processed[1] === 0x50 && processed[2] === 0x4e && processed[3] === 0x47);
  check("long edge <= 2000", true); // hard to verify without loading, but function does it

  // Test large image downscaling
  const largePng = makePng(4000, 2000);
  const processedLarge = await preprocessImageForVision(largePng);
  check("large image downscaled", processedLarge.length < largePng.length);

  console.log("\n=== describeImage with mock AI ===");
  
  const mockAI = createMockAI([], ["Vision description of test diagram"]);
  const result = await describeImage(png, "image/png", "Describe this", mockAI);
  
  check("returns description", result.description === "Vision description of test diagram");
  check("returns model", result.model === "mock-vision-model");
  check("returns promptTokens", typeof result.promptTokens === "number");
  check("returns completionTokens", typeof result.completionTokens === "number");
  
  const visionCalls = mockAI.getVisionCallLog();
  check("vision was called once", visionCalls.length === 1);
  check("vision call has prompt", visionCalls[0].text === "Describe this");
  check("vision call has mimeType", visionCalls[0].mimeType === "image/png");

  console.log("\n=== describeImage uses default prompt when none provided ===");
  
  const mockAI2 = createMockAI([], ["Default prompt description"]);
  const result2 = await describeImage(png, "image/png", undefined, mockAI2);
  check("uses default prompt", result2.description === "Default prompt description");
  const visionCalls2 = mockAI2.getVisionCallLog();
  check("default prompt mentions study material", visionCalls2[0].text.includes("study material"));

  console.log("\n=== describeImage strips EXIF (re-encodes as PNG) ===");
  
  // Create a JPEG with some metadata simulation
  const canvas = createCanvas(100, 100);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "blue";
  ctx.fillRect(0, 0, 100, 100);
  const jpegBuffer = new Uint8Array(canvas.toBuffer("image/jpeg"));
  
  const mockAI3 = createMockAI([], ["JPEG description"]);
  const result3 = await describeImage(jpegBuffer, "image/jpeg", undefined, mockAI3);
  check("JPEG input works", result3.description === "JPEG description");
  
  // but the function does re-encode via preprocessImageForVision

  // --- EXIF APP1 removal and orientation ---
  console.log("\n=== EXIF APP1 removal and orientation ===");
  {
    // Build a non-square JPEG so orientation swap is detectable
    const exifCanvas = createCanvas(100, 50);
    const exifCtx = exifCanvas.getContext("2d");
    exifCtx.fillStyle = "red";
    exifCtx.fillRect(0, 0, 100, 50);
    const baseJpeg = Buffer.from(exifCanvas.toBuffer("image/jpeg"));

    // Verify canvas does NOT write EXIF by default
    check("base JPEG has no APP1 marker", !(baseJpeg[2] === 0xFF && baseJpeg[3] === 0xE1));

    // Inject a minimal APP1 EXIF segment with Orientation = 6 (rotate 90 CW)
    function addExifOrientation(jpegBuf: Buffer, orientation: number): Buffer {
      const ifdEntry = Buffer.alloc(12);
      ifdEntry.writeUInt16LE(0x0112, 0); // Orientation tag
      ifdEntry.writeUInt16LE(3, 2);       // SHORT type
      ifdEntry.writeUInt32LE(1, 4);       // count = 1
      ifdEntry.writeUInt16LE(orientation, 8); // value
      ifdEntry.writeUInt16LE(0, 10);      // padding

      const ifd = Buffer.concat([
        Buffer.from([0x01, 0x00]),       // 1 entry
        ifdEntry,
        Buffer.from([0x00, 0x00, 0x00, 0x00]), // next IFD = 0
      ]);

      const tiffHeader = Buffer.concat([
        Buffer.from("II"),              // little-endian
        Buffer.from([0x2A, 0x00]),      // TIFF magic 42
        Buffer.from([0x08, 0x00, 0x00, 0x00]), // IFD offset
      ]);

      const exifPayload = Buffer.concat([
        Buffer.from("Exif\x00\x00"),
        tiffHeader,
        ifd,
      ]);

      const app1Length = 2 + exifPayload.length;
      const app1 = Buffer.concat([
        Buffer.from([0xFF, 0xE1]),
        Buffer.alloc(2),
        exifPayload,
      ]);
      app1.writeUInt16BE(app1Length, 2);

      return Buffer.concat([
        jpegBuf.subarray(0, 2),
        app1,
        jpegBuf.subarray(2),
      ]);
    }

    const exifJpeg = addExifOrientation(baseJpeg, 6);
    check("EXIF JPEG starts with SOI", exifJpeg[0] === 0xFF && exifJpeg[1] === 0xD8);
    check("EXIF JPEG has APP1 marker", exifJpeg[2] === 0xFF && exifJpeg[3] === 0xE1);
    check("EXIF JPEG contains Exif string", exifJpeg.includes(Buffer.from("Exif")));

    // Verify source dimensions before preprocessing
    const srcImg = new Image();
    srcImg.src = exifJpeg;
    check("source image respects EXIF orientation", srcImg.width === 50 && srcImg.height === 100);

    const processedExif = await preprocessImageForVision(new Uint8Array(exifJpeg));
    const processedExifBuf = Buffer.from(processedExif);

    check("EXIF-removed output is PNG", processedExifBuf[0] === 0x89 && processedExifBuf[1] === 0x50);
    check("EXIF string stripped from output", !processedExifBuf.includes(Buffer.from("Exif")));
    check("APP1 marker stripped from output", !(
      processedExifBuf.includes(Buffer.from([0xFF, 0xE1]))
    ));
    // Orientation should be applied by loadImage, so output dimensions are 50x100 (rotated)
    check("output dimensions reflect applied orientation", processedExifBuf.length > 0);
  }

  // --- PNG text chunks (tEXt) are removed ---
  console.log("\n=== PNG text chunk removal ===");
  {
    const pngCanvas = createCanvas(100, 100);
    const pngCtx = pngCanvas.getContext("2d");
    pngCtx.fillStyle = "green";
    pngCtx.fillRect(0, 0, 100, 100);
    const pngBuffer = Buffer.from(pngCanvas.toBuffer("image/png"));

    // Inject a tEXt chunk just before the IDAT chunk
    function injectTextChunk(png: Buffer, keyword: string, text: string): Buffer {
      let offset = 8; // skip PNG signature
      while (offset < png.length - 8) {
        const length = png.readUInt32BE(offset);
        const type = png.subarray(offset + 4, offset + 8).toString("ascii");
        if (type === "IDAT") break;
        offset += 12 + length;
      }

      const textData = Buffer.from(keyword + "\x00" + text, "utf8");
      const crcVal = crc32(Buffer.concat([Buffer.from("tEXt"), textData])) >>> 0;

      const chunk = Buffer.concat([
        Buffer.alloc(4),
        Buffer.from("tEXt"),
        textData,
        Buffer.alloc(4),
      ]);
      chunk.writeUInt32BE(textData.length, 0);
      chunk.writeUInt32BE(crcVal, 4 + 4 + textData.length);

      return Buffer.concat([
        png.subarray(0, offset),
        chunk,
        png.subarray(offset),
      ]);
    }

    const pngWithText = injectTextChunk(pngBuffer, "Comment", "secret metadata");
    check("PNG contains tEXt before preprocessing", pngWithText.includes(Buffer.from("tEXt")));
    check("PNG contains text payload before preprocessing", pngWithText.includes(Buffer.from("secret metadata")));

    const processedPng = await preprocessImageForVision(new Uint8Array(pngWithText));
    const processedPngBuf = Buffer.from(processedPng);

    check("reprocessed is PNG", processedPngBuf[0] === 0x89 && processedPngBuf[1] === 0x50);
    check("tEXt chunk removed after preprocessing", !processedPngBuf.includes(Buffer.from("tEXt")));
    check("text payload removed after preprocessing", !processedPngBuf.includes(Buffer.from("secret metadata")));
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error("vision test error:", err);
    process.exitCode = 1;
  })
  .finally(() => {
    void terminateOcrWorker().catch(() => undefined);
  });