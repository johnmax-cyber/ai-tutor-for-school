import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/topics/[id]
 * Get a specific topic with details
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  
  if (authError || !auth?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = auth.user.id;
  const { id } = await params;

  try {
    const { data: topic, error } = await supabase
      .from("topics")
      .select(`
        id,
        name,
        description,
        subjects(name as subject_name),
        mastery_state,
        total_attempts,
        correct_attempts,
        hints_used,
        retry_count,
        last_studied,
        next_review_at
      `)
      .eq("id", id)
      .eq("user_id", userId)
      .single();

    if (error) throw error;
    if (!topic) {
      return NextResponse.json({ error: "Topic not found" }, { status: 404 });
    }

    // Get count of resources assigned to this topic
    const { data: topicResources } = await supabase
      .from("resources_topics")
      .select("resource_id")
      .eq("topic_id", id);

    const resourceIds = (topicResources || []).map((r: any) => r.resource_id);

    let readyResourceCount = 0;
    if (resourceIds.length > 0) {
      const { count } = await supabase
        .from("resources")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("status", "ready")
        .in("id", resourceIds);
      readyResourceCount = count ?? 0;
    }

    return NextResponse.json({
      topic: {
        id: topic.id,
        name: topic.name,
        description: topic.description,
        subject_name: topic.subjects?.subject_name ?? null,
        mastery_state: topic.mastery_state,
        total_attempts: topic.total_attempts,
        correct_attempts: topic.correct_attempts,
        hints_used: topic.hints_used,
        last_studied: topic.last_studied,
        next_review_at: topic.next_review_at,
        resource_count: readyResourceCount
      }
    });
  } catch (error) {
    if (error.message === "Topic not found") {
      return NextResponse.json({ error: "Topic not found" }, { status: 404 });
    }
    console.error("Failed to load topic:", error);
    return NextResponse.json(
      { error: "Failed to load topic" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/topics/[id]
 * Update a topic
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  
  if (authError || !auth?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = auth.user.id;
  const { id } = await params;

  try {
    const body = await request.json();
    const { name, description, subject } = z.object({
      name: z.string().optional(),
      description: z.string().optional(),
      subject: z.string().optional()
    }).parse(body);

    let subjectId = null;

    // Handle subject update if provided
    if (subject !== undefined) {
      if (subject === null) {
        subjectId = null;
      } else {
        // Find or create subject
        const { data: existingSubject, error: subjectError } = await supabase
          .from("subjects")
          .select("id")
          .eq("user_id", userId)
          .eq("name", subject)
          .single();

        if (subjectError && subjectError.code !== "PGRST116") {
          throw subjectError;
        }

        if (existingSubject) {
          subjectId = existingSubject.id;
        } else {
          // Create new subject
          const { data: newSubject, error: createError } = await supabase
            .from("subjects")
            .insert({
              user_id: userId,
              name: subject
            })
            .select()
            .single();

          if (createError || !newSubject) {
            throw new Error("Failed to create subject");
          }

          subjectId = newSubject.id;
        }
      }
    }

    // Build update object
    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (subjectId !== undefined) updateData.subject_id = subjectId;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "No changes provided" }, { status: 400 });
    }

    // Update topic
    const { data: topic, error: topicError } = await supabase
      .from("topics")
      .update(updateData)
      .eq("id", id)
      .eq("user_id", userId)
      .single();

    if (topicError || !topic) {
      throw new Error("Failed to update topic");
    }

    return NextResponse.json({
      topic: {
        id: topic.id,
        name: topic.name,
        description: topic.description,
        subject_name: topic.subjects?.subject_name ?? null,
        mastery_state: topic.mastery_state,
        total_attempts: topic.total_attempts,
        correct_attempts: topic.correct_attempts,
        hints_used: topic.hints_used,
        last_studied: topic.last_studied,
        next_review_at: topic.next_review_at
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    if (error.message === "Topic not found") {
      return NextResponse.json({ error: "Topic not found" }, { status: 404 });
    }
    console.error("Failed to update topic:", error);
    return NextResponse.json(
      { error: "Failed to update topic" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/topics/[id]
 * Delete a topic
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  
  if (authError || !auth?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = auth.user.id;
  const { id } = await params;

  try {
    // Verify topic exists and belongs to user
    const { data: topic, error: topicError } = await supabase
      .from("topics")
      .select("id")
      .eq("id", id)
      .eq("user_id", userId)
      .single();

    if (topicError || !topic) {
      return NextResponse.json({ error: "Topic not found" }, { status: 404 });
    }

    // Delete topic (will cascade to related records due to foreign keys)
    const { error: deleteError } = await supabase
      .from("topics")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);

    if (deleteError) throw deleteError;

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error.message === "Topic not found") {
      return NextResponse.json({ error: "Topic not found" }, { status: 404 });
    }
    console.error("Failed to delete topic:", error);
    return NextResponse.json(
      { error: "Failed to delete topic" },
      { status: 500 }
    );
  }
}