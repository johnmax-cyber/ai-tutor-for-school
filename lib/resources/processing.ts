import type { SupabaseClient } from "@supabase/supabase-js";
import type { AIService } from "@/lib/ai/types";
import { extractResource, UnsupportedMediaError, type ProcessImage } from "@/lib/documents/extract";
import { describeImage } from "@/lib/documents/vision";
import { MAX_VISION_IMAGES_PER_RESOURCE } from "@/lib/documents/types";
import {
  chunkDocument,
  verifyDocumentCoverage,
  type PageChunk,
} from "@/lib/documents/chunking";
import { parseStoragePath } from "@/lib/supabase/storage";
import { type Resource, toChunkInsert, toImageInsert } from "@/lib/resources/types";

export const MAX_RETRIES = 3;
export const RETRY_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

/** Fields needed to evaluate the retry gates. */
export interface RetryGateResource {
  retry_count?: number | null;
  processing_started_at?: string | null;
  processing_metadata?: Record<string, unknown> | null;
}

export interface RetryGateResult {
  retryable: boolean;
  /** Short reason when the resource is skipped (empty when retryable). */
  reason: string;
  /** True when the failure is permanent and must never be retried. */
  permanent: boolean;
}

const RETRY_TOO_RECENT = "Retry limit exceeded or processing too recent.";
const PERMANENT_FAILURE = "Permanent failure; not retried.";

/**
 * Evaluate the retry gates shared by `processResource` and the n8n retry
 * webhook. A resource is skipped (not retried) when:
 *  - `retry_count` has reached MAX_RETRIES, or
 *  - `processing_started_at` is within the last RETRY_WINDOW_MS (too recent), or
 *  - `processing_metadata.permanent_failure` is true (permanent failure).
 */
export function evaluateRetryGates(
  resource: RetryGateResource,
): RetryGateResult {
  const retryCount = resource.retry_count ?? 0;
  if (retryCount >= MAX_RETRIES) {
    return { retryable: false, reason: RETRY_TOO_RECENT, permanent: false };
  }

  const meta = resource.processing_metadata;
  if (
    meta &&
    typeof meta === "object" &&
    (meta as { permanent_failure?: unknown }).permanent_failure === true
  ) {
    return { retryable: false, reason: PERMANENT_FAILURE, permanent: true };
  }

  if (resource.processing_started_at) {
    const started = Date.parse(resource.processing_started_at);
    if (
      !Number.isNaN(started) &&
      Date.now() - started < RETRY_WINDOW_MS
    ) {
      return { retryable: false, reason: RETRY_TOO_RECENT, permanent: false };
    }
  }

  return { retryable: true, reason: "", permanent: false };
}

/** Permanent failure categories (never retried). */
export type PermanentFailureReason =
  | "unsupported_type"
  | "corrupt_file"
  | "validation";

export interface ProcessResult {
  success: boolean;
  status: string;
  error?: string;
  resource?: Resource;
  /** Number of resource_images rows inserted this run (0 in Stage 8A). */
  imagesInserted?: number;
  /** When true, the failure is permanent and must not be retried. */
  permanent?: boolean;
}

const RESOURCE_SELECT =
  "id, user_id, title, original_filename, storage_path, mime_type, size_bytes, char_count, status, error_message, extracted_text, page_count, ocr_used, ocr_confidence, processing_metadata, retry_count, processing_started_at, created_at, updated_at";

const PERMANENT_ERROR_RE =
  /not a valid|does not match|signature|magic|invalid pdf|not\s*pdf|corrupt|truncated|unsupported file type|not supported yet/i;

async function storageDataToUint8(data: Blob | Uint8Array): Promise<Uint8Array> {
  if (data instanceof Blob) {
    return new Uint8Array(await data.arrayBuffer());
  }
  if (data instanceof Uint8Array) {
    return data;
  }
  throw new Error("Unsupported storage download format.");
}

/**
 * Classify a processing error. Unsupported types and corrupt/validation errors
 * are permanent (never retried); everything else is transient (retryable up to
 * MAX_RETRIES).
 */
