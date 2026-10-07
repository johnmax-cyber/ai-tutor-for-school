import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { performOcr, type OcrDocumentResult } from "./ocr";

type PdfjsGlobal = { pdfjsWorker?: unknown };

let workerReady: Promise<unknown> | null = null;

function ensureWorker(): Promise<unknown> {
  if (workerReady) return workerReady;
  workerReady = import("pdfjs-dist/legacy/build/pdf.worker.mjs").then((mod) => {
    (globalThis as PdfjsGlobal).pdfjsWorker = mod;
    return mod;
  });
  return workerReady;
}

export interface ExtractedPage {
  pageNumber: number;
  text: string;
}

export interface ExtractedDocument {
  pageCount: number;
  pages: ExtractedPage[];
  text: string;
  ocrUsed?: boolean;
  ocrConfidence?: number;
}

const MIN_READABLE_CHARS_PER_PAGE = 30;
const MIN_PAGES_WITH_TEXT_RATIO = 0.1;

/**
 * Check if extracted text indicates a scanned/image-only PDF
 */
function isScannedPdf(doc: ExtractedDocument): boolean {
  if (doc.pageCount === 0) return true;

  const pagesWithText = doc.pages.filter((p) => p.text.trim().length > 0).length;
  const totalReadableChars = doc.pages.reduce(
    (sum, p) => sum + p.text.replace(/\s/g, "").length,
    0,
  );

  const pagesWithTextRatio = pagesWithText / doc.pageCount;
  const avgCharsPerPage = totalReadableChars / doc.pageCount;

  return (
    pagesWithTextRatio < MIN_PAGES_WITH_TEXT_RATIO ||
    avgCharsPerPage < MIN_READABLE_CHARS_PER_PAGE
  );
}

/**
 * Convert OCR result to ExtractedDocument format
 */
function ocrToExtractedDocument(ocrResult: OcrDocumentResult): ExtractedDocument {
  return {
    pageCount: ocrResult.pageCount,
    pages: ocrResult.pages.map((p) => ({
      pageNumber: p.pageNumber,
      text: p.text,
    })),
    text: ocrResult.text,
    ocrUsed: true,
    ocrConfidence: ocrResult.averageConfidence,
  };
}

export async function extractPdfText(
  data: Uint8Array | Buffer,
): Promise<ExtractedDocument> {
  await ensureWorker();
  const bytes = Buffer.isBuffer(data) ? new Uint8Array(data) : new Uint8Array(data);

  const loadingTask = pdfjsLib.getDocument({ data: bytes });
  const pdf = await loadingTask.promise;

  try {
    const pageCount = pdf.numPages;

    if (pageCount === 0) {
      return { pageCount: 0, pages: [], text: "" };
    }

    const pages: ExtractedPage[] = [];

    for (let i = 1; i <= pageCount; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();

      const text = (content.items as Array<{ str?: string }>)
        .filter((item): item is { str: string } => typeof item.str === "string")
        .map((item) => item.str)
        .join("");

      pages.push({ pageNumber: i, text });
    }

    const text = pages
      .map((p) => `=== Page ${p.pageNumber} ===\n${p.text}`)
      .join("\n\n");

    const extractedDoc: ExtractedDocument = {
      pageCount,
      pages,
      text,
      ocrUsed: false,
    };

    // Check if document appears to be scanned/image-only
    if (isScannedPdf(extractedDoc)) {
      console.log(
        `Document appears scanned (${extractedDoc.pages.filter((p) => p.text.trim().length > 0).length}/${pageCount} pages with text). Falling back to OCR...`,
      );

      try {
        const ocrResult = await performOcr(data);
        console.log(
          `OCR completed with average confidence: ${ocrResult.averageConfidence.toFixed(1)}%`,
        );
        return ocrToExtractedDocument(ocrResult);
      } catch (ocrError) {
        const message = ocrError instanceof Error ? ocrError.message : "Unknown OCR error";
        console.error("OCR fallback failed:", message);
        throw new Error(
          `Document appears to be scanned but OCR failed: ${message}`,
        );
      }
    }

    return extractedDoc;
  } finally {
    await loadingTask.destroy();
  }
}
