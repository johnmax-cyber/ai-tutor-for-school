import { readFileSync } from "node:fs";

function loadEnv() {
  try {
    const env = readFileSync(".env.local", "utf-8");
    for (const line of env.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq);
      const val = trimmed.slice(eq + 1);
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    // .env.local not found; rely on environment
  }
}
loadEnv();

import { createClient } from "@supabase/supabase-js";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { extractPdfText } from "../lib/documents/pdf";
import { chunkDocument, verifyDocumentCoverage } from "../lib/documents/chunking";
import type { CoverageReport } from "../lib/documents/chunking";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

const results: Array<{ name: string; pass: boolean; detail?: string }> = [];

function check(name: string, pass: boolean, detail?: string) {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}: ${name}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  const supabase = createClient(url, publishableKey);

  console.log("=== Phase A: real Supabase probes (anon key, no session) ===");

  console.log("\n[A1] Anonymous read of resources is blocked by RLS");
  const { data: anonRes, error: anonErr } = await supabase.from("resources").select("id");
  check(
    "anon resource read returns no rows",
    anonErr == null && (anonRes?.length ?? 0) === 0,
    anonErr ? anonErr.message : `${anonRes?.length} rows visible to anon key`,
  );

  console.log("\n[A2] Phase 3 schema state on remote DB");
  const { error: chunkProbeErr } = await supabase.from("resource_chunks").select("id").limit(0);
  const chunksTableExists = chunkProbeErr == null;
  check(
    "resource_chunks table present",
    chunksTableExists,
    chunkProbeErr ? "MISSING — apply supabase/migrations/20261005000000_resource_chunks.sql" : "exists",
  );
  const { error: charCountErr } = await supabase.from("resources").select("char_count").limit(0);
  check(
    "resources.char_count column present",
    charCountErr == null,
    charCountErr ? "MISSING — part of the same migration" : "exists",
  );

  console.log("\n=== Phase B: real extraction → chunking → coverage on generated PDF ===");

  console.log("\n[B1] Build and extract a 4-page PDF (page 4 is dense, spans multiple chunks)");
  const pdfBytes = await makeTestPdf();
  const doc = await extractPdfText(pdfBytes);
  check("extraction yields 4 pages", doc.pageCount === 4, `pageCount=${doc.pageCount}`);
  check("page markers in combined text", doc.text.includes("=== Page 1 ===") && doc.text.includes("=== Page 4 ==="));

  console.log("\n[B2] Chunk pages (page-boundary safe, overlap, full coverage)");
  const chunks = chunkDocument(doc.pages);
  check("chunks created", chunks.length > 0, `count=${chunks.length}`);
  check(
    "sequential chunk_index across document",
    chunks.every((c, i) => c.chunk_index === i),
  );
  const reports: CoverageReport[] = verifyDocumentCoverage(
    doc.pages.map((p) => ({ pageNumber: p.pageNumber, text: p.text })),
    chunks,
  );
  check(
    "every page: complete char_start/char_end coverage with no uncovered gaps",
    reports.every((r) => r.is_complete && !r.has_gap),
    JSON.stringify(
      reports.map((r) => ({
        page: r.page_number,
        complete: r.is_complete,
        overlap: r.has_overlap,
        chunks: r.chunk_count,
      })),
    ),
  );
  check(
    "multi-chunk pages carry intentional overlap between consecutive chunks",
    reports.every((r) => r.chunk_count <= 1 || r.has_overlap),
    JSON.stringify(
      reports.filter((r) => r.chunk_count > 1).map((r) => ({
        page: r.page_number,
        overlap: r.has_overlap,
      })),
    ),
  );
  check(
    "chunks stay on their page (page-boundary safe, content matches slice)",
    chunks.every((c) => {
      const p = doc.pages.find((pg) => pg.pageNumber === c.page_number);
      return p !== undefined && c.char_end <= p.text.length && p.text.slice(c.char_start, c.char_end) === c.content;
    }),
  );

  console.log("\n=== Phase C: sign-up flow (real Supabase Auth) ===");

  const email = `e2etest${Date.now()}@gmail.com`;
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password: "TestPass123!",
  });
  if (signUpError) {
    check("sign up", false, signUpError.message + " (rate limit or email-confirm policy)");
  } else {
    check("sign up creates user", signUpData?.user?.email === email, email);
    const confirmed = signUpData?.session !== undefined;
    console.log(
      confirmed
        ? "NOTE: session returned (email confirm disabled)"
        : "NOTE: no session returned — project requires email confirmation before a valid session",
    );
  }

  console.log("\nNOTE: authenticated upload/search requires (1) the migration applied to the remote DB and");
  console.log("      (2) a confirmed user session (email confirm is enabled on this project).");

  finish();
}

