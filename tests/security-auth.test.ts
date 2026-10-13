import { readdirSync, readFileSync } from "node:fs";
import { resolve, join, relative } from "node:path";

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

function walkDir(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      results.push(...walkDir(full));
    } else if (entry.isFile() && entry.name === "route.ts") {
      results.push(full);
    }
  }
  return results;
}

function relPath(fullPath: string): string {
  return relative(resolve(process.cwd(), "app"), fullPath);
}

// ---------------------------------------------------------------------------
// Find all API route files (25 routes)
// ---------------------------------------------------------------------------
const apiDir = resolve(process.cwd(), "app/api");
const allRoutes = walkDir(apiDir).sort();

const webhookRoutes = allRoutes.filter((f) => relPath(f).includes("webhooks/n8n/"));
const publicRoute = allRoutes.filter((f) => relPath(f) === "api/embedding-status/route.ts");
const regularRoutes = allRoutes.filter(
  (f) => !relPath(f).includes("webhooks/n8n/") && relPath(f) !== "api/embedding-status/route.ts",
);

check("total API routes == 26", allRoutes.length === 26);
check("webhook routes == 5", webhookRoutes.length === 5);
check("public routes == 1", publicRoute.length === 1);
check("regular routes == 20", regularRoutes.length === 20);

// ---------------------------------------------------------------------------
// Webhook routes: must call validateN8nWebhook
// ---------------------------------------------------------------------------
for (const file of webhookRoutes) {
  const content = readFileSync(file, "utf-8");
  const name = relPath(file);
  check(`${name} calls validateN8nWebhook`, /validateN8nWebhook\s*\(/.test(content));
  check(`${name} imports from lib/automation/auth`, /from ["']@\/lib\/automation\/auth["']/.test(content));
}

// ---------------------------------------------------------------------------
// Regular routes: must have supabase.auth.getUser() auth gate
// ---------------------------------------------------------------------------
for (const file of regularRoutes) {
  const content = readFileSync(file, "utf-8");
  const name = relPath(file);
  check(`${name} has getUser() auth gate`, /supabase\.auth\.getUser\(\)/.test(content));
}

// ---------------------------------------------------------------------------
// Public route (embedding-status): must NOT have getUser()
// ---------------------------------------------------------------------------
for (const file of publicRoute) {
  const content = readFileSync(file, "utf-8");
  const name = relPath(file);
  check(
    `${name} is intentionally public (no getUser())`,
    !/supabase\.auth\.getUser\(\)/.test(content),
  );
}

// ---------------------------------------------------------------------------
// Dashboard: must redirect unauthenticated users
// ---------------------------------------------------------------------------
const dashboardPath = resolve(process.cwd(), "app/dashboard/page.tsx");
const dashboardContent = readFileSync(dashboardPath, "utf-8");
check("app/dashboard/page.tsx has getUser()", /supabase\.auth\.getUser\(\)/.test(dashboardContent));
check(
  "app/dashboard/page.tsx redirects unauth to /login",
  /redirect\(\s*["']\/login["']\s*\)/.test(dashboardContent),
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
