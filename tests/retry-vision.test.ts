import type { SupabaseClient } from "@supabase/supabase-js";

import { processResource } from "../lib/resources/processing";
import { terminateOcrWorker } from "../lib/documents/ocr";
import PizZip from "pizzip";

type Row = Record<string, unknown>;

interface MockConfig {
  resource: Row | null;
  downloadData?: Uint8Array | null;
  downloadError?: string | null;
  chunkInsertFails?: boolean;
  resourceUpdateFails?: boolean;
  initialChunks?: Row[];
}

interface MockState {
  resource: Row | null;
  chunks: Row[];
}

interface MockBuilder {
  select: (cols?: string) => MockBuilder;
  eq: (col: string, val: unknown) => MockBuilder;
  single: () => MockBuilder;
  insert: (data: unknown) => MockBuilder;
  update: (data: unknown) => MockBuilder;
  delete: () => MockBuilder;
  then: (
    onFulfilled?: (value: unknown) => unknown,
    onRejected?: (reason: unknown) => unknown,
  ) => Promise<unknown>;
  catch: (onRejected?: (reason: unknown) => unknown) => Promise<unknown>;
}

function makeBuilder(table: string, cfg: MockConfig, state: MockState): MockBuilder {
  let mode: "select" | "insert" | "update" | "delete" | null = null;
  let singleMode = false;
  const filters: Array<{ col: string; val: unknown }> = [];
  let payload: unknown = null;

  const matches = (row: Row) => filters.every((f) => row[f.col] === f.val);

  function execute(): unknown {
    if (mode === "insert") {
      if (table === "resource_chunks" && cfg.chunkInsertFails) {
        return {
          data: null,
          error: { message: "chunk insert rejected", code: "42550" },
        };
      }
      const arr = Array.isArray(payload) ? payload : [payload];
      const inserted = arr.map((d) => ({ ...(d as Row), id: `mock-${Math.random()}` }));
      if (table === "resource_chunks") {
        state.chunks.push(...inserted);
      }
      return { data: inserted, error: null };
    }

    if (mode === "update") {
      if (
        table === "resources" &&
        cfg.resourceUpdateFails &&
        (payload as Row)?.status === "ready"
      ) {
        return { data: null, error: { message: "update rejected", code: "42550" } };
      }
      if (table === "resources" && state.resource && matches(state.resource)) {
        Object.assign(state.resource, payload);
        return {
          data: singleMode ? state.resource : [state.resource],
          error: null,
        };
      }
      return { data: singleMode ? null : [], error: null };
    }

    if (mode === "delete") {
      if (table === "resource_chunks") {
        const removed = state.chunks.filter(matches);
        state.chunks = state.chunks.filter((c) => !matches(c));
        return { data: removed, error: null };
      }
      return { data: [], error: null };
    }

    let rows: Row[] = [];
    if (table === "resources") {
      rows = state.resource ? [state.resource] : [];
    } else if (table === "resource_chunks") {
      rows = state.chunks;
    }
    rows = rows.filter(matches);

    if (singleMode) {
      const row = rows[0] ?? null;
      if (!row) {
        return { data: null, error: { message: "Not found", code: "PGRST116" } };
      }
      return { data: row, error: null };
    }
    return { data: rows, error: null };
  }

  const builder: MockBuilder = {
    select() {
      mode = "select";
      return builder;
    },
    eq(col, val) {
      filters.push({ col, val });
      return builder;
    },
    single() {
      singleMode = true;
      return builder;
    },
    insert(data) {
      mode = "insert";
      payload = data;
      return builder;
    },
    update(data) {
      mode = "update";
      payload = data;
      return builder;
    },
    delete() {
      mode = "delete";
      return builder;
    },
    then(onFulfilled, onRejected) {
      return Promise.resolve(execute()).then(onFulfilled, onRejected);
    },
    catch(onRejected) {
      return Promise.resolve().catch(onRejected);
    },
  };

  return builder;
}

function createProcClient(cfg: MockConfig): { client: SupabaseClient; state: MockState } {
  const state: MockState = {
    resource: cfg.resource ? { ...cfg.resource } : null,
    chunks: cfg.initialChunks ? cfg.initialChunks.map((c) => ({ ...c })) : [],
  };

  const client = {
    from: (table: string) => makeBuilder(table, cfg, state),
    storage: {
      from() {
        return {
          download() {
            if (cfg.downloadError) {
              return Promise.resolve({
                data: null,
                error: { message: cfg.downloadError },
              });
            }
            const data = cfg.downloadData ?? null;
            return Promise.resolve({ data, error: null });
          },
        };
      },
    },
  } as unknown as SupabaseClient;

  return { client, state };
}

