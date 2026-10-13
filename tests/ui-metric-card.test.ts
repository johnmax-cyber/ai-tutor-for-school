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

const cssPath = resolve(process.cwd(), "app/globals.css");
const css = readFileSync(cssPath, "utf-8");

const metricCardPath = resolve(process.cwd(), "components/ui/MetricCard.tsx");
const metricCard = readFileSync(metricCardPath, "utf-8");

check("MetricCard component exists", true);

check("MetricCard has title prop", metricCard.includes("title:"));
check("MetricCard has value prop", metricCard.includes("value:"));
check("MetricCard has icon prop", metricCard.includes("icon:"));
check("MetricCard has color prop", metricCard.includes("color?"));
check("MetricCard uses color variants", metricCard.includes("colorClasses"));
check("MetricCard renders icon", metricCard.includes("material-symbols-outlined"));
check("MetricCard extracts text color from classes", metricCard.includes("classes.split(' ')[1]"));

// CSS has enhanced button/card classes
check("CSS has .btn-primary class", css.includes(".btn-primary"));
check("CSS has .btn-secondary class", css.includes(".btn-secondary"));
check("CSS has .card-base class", css.includes(".card-base"));
check("CSS has .card-elevated class", css.includes(".card-elevated"));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
