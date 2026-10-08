import PizZip from "pizzip";
import { createHash } from "node:crypto";
import { XMLParser } from "fast-xml-parser";
import type { ExtractedDocument } from "./pdf";
import type { ProcessImage } from "./extract";
import type { SupabaseClient } from "@supabase/supabase-js";

const MAX_ENTRIES = 1000;
const MAX_TOTAL_UNCOMPRESSED = 100 * 1024 * 1024;
const MAX_ENTRY_SIZE = 10 * 1024 * 1024;
const MIN_IMAGE_SIZE = 100;

interface SlideInfo {
  id: string;
  relId: string;
  path: string;
  pageNumber: number;
}

interface SlideContent {
  text: string;
  notes: string;
  images: Array<{ relId: string; path: string; mimeType: string; data: Uint8Array }>;
}

type ParsedElement = Record<string, unknown>;

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  processEntities: true,
});

function localName(name: string): string {
  const idx = name.indexOf(":");
  return idx === -1 ? name : name.slice(idx + 1);
}

function findChildren(parent: ParsedElement | null, name: string): ParsedElement[] {
  if (!parent || typeof parent !== "object") return [];
  const results: ParsedElement[] = [];
  for (const key of Object.keys(parent)) {
    if (key.startsWith("@_") || key === "#text" || key === "#attributess") continue;
    if (localName(key) === name) {
      const val = parent[key];
      if (Array.isArray(val)) results.push(...(val as ParsedElement[]));
      else if (typeof val === "object" && val !== null) results.push(val as ParsedElement);
    }
  }
  return results;
}

function getRoot(parsed: ParsedElement): ParsedElement | null {
  const keys = Object.keys(parsed).filter((k) => !k.startsWith("?"));
  if (keys.length === 0) return null;
  return parsed[keys[0]] as ParsedElement;
}

function getAttr(obj: ParsedElement | null, name: string): string | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  if (typeof obj["@_" + name] === "string") return obj["@_" + name] as string;
  for (const key of Object.keys(obj)) {
    if (key.startsWith("@_")) {
      const attrName = key.slice(2);
      if (localName(attrName) === name && typeof obj[key] === "string") {
        return obj[key] as string;
      }
    }
  }
  return undefined;
}

function getRelId(obj: ParsedElement | null): string | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  for (const key of Object.keys(obj)) {
    if (key.startsWith("@_")) {
      const attrName = key.slice(2);
      if (attrName.includes(":") && localName(attrName) === "id" && typeof obj[key] === "string") {
        return obj[key] as string;
      }
    }
  }
  return undefined;
}

function collectText(obj: ParsedElement | string): string[] {
  if (typeof obj === "string") return [obj];
  if (!obj || typeof obj !== "object") return [];

  const results: string[] = [];

  if (typeof obj["#text"] === "string") {
    results.push(obj["#text"]);
  }
  if (typeof obj["#attributess"] === "string") {
    results.push(obj["#attributess"]);
  }

  for (const key of Object.keys(obj)) {
    if (key.startsWith("@_") || key === "#text" || key === "#attributess") continue;
    const val = obj[key];
    if (typeof val === "string") {
      results.push(val);
    } else if (Array.isArray(val)) {
      for (const v of val) results.push(...collectText(v as ParsedElement | string));
    } else if (val && typeof val === "object") {
      results.push(...collectText(val as ParsedElement));
    }
  }
  return results;
}

function extractTextFromSlideXml(xml: string): string {
  const parsed = xmlParser.parse(xml);
  const texts = collectText(parsed);
  return texts.filter((t) => t.trim()).join(" ");
}

function resolveZipPath(baseDir: string, target: string): string {
  const parts = baseDir.split("/").filter(Boolean);
  const rel = target.split("/").filter(Boolean);
  for (const part of rel) {
    if (part === "..") {
      parts.pop();
    } else if (part !== ".") {
      parts.push(part);
    }
  }
  return parts.join("/");
}

function normalizeZipEntryName(name: string): string {
  let decoded = name;
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    // Not percent-encoded, use as-is
  }
  decoded = decoded.replace(/\\/g, "/");
  return decoded;
}

function validateZipEntryName(name: string): void {
  const normalized = normalizeZipEntryName(name);

  if (/^[a-zA-Z]:/.test(normalized)) {
    throw new Error(`PPTX contains path traversal attempt: ${name}.`);
  }

  const parts = normalized.split("/");
  for (const part of parts) {
    if (part === "..") {
      throw new Error(`PPTX contains path traversal attempt: ${name}.`);
    }
  }

  if (normalized.startsWith("/")) {
    throw new Error(`PPTX contains path traversal attempt: ${name}.`);
  }
}

