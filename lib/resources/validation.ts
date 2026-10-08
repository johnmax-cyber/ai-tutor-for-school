import PizZip from "pizzip";
import { MAX_IMAGE_BYTES, MAX_PPTX_BYTES, MAX_TEXT_BYTES, PPTX_MIME_TYPE } from "@/lib/documents/types";

export const MAX_PDF_BYTES = 25 * 1024 * 1024;

const PDF_MAGIC = "%PDF-";
const PK_MAGIC = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);

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

export interface PptxValidation {
  ok: boolean;
  error?: string;
}

export function validatePptx(
  filename: string,
  mimeType: string,
  sizeBytes: number,
  buffer: Uint8Array,
): PptxValidation {
  if (!filename.toLowerCase().endsWith(".pptx")) {
    return { ok: false, error: "Only PPTX files are allowed." };
  }

  if (mimeType !== PPTX_MIME_TYPE) {
    return { ok: false, error: "Invalid PPTX MIME type." };
  }

  if (sizeBytes <= 0) {
    return { ok: false, error: "File is empty." };
  }

  if (sizeBytes > MAX_PPTX_BYTES) {
    return { ok: false, error: `PPTX must be ${MAX_PPTX_BYTES / 1024 / 1024} MB or smaller.` };
  }

  if (buffer.length < PK_MAGIC.length) {
    return { ok: false, error: "File is not a valid PPTX (missing PK header)." };
  }

  const header = buffer.subarray(0, PK_MAGIC.length);
  if (!PK_MAGIC.every((b, i) => header[i] === b)) {
    return { ok: false, error: "File signature does not match a PPTX (not a ZIP archive)." };
  }

  let zip: PizZip;
  try {
    zip = new PizZip(buffer);
  } catch {
    return { ok: false, error: "Not a valid PPTX (zip parsing failed)." };
  }

  const contentTypesFile = zip.file("[Content_Types].xml");
  if (!contentTypesFile) {
    return { ok: false, error: "Not a valid PPTX (missing [Content_Types].xml)." };
  }

  const contentTypesXml = contentTypesFile.asText();
  if (!contentTypesXml.includes("ppt/")) {
    return { ok: false, error: "Not a valid PPTX (missing ppt/ in Content_Types)." };
  }

  return { ok: true };
}

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_MAGIC = [0xff, 0xd8, 0xff];

export interface ImageValidation {
  ok: boolean;
  error?: string;
}

export function validateImage(
  filename: string,
  mimeType: string,
  sizeBytes: number,
  buffer: Uint8Array,
): ImageValidation {
  const ext = filename.toLowerCase().split(".").pop();
  const validExt = ext === "png" || ext === "jpg" || ext === "jpeg";
  if (!validExt) {
    return { ok: false, error: "Only PNG and JPG images are allowed." };
  }

  if (mimeType !== "image/png" && mimeType !== "image/jpeg" && mimeType !== "image/jpg") {
    return { ok: false, error: "Only image/png and image/jpeg MIME types are allowed." };
  }

  if (sizeBytes <= 0) {
    return { ok: false, error: "File is empty." };
  }

  if (sizeBytes > MAX_IMAGE_BYTES) {
    return { ok: false, error: `Image must be ${MAX_IMAGE_BYTES / 1024 / 1024} MB or smaller.` };
  }

  if (buffer.length >= PNG_MAGIC.length) {
    const head = buffer.subarray(0, PNG_MAGIC.length);
    if (PNG_MAGIC.every((b, i) => head[i] === b)) {
      if (mimeType !== "image/png") {
        return { ok: false, error: "Image signature does not match the declared MIME type." };
      }
      return { ok: true };
    }
  }

  if (buffer.length >= JPEG_MAGIC.length) {
    const head = buffer.subarray(0, JPEG_MAGIC.length);
    if (JPEG_MAGIC.every((b, i) => head[i] === b)) {
      if (mimeType !== "image/jpeg" && mimeType !== "image/jpg") {
        return { ok: false, error: "Image signature does not match the declared MIME type." };
      }
      return { ok: true };
    }
  }

  return { ok: false, error: "File signature does not match a valid image." };
}

export interface TextValidation {
  ok: boolean;
  error?: string;
}

export function validateText(
  filename: string,
  mimeType: string,
  sizeBytes: number,
  buffer: Uint8Array,
): TextValidation {
  const ext = filename.toLowerCase().split(".").pop();
  if (ext !== "txt" && ext !== "md" && ext !== "markdown") {
    return { ok: false, error: "Only .txt and .md files are allowed." };
  }

  if (mimeType !== "text/plain" && mimeType !== "text/markdown" && mimeType !== "text/x-markdown") {
    return { ok: false, error: "Only text MIME types are allowed." };
  }

  if (sizeBytes <= 0) {
    return { ok: false, error: "File is empty." };
  }

  if (sizeBytes > MAX_TEXT_BYTES) {
    return { ok: false, error: `Text must be ${MAX_TEXT_BYTES / 1024 / 1024} MB or smaller.` };
  }

  const text = Buffer.from(buffer).toString("utf8");
  if (!Buffer.from(text, "utf8").equals(Buffer.from(buffer))) {
    return { ok: false, error: "File is not valid UTF-8 text." };
  }

  return { ok: true };
}

export interface ResourceValidation {
  type: "pdf" | "image" | "pptx" | "text" | "unknown";
  ok: boolean;
  error?: string;
}

export function validateResource(
  filename: string,
  mimeType: string,
  sizeBytes: number,
  buffer: Uint8Array,
): ResourceValidation {
  const ext = filename.toLowerCase().split(".").pop();

  if (ext === "pdf") {
    const v = validatePdf(filename, mimeType, sizeBytes, buffer);
    return { type: "pdf", ok: v.ok, error: v.error };
  }

  if (ext === "png" || ext === "jpg" || ext === "jpeg" || ext === "pjpeg") {
    const v = validateImage(filename, mimeType, sizeBytes, buffer);
    return { type: "image", ok: v.ok, error: v.error };
  }

  if (ext === "pptx") {
    const v = validatePptx(filename, mimeType, sizeBytes, buffer);
    return { type: "pptx", ok: v.ok, error: v.error };
  }

  if (ext === "txt" || ext === "md" || ext === "markdown") {
    const v = validateText(filename, mimeType, sizeBytes, buffer);
    return { type: "text", ok: v.ok, error: v.error };
  }

  if (sizeBytes <= 0) {
    return { type: "unknown", ok: false, error: "File is empty." };
  }

  return { type: "unknown", ok: false, error: "Unsupported file type." };
}
