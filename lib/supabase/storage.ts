export const STORAGE_BUCKET = "study-pdfs";

export function buildObjectPath(userId: string): { objectKey: string } {
  return { objectKey: `${userId}/${crypto.randomUUID()}.pdf` };
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

export function buildStoragePath(userId: string): {
  bucket: string;
  objectKey: string;
  storagePath: string;
} {
  const { objectKey } = buildObjectPath(userId);
  const storagePath = `${STORAGE_BUCKET}/${objectKey}`;
  return { bucket: STORAGE_BUCKET, objectKey, storagePath };
}
