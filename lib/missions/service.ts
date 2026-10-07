import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { StudyMission, MissionInput } from "./types";

export class MissionService {
  constructor(private supabase?: SupabaseClient) {}

  private async getSupabase(): Promise<SupabaseClient> {
    if (this.supabase) {
      return this.supabase;
    }
    return createClient();
  }

  async listForUser(
    userId: string,
    opts?: { completed?: boolean },
  ): Promise<StudyMission[]> {
    const supabase = await this.getSupabase();
    let query = supabase
      .from("study_missions")
      .select("*")
      .eq("user_id", userId);
    if (opts?.completed !== undefined) {
      query = query.eq("completed", opts.completed);
    }
    const { data, error } = await query.order("scheduled_for", {
      ascending: false,
    });
    if (error) {
      throw new Error("Failed to list missions");
    }
    return (data ?? []) as StudyMission[];
  }

  async create(input: MissionInput): Promise<StudyMission> {
    const supabase = await this.getSupabase();
    const { data, error } = await supabase
      .from("study_missions")
      .insert({
        user_id: input.user_id,
        type: input.type,
        topic_id: input.topic_id ?? null,
        title: input.title,
        description: input.description ?? null,
        scheduled_for: input.scheduled_for,
      })
      .select()
      .single();
    if (error || !data) {
      throw new Error("Failed to create mission");
    }
    return data as StudyMission;
  }

  async completeMission(
    missionId: string,
    userId: string,
  ): Promise<void> {
    const supabase = await this.getSupabase();
    const { error } = await supabase
      .from("study_missions")
      .update({ completed: true, updated_at: new Date().toISOString() })
      .eq("id", missionId)
      .eq("user_id", userId);
    if (error) {
      throw new Error("Failed to complete mission");
    }
  }
}
