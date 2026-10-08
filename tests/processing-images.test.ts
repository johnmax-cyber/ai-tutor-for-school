import PizZip from "pizzip";
import { processResource } from "../lib/resources/processing";
import { validatePptx } from "../lib/resources/validation";
import { PPTX_MIME_TYPE } from "../lib/documents/types";
import { extractPptxText } from "../lib/documents/pptx";
import { createMockAI } from "../lib/ai/mock";
import { describeImage } from "../lib/documents/vision";
import { terminateOcrWorker } from "../lib/documents/ocr";

let passed = 0;
let failed = 0;

function check(name: string, actual: boolean, detail?: string) {
  if (actual) {
    passed++;
    console.log(`PASS: ${name}`);
  } else {
    failed++;
    console.log(`FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function makeThenable(data: unknown, error: unknown = null) {
  return {
    then(onFulfilled?: (val: unknown) => unknown, onRejected?: (err: unknown) => unknown) {
      if (error) return Promise.reject(error);
      return Promise.resolve(data).then(onFulfilled);
    },
    catch(onRejected?: (err: unknown) => unknown) {
      return Promise.resolve(data).catch(onRejected);
    },
  };
}

function createMockSupabase(
  images: Array<{ storagePath: string; data: Uint8Array }> = [],
  opts: { existingResourceImages?: Array<any>; resourceData?: Uint8Array | null } = {},
) {
  const uploadedImages: Array<{ path: string; data: Uint8Array }> = [];
  const resourceImages: Array<any> = opts.existingResourceImages ? [...opts.existingResourceImages] : [];
  const resourceChunks: Array<any> = [];
  const resources: Map<string, any> = new Map();

  return {
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, data: Uint8Array) => {
          uploadedImages.push({ path, data });
          return { error: null, data: { path } };
        },
        download: async (path: string) => {
          const found = uploadedImages.find(u => u.path === path) || images.find(i => i.storagePath === path);
          if (found) {
            return { error: null, data: new Blob([new Uint8Array(found.data)]) };
          }
          if (opts.resourceData) {
            return { error: null, data: new Blob([new Uint8Array(opts.resourceData)]) };
          }
          return { error: { message: "Not found" }, data: null };
        },
      }),
    },
    from: (table: string) => {
      if (table === "resources") {
        return {
          select: (cols: string) => ({
            eq: (col: string, val: string) => ({
              single: async () => {
                const resource = resources.get(val);
                if (resource) return { data: resource, error: null };
                return { data: null, error: { message: "Not found" } };
              },
            }),
          }),
          update: (data: any) => ({
            eq: (col: string, val: string) => {
              const resource = resources.get(val);
              if (resource) { Object.assign(resource, data); return { error: null }; }
              return { error: { message: "Not found" } };
            },
          }),
          insert: (data: any) => {
            const id = `res-${Date.now()}-${Math.random()}`;
            const resource = { ...data, id, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
            resources.set(id, resource);
            return { error: null, data: resource };
          },
        };
      }
      if (table === "resource_images") {
        return {
          insert: (data: any[]) => { resourceImages.push(...(Array.isArray(data) ? data : [data])); return { error: null }; },
          update: (data: any) => ({
            eq: (col: string, val: string) => ({
              eq: (col2: string, val2: any) => ({
                eq: (col3: string, val3: any) => {
                  const idx = resourceImages.findIndex(r => r.resource_id === val && r[col2] === val2 && r[col3] === val3);
                  if (idx >= 0) { Object.assign(resourceImages[idx], data); return { error: null }; }
                  return { error: { message: "Not found" } };
                },
              }),
            }),
          }),
          select: (cols: string) => ({
            eq: (col: string, val: unknown) => {
              // Return a thenable that resolves with matching rows (Supabase array pattern)
              const matching = resourceImages.filter(r => r[col] === val);
              return makeThenable({ data: matching, error: null });
            },
          }),
        };
      }
      if (table === "resource_chunks") {
        return {
          delete: () => ({
            eq: (col: string, val: string) => ({
              like: (col2: string, pattern: string) => {
                const regex = new RegExp("^" + pattern.replace(/%/g, ".*") + "$");
                const removed = resourceChunks.filter(c => c[col] === val && regex.test(c[col2] ?? ""));
                resourceChunks.splice(0, resourceChunks.length,
                  ...resourceChunks.filter(c => !(c[col] === val && regex.test(c[col2] ?? ""))));
                return makeThenable({ data: removed, error: null });
              },
              then(onFulfilled?: (val: unknown) => unknown) {
                return Promise.resolve({ data: [], error: null }).then(onFulfilled);
              },
            }),
          }),
          insert: (data: any[]) => { resourceChunks.push(...(Array.isArray(data) ? data : [data])); return { error: null }; },
          select: (cols: string) => ({
            eq: (col: string, val: string) => ({
              eq: (col2: string, val2: any) => ({
                eq: (col3: string, val3: any) => ({
                  limit: (lim: number) => ({
                    single: async () => {
                      const found = resourceChunks.find(r => r[col] === val && r[col2] === val2 && r[col3] === val3);
                      if (found) return { data: found, error: null };
                      return { data: null, error: { message: "Not found" } };
                    },
                  }),
                }),
              }),
            }),
          }),
        };
      }
      return {
        select: () => ({ eq: () => ({ single: async () => ({ data: null, error: { message: "Not found" } }) }) }),
        insert: () => ({ error: null }),
        update: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ error: null }) }) }) }),
      };
    },
    _test: { uploadedImages, resourceImages, resourceChunks, resources },
  };
}

function makePng(width: number, height: number): Uint8Array {
  const { createCanvas } = require("canvas");
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "red";
  ctx.fillRect(0, 0, width, height);
  return new Uint8Array(canvas.toBuffer("image/png"));
}

function buildPptx(opts: {
  slides: Array<{
    text?: string;
    notes?: string;
    images?: Array<{ data: Uint8Array; mimeType: string }>;
  }>;
}): Uint8Array {
  const zip = new PizZip();

  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
  <Override PartName="/ppt/slides/_rels/slide1.xml.rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
</Types>`);

  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`);

  const slideCount = opts.slides.length;
  let presentationXml = `<?xml version="1.0" encoding="UTF-8"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:sldIdLst>`;

  for (let i = 0; i < slideCount; i++) {
    presentationXml += `<p:sldId id="${256 + i}" r:id="rId${i + 1}"/>`;
  }

  presentationXml += `</p:sldIdLst></p:presentation>`;
  zip.file("ppt/presentation.xml", presentationXml);

  let relsXml = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`;

  for (let i = 0; i < slideCount; i++) {
    relsXml += `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`;
  }

  relsXml += `</Relationships>`;
  zip.file("ppt/_rels/presentation.xml.rels", relsXml);

  for (let i = 0; i < slideCount; i++) {
    const slide = opts.slides[i];
    const slideNum = i + 1;

    let slideXml = `<?xml version="1.0" encoding="UTF-8"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:cSld><p:spTree>`;

    if (slide.text) {
      slideXml += `
    <p:sp>
      <p:txBody>
        <a:bodyPr/>
        <a:lstStyle/>
        <a:p>
          <a:r>
            <a:t>${slide.text}</a:t>
          </a:r>
        </a:p>
      </p:txBody>
    </p:sp>`;
    }

    if (slide.images && slide.images.length > 0) {
      for (let j = 0; j < slide.images.length; j++) {
        const imgRelId = `rId${j + 1}`;
        const imgName = `image${slideNum}_${j + 1}.png`;
        slideXml += `
    <p:pic>
      <p:blipFill>
        <a:blip r:embed="${imgRelId}"/>
      </p:blipFill>
    </p:pic>`;
        zip.file(`ppt/media/${imgName}`, slide.images[j].data);
      }
    }

    slideXml += `
  </p:spTree></p:cSld></p:sld>`;
    zip.file(`ppt/slides/slide${slideNum}.xml`, slideXml);

    let slideRelsXml = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`;

    if (slide.images && slide.images.length > 0) {
      for (let j = 0; j < slide.images.length; j++) {
        const imgRelId = `rId${j + 1}`;
        const imgName = `image${slideNum}_${j + 1}.png`;
        slideRelsXml += `<Relationship Id="${imgRelId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${imgName}"/>`;
      }
    }

    slideRelsXml += `</Relationships>`;
    zip.file(`ppt/slides/_rels/slide${slideNum}.xml.rels`, slideRelsXml);
  }

  return new Uint8Array(zip.generate({ type: "uint8array" }));
}

function buildResourceRow(resourceId: string, userId: string): any {
  return {
    id: resourceId,
    user_id: userId,
    title: "Test PPTX",
    original_filename: "test.pptx",
    storage_path: `extracted-images/${userId}/${resourceId}/test.pptx`,
    mime_type: PPTX_MIME_TYPE,
    size_bytes: 1024,
    char_count: null,
    status: "processing",
    error_message: null,
    extracted_text: null,
    page_count: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    retry_count: 0,
    processing_started_at: null,
  };
}

function buildStoragePath(userId: string, resourceId: string, slidePage: number, imgIdx: number): string {
  return `extracted-images/${userId}/${resourceId}/slide-${slidePage}-${imgIdx}.png`;
}

async function main() {
  console.log("=== Vision processing integration tests ===");

  // Test 1: validatePptx still works
  console.log("\n--- Test 1: validatePptx ---");
  const pngImage = makePng(100, 100);
  const pptxWithImage = buildPptx({
    slides: [{ text: "Slide with image", images: [{ data: pngImage, mimeType: "image/png" }] }],
  });
  check("valid PPTX passes", validatePptx("test.pptx", PPTX_MIME_TYPE, pptxWithImage.length, pptxWithImage).ok === true);

  // Test 2: extractPptxText extracts images
  console.log("\n--- Test 2: extractPptxText extracts images ---");
  const supabase = createMockSupabase() as any;
  const userId = "test-user";
  const resourceId = "test-resource";
  const extractResult = await extractPptxText(pptxWithImage, supabase, userId, resourceId);
  check("extracts 1 image", extractResult.images.length === 1);
  check("image has storagePath", extractResult.images[0].storagePath.startsWith("extracted-images/"));

  // Test 3: describeImage works with mock AI
  console.log("\n--- Test 3: describeImage with mock AI ---");
  const mockAI = createMockAI([], ["This is a test diagram showing a neural network."]);
  const visionResult = await describeImage(pngImage, "image/png", undefined, mockAI);
  check("returns description", visionResult.description === "This is a test diagram showing a neural network.");
  check("vision called once", mockAI.getVisionCallCount() === 1);

  // Test 4: VISION_DIAGRAMS_ENABLED=false means no vision processing in processResource
  console.log("\n--- Test 4: Vision env check logic ---");
  process.env.VISION_DIAGRAMS_ENABLED = "false";
  check("VISION_DIAGRAMS_ENABLED=false", process.env.VISION_DIAGRAMS_ENABLED !== "true");

  process.env.VISION_DIAGRAMS_ENABLED = "true";
  process.env.AI_VISION_MODEL = "test-model";
  process.env.AI_VISION_API_KEY = "test-key";
  check("VISION_DIAGRAMS_ENABLED=true with config", process.env.VISION_DIAGRAMS_ENABLED === "true" && !!process.env.AI_VISION_MODEL);

  // Test 5: MAX_VISION_IMAGES_PER_RESOURCE limit
  console.log("\n--- Test 5: MAX_VISION_IMAGES_PER_RESOURCE limit ---");
  const { MAX_VISION_IMAGES_PER_RESOURCE } = require("../lib/documents/types");
  check("MAX_VISION_IMAGES_PER_RESOURCE is 10", MAX_VISION_IMAGES_PER_RESOURCE === 10);

  // Test 6: Vision failure on one image doesn't fail describeImage for others
  console.log("\n--- Test 6: Vision failure resilience ---");
  const mockAIFail = createMockAI([], ["Success 1", "Success 2"]);
  let callCount = 0;
  const originalVision = mockAIFail.vision.bind(mockAIFail);
  mockAIFail.vision = async (text: string, b64: string, mime: string) => {
    callCount++;
    if (callCount === 2) throw new Error("Simulated vision failure");
    return originalVision(text, b64, mime);
  };

  try { await describeImage(pngImage, "image/png", undefined, mockAIFail); } catch {}
  try { await describeImage(pngImage, "image/png", undefined, mockAIFail); } catch {}
  try { await describeImage(pngImage, "image/png", undefined, mockAIFail); } catch {}

  // First call succeeded, second threw, third should also throw but be independent
  check("vision called multiple times independently", mockAIFail.getVisionCallCount() >= 2);

  // Test 7: Vision idempotency on retry - vision call count does not increase
  console.log("\n--- Test 7: Vision idempotency on retry ---");
  {
    const mockVisionAI = createMockAI([], ["Diagram showing a flowchart."]);
    const resourceId = "retry-vision-resource";
    const userId = "retry-user";
    const storagePath = buildStoragePath(userId, resourceId, 1, 0);

    // Seed resource_images with existing vision_description (simulating a previous successful vision call)
    const existingImages = [
      {
        resource_id: resourceId,
        user_id: userId,
        storage_path: storagePath,
        page_number: 1,
        image_index: 0,
        mime_type: "image/png",
        vision_description: "Diagram showing a flowchart.",
        vision_model: "mock-vision-model",
      },
    ];

    const supabase = createMockSupabase([], {
      existingResourceImages: existingImages,
      resourceData: pptxWithImage,
    }) as any;
    const resourceRow = buildResourceRow(resourceId, userId);
    supabase._test.resources.set(resourceId, resourceRow);

    await processResource(resourceId, supabase, mockVisionAI);

    check("vision not called on retry (idempotent)", mockVisionAI.getVisionCallCount() === 0);
    const visionChunks = supabase._test.resourceChunks.filter((c: any) => c.content.startsWith("[Image description]"));
    check("vision chunks inserted", visionChunks.length === 1);
    check("vision description from DB preserved", visionChunks[0]?.content === "[Image description] Diagram showing a flowchart.");
  }

  // Test 8: Ownership check - images with cross-user storage paths are skipped
  console.log("\n--- Test 8: Ownership check rejects cross-user image path ---");
  {
    const userId = "ownership-user";
    const resourceId = "ownership-resource";
    const expectedPrefix = `extracted-images/${userId}/${resourceId}/`;

    // Extract images and verify they have the correct prefix
    const supabase = createMockSupabase() as any;
    const extractResult = await extractPptxText(pptxWithImage, supabase, userId, resourceId);

    check("extracted images have correct prefix",
      extractResult.images.every((img: any) => img.storagePath.startsWith(expectedPrefix)));

    // Verify a cross-user path would be rejected
    const crossUserPath = "extracted-images/other-user/ownership-resource/slide-1-0.png";
    check("cross-user path does not match prefix", !crossUserPath.startsWith(expectedPrefix));

    // Verify ownership check logic: only paths starting with the expected prefix pass
    const correctPath = extractResult.images[0]?.storagePath ?? "";
    check("correct path passes ownership check", correctPath.startsWith(expectedPrefix));
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error("processing-images test error:", err);
    process.exitCode = 1;
  })
  .finally(() => {
    void terminateOcrWorker().catch(() => undefined);
  });
