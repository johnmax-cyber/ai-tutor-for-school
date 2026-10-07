import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { MissionService } from "@/lib/missions/service";
import type { MissionType } from "@/lib/missions/types";

export const dynamic = "force-dynamic";

const missionTypeSchema = z.enum(["daily_review", "weekly_summary"]);

const createMissionSchema = z.object({
  type: missionTypeSchema,
  topic_id: z.string().uuid().nullable().optional(),
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  scheduled_for: z.string().min(1),
});

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();

  if (authError || !auth?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = auth.user.id;
  const { searchParams } = new URL(request.url);
  const completedParam = searchParams.get("completed");

  let completed: boolean | undefined;
  if (completedParam === "true") completed = true;
  else if (completedParam === "false") completed = false;

  try {
    const service = new MissionService(supabase);
    const missions = await service.listForUser(
      userId,
      completed !== undefined ? { completed } : undefined,
    );

    return NextResponse.json({ missions });
  } catch (error) {
    console.error("Failed to list missions:", error);
    return NextResponse.json({ error: "Failed to load missions" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();

  if (authError || !auth?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = auth.user.id;

  try {
    const body = await request.json();
    const parsed = createMissionSchema.parse(body);

    const service = new MissionService(supabase);
    const mission = await service.create({
      user_id: userId,
      type: parsed.type as MissionType,
      topic_id: parsed.topic_id ?? null,
      title: parsed.title,
      description: parsed.description ?? null,
      scheduled_for: parsed.scheduled_for,
    });

    return NextResponse.json({ mission }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    console.error("Failed to create mission:", error);
    return NextResponse.json({ error: "Failed to create mission" }, { status: 500 });
  }
}
