import PizZip from "pizzip";
import { Buffer } from "node:buffer";
import { extractPptxText } from "../lib/documents/pptx";
import { validatePptx } from "../lib/resources/validation";
import { extractResource } from "../lib/documents/extract";
import { UnsupportedMediaError } from "../lib/documents/extract";
import { PPTX_MIME_TYPE } from "../lib/documents/types";

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

function createMockSupabase() {
  const uploadedImages: Array<{ path: string; data: Uint8Array }> = [];

  return {
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, data: Uint8Array) => {
          uploadedImages.push({ path, data });
          return { error: null, data: { path } };
        },
      }),
    },
    _test: { uploadedImages },
  };
}

function buildPptx(opts: {
  slides: Array<{
    text?: string;
    notes?: string;
    images?: Array<{ data: Uint8Array; mimeType: string }>;
  }>;
  reorder?: boolean;
}): Uint8Array {
  const zip = new PizZip();

  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
  <Override PartName="/ppt/slides/slide2.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
  <Override PartName="/ppt/slides/slide3.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
  <Override PartName="/ppt/notesSlides/notesSlide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"/>
  <Override PartName="/ppt/notesSlides/notesSlide2.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"/>
  <Override PartName="/ppt/notesSlides/notesSlide3.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"/>
  <Override PartName="/ppt/slides/_rels/slide1.xml.rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Override PartName="/ppt/slides/_rels/slide2.xml.rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Override PartName="/ppt/slides/_rels/slide3.xml.rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
</Types>`);

  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`);

  const slideCount = opts.slides.length;
  const slideIds = opts.reorder ? ["256", "257", "258"].slice(0, slideCount) : ["256", "257", "258"].slice(0, slideCount);
  const relIds = opts.reorder ? ["rId3", "rId1", "rId2"].slice(0, slideCount) : ["rId1", "rId2", "rId3"].slice(0, slideCount);

  let presentationXml = `<?xml version="1.0" encoding="UTF-8"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:sldIdLst>`;

  for (let i = 0; i < slideCount; i++) {
    presentationXml += `<p:sldId id="${slideIds[i]}" r:id="${relIds[i]}"/>`;
  }

  presentationXml += `</p:sldIdLst></p:presentation>`;
  zip.file("ppt/presentation.xml", presentationXml);

  let relsXml = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`;

  for (let i = 0; i < slideCount; i++) {
    const target = opts.reorder ? `slides/slide${4 - i - 1}.xml` : `slides/slide${i + 1}.xml`;
    relsXml += `<Relationship Id="${relIds[i]}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="${target}"/>`;
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

    if (slide.notes) {
      slideRelsXml += `<Relationship Id="rIdNotes" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide${slideNum}.xml"/>`;
    }

    if (slide.images && slide.images.length > 0) {
      for (let j = 0; j < slide.images.length; j++) {
        const imgRelId = `rId${j + 1}`;
        const imgName = `image${slideNum}_${j + 1}.png`;
        slideRelsXml += `<Relationship Id="${imgRelId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${imgName}"/>`;
      }
    }

    slideRelsXml += `</Relationships>`;
    zip.file(`ppt/slides/_rels/slide${slideNum}.xml.rels`, slideRelsXml);

    if (slide.notes) {
      let notesXml = `<?xml version="1.0" encoding="UTF-8"?>
<p:notesSlide xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree>
    <p:sp>
      <p:txBody>
        <a:bodyPr/>
        <a:lstStyle/>
        <a:p>
          <a:r>
            <a:t>${slide.notes}</a:t>
          </a:r>
        </a:p>
      </p:txBody>
    </p:sp>
  </p:spTree></p:cSld></p:notesSlide>`;
      zip.file(`ppt/notesSlides/notesSlide${slideNum}.xml`, notesXml);
    }
  }

  return new Uint8Array(zip.generate({ type: "uint8array" }));
}

function makePng(width: number, height: number): Uint8Array {
  const { createCanvas } = require("canvas");
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "red";
  ctx.fillRect(0, 0, width, height);
  return new Uint8Array(canvas.toBuffer("image/png"));
}

