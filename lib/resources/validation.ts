export const MAX_PDF_BYTES = 25 * 1024 * 1024;

const PDF_MAGIC = "%PDF-";

export interface PdfValidation {
  ok: boolean;
  error?: string;
}

export function validatePdf(
  filename: string,
  mimeType: string,
  sizeBytes: number,
  buffer: Uint8Array,
): PdfValidation {
  if (!filename.toLowerCase().endsWith(".pdf")) {
    return { ok: false, error: "Only PDF files are allowed." };
  }

  if (mimeType !== "application/pdf") {
    return { ok: false, error: "Only PDF files are allowed." };
  }

  if (sizeBytes <= 0) {
    return { ok: false, error: "File is empty." };
  }

  if (sizeBytes > MAX_PDF_BYTES) {
    return { ok: false, error: `PDF must be ${MAX_PDF_BYTES / 1024 / 1024} MB or smaller.` };
  }

  if (buffer.length < PDF_MAGIC.length) {
    return { ok: false, error: "File is not a valid PDF." };
  }

  const header = Buffer.from(buffer.subarray(0, PDF_MAGIC.length)).toString("utf8");
  if (header !== PDF_MAGIC) {
    return { ok: false, error: "File signature does not match a PDF." };
  }

  return { ok: true };
}
