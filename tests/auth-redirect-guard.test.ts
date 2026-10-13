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
      if (entry.name === ".next") continue;
      if (entry.name === ".vercel") continue;
      if (entry.name === ".kilo") continue;
      results.push(...walkDir(full));
    } else if (entry.isFile() && (entry.name.endsWith(".tsx") || entry.name.endsWith(".ts"))) {
      results.push(full);
    }
  }
  return results;
}

function relPath(fullPath: string): string {
  return relative(resolve(process.cwd(), "app"), fullPath);
}

// ---------------------------------------------------------------------------
// 1. Find all client components in app/ (pages, components, etc.)
// ---------------------------------------------------------------------------
const appDir = resolve(process.cwd(), "app");
const allAppFiles = walkDir(appDir).sort();

const clientFiles = allAppFiles.filter((f) => {
  const content = readFileSync(f, "utf-8");
  return content.startsWith('"use client"') || content.startsWith("'use client'");
});

const serverFiles = allAppFiles.filter((f) => {
  const content = readFileSync(f, "utf-8");
  return !content.startsWith('"use client"') && !content.startsWith("'use client'");
});

check(`found ${clientFiles.length} client components`, clientFiles.length > 0);
check(`found ${serverFiles.length} server components`, serverFiles.length > 0);

// ---------------------------------------------------------------------------
// 2. CLIENT COMPONENTS: must NOT import or call redirect() from next/navigation
//    They MUST use router.push() or router.replace() from useRouter()
//    The antipattern: redirect("/login") inside try/catch in useEffect/event handler
// ---------------------------------------------------------------------------
const redirectCallPattern = /\bredirect\s*\(\s*["']\/login["']\s*\)/;
const routerPushPattern = /router\.push\s*\(\s*["']\/login["']\s*\)/;
const routerReplacePattern = /router\.replace\s*\(\s*["']\/login["']\s*\)/;
const useRouterImportPattern = /useRouter/;

for (const file of clientFiles) {
  const content = readFileSync(file, "utf-8");
  const name = relPath(file);

  // Check for redirect("/login") call in client component
  const hasRedirectCall = redirectCallPattern.test(content);
  // Check for correct router.push("/login") or router.replace("/login")
  const hasRouterPush = routerPushPattern.test(content);
  const hasRouterReplace = routerReplacePattern.test(content);
  // Check for useRouter import
  const hasUseRouter = useRouterImportPattern.test(content);

  // Client components should NOT have redirect("/login") call
  check(`${name} has no redirect("/login") call in client code`, !hasRedirectCall);

  // If it has auth redirect logic, it should use router.push/replace
  if (hasRedirectCall) {
    check(`${name} uses router.push/replace instead of redirect()`, hasRouterPush || hasRouterReplace);
    check(`${name} imports useRouter for client navigation`, hasUseRouter);
  }
}

// ---------------------------------------------------------------------------
// 3. SERVER COMPONENT PAGES: redirect("/login") at top level is CORRECT
//    The antipattern is ONLY client-side redirect() inside try/catch
//    We verify server pages with auth gates use redirect() (not router.push)
// ---------------------------------------------------------------------------
const serverPages = serverFiles.filter((f) => f.endsWith("page.tsx"));
for (const file of serverPages) {
  const content = readFileSync(file, "utf-8");
  const name = relPath(file);

  // Check if it has auth gate with redirect
  const hasGetUser = /supabase\.auth\.getUser\(\)/.test(content);
  const hasRedirect = redirectCallPattern.test(content);

  if (hasGetUser && hasRedirect) {
    // Server page with auth gate should use redirect() - this is correct
    check(`${name} uses redirect("/login") at top level (correct server pattern)`, true);
  }
}

// ---------------------------------------------------------------------------
// 4. Specific known-fixed client pages: verify they use router.push
// ---------------------------------------------------------------------------
const fixedClientPages = [
  "page.tsx",           // app/page.tsx (dashboard)
  "practice/page.tsx",  // app/practice/page.tsx (just fixed)
  "library/page.tsx",
  "settings/page.tsx",
];

for (const page of fixedClientPages) {
  const file = resolve(process.cwd(), "app", page);
  try {
    const content = readFileSync(file, "utf-8");
    const hasRouterPush = routerPushPattern.test(content) || routerReplacePattern.test(content);
    const hasUseRouter = useRouterImportPattern.test(content);
    const hasRedirectCall = redirectCallPattern.test(content);

    check(`${page} uses router.push/replace for login redirect`, hasRouterPush);
    check(`${page} imports useRouter`, hasUseRouter);
    check(`${page} has no redirect() call`, !hasRedirectCall);
  } catch {
    check(`${page} exists and is readable`, false);
  }
}

// ---------------------------------------------------------------------------
// 5. Verify NO client component imports redirect from next/navigation
// ---------------------------------------------------------------------------
const redirectImportPattern = /import\s+.*\bredirect\b.*from\s+["']next\/navigation["']/;
const redirectDestructuredImport = /const\s+\{\s*redirect\s*\}\s*=\s*await\s+import\s*\(\s*["']next\/navigation["']\s*\)/;
const redirectAwaitImport = /await\s+import\s*\(\s*["']next\/navigation["']\s*\)\s*\.\s*then/;

for (const file of clientFiles) {
  const content = readFileSync(file, "utf-8");
  const name = relPath(file);

  const hasRedirectImport = redirectImportPattern.test(content);
  const hasRedirectDestructured = redirectDestructuredImport.test(content);
  const hasRedirectAwait = redirectAwaitImport.test(content);

  check(`${name} does not import redirect from next/navigation`, 
    !hasRedirectImport && !hasRedirectDestructured && !hasRedirectAwait);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;