function parseSlideOrder(
  presentationXml: string,
  presentationRelsXml: string,
): SlideInfo[] {
  const slides: SlideInfo[] = [];

  const relsObj = xmlParser.parse(presentationRelsXml);
  const relsRoot = getRoot(relsObj);
  const relationships = findChildren(relsRoot, "Relationship");
  const relsMap = new Map<string, string>();
  for (const rel of relationships) {
    const id = getAttr(rel, "Id");
    const type = getAttr(rel, "Type");
    const target = getAttr(rel, "Target");
    if (id && type && type.includes("slide") && target) {
      relsMap.set(id, target);
    }
  }

  const presObj = xmlParser.parse(presentationXml);
  const presRoot = getRoot(presObj);
  if (!presRoot) return slides;

  const sldIdLsts = findChildren(presRoot, "sldIdLst");
  const sldIdLst = sldIdLsts[0];
  if (!sldIdLst) return slides;

  const sldIds = findChildren(sldIdLst, "sldId");
  let pageNumber = 0;
  for (const sldId of sldIds) {
    pageNumber++;
    const numericId = getAttr(sldId, "id");
    const relId = getRelId(sldId);
    if (relId) {
      const target = relsMap.get(relId);
      if (target) {
        const slidePath = resolveZipPath("ppt", target.replace(/^\.\//, ""));
        slides.push({
          id: numericId ?? relId,
          relId,
          path: slidePath,
          pageNumber,
        });
      }
    }
  }

  return slides;
}

function parseSlideContent(
  zip: PizZip,
  slidePath: string,
): SlideContent {
  const slideXml = zip.file(slidePath)?.asText();
  if (!slideXml) {
    return { text: "", notes: "", images: [] };
  }

  const text = extractTextFromSlideXml(slideXml);

  const slideDir = slidePath.replace(/\/[^/]+$/, "");
  const slideRelsPath = `${slideDir}/_rels/${slidePath.split("/").pop()}.rels`;
  const slideRelsXml = zip.file(slideRelsPath)?.asText() || "";

  const slideRelsObj = slideRelsXml ? xmlParser.parse(slideRelsXml) : null;
  const notes = slideRelsObj
    ? extractNotesFromSlideRels(zip, slideDir, slideRelsObj)
    : "";

  const images = slideRelsObj
    ? extractImagesFromSlideRels(zip, slideDir, slideRelsObj)
    : [];

  return { text, notes: notes.trim(), images };
}

function extractNotesFromSlideRels(zip: PizZip, slideDir: string, slideRelsObj: ParsedElement): string {
  const relsRoot = getRoot(slideRelsObj);
  const rels = findChildren(relsRoot, "Relationship");
  let notes = "";
  for (const rel of rels) {
    const type = getAttr(rel, "Type");
    if (type && type.includes("notesSlide")) {
      const target = getAttr(rel, "Target");
      if (target) {
        const notesPath = resolveZipPath(slideDir, target);
        const notesXml = zip.file(notesPath)?.asText();
        if (notesXml) {
          notes += extractTextFromSlideXml(notesXml) + " ";
        }
      }
    }
  }
  return notes;
}

function extractImagesFromSlideRels(
  zip: PizZip,
  slideDir: string,
  slideRelsObj: ParsedElement,
): SlideContent["images"] {
  const relsRoot = getRoot(slideRelsObj);
  const rels = findChildren(relsRoot, "Relationship");
  const images: SlideContent["images"] = [];

  const relsMap = new Map<string, string>();
  for (const rel of rels) {
    const id = getAttr(rel, "Id");
    const type = getAttr(rel, "Type");
    const target = getAttr(rel, "Target");
    if (id && type && type.includes("image") && target) {
      relsMap.set(id, target);
    }
  }

  for (const [relId, target] of relsMap) {
    const imgPath = resolveZipPath(slideDir, target);
    const imgFile = zip.file(imgPath);
    if (imgFile) {
      const data = imgFile.asUint8Array();
      const mimeType = getImageMimeType(imgPath, data);
      if (data.length >= MIN_IMAGE_SIZE) {
        images.push({ relId, path: imgPath, mimeType, data });
      }
    }
  }

  return images;
}

function getImageMimeType(path: string, data: Uint8Array): string {
  const ext = path.toLowerCase().split(".").pop();
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "gif") return "image/gif";
  if (ext === "bmp") return "image/bmp";
  if (ext === "tiff" || ext === "tif") return "image/tiff";

  if (data.length >= 8) {
    if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) return "image/png";
    if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "image/jpeg";
    if (data[0] === 0x47 && data[1] === 0x49 && data[2] === 0x46) return "image/gif";
    if (data[0] === 0x42 && data[1] === 0x4d) return "image/bmp";
  }
  return "application/octet-stream";
}

