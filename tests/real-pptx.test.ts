import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { extractPptxText } from "../lib/documents/pptx";
import { validatePptx } from "../lib/resources/validation";
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
  return {
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, data: Uint8Array) => {
          return { error: null, data: { path } };
        },
      }),
    },
  };
}

async function main() {
  console.log("=== Real PPTX Fixtures Test ===");
  
  const fixturesDir = join(__dirname, "fixtures");
  let fixtureFiles: string[] = [];
  
  try {
    fixtureFiles = readdirSync(fixturesDir).filter(f => f.toLowerCase().endsWith(".pptx"));
  } catch {
    console.log("SKIP: tests/fixtures/ directory not found or empty");
    console.log(`\n${passed} passed, ${failed} failed`);
    return;
  }

  if (fixtureFiles.length === 0) {
    console.log("SKIP: No .pptx files found in tests/fixtures/");
    console.log(`\n${passed} passed, ${failed} failed`);
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test mock doesn't implement full SupabaseClient
  const supabase = createMockSupabase() as any;
  const userId = "test-user";
  const resourceId = "test-resource";

  for (const file of fixtureFiles) {
    console.log(`\n--- Testing ${file} ---`);
    const filePath = join(fixturesDir, file);
    const buffer = readFileSync(filePath);
    const uint8 = new Uint8Array(buffer);

    const validation = validatePptx(file, PPTX_MIME_TYPE, uint8.length, uint8);
    check(`${file}: validation passes`, validation.ok === true, validation.error);

    if (!validation.ok) {
      console.log(`  Skipping extraction due to validation failure: ${validation.error}`);
      continue;
    }

    try {
      const result = await extractPptxText(uint8, supabase, userId, resourceId);
      check(`${file}: extraction succeeds`, result.document.pageCount > 0);
      check(`${file}: has pages`, result.document.pages.length > 0);
      check(`${file}: pages have pageNumber`, result.document.pages.every(p => p.pageNumber > 0));
      check(`${file}: text is string`, typeof result.document.text === "string");
      check(`${file}: images array exists`, Array.isArray(result.images));
      
      for (const img of result.images) {
        check(`${file}: image has storagePath`, typeof img.storagePath === "string" && img.storagePath.length > 0);
        check(`${file}: image has mimeType`, typeof img.mimeType === "string" && img.mimeType.length > 0);
        check(`${file}: image has pageNumber >= 1`, img.pageNumber >= 1);
        check(`${file}: image has imageIndex >= 0`, img.imageIndex >= 0);
      }
      
      console.log(`  Pages: ${result.document.pageCount}, Images: ${result.images.length}, Text length: ${result.document.text.length}`);
    } catch (err) {
      check(`${file}: extraction fails`, false, (err as Error).message);
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error("real-pptx test error:", err);
  process.exitCode = 1;
});