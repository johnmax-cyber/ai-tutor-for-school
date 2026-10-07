import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { NotificationService } from "@/lib/notifications/service";
import type { NotificationType } from "@/lib/notifications/types";

export const dynamic = "force-dynamic";

const notificationTypeSchema = z.enum([
  "reminder",
  "mission",
  "summary",
  "processing_complete",
]);

const createNotificationSchema = z.object({
  type: notificationTypeSchema,
  title: z.string().min(1),
  message: z.string().min(1),
  link: z.string().nullable().optional(),
});

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();

  if (authError || !auth?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = auth.user.id;
  const { searchParams } = new URL(request.url);
  const unreadOnly = searchParams.get("unreadOnly") === "true";

  try {
    const service = new NotificationService(supabase);
    const [notifications, unreadCount] = await Promise.all([
      service.listForUser(userId, { unreadOnly, limit: 10 }),
      service.unreadCount(userId),
    ]);

    return NextResponse.json({ notifications, unreadCount });
  } catch (error) {
    console.error("Failed to list notifications:", error);
    return NextResponse.json(
      { error: "Failed to load notifications" },
      { status: 500 },
    );
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
    const parsed = createNotificationSchema.parse(body);

    const service = new NotificationService(supabase);
    await service.create({
      user_id: userId,
      type: parsed.type as NotificationType,
      title: parsed.title,
      message: parsed.message,
      link: parsed.link ?? null,
    });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    console.error("Failed to create notification:", error);
    return NextResponse.json(
      { error: "Failed to create notification" },
      { status: 500 },
    );
  }
}
