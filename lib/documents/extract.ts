import type { AIService } from "@/lib/ai/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { extractPdfText, type ExtractedDocument } from "./pdf";
import { extractImageText } from "./images";
import { extractText } from "./text";
import { extractPptxText } from "./pptx";
import { PPTX_MIME_TYPE } from "./types";

export interface ProcessImage {
  storagePath: string;
  mimeType: string;
  pageNumber: number;
  imageIndex: number;
}

export interface ProcessingOutput {
  document: ExtractedDocument;
  images: ProcessImage[];
  metadata: Record<string, unknown>;
  sourceKind: "pdf" | "image" | "pptx" | "text";
}

/**
 * Thrown by the dispatcher for file types that are recognized but not yet
 * implemented (e.g. PPTX in Stage 8A). These are classified as permanent
 * failures by `processResource` and are never retried.
 */
export class UnsupportedMediaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedMediaError";
  }
}

export interface ExtractResourceOptions {
  visionDiagramsEnabled?: boolean;
  supabase?: SupabaseClient;
  userId?: string;
  resourceId?: string;
}

export async function extractResource(
  data: Uint8Array,
  mimeType: string,
  _filename: string,
  _ai?: AIService,
  opts?: ExtractResourceOptions,
): Promise<ProcessingOutput> {
  switch (mimeType) {
    case "application/pdf":
      return {
        document: await extractPdfText(data),
        images: [],
        metadata: {},
        sourceKind: "pdf",
      };

    case "image/png":
    case "image/jpeg":
    case "image/jpg":
    case "image/pjpeg":
      return {
        document: await extractImageText(data),
        images: [],
        metadata: {},
        sourceKind: "image",
      };

    case "text/plain":
    case "text/markdown":
    case "text/x-markdown":
      return {
        document: await extractText(data),
        images: [],
        metadata: {},
        sourceKind: "text",
      };

    case PPTX_MIME_TYPE: {
      if (!opts?.supabase || !opts?.userId || !opts?.resourceId) {
        throw new UnsupportedMediaError("PPTX extraction requires supabase client, userId, and resourceId.");
      }
      const result = await extractPptxText(data, opts.supabase, opts.userId, opts.resourceId);
      return {
        document: result.document,
        images: result.images,
        metadata: { imageCount: result.images.length, processingWarnings: result.processingWarnings },
        sourceKind: "pptx",
      };
    }

    default:
      throw new UnsupportedMediaError("Unsupported file type.");
  }
}
