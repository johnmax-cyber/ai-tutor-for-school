import type { SupabaseClient } from "@supabase/supabase-js";
import { extractPdfText } from "@/lib/documents/pdf";
import {
  chunkDocument,
  verifyDocumentCoverage,
  type PageChunk,
} from "@/lib/documents/chunking";
import { parseStoragePath } from "@/lib/supabase/storage";
import { type Resource, toChunkInsert } from "@/lib/resources/types";

export interface ProcessResult {
  success: boolean;
  status: string;
  error?: string;
  resource?: Resource;
}

const RESOURCE_SELECT =
  "id, user_id, title, original_filename, storage_path, mime_type, size_bytes, char_count, status, error_message, extracted_text, page_count, created_at, updated_at";

async function storageDataToUint8(data: Blob | Uint8Array): Promise<Uint8Array> {
  if (data instanceof Blob) {
    return new Uint8Array(await data.arrayBuffer());
  }
  if (data instanceof Uint8Array) {
    return data;
  }
  throw new Error("Unsupported storage download format.");
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
 * Steps: fetch resource, parse storage path, download, extract PDF text,
 * chunk, verify coverage, delete old chunks, insert new chunks, mark ready.
 *
 * On any failure the resource is marked `failed` with a short error_message
 * and the full error is logged server-side. The caller never sees a stack
 * trace (only a short error string in the returned `error` field).
 */
export async function processResource(
  resourceId: string,
  supabase: SupabaseClient,
): Promise<ProcessResult> {
  try {
    // 1. Fetch the resource record
    const { data: resource, error: fetchError } = await supabase
      .from("resources")
      .select(RESOURCE_SELECT)
      .eq("id", resourceId)
      .single();

    if (fetchError || !resource) {
      const message = "Resource not found.";
      console.error(`processResource fetch error [${resourceId}]:`, fetchError?.message ?? message);
      await markFailed(supabase, resourceId, message);
      return { success: false, status: "failed", error: message };
    }

    // 2. Parse the storage path into bucket + object key
    const { bucket, objectKey } = parseStoragePath(resource.storage_path);

    // 3. Download the original file from storage
    const { data: downloaded, error: downloadError } = await supabase.storage
      .from(bucket)
      .download(objectKey);

    if (downloadError || !downloaded) {
      const message = "Failed to download resource from storage.";
      console.error(`processResource download error [${resourceId}]:`, downloadError);
      await markFailed(supabase, resourceId, message);
      return { success: false, status: "failed", error: message };
    }

    const buffer = await storageDataToUint8(downloaded);

    // 4. Extract text from the PDF
    const doc = await extractPdfText(buffer);

    // 5. Chunk the document pages
    const chunks: PageChunk[] = chunkDocument(doc.pages);
    const nonEmptyChunks = chunks.filter((c) => c.content.trim().length > 0);

    // 6. Verify document coverage and warn on gaps
    const coverageReports = verifyDocumentCoverage(
      doc.pages.map((p) => ({ pageNumber: p.pageNumber, text: p.text })),
      nonEmptyChunks,
    );
    for (const report of coverageReports) {
      if (!report.is_complete || report.has_gap) {
        console.warn(
          `Coverage gap on page ${report.page_number}: length=${report.page_text_length}, gapAt=${report.first_gap_at ?? "none"}`,
        );
      }
    }

    // 7. Delete any previously stored chunks for this resource
    const { error: deleteError } = await supabase
      .from("resource_chunks")
      .delete()
      .eq("resource_id", resourceId);

    if (deleteError) {
      const message = "Failed to clear previous chunks.";
      console.error(`processResource delete error [${resourceId}]:`, deleteError.message);
      await markFailed(supabase, resourceId, message);
      return { success: false, status: "failed", error: message };
    }

    // 8. Insert the new chunks
    const chunkInserts = nonEmptyChunks.map((c) =>
      toChunkInsert(c, resourceId, resource.user_id),
    );

    const { error: chunkError } = await supabase
      .from("resource_chunks")
      .insert(chunkInserts);

    if (chunkError) {
      const message = "Chunk insertion failed.";
      console.error(`processResource chunk insert error [${resourceId}]:`, chunkError.message);
      await markFailed(supabase, resourceId, message);
      return { success: false, status: "failed", error: message };
    }

    // 9. Mark the resource as ready
    const { error: updateError } = await supabase
      .from("resources")
      .update({
        extracted_text: doc.text,
        page_count: doc.pageCount,
        char_count: doc.text.length,
        status: "ready",
        error_message: null,
      })
      .eq("id", resourceId);

    if (updateError) {
      const message = "Resource update failed.";
      console.error(`processResource update error [${resourceId}]:`, updateError.message);
      await markFailed(supabase, resourceId, message);
      return { success: false, status: "failed", error: message };
    }

    // 10. Fetch and return the updated resource
    const { data: updated, error: refetchError } = await supabase
      .from("resources")
      .select(RESOURCE_SELECT)
      .eq("id", resourceId)
      .single();

    if (refetchError || !updated) {
      console.error(`processResource refetch error [${resourceId}]:`, refetchError?.message);
      return { success: true, status: "ready" };
    }

    return { success: true, status: "ready", resource: updated as Resource };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    console.error(`processResource error [${resourceId}]:`, message);
    await markFailed(supabase, resourceId, "PDF processing failed.");
    return { success: false, status: "failed", error: "PDF processing failed." };
  }
}
