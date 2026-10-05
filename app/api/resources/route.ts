import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { extractPdfText } from "@/lib/documents/pdf";
import { chunkDocument, verifyDocumentCoverage } from "@/lib/documents/chunking";
import { assessTextQuality } from "@/lib/documents/text-quality";
import { validatePdf, MAX_PDF_BYTES } from "@/lib/resources/validation";
import { buildStoragePath } from "@/lib/supabase/storage";
import type { Resource } from "@/lib/resources/types";
import { toChunkInsert } from "@/lib/resources/types";

export const runtime = "nodejs";

const MAX_BYTES_ERROR = `PDF must be at most ${MAX_PDF_BYTES / 1024 / 1024} MB.`;

export function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET() {
  const supabase = await createClient();

  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth?.user) {
    return jsonError("Unauthorized.", 401);
  }

  const { data, error } = await supabase
    .from("resources")
    .select(
      "id, user_id, title, original_filename, storage_path, mime_type, size_bytes, char_count, status, error_message, page_count, created_at, updated_at",
    )
    .eq("user_id", auth.user.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("resources list error:", error.message);
    return jsonError("Failed to load your library.", 500);
  }

  return NextResponse.json({ resources: (data ?? []) as Resource[] });
}

export async function POST(request: Request) {
  const supabase = await createClient();

  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth?.user) {
    return jsonError("Unauthorized.", 401);
  }

  const userId = auth.user.id;

  const formData = await request.formData();
  const file = formData.get("file");

  if (!file || !(file instanceof File) || file.size === 0) {
    return jsonError("No PDF file provided.", 400);
  }

  if (file.size > MAX_PDF_BYTES) {
    return jsonError(MAX_BYTES_ERROR, 413);
  }

  const originalFilename = file.name;
  const mimeType = file.type || "application/pdf";
  const buffer = Buffer.from(await file.arrayBuffer());
  const sizeBytes = buffer.length;

  const validation = validatePdf(originalFilename, mimeType, sizeBytes, new Uint8Array(buffer));
  if (!validation.ok) {
    return jsonError(validation.error ?? "Invalid file.", 400);
  }

  const { bucket, objectKey, storagePath } = buildStoragePath(userId);

  const { data: inserted, error: insertError } = await supabase
    .from("resources")
    .insert({
      user_id: userId,
      title: originalFilename.replace(/\.pdf$/i, "") || originalFilename,
      original_filename: originalFilename,
      storage_path: storagePath,
      mime_type: "application/pdf",
      size_bytes: sizeBytes,
      status: "processing",
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    console.error("resources insert error:", insertError?.message);
    return jsonError("Failed to create resource record.", 500);
  }

  const resourceId = inserted.id;

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(objectKey, buffer, { contentType: "application/pdf", upsert: false });

  if (uploadError) {
    console.error("storage upload error:", uploadError.message);
    await supabase
      .from("resources")
      .update({ status: "failed", error_message: "Upload to storage failed." })
      .eq("id", resourceId);
    return jsonError("Failed to store file.", 500);
  }

  try {
    const doc = await extractPdfText(buffer);

    const quality = assessTextQuality(doc.pages);
    if (!quality.ok) {
      const errorMessage =
        "No readable text found. This PDF looks scanned or photographed. OCR is not supported yet.";
      await supabase
        .from("resources")
        .update({ status: "failed", error_message: errorMessage })
        .eq("id", resourceId);
      return jsonError(errorMessage, 422);
    }

    // Chunk pages and prepare for insertion
    const chunks = chunkDocument(doc.pages);

    // Filter out empty chunks
    const nonEmptyChunks = chunks.filter((c) => c.content.trim().length > 0);

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

    const chunkInserts = nonEmptyChunks.map((c) => toChunkInsert(c, resourceId, userId));

    // Insert chunks first
    await supabase.from("resource_chunks").delete().eq("resource_id", resourceId);

    const { error: chunkError } = await supabase
      .from("resource_chunks")
      .insert(chunkInserts);

    if (chunkError) {
      console.error("resource_chunks insert error:", chunkError.message);
      await supabase
        .from("resources")
        .update({ status: "failed", error_message: "Chunk insertion failed." })
        .eq("id", resourceId);
      return jsonError("Chunk insertion failed.", 500);
    }

    // Only update resource to ready after successful chunk insertion
    const { error: updateError } = await supabase
      .from("resources")
      .update({
        extracted_text: doc.text,
        page_count: doc.pageCount,
        char_count: doc.text.length,
        status: "ready",
      })
      .eq("id", resourceId);

    if (updateError) {
      console.error("resources update error:", updateError.message);
      await supabase
        .from("resources")
        .update({ status: "failed", error_message: "Resource update failed." })
        .eq("id", resourceId);
      return NextResponse.json(
        { resourceId, status: "processing", error: "Resource recorded; status update pending." },
        { status: 202 },
      );
    }

    const { data: resource, error: fetchError } = await supabase
      .from("resources")
      .select(
        "id, user_id, title, original_filename, storage_path, mime_type, size_bytes, char_count, status, error_message, page_count, created_at, updated_at",
      )
      .eq("id", resourceId)
      .single();

    if (fetchError) {
      console.error("resources fetch error:", fetchError.message);
    }

    return NextResponse.json({ resource: resource as Resource });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    console.error("pdf extraction error:", message);
    await supabase
      .from("resources")
      .update({ status: "failed", error_message: "PDF text extraction failed." })
      .eq("id", resourceId);
    return jsonError("PDF processing failed.", 500);
  }
}
