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
import { retrieveChunks } from "../lib/tutor/retrieve";
import type { RetrievedChunk } from "../lib/tutor/retrieve";
import goldenCases from "./tutor-golden.json";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const testEmail = process.env.TEST_EMAIL!;
const testPassword = process.env.TEST_PASSWORD!;

const results: Array<{ name: string; pass: boolean; detail?: string }> = [];

function check(name: string, pass: boolean, detail?: string) {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}: ${name}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  const supabase = createClient(url, publishableKey);

  console.log("=== Sign in with test account ===");
  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email: testEmail,
    password: testPassword,
  });

  if (signInError || !signInData.session) {
    check("sign in", false, signInError?.message ?? "no session");
    finish();
    return;
  }
  check("sign in", true, `user: ${signInData.user?.email}`);

  const session = signInData.session;
  const authedSupabase = createClient(url, publishableKey, {
    global: { headers: { Authorization: `Bearer ${session.access_token}` } },
  });

  console.log("\n=== Golden retrieval tests ===");
  for (const tc of goldenCases) {
    const question = tc.question;
    const expectedPage = tc.expectedPage;

    // Call retrieveChunks - we need to simulate the server-side call with the authed client
    // retrieveChunks uses the server client, so we'll call the RPC directly
    const { data: chunks, error } = await authedSupabase.rpc("search_resource_chunks", {
      p_query: question,
      p_limit: 12,
      p_resource_id: null,
    });

    if (error) {
      check(`"${question}"`, false, `RPC error: ${error.message}`);
      continue;
    }

    const retrievedChunks = (chunks ?? []) as RetrievedChunk[];
    const top5Pages = retrievedChunks.slice(0, 5).map((c) => c.page_number);
    const found = top5Pages.includes(expectedPage);

    check(
      `"${question}" -> page ${expectedPage} in top 5`,
      found,
      found ? `pages: [${top5Pages.join(", ")}]` : `pages: [${top5Pages.join(", ")}], expected ${expectedPage}`
    );
  }

  finish();
}

function finish() {
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n=== ${passed} passed, ${failed} failed ===`);
  process.exitCode = failed > 0 ? 1 : 0;
}

main().catch((err) => {
  console.error("Golden test error:", err);
  process.exitCode = 1;
});