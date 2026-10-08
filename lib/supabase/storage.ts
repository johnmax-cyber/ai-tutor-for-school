import type { SupabaseClient } from "@supabase/supabase-js";

export const STORAGE_BUCKET = "study-pdfs";

const DEFAULT_EXT = "pdf";

export function buildObjectPath(userId: string, ext: string = DEFAULT_EXT): { objectKey: string } {
  const safeExt = ext.replace(/\./g, "").toLowerCase() || DEFAULT_EXT;
  return { objectKey: `${userId}/${crypto.randomUUID()}.${safeExt}` };
}

export function parseStoragePath(storagePath: string): {
  bucket: string;
  objectKey: string;
} {
  const separator = storagePath.indexOf("/");
  if (separator === -1) {
    return { bucket: STORAGE_BUCKET, objectKey: storagePath };
  }
  return {
    bucket: storagePath.slice(0, separator),
    objectKey: storagePath.slice(separator + 1),
  };
}

export function buildStoragePath(userId: string, ext: string = DEFAULT_EXT): {
  bucket: string;
  objectKey: string;
  storagePath: string;
} {
  const { objectKey } = buildObjectPath(userId, ext);
  const storagePath = `${STORAGE_BUCKET}/${objectKey}`;
  return { bucket: STORAGE_BUCKET, objectKey, storagePath };
}

/**
 * Return a time-limited signed download URL for a private resource object.
 * Used for private image/PPTX previews.
 */
export async function getSignedResourceUrl(
  supabase: SupabaseClient,
  storagePath: string,
  expiresInSec = 60,
): Promise<string | null> {
  const { bucket, objectKey } = parseStoragePath(storagePath);
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(objectKey, expiresInSec);

  if (error || !data?.signedUrl) {
    console.error("getSignedResourceUrl error:", error?.message ?? data);
    return null;
  }

  return data.signedUrl;
}