function hashData(data: Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

async function uploadImage(
  supabase: SupabaseClient,
  userId: string,
  resourceId: string,
  pageNumber: number,
  imageIndex: number,
  mimeType: string,
  data: Uint8Array,
): Promise<string | null> {
  const ext = mimeType.split("/")[1] || "png";
  const storagePath = `extracted-images/${userId}/${resourceId}/slide-${pageNumber}-${imageIndex}.${ext}`;

  const { error } = await supabase.storage
    .from("study-pdfs")
    .upload(storagePath, data, {
      contentType: mimeType,
      upsert: true,
    });

  if (error) {
    console.error(`Failed to upload image ${storagePath}:`, error.message);
    return null;
  }

  return storagePath;
}

export interface PptxExtractionResult {
  document: ExtractedDocument;
  images: ProcessImage[];
  imageHashes: Set<string>;
  processingWarnings: string[];
}

export async function extractPptxText(
  data: Uint8Array,
  supabase: SupabaseClient,
  userId: string,
  resourceId: string,
): Promise<PptxExtractionResult> {
  const processingWarnings: string[] = [];

  let zip: PizZip;
  try {
    zip = new PizZip(data);
  } catch {
    throw new Error("Not a valid PPTX file (zip parsing failed).");
  }

  const entries = Object.keys(zip.files);
  if (entries.length > MAX_ENTRIES) {
    throw new Error(`PPTX contains too many entries (${entries.length} > ${MAX_ENTRIES}).`);
  }

  let totalUncompressed = 0;
  for (const entryName of entries) {
    const file = zip.files[entryName];
    if (file && !file.dir) {
      validateZipEntryName(entryName);
      const size = file.asNodeBuffer().length;
      if (size > MAX_ENTRY_SIZE) {
        throw new Error(`PPTX entry "${entryName}" exceeds max size (${size} > ${MAX_ENTRY_SIZE}).`);
      }
      totalUncompressed += size;
      if (totalUncompressed > MAX_TOTAL_UNCOMPRESSED) {
        throw new Error(`PPTX total uncompressed size exceeds limit (${totalUncompressed} > ${MAX_TOTAL_UNCOMPRESSED}).`);
      }
    }
  }

  const contentTypesXml = zip.file("[Content_Types].xml")?.asText();
  if (!contentTypesXml || !contentTypesXml.includes("ppt/")) {
    throw new Error("Not a valid PPTX file (missing ppt/ in Content_Types).");
  }

  const presentationXml = zip.file("ppt/presentation.xml")?.asText();
  if (!presentationXml) {
    throw new Error("PPTX missing ppt/presentation.xml.");
  }

  const presentationRelsXml = zip.file("ppt/_rels/presentation.xml.rels")?.asText();
  if (!presentationRelsXml) {
    throw new Error("PPTX missing ppt/_rels/presentation.xml.rels.");
  }

  const slideOrder = parseSlideOrder(presentationXml, presentationRelsXml);
  if (slideOrder.length === 0) {
    return {
      document: { pageCount: 0, pages: [], text: "" },
      images: [],
      imageHashes: new Set(),
      processingWarnings,
    };
  }

  // Detect orphan slides (slide files that exist on disk but aren't in presentation.xml order)
  const slidePathsInOrder = new Set(slideOrder.map((s) => s.path));
  const orphanSlides: string[] = [];
  for (const entryName of entries) {
    if (entryName.startsWith("ppt/slides/") && entryName.endsWith(".xml") && !entryName.includes("/_rels/")) {
      if (!slidePathsInOrder.has(entryName)) {
        orphanSlides.push(entryName);
      }
    }
  }
  if (orphanSlides.length > 0) {
    processingWarnings.push(`Orphan slides not in presentation order: ${orphanSlides.join(", ")}`);
  }

  const pages: ExtractedDocument["pages"] = [];
  const processImages: ProcessImage[] = [];
  const imageHashes = new Set<string>();
  let imageIndex = 0;

  for (const slide of slideOrder) {
    const content = parseSlideContent(zip, slide.path);

    // Warn on missing slides
    const slideXml = zip.file(slide.path)?.asText();
    if (!slideXml && !processingWarnings.some((w) => w.includes(`Missing slide at`))) {
      processingWarnings.push(`Missing slide at ${slide.path} (declared in presentation.xml)`);
    }

    const combinedText = [content.text, content.notes].filter(Boolean).join("\n\n");
    pages.push({ pageNumber: slide.pageNumber, text: combinedText });

    for (const img of content.images) {
      const imgHash = hashData(img.data);
      if (imageHashes.has(imgHash)) {
        continue;
      }
      imageHashes.add(imgHash);

      const storagePath = await uploadImage(
        supabase,
        userId,
        resourceId,
        slide.pageNumber,
        imageIndex,
        img.mimeType,
        img.data,
      );

      if (storagePath) {
        processImages.push({
          storagePath,
          mimeType: img.mimeType,
          pageNumber: slide.pageNumber,
          imageIndex,
        });
        imageIndex++;
      }
    }
  }

  const fullText = pages
    .map((p) => `=== Slide ${p.pageNumber} ===\n${p.text}`)
    .join("\n\n");

  return {
    document: { pageCount: pages.length, pages, text: fullText },
    images: processImages,
    imageHashes,
    processingWarnings,
  };
}

export { MAX_ENTRIES, MAX_TOTAL_UNCOMPRESSED, MAX_ENTRY_SIZE, MIN_IMAGE_SIZE };
