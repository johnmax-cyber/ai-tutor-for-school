import { readFileSync, readdirSync } from "fs";
import { join } from "path";

function parseMigrations(): string {
  const migrationsDir = join(process.cwd(), "supabase", "migrations");
  const files = readdirSync(migrationsDir).filter(f => f.endsWith(".sql")).sort();
  const contents: string[] = [];
  for (const f of files) {
    contents.push(readFileSync(join(migrationsDir, f), "utf8"));
  }
  return contents.join("\n\n");
}

function findTableReferences(): Set<string> {
  const libDir = join(process.cwd(), "lib");
  const apiDir = join(process.cwd(), "app", "api");
  const tables = new Set<string>();
  const pattern = /\.from\(["']([a-zA-Z_][a-zA-Z0-9_.]*)["']/g;

  function walk(dir: string) {
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const e of entries) {
        if (e.isDirectory()) {
          walk(join(dir, e.name));
        } else if (e.isFile() && e.name.endsWith(".ts")) {
          const content = readFileSync(join(dir, e.name), "utf8");
          let m;
          while ((m = pattern.exec(content)) !== null) {
            tables.add(m[1]);
          }
        }
      }
    } catch {
      // ignore
    }
  }

  walk(libDir);
  walk(apiDir);
  return tables;
}

function assertRlsForTables(tables: Set<string>, migrationsContent: string) {
  const errors: string[] = [];
  for (const table of tables) {
    // Normalize to just table name
    const tableName = table.includes(".") ? table.split(".").pop()! : table;
    const fullyQualified = table.includes(".") ? table : `public.${tableName}`;

    // Check if there is enable row level security for this table
    const enableRlsPattern = new RegExp(`alter\\s+table\\s+${fullyQualified.replace(".", "\\.")}\\s+enable\\s+row\\s+level\\s+security`, "i");
    const hasEnableRls = enableRlsPattern.test(migrationsContent);

    // Check if there is at least one policy on this table
    const policyPattern = new RegExp(`create\\s+policy\\s+[^;]+\\s+on\\s+${fullyQualified.replace(".", "\\.")}`, "i");
    const hasPolicy = policyPattern.test(migrationsContent);

    if (!hasEnableRls || !hasPolicy) {
      errors.push(`Missing RLS or policy for table ${fullyQualified} (referenced as ${table})`);
    }
  }

  if (errors.length > 0) {
    throw new Error("RLS policy assertion failed:\n" + errors.join("\n"));
  }
}

function run() {
  const tables = findTableReferences();
  const migrations = parseMigrations();
  assertRlsForTables(tables, migrations);
  console.log("PASS: all referenced tables have RLS policies");
}

try {
  run();
  console.log("PASS: security-db-policies");
  process.exit(0);
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