function classifyFailure(err: unknown): {
  permanent: boolean;
  reason: PermanentFailureReason | "processing_error";
  message: string;
} {
  if (err instanceof UnsupportedMediaError) {
    return { permanent: true, reason: "unsupported_type", message: err.message };
  }

  const raw = err instanceof Error ? err.message : String(err);
  if (PERMANENT_ERROR_RE.test(raw)) {
    return {
      permanent: true,
      reason: "corrupt_file",
      message: "Corrupt or invalid file.",
    };
  }

  return {
    permanent: false,
    reason: "processing_error",
    message: "Extraction failed.",
  };
}

/**
 * Persist the failure: increment retry_count (capped at MAX_RETRIES for
 * transient, forced to MAX for permanent so the retry webhook never re-processes
 * it), classify in processing_metadata, and mark the resource failed.
 */
async function recordFailure(
  supabase: SupabaseClient,
  resourceId: string,
  classification: ReturnType<typeof classifyFailure>,
  prevRetryCount: number,
): Promise<void> {
  const nextRetryCount = classification.permanent
    ? MAX_RETRIES
    : Math.min(prevRetryCount + 1, MAX_RETRIES);

  const processing_metadata: Record<string, unknown> = {
    permanent_failure: classification.permanent,
    failure_reason: classification.reason,
    last_error: classification.message,
    attempts: nextRetryCount,
  };

  const { error } = await supabase
    .from("resources")
    .update({
      status: "failed",
      error_message: classification.message,
      retry_count: nextRetryCount,
      processing_metadata,
    })
    .eq("id", resourceId);

  if (error) {
    console.error(`processResource recordFailure error [${resourceId}]:`, error.message);
  }
}

async function markFailed(
  supabase: SupabaseClient,
  resourceId: string,
  message: string,
): Promise<void> {
  const { error } = await supabase
    .from("resources")
    .update({ status: "failed", error_message: message })
    .eq("id", resourceId);

  if (error) {
    console.error(`processResource markFailed error [${resourceId}]:`, error.message);
  }
}

/**
 * Run the full document-processing pipeline for a resource that has already
 * been uploaded to storage.
 *
 * Steps: fetch resource, parse storage path, download, dispatch extraction
 * (pdf|image|text), chunk, verify coverage, delete old chunks, insert new
 * chunks, mark ready.
 *
 * Retry safety: on entry, if `retry_count >= MAX_RETRIES` or the resource was
 * started less than RETRY_WINDOW_MS ago, the run is skipped. Permanent failures
 * (unsupported type, corrupt file, validation) are classified and never retried.
 *
 * On any failure the resource is marked `failed` with a short error_message
 * and the full error is logged server-side. The caller never sees a stack
 * trace (only a short error string in the returned `error` field).
 */
