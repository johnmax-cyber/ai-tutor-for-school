import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { validatePdf, MAX_PDF_BYTES } from "@/lib/resources/validation";
import { buildStoragePath } from "@/lib/supabase/storage";
import type { Resource } from "@/lib/resources/types";
import { processResource } from "@/lib/resources/processing";

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

  const result = await processResource(resourceId, supabase);

  if (result.success) {
    return NextResponse.json({ resource: result.resource as Resource });
  }

  console.error("resource processing error:", result.error);
  return jsonError(result.error ?? "PDF processing failed.", 500);
}
