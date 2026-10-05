import { mapProviderError } from "../lib/ai/client";
import { AIError } from "../lib/ai/types";

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

function checkType(err: unknown, expectedType: AIError["type"], name: string) {
  const ok = err instanceof AIError && err.type === expectedType;
  check(name, ok);
  if (!ok) {
    console.log(`  Expected type: ${expectedType}`);
    console.log(`  Actual: ${err instanceof AIError ? err.type : typeof err}`);
  }
}

// Create mock OpenAI errors for different status codes
const makeOpenAIError = (status: number, message: string) => {
  const err = new Error(message) as unknown as Record<string, unknown>;
  err.status = status;
  return err;
};

checkType(mapProviderError(makeOpenAIError(401, "Unauthorized")), "auth", "401 -> auth");
checkType(mapProviderError(makeOpenAIError(403, "Forbidden")), "auth", "403 -> auth");
checkType(mapProviderError(makeOpenAIError(429, "Rate limited")), "rate_limit", "429 -> rate_limit");
checkType(mapProviderError(makeOpenAIError(400, "Bad request")), "bad_request", "400 -> bad_request");
checkType(mapProviderError(makeOpenAIError(500, "Internal error")), "unavailable", "500 -> unavailable");
checkType(mapProviderError(makeOpenAIError(503, "Service unavailable")), "unavailable", "503 -> unavailable");
checkType(mapProviderError(makeOpenAIError(504, "Gateway timeout")), "unavailable", "504 -> unavailable");

// Network/timeout errors
const timeoutErr = new Error("ETIMEDOUT");
checkType(mapProviderError(timeoutErr), "unavailable", "timeout -> unavailable");

const networkErr = new Error("fetch failed");
checkType(mapProviderError(networkErr), "unavailable", "network -> unavailable");

const connResetErr = new Error("ECONNRESET");
checkType(mapProviderError(connResetErr), "unavailable", "ECONNRESET -> unavailable");

// Unknown error defaults to unavailable
checkType(mapProviderError(new Error("unknown")), "unavailable", "unknown -> unavailable");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;