function buildPptx(text: string): Uint8Array {
  const zip = new PizZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
</Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`);
  zip.file("ppt/presentation.xml", `<?xml version="1.0" encoding="UTF-8"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst>
</p:presentation>`);
  zip.file("ppt/_rels/presentation.xml.rels", `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
</Relationships>`);
  zip.file("ppt/slides/slide1.xml", `<?xml version="1.0" encoding="UTF-8"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:cSld><p:spTree>
    <p:sp>
      <p:txBody>
        <a:bodyPr/><a:lstStyle/>
        <a:p><a:r><a:t>${text}</a:t></a:r></a:p>
      </p:txBody>
    </p:sp>
  </p:spTree></p:cSld></p:sld>`);
  return new Uint8Array(zip.generate({ type: "uint8array" }));
}

let passed = 0;
let failed = 0;

function check(name: string, actual: boolean) {
  if (actual) {
    passed++;
    console.log(`PASS: ${name}`);
  } else {
    failed++;
    console.log(`FAIL: ${name}`);
  }
}

const USER_ID = "test-user-id";
const RESOURCE_ID = "resource-1";
const STORAGE_PATH = "study-pdfs/test-user-id/doc-1.pptx";

function baseResource(overrides: Row = {}): Row {
  return {
    id: RESOURCE_ID,
    user_id: USER_ID,
    title: "Sample PPTX",
    original_filename: "sample.pptx",
    storage_path: STORAGE_PATH,
    mime_type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    size_bytes: 1024,
    char_count: null,
    status: "processing",
    error_message: null,
    extracted_text: null,
    page_count: null,
    created_at: "2026-10-07T00:00:00Z",
    updated_at: "2026-10-07T00:00:00Z",
    ...overrides,
  };
}

async function runTests() {
  const pptxBytes = buildPptx("Slide content here.");
  const originalEnv = process.env.VISION_DIAGRAMS_ENABLED;
  process.env.VISION_DIAGRAMS_ENABLED = "true";

  // --- 1. retry_count increments on transient failure for PPTX ---
  console.log("\n=== retry_count increments on transient failure (PPTX) ===");
  {
    const { client, state } = createProcClient({
      resource: baseResource({ retry_count: 0 }),
      downloadData: pptxBytes,
      chunkInsertFails: true,
    });

    const result = await processResource(RESOURCE_ID, client);

    check("transient PPTX failure returns not success", result.success === false);
    check("retry_count incremented from 0 to 1", (state.resource as Row)?.retry_count === 1);
    check("not permanent", result.permanent !== true);
  }

  // --- 2. Permanent failures are not retried ---
  console.log("\n=== Permanent failures not retried ===");
  {
    const { client, state } = createProcClient({
      resource: baseResource({ retry_count: 0 }),
      downloadData: new Uint8Array(Buffer.from("not an image or pdf")),
    });

    const result = await processResource(RESOURCE_ID, client);

    check("unsupported type returns not success", result.success === false);
    check("unsupported type is permanent", result.permanent === true);
    check("unsupported type maxes retry_count", (state.resource as Row)?.retry_count === 3);

    const retry = await processResource(RESOURCE_ID, client);
    check("permanent failure not reprocessed", retry.success === false);
    check(
      "permanent failure short-circuits",
      retry.error === "Permanent failure; not retried." ||
        retry.error === "Retry limit exceeded or processing too recent."
    );
  }

  // --- 3. processing_started_at under 10 minutes is skipped ---
  console.log("\n=== processing_started_at under 10 minutes is skipped ===");
  {
    const recent = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { client, state } = createProcClient({
      resource: baseResource({
        retry_count: 1,
        processing_started_at: recent,
      }),
      downloadData: pptxBytes,
    });

    const result = await processResource(RESOURCE_ID, client);

    check("recent start returns not success", result.success === false);
    check("recent start error mentions gate", result.error === "Retry limit exceeded or processing too recent.");
    check("recent start no chunks inserted", state.chunks.length === 0);
  }

  // --- 4. Vision-enabled resource: retry_count stays capped on permanent ---
  console.log("\n=== Vision-enabled resource permanent failure ===");
  {
    const { client, state } = createProcClient({
      resource: baseResource({ retry_count: 0 }),
      downloadData: new Uint8Array(Buffer.from("corrupt pptx bytes that fail parsing")),
    });

    const result = await processResource(RESOURCE_ID, client);

    check("corrupt PPTX returns not success", result.success === false);
    check("corrupt PPTX is permanent", result.permanent === true);
    check("corrupt PPTX maxes retry_count", (state.resource as Row)?.retry_count === 3);
  }

  process.env.VISION_DIAGRAMS_ENABLED = originalEnv;

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

runTests()
  .catch((err) => {
    console.error("retry vision test error:", err);
    process.exitCode = 1;
  })
  .finally(() => {
    void terminateOcrWorker().catch(() => undefined);
  });
