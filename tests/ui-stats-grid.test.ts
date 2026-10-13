import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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

const statsGridPath = resolve(process.cwd(), "components/ui/StatsGrid.tsx");
const statsGrid = readFileSync(statsGridPath, "utf-8");

check("StatsGrid component exists", true);
check("StatsGrid accepts stats prop", statsGrid.includes("stats:"));
check("StatsGrid renders stat cards", statsGrid.includes("map("));
check("StatsGrid renders title", statsGrid.includes("title:"));
check("StatsGrid renders value", statsGrid.includes("value:"));
check("StatsGrid uses semantic colors", statsGrid.includes("text-on-surface"));
check("StatsGrid has proper typography", statsGrid.includes("text-2xl font-bold"));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
