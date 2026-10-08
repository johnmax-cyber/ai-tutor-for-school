import { readdirSync, readFileSync } from "node:fs";
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

function walkDir(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      results.push(...walkDir(full));
    } else if (entry.isFile() && entry.name.endsWith(".sql")) {
      results.push(full);
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Read all migration files
// ---------------------------------------------------------------------------
const migrationsDir = resolve(process.cwd(), "supabase/migrations");
const migrationFiles = walkDir(migrationsDir).sort();
const allSql = migrationFiles.map((f) => readFileSync(f, "utf-8")).join("\n");

// Extract table names from CREATE TABLE statements
const createTableRegex = /create\s+table\s+(?:if\s+not\s+exists\s+)?public\.(\w+)/gi;
const tableNames = new Set<string>();
let match: RegExpExecArray | null;
while ((match = createTableRegex.exec(allSql)) !== null) {
  tableNames.add(match[1]);
}

console.log(`\nFound ${tableNames.size} tables in local migrations:`);
for (const t of [...tableNames].sort()) {
  console.log(`  - ${t}`);
}

// ---------------------------------------------------------------------------
// Check each table has row level security enabled
// ---------------------------------------------------------------------------
const rlsRegex = /alter\s+table\s+public\.(\w+)\s+enable\s+row\s+level\s+security/gi;
const tablesWithRls = new Set<string>();
while ((match = rlsRegex.exec(allSql)) !== null) {
  tablesWithRls.add(match[1]);
}

for (const table of [...tableNames].sort()) {
  if (tablesWithRls.has(table)) {
    check(`table ${table} has RLS enabled`, true);
  } else {
    check(`table ${table} has RLS enabled`, false);
  }
}

// ---------------------------------------------------------------------------
// embedding_usage_log must have auth.uid() = user_id in a policy
// ---------------------------------------------------------------------------
const embeddingPolicyMatch = allSql.match(
  /create table if not exists public\.embedding_usage_log[\s\S]*?create policy[\s\S]*?auth\.uid\(\)\s*=\s*user_id/i,
);
check(
  "embedding_usage_log has auth.uid() = user_id in a read policy",
  !!embeddingPolicyMatch,
);
check(
  "embedding_usage_log has auth.uid() = user_id in policies (whole file)",
  allSql.includes("auth.uid() = user_id"),
);

// ---------------------------------------------------------------------------
// resource_chunks must have auth.uid() = user_id in a policy
// ---------------------------------------------------------------------------
const resourceChunksPolicyMatch = allSql.match(
  /create table if not exists public\.resource_chunks[\s\S]*?create policy[\s\S]*?auth\.uid\(\)\s*=\s*user_id/i,
);
check(
  "resource_chunks has auth.uid() = user_id in a policy",
  !!resourceChunksPolicyMatch,
);

// ---------------------------------------------------------------------------
// resources table is NOT created in local migrations (remote Supabase table)
// ---------------------------------------------------------------------------
check(
  "resources table is NOT created in local migrations (flagged for manual review)",
  !tableNames.has("resources"),
);
console.log(
  `  -> resources table has owner policies in remote Supabase (Phase 2), not in local migrations. Manual policy review required.`,
);

// ---------------------------------------------------------------------------
// Summary: report tables without RLS
// ---------------------------------------------------------------------------
const tablesWithoutRls = [...tableNames].filter((t) => !tablesWithRls.has(t));
if (tablesWithoutRls.length > 0) {
  console.log(`\nTables WITHOUT RLS in local migrations: ${tablesWithoutRls.join(", ")}`);
} else {
  console.log(`\nAll ${tableNames.size} local tables have RLS enabled.`);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
