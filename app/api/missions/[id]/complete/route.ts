import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { MissionService } from "@/lib/missions/service";

export const dynamic = "force-dynamic";

/**
 * POST /api/missions/[id]/complete
 * Mark a study mission complete. Ownership is enforced by filtering on user_id,
 * so a request against another user's mission updates zero rows.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();

  if (authError || !auth?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = auth.user.id;
  const { id } = await params;

  try {
    const service = new MissionService(supabase);
    await service.completeMission(id, userId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to complete mission:", error);
    return NextResponse.json(
      { error: "Failed to complete mission" },
      { status: 500 },
    );
  }
}
