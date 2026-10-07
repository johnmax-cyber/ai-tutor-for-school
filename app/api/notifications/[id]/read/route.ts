import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { NotificationService } from "@/lib/notifications/service";

export const dynamic = "force-dynamic";

/**
 * POST /api/notifications/[id]/read
 * Mark a notification as read. Ownership is enforced by filtering on user_id,
 * so a request against another user's notification updates zero rows.
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
    const service = new NotificationService(supabase);
    await service.markRead(id, userId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to mark notification read:", error);
    return NextResponse.json(
      { error: "Failed to update notification" },
      { status: 500 },
    );
  }
}
