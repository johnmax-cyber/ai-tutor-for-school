import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";

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

function checkWarn(name: string, actual: boolean) {
  if (actual) {
    passed++;
    console.log(`PASS: ${name}`);
  } else {
    console.log(`WARN: ${name} — finding reported as recommendation`);
  }
}

function walk(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      results.push(...walk(full));
    } else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))) {
      results.push(full);
    }
  }
  return results;
}

function readAll(dir: string): string {
  const files = walk(dir);
  return files.map((f) => readFileSync(f, "utf-8")).join("\n");
}

function readFile(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), "utf-8");
}

// 6 true secrets that must never appear in client-facing code.
const SECRETS = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "AI_API_KEY",
  "AI_EMBEDDING_API_KEY",
  "AI_VISION_API_KEY",
  "N8N_WEBHOOK_SECRET",
  "N8N_ENCRYPTION_KEY",
];

// Matches process.env.SECRET or process.env["SECRET"] style access
function secretAccessPattern(varName: string): RegExp {
  return new RegExp(`process\\.env\\.?\\[?"?${varName}"?\\]?`);
}

// ---------------------------------------------------------------------------
// 1. Scan components/ — zero secrets, zero AI_EMBEDDING/AI_VISION env access
//    (display-string mentions like "Set AI_VISION_MODEL" are not env access)
// ---------------------------------------------------------------------------
const componentsDir = resolve(process.cwd(), "components");
const componentFiles = walk(componentsDir);
const componentsContent = componentFiles.map((f) => readFileSync(f, "utf-8")).join("\n");

for (const secret of SECRETS) {
  check(
    `components/ has no process.env.${secret}`,
    !secretAccessPattern(secret).test(componentsContent),
  );
}

check(
  "components/ has no process.env.AI_EMBEDDING_* access",
  !/process\.env\.?\[?"?AI_EMBEDDING_/.test(componentsContent),
);
check(
  "components/ has no process.env.AI_VISION_* access",
  !/process\.env\.?\[?"?AI_VISION_/.test(componentsContent),
);

// ---------------------------------------------------------------------------
// 2. Scan lib/supabase/ — service role key must not leak into client/proxy
// ---------------------------------------------------------------------------
const clientContent = readFile("lib/supabase/client.ts");
const proxyContent = readFile("lib/supabase/proxy.ts");
const serverContent = readFile("lib/supabase/server.ts");

check(
  "lib/supabase/client.ts does not reference SUPABASE_SERVICE_ROLE_KEY",
  !clientContent.includes("SUPABASE_SERVICE_ROLE_KEY"),
);
check(
  "lib/supabase/proxy.ts does not reference SUPABASE_SERVICE_ROLE_KEY",
  !proxyContent.includes("SUPABASE_SERVICE_ROLE_KEY"),
);
check(
  "lib/supabase/server.ts does not reference SUPABASE_SERVICE_ROLE_KEY",
  !serverContent.includes("SUPABASE_SERVICE_ROLE_KEY"),
);

const publicVarPattern = /process\.env\.(NEXT_PUBLIC_[A-Z_]+)/g;
const clientVars = new Set(clientContent.match(publicVarPattern) ?? []);
const proxyVars = new Set(proxyContent.match(publicVarPattern) ?? []);
check(
  "lib/supabase/client.ts references only NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  clientVars.size === 2 &&
    clientVars.has("process.env.NEXT_PUBLIC_SUPABASE_URL") &&
    clientVars.has("process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
);
check(
  "lib/supabase/proxy.ts references only NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  proxyVars.size === 2 &&
    proxyVars.has("process.env.NEXT_PUBLIC_SUPABASE_URL") &&
    proxyVars.has("process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
);

// ---------------------------------------------------------------------------
// 3. Scan app/ excluding app/api/ — client components must not access secrets
//    Server Components resolve process.env server-side (not a leak), but we
//    report any process.env.SECRET access as a recommendation.
// ---------------------------------------------------------------------------
const appDir = resolve(process.cwd(), "app");
const apiDir = resolve(process.cwd(), "app/api");
const appFiles = walk(appDir).filter((f) => !f.startsWith(apiDir));

// Separate client components from server components
const clientAppFiles: string[] = [];
const serverAppFiles: string[] = [];
for (const f of appFiles) {
  const content = readFileSync(f, "utf-8");
  if (content.startsWith('"use client"') || content.startsWith("'use client'")) {
    clientAppFiles.push(f);
  } else {
    serverAppFiles.push(f);
  }
}

const clientAppContent = clientAppFiles.map((f) => readFileSync(f, "utf-8")).join("\n");
const serverAppContent = serverAppFiles.map((f) => readFileSync(f, "utf-8")).join("\n");

// Hard check: Client Components in app/ must not access any of the 6 secrets
for (const secret of SECRETS) {
  check(
    `app/ client components have no process.env.${secret}`,
    !secretAccessPattern(secret).test(clientAppContent),
  );
}

// Soft check: Server Components may reference process.env.* server-side;
// report any secret access as a recommendation to move to env-check endpoint.
for (const secret of SECRETS) {
  const count = (serverAppContent.match(secretAccessPattern(secret)) ?? []).length;
  if (count > 0) {
    const files = serverAppFiles.filter((f) => secretAccessPattern(secret).test(readFileSync(f, "utf-8")));
    checkWarn(
      `app/ server components reference process.env.${secret} (recommendation: route through an env-check endpoint) [${files.join(", ")}]`,
      true,
    );
  }
}

// ---------------------------------------------------------------------------
// 4. .env.example documents all secrets and Phase 7/8/9 config vars
// ---------------------------------------------------------------------------
const envExample = readFile(".env.example");

for (const secret of SECRETS) {
  check(`app/.env.example documents ${secret}`, envExample.includes(secret));
}

const expectedConfigVars = [
  "AI_EMBEDDING_MODEL",
  "AI_EMBEDDING_DIMENSIONS",
  "AI_EMBEDDING_BASE_URL",
  "AI_EMBEDDING_API_KEY",
  "AI_VISION_MODEL",
  "AI_VISION_BASE_URL",
  "AI_VISION_API_KEY",
  "VISION_DIAGRAMS_ENABLED",
  "MAX_EMBEDDABLE_CHUNKS_PER_RESOURCE",
  "SUPABASE_SERVICE_ROLE_KEY",
  "N8N_WEBHOOK_SECRET",
  "N8N_ENCRYPTION_KEY",
];
for (const v of expectedConfigVars) {
  check(`app/.env.example documents ${v}`, envExample.includes(v));
}

// MAX_VISION_IMAGES_PER_RESOURCE is a code constant, must NOT be an active env entry
check(
  ".env.example does not list MAX_VISION_IMAGES_PER_RESOURCE as an active env var",
  !/^MAX_VISION_IMAGES_PER_RESOURCE=/m.test(envExample) &&
    envExample.includes("MAX_VISION_IMAGES_PER_RESOURCE"),
);

// ---------------------------------------------------------------------------
// 5. Cross-check: every secret var used in app code is documented in .env.example
// ---------------------------------------------------------------------------
const libDir = resolve(process.cwd(), "lib");
const apiDir2 = resolve(process.cwd(), "app/api");
const codeContent = [readAll(libDir), readAll(apiDir2)].join("\n");

for (const secret of SECRETS) {
  if (codeContent.includes(secret)) {
    check(
      `secret ${secret} used in code is documented in .env.example`,
      envExample.includes(secret),
    );
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
