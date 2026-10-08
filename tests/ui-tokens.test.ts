import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buttonClasses } from "../components/ui/button";

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

// Design tokens
const cssPath = resolve(process.cwd(), "app/globals.css");
const css = readFileSync(cssPath, "utf-8");

const requiredTokens = [
  "--background",
  "--foreground",
  "--surface",
  "--surface-container",
  "--surface-container-low",
  "--surface-container-high",
  "--border",
  "--border-strong",
  "--focus-ring",
  "--ds-primary",
  "--ds-secondary",
  "--ds-accent",
  "--ds-success",
  "--ds-warning",
  "--ds-error",
  "--ds-on-primary",
  "--ds-on-error",
  "--ds-on-success",
  "--ds-on-warning",
];

check("--color-warning is NOT circular", !/color-warning:\s*var\(--color-warning\)/.test(css));

for (const token of requiredTokens) {
  check(`globals.css defines ${token}`, css.includes(`${token}:`));
}

check(
  "globals.css defines dark (root) and light (.light) variants",
  css.includes(":root") && css.includes(".light"),
);

check("globals.css defines font-sans", css.includes("--font-sans"));
check("globals.css defines type-display class", css.includes(".type-display"));
check("globals.css defines focus ring utility", css.includes(".focus-ring"));

// Button primitives
check(
  "buttonClasses includes base focus ring",
  buttonClasses("primary", "md").includes("focus-visible:ring-2"),
);

check(
  "buttonClasses primary has bg-primary",
  buttonClasses("primary", "md").includes("bg-primary"),
);

check(
  "buttonClasses secondary has bg-secondary",
  buttonClasses("secondary", "md").includes("bg-secondary"),
);

check(
  "buttonClasses outline is transparent",
  buttonClasses("outline", "md").includes("bg-transparent"),
);

check(
  "buttonClasses ghost has no bg fill",
  buttonClasses("ghost", "md").includes("bg-transparent"),
);

check(
  "buttonClasses size sm has h-8",
  buttonClasses("primary", "sm").includes("h-8"),
);

check(
  "buttonClasses size lg has h-12",
  buttonClasses("primary", "lg").includes("h-12"),
);

check(
  "buttonClasses size icon has w-9",
  buttonClasses("primary", "icon").includes("w-9"),
);

check(
  "buttonClasses destructive has bg-error",
  buttonClasses("destructive", "md").includes("bg-error"),
);

check(
  "buttonClasses success has bg-success",
  buttonClasses("success", "md").includes("bg-success"),
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
