import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

type PdfjsGlobal = { pdfjsWorker?: unknown };

let workerReady: Promise<unknown> | null = null;

function ensureWorker(): Promise<unknown> {
  if (workerReady) return workerReady;
  workerReady = import("pdfjs-dist/legacy/build/pdf.worker.mjs").then((mod) => {
    (globalThis as PdfjsGlobal).pdfjsWorker = mod;
    return mod;
  });
  return workerReady;
}

export interface ExtractedPage {
  pageNumber: number;
  text: string;
}

export interface ExtractedDocument {
  pageCount: number;
  pages: ExtractedPage[];
  text: string;
}

export async function extractPdfText(
  data: Uint8Array | Buffer,
): Promise<ExtractedDocument> {
  // pdfjs-dist's legacy (Node.js) build instantiates an in-process "fake worker"
  // through a runtime dynamic `import("./pdf.worker.mjs")`. Under Next.js /
  // Turbopack that dynamic import is left for Node to resolve at runtime, but
  // the relative specifier is resolved against the relocated
  // `.next/server/chunks` location instead of `node_modules`, so the worker
  // module can't be found and extraction crashes with "Setting up fake worker
  // failed" (HTTP 500).
  //
  // Preloading `globalThis.pdfjsWorker` makes pdfjs-dist's loader use the
  // already-imported handler (`WorkerMessageHandler`) and skip its own worker
  // import entirely. This keeps the in-process (no browser Worker / thread)
  // model and introduces no service-role key.
  await ensureWorker();

  const bytes = Buffer.isBuffer(data) ? new Uint8Array(data) : data;

  const loadingTask = pdfjsLib.getDocument({ data: bytes });
  const pdf = await loadingTask.promise;

  try {
    const pageCount = pdf.numPages;

    if (pageCount === 0) {
      return { pageCount: 0, pages: [], text: "" };
    }

    const pages: ExtractedPage[] = [];

    for (let i = 1; i <= pageCount; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();

      const text = (content.items as Array<{ str?: string }>)
        .filter((item): item is { str: string } => typeof item.str === "string")
        .map((item) => item.str)
        .join("");

      pages.push({ pageNumber: i, text });
    }

    const text = pages
      .map((p) => `=== Page ${p.pageNumber} ===\n${p.text}`)
      .join("\n\n");

    return { pageCount, pages, text };
  } finally {
    await loadingTask.destroy();
  }
}
