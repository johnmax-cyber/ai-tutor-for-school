import { createWorker } from "tesseract.js";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { createCanvas } from "canvas";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";

export interface OcrPageResult {
  pageNumber: number;
  text: string;
  confidence: number;
}

export interface OcrDocumentResult {
  pageCount: number;
  pages: OcrPageResult[];
  text: string;
  averageConfidence: number;
}

let workerPromise: Promise<Awaited<ReturnType<typeof createWorker>>> | null = null;

async function getWorker(): Promise<Awaited<ReturnType<typeof createWorker>>> {
  if (!workerPromise) {
    workerPromise = createWorker("eng");
  }
  return workerPromise;
}

/**
 * Perform OCR on a PDF buffer.
 * Returns extracted text per page with confidence scores.
 */
interface RawOcrPage {
  pageNumber?: number;
  text?: string;
  confidence?: number;
}

interface RawOcrResult {
  pages?: RawOcrPage[];
  pageNumber?: number;
  text?: string;
  confidence?: number;
}

interface WorkerWithRecognize {
  recognize: (
    data: string,
    options?: Record<string, unknown>,
  ) => Promise<{ data: RawOcrResult }>;
}

/**
 * Convert PDF pages to PNG image buffers using pdfjs-dist
 */
async function pdfPagesToImages(
  pdfBytes: Buffer | Uint8Array,
): Promise<string[]> {
  // Set up pdfjs worker
  const pdfjsGlobal = globalThis as { pdfjsWorker?: unknown };
  if (!pdfjsGlobal.pdfjsWorker) {
    const workerModule = await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
    pdfjsGlobal.pdfjsWorker = workerModule;
  }

  // Convert to Uint8Array for pdfjs-dist
  const bytes = Buffer.isBuffer(pdfBytes) ? new Uint8Array(pdfBytes) : pdfBytes;

  const loadingTask = pdfjsLib.getDocument({ data: bytes });
  const pdf = await loadingTask.promise;

  try {
    const pageCount = pdf.numPages;
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ocr-"));
    const images: string[] = [];

     for (let i = 1; i <= pageCount; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 2.0 });

      // Create canvas for rendering using node-canvas
      const canvas = createCanvas(viewport.width, viewport.height);
      const ctx = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;

      if (!ctx) {
        throw new Error("Failed to get canvas context");
      }

      await page.render({ canvas: null, canvasContext: ctx, viewport }).promise;

      // Convert canvas to PNG file
      const pngBuffer = canvas.toBuffer("image/png");
      const filePath = path.join(tempDir, `page-${i}.png`);
      await fs.writeFile(filePath, pngBuffer);

      images.push(filePath);
    }

    return images;
  } finally {
    await loadingTask.destroy();
  }
}

export async function performOcr(
  data: Uint8Array | Buffer,
): Promise<OcrDocumentResult> {
  const bytes = Buffer.isBuffer(data) ? new Uint8Array(data) : data;
  const clonedBytes = new Uint8Array(bytes);

  // Convert PDF pages to images
  const pageImages = await pdfPagesToImages(clonedBytes);

  const worker = (await getWorker()) as unknown as WorkerWithRecognize;
  const pages: OcrPageResult[] = [];

  for (let i = 0; i < pageImages.length; i++) {
    const imagePath = pageImages[i];
    const { data: result } = await worker.recognize(imagePath);

    pages.push({
      pageNumber: i + 1,
      text: (result.text || "").trim(),
      confidence: result.confidence ?? 0,
    });
  }

  const averageConfidence =
    pages.length > 0
      ? pages.reduce((sum, p) => sum + p.confidence, 0) / pages.length
      : 0;

  const fullText = pages
    .map((p) => `=== Page ${p.pageNumber} ===\n${p.text}`)
    .join("\n\n");

  return {
    pageCount: pages.length,
    pages,
    text: fullText,
    averageConfidence,
  };
}

/**
 * Terminate the OCR worker (call on app shutdown if needed)
 */
export async function terminateOcrWorker(): Promise<void> {
  if (workerPromise) {
    const worker = await workerPromise;
    await worker.terminate();
    workerPromise = null;
  }
}