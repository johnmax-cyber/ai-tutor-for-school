export type ResourceType = "pdf" | "image" | "pptx" | "text";

export const IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/jpg"] as const;
export const PPTX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";
export const TEXT_MIME_TYPES = ["text/plain", "text/markdown"] as const;

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_PPTX_BYTES = 50 * 1024 * 1024; // 50 MB
export const MAX_TEXT_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_VISION_IMAGES_PER_RESOURCE = 10;

export interface ResourceTypeDetection {
  type: ResourceType;
  error?: string;
}

export function detectResourceType(
  filename: string,
  mimeType: string,
  sizeBytes: number,
): ResourceTypeDetection {
  const ext = filename.toLowerCase().split(".").pop();

  if (ext === "pdf" || mimeType === "application/pdf") {
    return { type: "pdf" };
  }

  if (ext === "png" || ext === "jpg" || ext === "jpeg" || ext === "pjpeg") {
    return { type: "image" };
  }

  if (ext === "pptx") {
    return { type: "pptx" };
  }

  if (ext === "txt" || ext === "md" || ext === "markdown") {
    return { type: "text" };
  }

  return {
    type: "text",
    error: `Unsupported file type. Allowed: PDF, PNG, JPG, PPTX, TXT, MD.`,
  };
}