async function main() {
  console.log("=== validatePptx ===");
  
  const validPptx = buildPptx({ slides: [{ text: "Slide 1" }] });
  check("valid PPTX passes", validatePptx("test.pptx", PPTX_MIME_TYPE, validPptx.length, validPptx).ok === true);
  check("wrong extension rejected", validatePptx("test.pdf", PPTX_MIME_TYPE, validPptx.length, validPptx).ok === false);
  check("wrong mime rejected", validatePptx("test.pptx", "application/pdf", validPptx.length, validPptx).ok === false);
  check("empty file rejected", validatePptx("test.pptx", PPTX_MIME_TYPE, 0, new Uint8Array()).ok === false);
  check("oversized rejected", validatePptx("test.pptx", PPTX_MIME_TYPE, 51 * 1024 * 1024, validPptx).ok === false);
  
  const badMagic = new Uint8Array([0x00, 0x01, 0x02, 0x03]);
  check("bad magic rejected", validatePptx("test.pptx", PPTX_MIME_TYPE, 100, badMagic).ok === false);
  
  const noContentTypes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]);
  check("missing Content_Types rejected", validatePptx("test.pptx", PPTX_MIME_TYPE, noContentTypes.length, noContentTypes).ok === false);

  const docxLikeZip = new PizZip();
  docxLikeZip.file("[Content_Types].xml", `<Types><Default Extension="xml" ContentType="application/xml"/></Types>`);
  docxLikeZip.file("word/document.xml", `<w:document/>`);
  const docxBytes = new Uint8Array(docxLikeZip.generate({ type: "uint8array" }));
  check("non-PPTX zip (docx-like) rejected", validatePptx("test.pptx", PPTX_MIME_TYPE, docxBytes.length, docxBytes).ok === false);

  console.log("\n=== extractPptxText (with pizzip fixtures) ===");
  
  const supabase = createMockSupabase() as any;
  const userId = "test-user";
  const resourceId = "test-resource";

  const pngImage = makePng(100, 100);
  
  const basicPptx = buildPptx({
    slides: [
      { text: "First slide content", notes: "Speaker notes for slide 1" },
      { text: "Second slide content", notes: "Speaker notes for slide 2" },
    ],
  });
  
  const result = await extractPptxText(basicPptx, supabase, userId, resourceId);
  
  check("pageCount = 2", result.document.pageCount === 2);
  check("page 1 has text", result.document.pages[0].text.includes("First slide content"));
  check("page 1 has notes", result.document.pages[0].text.includes("Speaker notes for slide 1"));
  check("page 2 has text", result.document.pages[1].text.includes("Second slide content"));
  check("page 2 has notes", result.document.pages[1].text.includes("Speaker notes for slide 2"));
  check("full text has slide markers", result.document.text.includes("=== Slide 1 ===") && result.document.text.includes("=== Slide 2 ==="));
  check("images array empty for no images", result.images.length === 0);

  const pptxWithImages = buildPptx({
    slides: [
      { text: "Slide with image", images: [{ data: pngImage, mimeType: "image/png" }] },
      { text: "Slide with two images", images: [
        { data: makePng(50, 50), mimeType: "image/png" },
        { data: makePng(60, 60), mimeType: "image/png" },
      ]},
    ],
  });

  const resultWithImages = await extractPptxText(pptxWithImages, supabase, userId, resourceId);
  check("two slides extracted", resultWithImages.document.pageCount === 2);
  check("3 images extracted", resultWithImages.images.length === 3);
  check("images have correct page numbers", resultWithImages.images[0].pageNumber === 1 && resultWithImages.images[1].pageNumber === 2 && resultWithImages.images[2].pageNumber === 2);
  check("images have sequential imageIndex", resultWithImages.images[0].imageIndex === 0 && resultWithImages.images[1].imageIndex === 1 && resultWithImages.images[2].imageIndex === 2);
  check("images have storage paths", resultWithImages.images.every(img => img.storagePath.startsWith("extracted-images/")));

  const reorderPptx = buildPptx({
    slides: [
      { text: "Slide A" },
      { text: "Slide B" },
      { text: "Slide C" },
    ],
    reorder: true,
  });
  
  const resultReorder = await extractPptxText(reorderPptx, supabase, userId, resourceId);
  check("reordered slides: 3 slides extracted", resultReorder.document.pageCount === 3);
  check("slide order follows presentation.xml", resultReorder.document.pages[0].text.includes("Slide C") && resultReorder.document.pages[1].text.includes("Slide B") && resultReorder.document.pages[2].text.includes("Slide A"));

  const tinyImage = makePng(10, 10);
  const pptxWithTiny = buildPptx({
    slides: [
      { text: "Slide with tiny image", images: [{ data: tinyImage, mimeType: "image/png" }] },
    ],
  });
  
  const resultTiny = await extractPptxText(pptxWithTiny, supabase, userId, resourceId);
  check("tiny image skipped", resultTiny.images.length === 0);

  const duplicateImage = makePng(80, 80);
  const pptxWithDupes = buildPptx({
    slides: [
      { text: "Slide 1", images: [{ data: duplicateImage, mimeType: "image/png" }] },
      { text: "Slide 2", images: [{ data: duplicateImage, mimeType: "image/png" }] },
    ],
  });
  
  const resultDupes = await extractPptxText(pptxWithDupes, supabase, userId, resourceId);
  check("duplicate images deduped", resultDupes.images.length === 1);

  console.log("\n=== zip safety limits ===");
  
  const manyEntriesZip = new PizZip();
  manyEntriesZip.file("[Content_Types].xml", `<Types><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/></Types>`);
  manyEntriesZip.file("_rels/.rels", `<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>`);
  manyEntriesZip.file("ppt/presentation.xml", `<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldIdLst/></p:presentation>`);
  manyEntriesZip.file("ppt/_rels/presentation.xml.rels", `<Relationships/>`);
  
  for (let i = 0; i < 1001; i++) {
    manyEntriesZip.file(`ppt/extra/file${i}.xml`, `<xml/>`);
  }
  const manyEntriesBytes = new Uint8Array(manyEntriesZip.generate({ type: "uint8array" }));
  
  try {
    await extractPptxText(manyEntriesBytes, supabase, userId, resourceId);
    check("too many entries rejected", false);
  } catch (err) {
    check("too many entries rejected", (err as Error).message.includes("too many entries"));
  }

  const largeEntryZip = new PizZip();
  largeEntryZip.file("[Content_Types].xml", `<Types><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/></Types>`);
  largeEntryZip.file("_rels/.rels", `<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>`);
  largeEntryZip.file("ppt/presentation.xml", `<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldIdLst/></p:presentation>`);
  largeEntryZip.file("ppt/_rels/presentation.xml.rels", `<Relationships/>`);
  largeEntryZip.file("ppt/huge.bin", new Uint8Array(11 * 1024 * 1024));
  const largeEntryBytes = new Uint8Array(largeEntryZip.generate({ type: "uint8array" }));
  
  try {
    await extractPptxText(largeEntryBytes, supabase, userId, resourceId);
    check("large entry rejected", false);
  } catch (err) {
    check("large entry rejected", (err as Error).message.includes("exceeds max size"));
  }

  const traversalZip = new PizZip();
  traversalZip.file("[Content_Types].xml", `<Types><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/></Types>`);
  traversalZip.file("_rels/.rels", `<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>`);
  traversalZip.file("ppt/presentation.xml", `<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldIdLst/></p:presentation>`);
  traversalZip.file("ppt/_rels/presentation.xml.rels", `<Relationships/>`);
  traversalZip.file("../../../etc/passwd", new Uint8Array([1,2,3]));
  const traversalBytes = new Uint8Array(traversalZip.generate({ type: "uint8array" }));
  
  try {
    await extractPptxText(traversalBytes, supabase, userId, resourceId);
    check("path traversal rejected", false);
  } catch (err) {
    check("path traversal rejected", (err as Error).message.includes("path traversal"));
  }

  console.log("\n=== extractResource dispatch ===");
  
  const dispatchResult = await extractResource(validPptx, PPTX_MIME_TYPE, "test.pptx", undefined, { supabase, userId, resourceId });
  check("extractResource returns pptx sourceKind", dispatchResult.sourceKind === "pptx");
  check("extractResource returns document", typeof dispatchResult.document === "object");
  check("extractResource returns images array", Array.isArray(dispatchResult.images));

  try {
    await extractResource(validPptx, PPTX_MIME_TYPE, "test.pptx");
    check("extractResource without options throws", false);
  } catch (err) {
    check("extractResource without options throws", err instanceof UnsupportedMediaError && /requires supabase/.test((err as Error).message));
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error("pptx test error:", err);
  process.exitCode = 1;
});