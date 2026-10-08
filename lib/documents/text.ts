import type { ExtractedDocument } from "./pdf";

const MAX_TEXT_BYTES_CHECK = 5 * 1024 * 1024; // 5 MB, mirrors validation limit

/**
 * Decode a plain-text / Markdown buffer to text and wrap it as a single-page
 * ExtractedDocument (pageNumber = 1). Non-OCR: `ocrUsed` stays false.
 */
export async function extractText(
  data: Uint8Array | Buffer,
): Promise<ExtractedDocument> {
  const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data);

  if (bytes.length > MAX_TEXT_BYTES_CHECK) {
    throw new Error("Text file too large.");
  }

  const text = bytes.toString("utf8");

  if (text.length === 0) {
    return {
      pageCount: 1,
      pages: [{ pageNumber: 1, text: "" }],
      text: "",
      ocrUsed: false,
    };
  }

  return {
    pageCount: 1,
    pages: [{ pageNumber: 1, text }],
    text,
    ocrUsed: false,
  };
}
