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

const achievementsListPath = resolve(process.cwd(), "components/ui/AchievementsList.tsx");
const achievementsList = readFileSync(achievementsListPath, "utf-8");

check("AchievementsList component exists", true);
check("AchievementsList accepts achievements prop", achievementsList.includes("achievements:"));
check("AchievementsList implements progressive disclosure", achievementsList.includes("slice(0, 3)"));
check("AchievementsList shows 'View all' when more exist", achievementsList.includes("View all achievements"));
check("AchievementsList renders icons", achievementsList.includes("material-symbols-outlined"));
check("AchievementsList renders date", achievementsList.includes("toLocaleDateString"));
check("AchievementsList has link to progress page", achievementsList.includes('href="/progress"'));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
