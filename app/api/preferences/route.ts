import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const PREFERENCE_COLUMNS =
  "user_id, study_reminders_enabled, reminder_time, daily_mission_enabled, weekly_summary_enabled, processing_retry_enabled, updated_at";

const DEFAULT_REMINDER_TIME = "09:00:00";

const preferencesPatchSchema = z.object({
  study_reminders_enabled: z.boolean().optional(),
  daily_mission_enabled: z.boolean().optional(),
  weekly_summary_enabled: z.boolean().optional(),
  processing_retry_enabled: z.boolean().optional(),
  reminder_time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/)
    .optional(),
});

/**
 * GET /api/preferences
 * Returns the caller's automation preferences, creating a defaults row when one
 * does not yet exist.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();

  if (authError || !auth?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = auth.user.id;

  const { data: prefs, error } = await supabase
    .from("user_preferences")
    .select(PREFERENCE_COLUMNS)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("Failed to load preferences:", (error as Error).message);
    return NextResponse.json(
      { error: "Failed to load preferences" },
      { status: 500 },
    );
  }

  if (!prefs) {
    const defaults = {
      user_id: userId,
      study_reminders_enabled: true,
      reminder_time: DEFAULT_REMINDER_TIME,
      daily_mission_enabled: true,
      weekly_summary_enabled: true,
      processing_retry_enabled: true,
    };
    const { data: created, error: createError } = await supabase
      .from("user_preferences")
      .upsert(defaults)
      .select(PREFERENCE_COLUMNS)
      .single();

    if (createError || !created) {
      console.error("Failed to create preferences:", createError?.message);
      return NextResponse.json(
        { error: "Failed to load preferences" },
        { status: 500 },
      );
    }

    return NextResponse.json({ preferences: created });
  }

  return NextResponse.json({ preferences: prefs });
}

/**
 * PATCH /api/preferences
 * Apply a partial update to the caller's automation preferences.
 */
export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();

  if (authError || !auth?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = auth.user.id;

  try {
    const body = await request.json();
    const parsed = preferencesPatchSchema.parse(body) as Record<string, unknown>;

    if (Object.keys(parsed).length === 0) {
      return NextResponse.json({ error: "No changes provided" }, { status: 400 });
    }

    const { data: prefs, error } = await supabase
      .from("user_preferences")
      .upsert({
        user_id: userId,
        ...parsed,
        updated_at: new Date().toISOString(),
      })
      .select(PREFERENCE_COLUMNS)
      .single();

    if (error || !prefs) {
      console.error("Failed to update preferences:", error?.message);
      return NextResponse.json(
        { error: "Failed to update preferences" },
        { status: 500 },
      );
    }

    return NextResponse.json({ preferences: prefs });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    console.error("Failed to update preferences:", error);
    return NextResponse.json(
      { error: "Failed to update preferences" },
      { status: 500 },
    );
  }
}
