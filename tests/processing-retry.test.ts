import type { SupabaseClient } from "@supabase/supabase-js";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { processResource } from "../lib/resources/processing";

type Row = Record<string, unknown>;

interface MockConfig {
  /** Resource row to seed. When null, the resources fetch returns "not found". */
  resource: Row | null;
  /** Bytes the storage download should return (used for extraction). */
  downloadData?: Uint8Array | null;
  /** When set, the storage download returns this error message. */
  downloadError?: string | null;
  /** When true, inserting resource_chunks returns an error. */
  chunkInsertFails?: boolean;
  /** When true, marking the resource "ready" returns an error. */
  resourceUpdateFails?: boolean;
  /** Pre-existing chunks for the resource (to verify deletion/replace). */
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

    // select
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

function createProcClient(cfg: MockConfig): {
  client: SupabaseClient;
  state: MockState;
} {
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

async function buildSamplePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page1 = doc.addPage([400, 400]);
  const page2 = doc.addPage([400, 400]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const lines = [
    "Hello Study Agent",
    "This is a sample document for testing the processing pipeline.",
    "A byte is the fundamental unit of digital information.",
    "It contains eight bits which are binary digits.",
    "Understanding bytes and bits is essential for computer science.",
  ];
  let y = 380;
  for (const line of lines) {
    page1.drawText(line, { x: 10, y, size: 12, font });
    y -= 20;
  }
  y = 380;
  for (const line of lines) {
    page2.drawText(line, { x: 10, y, size: 12, font });
    y -= 20;
  }
  return new Uint8Array(await doc.save());
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
const STORAGE_PATH = "study-pdfs/test-user-id/doc-1.pdf";

function baseResource(overrides: Row = {}): Row {
  return {
    id: RESOURCE_ID,
    user_id: USER_ID,
    title: "Sample Doc",
    original_filename: "sample.pdf",
    storage_path: STORAGE_PATH,
    mime_type: "application/pdf",
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
  const pdfBytes = await buildSamplePdf();

  // --- 1. Success path ---
  console.log("\n=== Success path ===");
  {
    const { client, state } = createProcClient({
      resource: baseResource(),
      downloadData: pdfBytes,
    });

    const result = await processResource(RESOURCE_ID, client);

    check("success path returns success", result.success === true);
    check("success path status is ready", result.status === "ready");
    check("success path returns resource", !!result.resource);
    check("success path resource status ready", state.resource?.status === "ready");
    check("success path resource has page_count 2", state.resource?.page_count === 2);
    check(
      "success path resource has char_count",
      typeof state.resource?.char_count === "number" &&
        (state.resource?.char_count as number) > 0,
    );
    check("success path resource has extracted_text", !!state.resource?.extracted_text);
    check("success path inserted chunks", state.chunks.length > 0);
  }

  // --- 2. Retry: old chunks replaced on re-run ---
  console.log("\n=== Retry / chunk replacement ===");
  {
    const oldChunks: Row[] = [
      {
        id: "old-1",
        resource_id: RESOURCE_ID,
        user_id: USER_ID,
        page_number: 1,
        chunk_index: 0,
        char_start: 0,
        char_end: 10,
        content: "stale chunk content here that should be removed",
        token_count: 4,
        created_at: "2026-10-07T00:00:00Z",
        updated_at: "2026-10-07T00:00:00Z",
      },
    ];
    const { client, state } = createProcClient({
      resource: baseResource({ status: "failed", error_message: "previous failure" }),
      downloadData: pdfBytes,
      initialChunks: oldChunks,
    });

    const result = await processResource(RESOURCE_ID, client);

    check("retry returns success", result.success === true);
    check("retry status is ready", result.status === "ready");
    check("retry old chunk removed", !state.chunks.some((c) => c.id === "old-1"));
    check("retry new chunks present", state.chunks.length > 0);
    check(
      "retry chunks belong to resource",
      state.chunks.every((c) => c.resource_id === RESOURCE_ID),
    );
    check("retry cleared previous error_message", state.resource?.error_message === null);
    check("retry resource now ready", state.resource?.status === "ready");
  }

  // --- 3. Extraction failure (invalid PDF bytes) -> failed ---
  console.log("\n=== Extraction failure ===");
  {
    const garbage = new Uint8Array(Buffer.from("this is not a pdf", "utf8"));
    const { client, state } = createProcClient({
      resource: baseResource(),
      downloadData: garbage,
    });

    const result = await processResource(RESOURCE_ID, client);

    check("extract failure returns not success", result.success === false);
    check("extract failure status failed", result.status === "failed");
    check("extract failure has error", !!result.error);
    check("extract failure did not mark ready", state.resource?.status === "failed");
    check(
      "extract failure set error_message",
      typeof state.resource?.error_message === "string",
    );
    check("extract failure no chunks inserted", state.chunks.length === 0);
  }

  // --- 4. Download failure -> failed, extraction skipped ---
  console.log("\n=== Download failure ===");
  {
    const { client, state } = createProcClient({
      resource: baseResource(),
      downloadError: "storage unavailable",
    });

    const result = await processResource(RESOURCE_ID, client);

    check("download failure returns not success", result.success === false);
    check("download failure status failed", result.status === "failed");
    check(
      "download failure error message",
      result.error === "Failed to download resource from storage.",
    );
    check("download failure set resource failed", state.resource?.status === "failed");
    check("download failure no chunks inserted", state.chunks.length === 0);
  }

  // --- 5. Resource not found -> failed ---
  console.log("\n=== Resource not found ===");
  {
    const { client } = createProcClient({
      resource: null,
      downloadData: pdfBytes,
    });

    const result = await processResource("missing-resource", client);

    check("not found returns not success", result.success === false);
    check("not found status failed", result.status === "failed");
    check("not found error", result.error === "Resource not found.");
  }

  // --- 6. Chunk insert failure -> failed, resource not ready ---
  console.log("\n=== Chunk insert failure ===");
  {
    const { client, state } = createProcClient({
      resource: baseResource(),
      downloadData: pdfBytes,
      chunkInsertFails: true,
    });

    const result = await processResource(RESOURCE_ID, client);

    check("chunk insert failure returns not success", result.success === false);
    check("chunk insert failure status failed", result.status === "failed");
    check("chunk insert failure error", result.error === "Chunk insertion failed.");
    check("chunk insert failure resource failed", state.resource?.status === "failed");
    check(
      "chunk insert failure error_message set",
      typeof state.resource?.error_message === "string",
    );
  }

  // --- 7. Resource update (mark ready) failure -> failed after chunks inserted ---
  console.log("\n=== Resource update failure ===");
  {
    const { client, state } = createProcClient({
      resource: baseResource(),
      downloadData: pdfBytes,
      resourceUpdateFails: true,
    });

    const result = await processResource(RESOURCE_ID, client);

    check("update failure returns not success", result.success === false);
    check("update failure status failed", result.status === "failed");
    check("update failure error", result.error === "Resource update failed.");
    check("update failure chunks were inserted", state.chunks.length > 0);
    check("update failure resource marked failed", state.resource?.status === "failed");
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

runTests().catch((err) => {
  console.error("Test runner error:", err);
  process.exitCode = 1;
});
