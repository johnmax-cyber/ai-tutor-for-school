import type { SupabaseClient } from "@supabase/supabase-js";
import { createMockSupabase } from "./supabase-mock";
import {
  validateN8nWebhook,
  verifyUserExists,
  verifyResourceOwnership,
  isPreferenceEnabled,
  retryProcessingSchema,
  webhookBaseSchema,
} from "../lib/automation/auth";

type Row = Record<string, unknown>;

const TEST_SECRET = "test-n8n-secret-123";
const VALID_USER = "550e8400-e29b-41d4-a716-446655440000";
const VALID_RESOURCE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

function makeRequest(headers: Record<string, string> = {}): Request {
  const h = new Headers();
  for (const [k, v] of Object.entries(headers)) {
    h.set(k, v);
  }
  return new Request("https://webhook.example.com", { method: "POST", headers: h });
}

interface MockOptions {
  resources?: Row[];
  userPreferences?: Row[];
  userExists?: boolean;
}

function makeMock(opts: MockOptions): SupabaseClient {
  const base = createMockSupabase({
    resources: opts.resources ?? [],
    user_preferences: opts.userPreferences ?? [],
  });

  return {
    ...base,
    auth: {
      getUser: base.auth.getUser,
      admin: {
        getUserById: (uid: string) =>
          Promise.resolve({
            data: { user: opts.userExists === false ? null : { id: uid } },
            error:
              opts.userExists === false
                ? { message: "User not found", code: "PGRST116" }
                : null,
          }),
      },
    },
  } as unknown as SupabaseClient;
}

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

function setupSecret(value: string | undefined) {
  if (value === undefined) {
    delete process.env.N8N_WEBHOOK_SECRET;
  } else {
    process.env.N8N_WEBHOOK_SECRET = value;
  }
}

// ---- validateN8nWebhook (synchronous) ----

console.log("\n=== validateN8nWebhook ===");
setupSecret(TEST_SECRET);

check(
  "valid secret is accepted",
  validateN8nWebhook(makeRequest({ "x-n8n-webhook-secret": TEST_SECRET })).valid === true,
);
check(
  "missing header is rejected",
  validateN8nWebhook(makeRequest()).valid === false,
);
check(
  "wrong secret is rejected",
  validateN8nWebhook(makeRequest({ "x-n8n-webhook-secret": "wrong" })).valid === false,
);
check(
  "mismatched length is rejected",
  validateN8nWebhook(makeRequest({ "x-n8n-webhook-secret": "sho-rt" })).valid === false,
);
check(
  "never throws when env unset, returns invalid",
  (() => {
    setupSecret(undefined);
    const res = validateN8nWebhook(makeRequest({ "x-n8n-webhook-secret": TEST_SECRET }));
    setupSecret(TEST_SECRET);
    return res.valid === false;
  })(),
);
check(
  "does not throw on garbage header",
  (() => {
    setupSecret(TEST_SECRET);
    let threw = false;
    try {
      validateN8nWebhook(makeRequest({ "x-n8n-webhook-secret": "x".repeat(200) }));
    } catch {
      threw = true;
    }
    return !threw;
  })(),
);

async function runTests() {
  // ---- verifyUserExists ----

  console.log("\n=== verifyUserExists ===");
  {
    const supabase = makeMock({ userExists: true });
    check("existing user returns true", await verifyUserExists(supabase, VALID_USER) === true);

    const missing = makeMock({ userExists: false });
    check("missing user returns false", await verifyUserExists(missing, VALID_USER) === false);
  }

  // ---- verifyResourceOwnership ----

  console.log("\n=== verifyResourceOwnership ===");
  {
    const ownedResource = {
      id: VALID_RESOURCE,
      user_id: VALID_USER,
      title: "Owned PDF",
      status: "ready",
      storage_path: "study-pdfs/u1/doc.pdf",
    };
    const otherResource = {
      id: "6ba7b810-9dad-11d1-80b4-00c04fd430c9",
      user_id: "other-user",
      title: "Other PDF",
      status: "ready",
      storage_path: "study-pdfs/u2/other.pdf",
    };
    const supabase = makeMock({ resources: [ownedResource, otherResource] });

    const owned = await verifyResourceOwnership(supabase, VALID_USER, VALID_RESOURCE);
    check("owned resource is returned", !!owned);
    check("owned resource has title", owned?.title === "Owned PDF");

    const notOwned = await verifyResourceOwnership(
      supabase,
      "some-other-user",
      "6ba7b810-9dad-11d1-80b4-00c04fd430c9",
    );
    check("non-owned resource returns null", notOwned === null);

    const missing = await verifyResourceOwnership(supabase, VALID_USER, "nonexistent-id");
    check("missing resource returns null", missing === null);
  }

  // ---- isPreferenceEnabled ----

  console.log("\n=== isPreferenceEnabled ===");
  {
    const enabled = makeMock({
      userPreferences: [{ user_id: VALID_USER, processing_retry_enabled: false }],
    });
    check(
      "explicit false returns false",
      await isPreferenceEnabled(enabled, VALID_USER, "processing_retry_enabled", true) === false,
    );

    const disabled = makeMock({
      userPreferences: [{ user_id: VALID_USER, processing_retry_enabled: true }],
    });
    check(
      "explicit true returns true",
      await isPreferenceEnabled(disabled, VALID_USER, "processing_retry_enabled", true) === true,
    );

    const missing = makeMock({ userPreferences: [] });
    check(
      "missing row defaults true",
      await isPreferenceEnabled(missing, VALID_USER, "processing_retry_enabled", true) === true,
    );

    check(
      "missing row respects default false",
      await isPreferenceEnabled(missing, VALID_USER, "processing_retry_enabled", false) === false,
    );
  }

  // ---- Zod body schemas ----

  console.log("\n=== webhook body schemas ===");
  {
    const good = retryProcessingSchema.safeParse({
      userId: VALID_USER,
      resourceId: VALID_RESOURCE,
    });
    check("retry-processing accepts valid body", good.success === true);

    const missingResource = retryProcessingSchema.safeParse({ userId: VALID_USER });
    check("retry-processing rejects missing resourceId", missingResource.success === false);

    const badUser = retryProcessingSchema.safeParse({
      userId: "not-a-uuid",
      resourceId: VALID_RESOURCE,
    });
    check("retry-processing rejects invalid userId", badUser.success === false);

    const badResource = retryProcessingSchema.safeParse({
      userId: VALID_USER,
      resourceId: "nope",
    });
    check("retry-processing rejects invalid resourceId", badResource.success === false);

    const noBody = retryProcessingSchema.safeParse({});
    check("retry-processing rejects empty body", noBody.success === false);
  }

  {
    const good = webhookBaseSchema.safeParse({ userId: VALID_USER });
    check("base schema accepts valid userId", good.success === true);

    const goodWithResource = webhookBaseSchema.safeParse({
      userId: VALID_USER,
      resourceId: VALID_RESOURCE,
    });
    check("base schema accepts optional resourceId", goodWithResource.success === true);

    const bad = webhookBaseSchema.safeParse({ userId: "bad", resourceId: VALID_RESOURCE });
    check("base schema rejects invalid userId", bad.success === false);
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

runTests().catch((err) => {
  console.error("Test runner error:", err);
  process.exitCode = 1;
});
