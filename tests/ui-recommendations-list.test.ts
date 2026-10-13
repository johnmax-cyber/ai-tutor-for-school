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

const recommendationsListPath = resolve(process.cwd(), "components/ui/RecommendationsList.tsx");
const recommendationsList = readFileSync(recommendationsListPath, "utf-8");

check("RecommendationsList component exists", true);
check("RecommendationsList accepts recommendations prop", recommendationsList.includes("recommendations:"));
check("RecommendationsList implements progressive disclosure", recommendationsList.includes("slice(0, 3)"));
check("RecommendationsList shows 'View all' when more exist", recommendationsList.includes("View all recommendations"));
check("RecommendationsList renders icons", recommendationsList.includes("material-symbols-outlined"));
check("RecommendationsList maps recommendation types to icons", recommendationsList.includes("review_mistake") && recommendationsList.includes("repeat"));
check("RecommendationsList renders action link", recommendationsList.includes("actionLink"));
check("RecommendationsList shows estimated time", recommendationsList.includes("estimatedTime"));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
