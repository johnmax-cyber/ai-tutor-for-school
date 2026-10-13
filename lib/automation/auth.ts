import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Resource } from "@/lib/resources/types";

/**
 * Create a Supabase client authenticated with the service role key. This client
 * bypasses Row Level Security so background workers can act on behalf of users.
 *
 * This is the ONLY place the service role key is read (cron routes obtain
 * their client here rather than reading the key themselves).
 */
export function createServiceSupabase(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}

/**
 * Verify that a user exists via the admin API (service-role only).
 */
export async function verifyUserExists(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data, error } = await supabase.auth.admin.getUserById(userId);
  if (error || !data?.user) {
    return false;
  }
  return true;
}

/**
 * Verify that a resource exists and belongs to the given user. Returns the
 * resource row (with a small, fixed column set) or null if not owned/not found.
 */
export async function verifyResourceOwnership(
  supabase: SupabaseClient,
  userId: string,
  resourceId: string,
): Promise<Resource | null> {
  const { data, error } = await supabase
    .from("resources")
    .select(
      "id, user_id, title, status, storage_path, mime_type, retry_count, processing_started_at, processing_metadata, updated_at",
    )
    .eq("id", resourceId)
    .eq("user_id", userId)
    .single();

  if (error || !data) {
    return null;
  }
  return data as Resource;
}

export type PreferenceKey =
  | "study_reminders_enabled"
  | "daily_mission_enabled"
  | "weekly_summary_enabled"
  | "processing_retry_enabled";

/**
 * Read a per-user automation preference. A missing user_preferences row (or a
 * read error) means the toggle defaults to `defaultValue` (defaults are ON).
 */
export async function isPreferenceEnabled(
  supabase: SupabaseClient,
  userId: string,
  key: PreferenceKey,
  defaultValue = true,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("user_preferences")
    .select(key)
    .eq("user_id", userId)
    .single();

  if (error || !data) {
    if (error && error.code !== "PGRST116") {
      console.error(`user_preferences read error [${userId}, ${key}]:`, (error as Error).message);
    }
    return defaultValue;
  }

  const row = data as Record<string, unknown>;
  return row[key] === true;
}

/** Shared Zod schemas / parsing helpers used across the cron routes. */

const uuid = z.string().uuid();

/** Base body: every cron job identifies the acting user. */
export const cronBaseSchema = z.object({
  userId: uuid,
  resourceId: uuid.optional(),
});

/** retry-processing additionally requires an owned resource. */
export const retryProcessingSchema = cronBaseSchema.extend({
  resourceId: uuid,
});