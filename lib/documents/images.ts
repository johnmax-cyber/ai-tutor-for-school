import { createCanvas, loadImage } from "canvas";
import { recognizeImageBuffer } from "./ocr";
import type { ExtractedDocument } from "./pdf";
import type { IMAGE_MIME_TYPES } from "./types";

const MAX_IMAGE_LONG_EDGE = 2000;
const MAX_IMAGE_PIXELS = 25 * 1024 * 1024; // 25 megapixel safety ceiling
const MIN_IMAGE_PIXELS = 64 * 64; // below this skip OCR (too small to be useful)

export type ImageMime = (typeof IMAGE_MIME_TYPES)[number];

/**
 * Detect MIME type from the magic bytes of a PNG/JPEG buffer. Returns null
 * when the bytes are not a recognized image header.
 */
export function detectImageMime(buffer: Uint8Array): ImageMime | null {
  if (buffer.length >= 4) {
    const b0 = buffer[0];
    const b1 = buffer[1];
    const b2 = buffer[2];
    const b3 = buffer[3];
    if (b0 === 0x89 && b1 === 0x50 && b2 === 0x4e && b3 === 0x47) {
      return "image/png";
    }
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  return null;
}

/**
 * Re-encode the image to strip EXIF/metadata and downscale the long edge to
 * at most MAX_IMAGE_LONG_EDGE pixels, while respecting the megapixel ceiling.
 * Returns a PNG buffer.
 */
function preprocessImage(data: Uint8Array): Promise<Uint8Array> {
  const src = Buffer.from(data);
  return loadImage(src).then((img) => {
    let { width, height } = img;
    if (width * height > MAX_IMAGE_PIXELS) {
      const scale = Math.sqrt(MAX_IMAGE_PIXELS / (width * height));
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }
    const longEdge = Math.max(width, height);
    if (longEdge > MAX_IMAGE_LONG_EDGE) {
      const scale = MAX_IMAGE_LONG_EDGE / longEdge;
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    const pngBuffer = canvas.toBuffer("image/png");
    return new Uint8Array(pngBuffer);
  });
}

function canOcr(width: number, height: number): boolean {
  return width * height >= MIN_IMAGE_PIXELS;
}

/**
 * Extract text from a standalone image via tesseract OCR.
 *
 * The image is re-encoded via canvas to strip EXIF and downscaled so the
 * long edge is at most MAX_IMAGE_LONG_EDGE px (and the total pixel count is
 * within the megapixel ceiling). OCR runs on the resulting PNG.
 *
 * The result is a single-page document (pageNumber = 1). `ocrUsed` is true
 * and `ocrConfidence` is reported when OCR succeeds.
 */
export async function extractImageText(
  data: Uint8Array | Buffer,
): Promise<ExtractedDocument> {
  const bytes = Buffer.isBuffer(data) ? new Uint8Array(data) : data;

  const image = await loadImage(Buffer.from(bytes));
  const { width, height } = image;
  if (!canOcr(width, height)) {
    return {
      pageCount: 1,
      pages: [{ pageNumber: 1, text: "" }],
      text: "",
      ocrUsed: true,
      ocrConfidence: 0,
    };
  }

  const processed = await preprocessImage(bytes);

  const result = await recognizeImageBuffer(processed);
  const pageText = result.text || "";
  const confidence = result.confidence ?? 0;

  return {
    pageCount: 1,
    pages: [{ pageNumber: 1, text: pageText }],
    text: pageText,
    ocrUsed: true,
    ocrConfidence: confidence,
  };
}

export { MAX_IMAGE_LONG_EDGE, MAX_IMAGE_PIXELS, MIN_IMAGE_PIXELS };
