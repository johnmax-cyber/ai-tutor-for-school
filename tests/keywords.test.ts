import { extractKeywords } from "../lib/tutor/keywords";

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

function equal<T>(actual: T, expected: T, name: string) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  check(name, ok);
  if (!ok) {
    console.log(`  Expected: ${JSON.stringify(expected)}`);
    console.log(`  Actual:   ${JSON.stringify(actual)}`);
  }
}

const r1 = extractKeywords("How does TCP differ from UDP?");
equal(r1.terms, ["tcp", "differ", "udp"], "tcp differ udp terms");
equal(r1.tsQuery, "tcp | differ:* | udp", "tcp differ udp tsQuery");

const r2 = extractKeywords("How many bits are in a byte?");
equal(r2.terms, ["many", "bits", "byte"], "many bits byte terms");
equal(r2.tsQuery, "many:* | bits:* | byte:*", "many bits byte tsQuery");

const r3 = extractKeywords("");
equal(r3.terms, [], "empty terms");
equal(r3.tsQuery, "", "empty tsQuery");

const r4 = extractKeywords("the is of");
equal(r4.terms, [], "stopwords only terms");
equal(r4.tsQuery, "", "stopwords only tsQuery");

const r5 = extractKeywords('What is "TCP/IP" & UDP|HTTP? (explain)');
equal(r5.terms, ["tcp", "ip", "udp", "http", "explain"], "punctuation terms");
check("no special chars in tsQuery", !/[&|()"':]/.test(r5.tsQuery));

const r6 = extractKeywords("A B C D E F G H I J K");
equal(r6.terms.length, 8, "max 8 terms");

const r7 = extractKeywords("Version 2.0 and v3");
equal(r7.terms, ["version", "2", "v3"], "numeric terms kept");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;