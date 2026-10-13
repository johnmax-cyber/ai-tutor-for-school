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

const todayFocusCardPath = resolve(process.cwd(), "components/ui/TodayFocusCard.tsx");
const todayFocusCard = readFileSync(todayFocusCardPath, "utf-8");

check("TodayFocusCard component exists", true);
check("TodayFocusCard has topic prop", todayFocusCard.includes("topic:"));
check("TodayFocusCard has progress prop", todayFocusCard.includes("progress:"));
check("TodayFocusCard has timeEstimate prop", todayFocusCard.includes("timeEstimate:"));
check("TodayFocusCard renders progress bar", todayFocusCard.includes("bg-primary rounded-full"));
check("TodayFocusCard shows progress percentage", todayFocusCard.includes("progress}%"));
check("TodayFocusCard has start link", todayFocusCard.includes("href=\"/study\""));
check("TodayFocusCard uses Material Symbols icon", todayFocusCard.includes("material-symbols-outlined"));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
