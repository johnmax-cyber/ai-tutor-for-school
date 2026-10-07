import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Notification, NotificationInput } from "./types";

export class NotificationService {
  constructor(private supabase?: SupabaseClient) {}

  private async getSupabase(): Promise<SupabaseClient> {
    if (this.supabase) {
      return this.supabase;
    }
    return createClient();
  }

  async listForUser(
    userId: string,
    opts?: { unreadOnly?: boolean; limit?: number },
  ): Promise<Notification[]> {
    const supabase = await this.getSupabase();
    let query = supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId);
    if (opts?.unreadOnly) {
      query = query.is("read_at", null);
    }
    if (opts?.limit) {
      query = query.limit(opts.limit);
    }
    const { data, error } = await query.order("created_at", {
      ascending: false,
    });
    if (error) {
      throw new Error("Failed to list notifications");
    }
    return (data ?? []) as Notification[];
  }

  async create(
    input: NotificationInput | NotificationInput[],
  ): Promise<void> {
    const supabase = await this.getSupabase();
    const items = Array.isArray(input) ? input : [input];
    const { error } = await supabase.from("notifications").insert(
      items.map((item) => ({
        user_id: item.user_id,
        type: item.type,
        title: item.title,
        message: item.message,
        link: item.link ?? null,
      })),
    );
    if (error) {
      throw new Error("Failed to create notification");
    }
  }

  async markRead(notificationId: string, userId: string): Promise<void> {
    const supabase = await this.getSupabase();
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", notificationId)
      .eq("user_id", userId);
    if (error) {
      throw new Error("Failed to mark notification read");
    }
  }

  async markAllRead(userId: string): Promise<void> {
    const supabase = await this.getSupabase();
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", userId);
    if (error) {
      throw new Error("Failed to mark notifications read");
    }
  }

  async deleteNotification(
    notificationId: string,
    userId: string,
  ): Promise<void> {
    const supabase = await this.getSupabase();
    const { error } = await supabase
      .from("notifications")
      .delete()
      .eq("id", notificationId)
      .eq("user_id", userId);
    if (error) {
      throw new Error("Failed to delete notification");
    }
  }

  async unreadCount(userId: string): Promise<number> {
    const supabase = await this.getSupabase();
    const { count, error } = await supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .is("read_at", null);
    if (error) {
      throw new Error("Failed to count unread notifications");
    }
    return count ?? 0;
  }
}
