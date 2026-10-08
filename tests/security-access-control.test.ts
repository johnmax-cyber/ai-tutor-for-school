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

function warn(name: string, actual: boolean, detail: string) {
  if (actual) {
    passed++;
    console.log(`PASS: ${name}`);
  } else {
    console.log(`WARN: ${name} — ${detail}`);
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

function hasUserIdFilter(content: string): boolean {
  return content.includes('.eq("user_id"') || content.includes(".eq('user_id'");
}

function hasOwnershipCheck(content: string): boolean {
  if (content.includes("verifyResourceOwnership")) return true;
  if (hasUserIdFilter(content)) return true;
  // Service-layer ownership: userId passed as an argument to any method
  if (/\(\s*userId/.test(content) || /,\s*userId/.test(content)) return true;
  if (content.includes(".rpc('") || content.includes('.rpc("')) return true;
  if (content.includes("search_resource_chunks")) return true;
  return false;
}

const allRoutes = walkDir(resolve(process.cwd(), "app/api")).sort();
const webhookRoutes = allRoutes.filter((f) => relPath(f).includes("webhooks/n8n/"));
const regularRoutes = allRoutes.filter(
  (f) => !relPath(f).includes("webhooks/n8n/") && relPath(f) !== "api/embedding-status/route.ts",
);

// ---------------------------------------------------------------------------
// 1. Webhook routes: validateN8nWebhook must be called before any DB access
// ---------------------------------------------------------------------------
for (const file of webhookRoutes) {
  const content = readFileSync(file, "utf-8");
  const name = relPath(file);

  check(
    `${name} imports validateN8nWebhook from lib/automation/auth`,
    (content.includes('from "@/lib/automation/auth"') || content.includes("from '@/lib/automation/auth'")) &&
      content.includes("validateN8nWebhook"),
  );

  const webhookIdx = content.indexOf("validateN8nWebhook(");
  const dbIdx = content.indexOf("createServiceSupabase(");

  check(`${name} calls validateN8nWebhook before DB access`, webhookIdx !== -1 && webhookIdx < dbIdx);
  check(`${name} calls verifyUserExists after auth`, content.includes("verifyUserExists"));
  check(`${name} calls verifyResourceOwnership when resourceId present`, content.includes("verifyResourceOwnership"));
}

// ---------------------------------------------------------------------------
// 2. Regular routes with [id] / [sessionId] path params: ownership check
// ---------------------------------------------------------------------------
const idParamRoutes = regularRoutes.filter((f) => /\[(id|sessionId)\]/.test(relPath(f)));

for (const file of idParamRoutes) {
  const content = readFileSync(file, "utf-8");
  const name = relPath(file);

  if (hasOwnershipCheck(content)) {
    check(`${name} has ownership check for path param`, true);
  } else {
    warn(
      `${name} lacks explicit ownership check for path param`,
      false,
      `No verifyResourceOwnership, .eq("user_id"), service(userId,...) call, or RPC with auth.uid(). Route may rely on RLS only.`,
    );
  }
}

// ---------------------------------------------------------------------------
// 3. Routes accepting resourceId or imageResourceId in body
// ---------------------------------------------------------------------------
const resourceIdBodyRoutes = regularRoutes.filter((f) => {
  const content = readFileSync(f, "utf-8");
  return content.includes("resourceId") || content.includes("imageResourceId");
});

for (const file of resourceIdBodyRoutes) {
  const content = readFileSync(file, "utf-8");
  const name = relPath(file);

  if (hasOwnershipCheck(content)) {
    check(`${name} has ownership check for resourceId body field`, true);
  } else {
    warn(
      `${name} lacks ownership check for resourceId body field`,
      false,
      `No verifyResourceOwnership or .eq("user_id") check found for user-scoped resourceId.`,
    );
  }

  if (content.includes("imageResourceId")) {
    check(
      `${name} checks imageResourceId ownership via verifyResourceOwnership or .eq("user_id")`,
      content.includes("verifyResourceOwnership") || hasUserIdFilter(content),
    );
  }
}

// ---------------------------------------------------------------------------
// 4. Routes accepting topicId/sessionId query params — verify service scoping
// ---------------------------------------------------------------------------
for (const file of regularRoutes) {
  const content = readFileSync(file, "utf-8");
  const name = relPath(file);

  if ((content.includes("topicId") || content.includes("sessionId")) && !hasOwnershipCheck(content)) {
    warn(
      `${name} accepts user-scoped topicId/sessionId but lacks ownership check`,
      false,
      `No ownership verification pattern detected. Verify the service layer enforces user_id scoping.`,
    );
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