const DENSE_PAGE_4_TEXT =
  "Operational security in cyber defense emphasizes limiting the exposure of critical infrastructure to adversaries. " +
  "Attackers perform reconnaissance to map the attack surface, identify misconfigured services, weak credentials, and unpatched software before attempting initial access. " +
  "Defenders counter this exposure by maintaining an up-to-date asset inventory, enforcing strict network segmentation, and continuously monitoring for anomalous traffic patterns. " +
  "Log aggregation and correlation allow security teams to detect lateral movement, privilege escalation, and data exfiltration attempts in near real time. " +
  "Incident response planning defines roles, communication channels, escalation paths, and forensic procedures so that a team can contain and eradicate an active threat quickly. " +
  "Post-incident reviews convert each breach or near-miss into concrete improvements such as new detection rules, tighter access controls, and updated training programs. " +
  "Zero-trust architecture extends this discipline to every workload by requiring continuous verification of identity, device posture, and least-privilege access for each request. " +
  "Regular tabletop exercises keep the organization aligned on these procedures without waiting for a real crisis to reveal gaps in coordination and decision making.";

function wrapLines(text: string, width: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    if (line && (line + " " + w).length > width) {
      lines.push(line);
      line = w;
    } else {
      line = line ? line + " " + w : w;
    }
  }
  if (line) lines.push(line);
  return lines;
}

async function makeTestPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page1 = doc.addPage([200, 200]);
  const page2 = doc.addPage([200, 200]);
  const page3 = doc.addPage([200, 200]);
  const page4 = doc.addPage([300, 400]);
  const font = await doc.embedFont(StandardFonts.Helvetica);

  page1.drawText("Cybersecurity Fundamentals", { x: 10, y: 180, size: 20, font });
  page1.drawText("Network security involves firewalls, encryption, and intrusion detection systems. Firewalls filter traffic between networks.", { x: 10, y: 140, size: 12, font });
  page1.drawText("Encryption transforms data into ciphertext using algorithms like AES and RSA. This protects data confidentiality.", { x: 10, y: 100, size: 12, font });
  page1.drawText("Authentication verifies user identity using passwords, tokens, or biometrics. Authorization determines what resources a user can access after authentication.", { x: 10, y: 60, size: 12, font });

  page2.drawText("Data representation uses bits and bytes. A byte contains 8 bits and can represent 256 distinct values.", { x: 10, y: 180, size: 12, font });
  page2.drawText("Binary numbers are base-2, using only 0 and 1. The number 255 in binary is 11111111.", { x: 10, y: 140, size: 12, font });
  page2.drawText("Hexadecimal is base-16, using 0-9 and A-F. It is useful for representing binary data compactly.", { x: 10, y: 100, size: 12, font });
  page2.drawText("ASCII maps characters to numbers. For example, the letter A is 65 in ASCII.", { x: 10, y: 60, size: 12, font });

  page3.drawText("Firewall types include packet filters, stateful firewalls, and application-level gateways.", { x: 10, y: 180, size: 12, font });
  page3.drawText("Packet filters examine headers and drop or forward packets based on rules.", { x: 10, y: 140, size: 12, font });
  page3.drawText("Stateful firewalls track active connections and make decisions based on connection state.", { x: 10, y: 100, size: 12, font });
  page3.drawText("Intrusion detection systems monitor network traffic for suspicious activity.", { x: 10, y: 60, size: 12, font });

  let y4 = 380;
  for (const line of wrapLines(DENSE_PAGE_4_TEXT, 70)) {
    page4.drawText(line, { x: 10, y: y4, size: 10, font });
    y4 -= 14;
  }

  return Buffer.from(await doc.save());
}

function finish() {
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n=== ${passed} passed, ${failed} failed ===`);
  process.exitCode = failed > 0 ? 1 : 0;
}

main().catch((err) => {
  console.error("E2E test error:", err);
  process.exitCode = 1;
});