export async function processResource(
  resourceId: string,
  supabase: SupabaseClient,
  ai?: AIService,
): Promise<ProcessResult> {
  // 1. Fetch the resource record (incl. retry gates + OCR metadata)
  const { data: resource, error: fetchError } = await supabase
    .from("resources")
    .select(RESOURCE_SELECT)
    .eq("id", resourceId)
    .single();

  if (fetchError || !resource) {
    const message = "Resource not found.";
    console.error(`processResource fetch error [${resourceId}]:`, fetchError?.message ?? message);
    await markFailed(supabase, resourceId, message);
    return { success: false, status: "failed", error: message, imagesInserted: 0 };
  }

  const resourceRow = resource as unknown as Resource;

  const retryCount = resourceRow.retry_count ?? 0;

  // 2. Retry gates (shared with the n8n retry webhook)
  const gate = evaluateRetryGates(resourceRow);
  if (!gate.retryable) {
    return {
      success: false,
      status: "failed",
      error: gate.reason,
      permanent: gate.permanent,
      imagesInserted: 0,
    };
  }

  // 3. Record that this attempt has started
  const startedAt = new Date().toISOString();
  const { error: startError } = await supabase
    .from("resources")
    .update({ processing_started_at: startedAt, status: "processing" })
    .eq("id", resourceId);

  if (startError) {
    console.error(`processResource start-mark error [${resourceId}]:`, startError.message);
    // Non-fatal: continue; metadata may be partially recorded.
  }

  // 4. Parse the storage path into bucket + object key
  const { bucket, objectKey } = parseStoragePath(resourceRow.storage_path);

  // 5. Download the original file from storage
  const { data: downloaded, error: downloadError } = await supabase.storage
    .from(bucket)
    .download(objectKey);

  if (downloadError || !downloaded) {
    const message = "Failed to download resource from storage.";
    console.error(`processResource download error [${resourceId}]:`, downloadError);
    await recordFailure(supabase, resourceId, {
      permanent: false,
      reason: "processing_error",
      message,
    }, retryCount);
    return { success: false, status: "failed", error: message, imagesInserted: 0 };
  }

  const buffer = await storageDataToUint8(downloaded);

  // 6. Dispatch extraction by mime type (pdf | image | text | pptx)
  let document;
  let images: ProcessImage[] = [];
  let extractionMetadata: Record<string, unknown> = {};
  try {
    const output = await extractResource(
      buffer,
      resourceRow.mime_type,
      resourceRow.original_filename,
      undefined,
      { supabase, userId: resourceRow.user_id, resourceId },
    );
    document = output.document;
    images = output.images;
    extractionMetadata = output.metadata;
  } catch (err) {
    const classification = classifyFailure(err);
    console.error(`processResource extract error [${resourceId}]:`, classification.message);
    await recordFailure(supabase, resourceId, classification, retryCount);
    return {
      success: false,
      status: "failed",
      permanent: classification.permanent,
      error: classification.message,
      imagesInserted: 0,
    };
  }

  // 7. Chunk the document pages
  const chunks: PageChunk[] = chunkDocument(document.pages);
  const nonEmptyChunks = chunks.filter((c) => c.content.trim().length > 0);

  // 8. Verify document coverage and warn on gaps
  const coverageReports = verifyDocumentCoverage(
    document.pages.map((p) => ({ pageNumber: p.pageNumber, text: p.text })),
    nonEmptyChunks,
  );
  for (const report of coverageReports) {
    if (!report.is_complete || report.has_gap) {
      console.warn(
        `Coverage gap on page ${report.page_number}: length=${report.page_text_length}, gapAt=${report.first_gap_at ?? "none"}`,
      );
    }
  }

  // 9. Delete any previously stored chunks for this resource
  const { error: deleteError } = await supabase
    .from("resource_chunks")
    .delete()
    .eq("resource_id", resourceId);

  if (deleteError) {
    const message = "Failed to clear previous chunks.";
    console.error(`processResource delete error [${resourceId}]:`, deleteError.message);
    await recordFailure(supabase, resourceId, {
      permanent: false,
      reason: "processing_error",
      message,
    }, retryCount);
    return { success: false, status: "failed", error: message, imagesInserted: 0 };
  }

  // 10. Insert the new chunks
  const chunkInserts = nonEmptyChunks.map((c) =>
    toChunkInsert(c, resourceId, resourceRow.user_id),
  );

  const { error: chunkError } = await supabase
    .from("resource_chunks")
    .insert(chunkInserts);

  if (chunkError) {
    const message = "Chunk insertion failed.";
    console.error(`processResource chunk insert error [${resourceId}]:`, chunkError.message);
    await recordFailure(supabase, resourceId, {
      permanent: false,
      reason: "processing_error",
      message,
    }, retryCount);
    return { success: false, status: "failed", error: message, imagesInserted: 0 };
  }

  // 10b. Insert resource_images rows for PPTX extracted images
  let imagesInserted = 0;
  if (images.length > 0) {
    const imageInserts = images.map((img) =>
      toImageInsert(
        {
          storagePath: img.storagePath,
          mimeType: img.mimeType,
          pageNumber: img.pageNumber,
          imageIndex: img.imageIndex,
        },
        resourceId,
        resourceRow.user_id,
      ),
    );

    const { error: imageError } = await supabase
      .from("resource_images")
      .insert(imageInserts);

    if (imageError) {
      const message = "Image insertion failed.";
      console.error(`processResource image insert error [${resourceId}]:`, imageError.message);
      await recordFailure(supabase, resourceId, {
        permanent: false,
        reason: "processing_error",
        message,
      }, retryCount);
      return { success: false, status: "failed", error: message, imagesInserted: 0 };
    }

    imagesInserted = imageInserts.length;
  }

  // 10c. Vision processing for images (if enabled)
  let visionProcessed = 0;
  let visionSkipped = 0;
  let visionFailed = 0;
  if (
    images.length > 0 &&
    process.env.VISION_DIAGRAMS_ENABLED === "true"
  ) {
    const visionImages = images.slice(0, MAX_VISION_IMAGES_PER_RESOURCE);

    // Idempotency: fetch existing vision descriptions so we don't re-call vision
    const { data: existingImages, error: existingImgError } = await supabase
      .from("resource_images")
      .select("storage_path, vision_description, vision_model")
      .eq("resource_id", resourceId);

    if (existingImgError) {
      console.warn(`Vision: failed to query existing images [${resourceId}]:`, existingImgError.message);
    }

    const existingVisionMap = new Map<string, { description: string; model: string }>();
    if (existingImages) {
      for (const row of existingImages) {
        if (row.vision_description) {
          existingVisionMap.set(row.storage_path, {
            description: row.vision_description,
            model: row.vision_model ?? "unknown",
          });
        }
      }
    }

    const expectedPathPrefix = `extracted-images/${resourceRow.user_id}/${resourceId}/`;

    const visionChunks: Array<{
      content: string;
      pageNumber: number;
      imageIndex: number;
      storagePath: string;
      description: string;
      model: string;
    }> = [];

    for (const img of visionImages) {
      // Ownership check: verify the image storage path belongs to this user/resource
      if (!img.storagePath.startsWith(expectedPathPrefix)) {
        console.warn(`Vision: ownership check failed for ${img.storagePath}, expected prefix ${expectedPathPrefix}`);
        visionFailed++;
        continue;
      }

      // Idempotency: skip if vision description already exists
      const existing = existingVisionMap.get(img.storagePath);
      if (existing) {
        visionChunks.push({
          content: `[Image description] ${existing.description}`,
          pageNumber: img.pageNumber,
          imageIndex: img.imageIndex,
          storagePath: img.storagePath,
          description: existing.description,
          model: existing.model,
        });
        visionSkipped++;
        continue;
      }

      try {
        // Download the image from storage
        const { data: imgData, error: imgDownloadError } = await supabase.storage
          .from("study-pdfs")
          .download(img.storagePath);

        if (imgDownloadError || !imgData) {
          console.warn(`Vision: failed to download image ${img.storagePath}:`, imgDownloadError?.message);
          visionFailed++;
          continue;
        }

        const imgBuffer = await storageDataToUint8(imgData);
        const result = await describeImage(imgBuffer, img.mimeType, undefined, ai);

        const descriptionText = `[Image description] ${result.description}`;
        visionChunks.push({
          content: descriptionText,
          pageNumber: img.pageNumber,
          imageIndex: img.imageIndex,
          storagePath: img.storagePath,
          description: result.description,
          model: result.model,
        });

        // Update the resource_images row with vision description
        const { error: visionUpdateError } = await supabase
          .from("resource_images")
          .update({
            vision_description: result.description,
            vision_model: result.model,
          })
          .eq("resource_id", resourceId)
          .eq("page_number", img.pageNumber)
          .eq("image_index", img.imageIndex);

        if (visionUpdateError) {
          console.warn(`Vision: failed to update resource_images for ${img.storagePath}:`, visionUpdateError.message);
        }

        visionProcessed++;
      } catch (err) {
        // Vision failure on one image must NOT fail the resource
        console.warn(`Vision: failed to process image ${img.storagePath}:`, err instanceof Error ? err.message : String(err));
        visionFailed++;
      }
    }

    // Delete old vision description chunks before inserting new ones (idempotency)
    if (visionChunks.length > 0) {
      const { error: deleteVisionChunksError } = await supabase
        .from("resource_chunks")
        .delete()
        .eq("resource_id", resourceId)
        .like("content", "[Image description]%");

      if (deleteVisionChunksError) {
        console.warn(`Vision: failed to delete old vision chunks [${resourceId}]:`, deleteVisionChunksError.message);
      }
    }

    // Insert vision description chunks
    if (visionChunks.length > 0) {
      // Get the next chunk_index for each page
      const pageChunkCounts = new Map<number, number>();
      for (const chunk of nonEmptyChunks) {
        const current = pageChunkCounts.get(chunk.page_number) ?? 0;
        if (chunk.chunk_index >= current) {
          pageChunkCounts.set(chunk.page_number, chunk.chunk_index + 1);
        }
      }

      const visionChunkInserts = visionChunks.map((vc) => {
        const chunkIndex = pageChunkCounts.get(vc.pageNumber) ?? 0;
        pageChunkCounts.set(vc.pageNumber, chunkIndex + 1);
        return {
          resource_id: resourceId,
          user_id: resourceRow.user_id,
          page_number: vc.pageNumber,
          chunk_index: chunkIndex,
          char_start: 0,
          char_end: vc.content.length,
          content: vc.content,
          token_count: Math.ceil(vc.content.length / 4),
        };
      });

      const { error: visionChunkError } = await supabase
        .from("resource_chunks")
        .insert(visionChunkInserts);

      if (visionChunkError) {
        console.warn(`Vision: failed to insert vision chunks:`, visionChunkError.message);
      }
    }

    // Record vision stats in processing_metadata
    if (visionProcessed > 0 || visionSkipped > 0 || visionFailed > 0) {
      console.log(`Vision: processed=${visionProcessed} skipped=${visionSkipped} failed=${visionFailed} for resource ${resourceId}`);
    }
  }

  // 11. Mark the resource as ready with full OCR/vision metadata
  const processing_metadata: Record<string, unknown> = {
    attempts: retryCount + 1,
  };
  if (document.ocrUsed) {
    processing_metadata.source_kind = "image";
    processing_metadata.ocr_confidence = document.ocrConfidence ?? null;
  } else if (resourceRow.mime_type === "application/vnd.openxmlformats-officedocument.presentationml.presentation") {
    processing_metadata.source_kind = "pptx";
  }
  if (visionProcessed > 0 || visionSkipped > 0 || visionFailed > 0) {
    processing_metadata.vision_processed = visionProcessed;
    processing_metadata.vision_skipped = visionSkipped;
    processing_metadata.vision_failed = visionFailed;
  }
  // Merge extraction warnings (e.g., missing slides, orphan slides)
  const extractionWarnings = extractionMetadata?.processingWarnings;
  if (extractionWarnings && Array.isArray(extractionWarnings) && extractionWarnings.length > 0) {
    processing_metadata.extraction_warnings = extractionWarnings;
  }

  const { error: updateError } = await supabase
    .from("resources")
    .update({
      extracted_text: document.text,
      page_count: document.pageCount,
      char_count: document.text.length,
      ocr_used: !!document.ocrUsed,
      ocr_confidence: document.ocrConfidence ?? null,
      processing_metadata,
      retry_count: 0,
      processing_started_at: null,
      status: "ready",
      error_message: null,
    })
    .eq("id", resourceId);

  if (updateError) {
    const message = "Resource update failed.";
    console.error(`processResource update error [${resourceId}]:`, updateError.message);
    await recordFailure(supabase, resourceId, {
      permanent: false,
      reason: "processing_error",
      message,
    }, retryCount);
    return { success: false, status: "failed", error: message, imagesInserted: 0 };
  }

  // 12. Fetch and return the updated resource
  const { data: updated, error: refetchError } = await supabase
    .from("resources")
    .select(RESOURCE_SELECT)
    .eq("id", resourceId)
    .single();

  if (refetchError || !updated) {
    console.error(`processResource refetch error [${resourceId}]:`, refetchError?.message);
    return { success: true, status: "ready", imagesInserted: 0 };
  }

  return { success: true, status: "ready", resource: updated as Resource, imagesInserted };
}
