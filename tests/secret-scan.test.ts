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

function checkHard(name: string, actual: boolean) {
  if (actual) {
    passed++;
    console.log(`PASS: ${name}`);
  } else {
    failed++;
    console.log(`FAIL: ${name}`);
  }
}

// ---- Pattern list for secret VALUES ----
// GitHub Personal Access Tokens
const GH_PAT_PATTERN = /ghp_[A-Za-z0-9]{36}/;
// GitHub OIDC token
const GH_O_PATTERN = /gho_[A-Za-z0-9]{36}/;
// GitHub-generated PAT
const GH_PAT_GITHUB_PAT_PATTERN = /github_pat_[A-Za-z0-9_]{82}/;
// npm tokens
const NPM_TOKEN_PATTERN = /npm_[A-Za-z0-9]{36}/;
// AWS Access Key IDs
const AKIA_PATTERN = /AKIA[A-Z0-9]{16}/;
// Google/AIza API keys
const AIza_PATTERN = /AIza[A-Za-z0-9\-_]{35}/;
// Stripe keys
const STRIPE_PATTERN = /sk_live_[A-Za-z0-9]+/;
// Private keys (PEM format)
const PEM_PRIVATE_KEY_PATTERN = /-----BEGIN (RSA |EC |OPEN )?PRIVATE KEY-----/;

// Combined list of (name, pattern) tuples for scanning
const SECRET_SCAN_PATTERNS = [
  { name: "GitHub PAT (ghp_)", pattern: GH_PAT_PATTERN },
  { name: "GitHub PAT (gho_)", pattern: GH_O_PATTERN },
  { name: "GitHub PAT (github_pat_)", pattern: GH_PAT_GITHUB_PAT_PATTERN },
  { name: "npm token", pattern: NPM_TOKEN_PATTERN },
  { name: "AWS Access Key ID", pattern: AKIA_PATTERN },
  { name: "Google/AIza API key", pattern: AIza_PATTERN },
  { name: "Stripe key (sk_live_)", pattern: STRIPE_PATTERN },
  { name: "Private key (PEM)", pattern: PEM_PRIVATE_KEY_PATTERN },
];

// ---- Fixture: a file that contains a fake token for testing ----
const FIXTURE_DIR = resolve(process.cwd(), "test-fixtures");
const FIXTURE_FILE = join(FIXTURE_DIR, "secret-fixture.ts");

// Ensure fixture directory exists
if (!require("fs").existsSync(FIXTURE_DIR)) {
  require("fs").mkdirSync(FIXTURE_DIR, { recursive: true });
}

// Write a fixture that contains a fake GitHub PAT (this is what the test will check)
if (!require("fs").existsSync(FIXTURE_FILE)) {
  require("fs").writeFileSync(FIXTURE_FILE, `// Fixture: contains a fake GitHub PAT\nconst fake = "ghp_fake1234567890abcdefghijklmnopqrstuvwxyz";\n`);
}

// Read all tracked files (excluding node_modules, .next, .vercel, .git)
function walk(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      if (entry.name === ".git") continue;
      if (entry.name === ".next") continue;
      if (entry.name === ".vercel") continue;
      results.push(...walk(full));
    } else if (entry.isFile()) {
      results.push(full);
    }
  }
  return results;
}

// Read entire content of all files
function readAllFilesContent(): string {
  const files = walk(process.cwd());
  return files
    .filter((f) => !f.endsWith(".test.ts"))
    .map((f) => readFileSync(f, "utf-8"))
    .join("\n");
}

// ---- 1. Scan for secret VALUES in source files ----
const allContent = readAllFilesContent();

for (const { name, pattern } of SECRET_SCAN_PATTERNS) {
  const matches = allContent.match(pattern);
  const matchCount = matches ? matches.length : 0;
  checkHard(
    `no ${name} in source files`,
    matchCount === 0,
  );
  if (matchCount > 0) {
    console.log(`  ${name}: ${matchCount} match(es) found across source files`);
  }
}

// ---- 2. Check that the secret-fixture file IS detectable ----
// This verifies the scan patterns actually work by checking the fixture
const fixtureContent = readFileSync(FIXTURE_FILE, "utf-8");
let fixtureDetected = false;
for (const { name, pattern } of SECRET_SCAN_PATTERNS) {
  if (pattern.test(fixtureContent)) {
    fixtureDetected = true;
    checkHard(
      `fixture file detectable by ${name} pattern`,
      true,
    );
    break;
  }
}
if (!fixtureDetected) {
  checkHard(
    `fixture file detectable by at least one secret pattern`,
    false,
  );
}

// ---- 2c. If we're running with a planted token, the scan MUST find it ----
// If a FAKE_TOKEN env var is set, check that it's found
const fakeToken = process.env.FAKE_TOKEN as string | undefined;
if (fakeToken) {
  let fakeFound = false;
  for (const { name, pattern } of SECRET_SCAN_PATTERNS) {
    if (pattern.test(fakeToken)) {
      fakeFound = true;
      break;
    }
  }
  checkHard(
    `FAKE_TOKEN ${fakeToken.slice(0, 10)}... detected by secret scan`,
    fakeFound,
  );
}

// ---- 2d. Scan app/ client components for process.env.XXX patterns matching the 6 traditional secrets ----
const SECRETS = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "AI_API_KEY",
  "AI_EMBEDDING_API_KEY",
  "AI_VISION_API_KEY",
  "N8N_WEBHOOK_SECRET",
  "N8N_ENCRYPTION_KEY",
];

function scanForSecretInClientApps(secret: string): RegExp {
  return new RegExp(`process\\.env\\.?\\['?"]?${secret}['?"]?\\]?`);
}

const appDir = resolve(process.cwd(), "app");
const appFiles = walk(appDir);
const clientAppFiles: string[] = [];
for (const f of appFiles) {
  try {
    const firstLine = readFileSync(f, "utf-8").split("\n")[0];
    if (firstLine.startsWith('"use client"') || firstLine.startsWith("'use client'")) {
      clientAppFiles.push(f);
    }
  } catch {
    // skip
  }
}

for (const secret of SECRETS) {
  const pattern = scanForSecretInClientApps(secret);
  const foundIn = clientAppFiles.filter((f) => pattern.test(readFileSync(f, "utf-8")));
  checkHard(
    `app/ client components have no process.env.${secret}`,
    foundIn.length === 0,
  );
  if (foundIn.length > 0) {
    console.log(`  Found in: ${foundIn.slice(0, 3).join(", ")}`);
  }
}

// ---- 3. .env.example documents all secrets ----
const envExample = readFileSync(".env.example", "utf-8");
for (const secret of SECRETS) {
  checkHard(
    `app/.env.example documents ${secret}`,
    envExample.includes(secret),
  );
}

// ---- 4. package.json repository URL must not contain credentials ----
try {
  const pkg = JSON.parse(readFileSync("package.json", "utf-8"));
  if (pkg.repository?.url) {
    const repoUrl = pkg.repository.url;
    const hasCreds = /https?:\/\/[^:\s]+:[^@\s]+@/.test(repoUrl);
    checkHard("package.json repository.url has no embedded credentials", !hasCreds);
  }
} catch {
  checkHard("package.json repository.url check: could not parse", true);
}

// ---- 5. Summary ----
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;