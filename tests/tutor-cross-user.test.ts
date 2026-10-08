import { createMockSupabase } from "./supabase-mock";
import {
  verifyResourceOwnership,
} from "../lib/automation/auth";

let passed = 0;
let failed = 0;

function check(name: string, actual: boolean, detail?: string) {
  if (actual) {
    passed++;
    console.log(`PASS: ${name}`);
  } else {
    failed++;
    console.log(`FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const USER_A = "user-a-id";
const USER_B = "user-b-id";
const RESOURCE_A = "res-a-id";
const RESOURCE_B = "res-b-id";

async function main() {
  // --- Cross-user: verifyResourceOwnership ---
  console.log("\n=== verifyResourceOwnership cross-user ===");
  {
    const resourceA = {
      id: RESOURCE_A,
      user_id: USER_A,
      title: "Doc A",
      status: "ready",
      storage_path: "study-pdfs/u1/a.pdf",
      mime_type: "application/pdf",
    };
    const resourceB = {
      id: RESOURCE_B,
      user_id: USER_B,
      title: "Doc B",
      status: "ready",
      storage_path: "study-pdfs/u2/b.pdf",
      mime_type: "application/pdf",
    };
    const supabase = createMockSupabase({
      resources: [resourceA, resourceB],
    });

    check("owner can fetch own resource", (await verifyResourceOwnership(supabase, USER_A, RESOURCE_A)) !== null);
    check("owner B can fetch own resource", (await verifyResourceOwnership(supabase, USER_B, RESOURCE_B)) !== null);
    check("user A cannot fetch user B resource", await verifyResourceOwnership(supabase, USER_A, RESOURCE_B) === null);
    check("user B cannot fetch user A resource", await verifyResourceOwnership(supabase, USER_B, RESOURCE_A) === null);
    check("missing resource returns null", await verifyResourceOwnership(supabase, USER_A, "nonexistent") === null);
  }

  // --- Cross-user: tutor route resource ownership query pattern ---
  console.log("\n=== tutor route resource ownership query pattern ===");
  {
    const imgResourceA = {
      id: RESOURCE_A,
      user_id: USER_A,
      title: "Image Doc A",
      status: "ready",
      mime_type: "image/png",
    };
    const imgResourceB = {
      id: RESOURCE_B,
      user_id: USER_B,
      title: "Image Doc B",
      status: "ready",
      mime_type: "image/png",
    };
    const supabase = createMockSupabase({
      resources: [imgResourceA, imgResourceB],
    });

    // Simulate the tutor route's inline check for imageResourceId:
    // .from("resources").select("id, mime_type, status").eq("id", imageResourceId).eq("user_id", userId).single()
    async function fetchImageResource(userId: string, imageResourceId: string) {
      const { data, error } = await supabase
        .from("resources")
        .select("id, mime_type, status")
        .eq("id", imageResourceId)
        .eq("user_id", userId)
        .single();
      return { data, error };
    }

    const own = await fetchImageResource(USER_A, RESOURCE_A);
    check("user A sees own image resource", own.data !== null && own.data !== undefined);

    const cross = await fetchImageResource(USER_A, RESOURCE_B);
    check("user A does NOT see user B image resource", cross.data === null || cross.data === undefined);
    check("user A cross-user returns not-found error", ((cross.error as { code?: string })?.code === "PGRST116") || cross.data === null);
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error("cross-user test error:", err);
    process.exitCode = 1;
  });
