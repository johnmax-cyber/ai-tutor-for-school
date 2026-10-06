import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/topics/[id]/assign
 * Assign a resource to a topic
 */
export async function POST(
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
    const { resourceId } = z.object({ resourceId: z.string() }).parse(body);

    // Verify topic ownership
    const { data: topic, error: topicError } = await supabase
      .from("topics")
      .select("id")
      .eq("id", id)
      .eq("user_id", userId)
      .single();

    if (topicError || !topic) {
      return NextResponse.json({ error: "Topic not found" }, { status: 404 });
    }

    // Verify resource ownership and readiness
    const { data: resource, error: resourceError } = await supabase
      .from("resources")
      .select("id, status")
      .eq("id", resourceId)
      .eq("user_id", userId)
      .single();

    if (resourceError || !resource) {
      return NextResponse.json({ error: "Resource not found" }, { status: 404 });
    }

    if (resource.status !== "ready") {
      return NextResponse.json({ error: "Resource is not ready for assignment" }, { status: 400 });
    }

    // Check if already assigned
    const { data: existingAssignment } = await supabase
      .from("resources_topics")
      .select("id")
      .eq("resource_id", resourceId)
      .eq("topic_id", id)
      .single();

    if (existingAssignment) {
      return NextResponse.json({ error: "Resource already assigned to topic" }, { status: 409 });
    }

    // Create the assignment
    const { error: assignError } = await supabase
      .from("resources_topics")
      .insert({
        resource_id: resourceId,
        topic_id: id
      });

    if (assignError) throw assignError;

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    if (error.message === "Topic not found") {
      return NextResponse.json({ error: "Topic not found" }, { status: 404 });
    }
    if (error.message === "Resource not found") {
      return NextResponse.json({ error: "Resource not found" }, { status: 404 });
    }
    if (error.message === "Resource is not ready for assignment") {
      return NextResponse.json({ error: "Resource is not ready for assignment" }, { status: 400 });
    }
    console.error("Failed to assign resource to topic:", error);
    return NextResponse.json(
      { error: "Failed to assign resource to topic" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/topics/[id]/unassign
 * Unassign a resource from a topic
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
    const body = await request.json();
    const { resourceId } = z.object({ resourceId: z.string() }).parse(body);

    // Verify topic ownership
    const { data: topic, error: topicError } = await supabase
      .from("topics")
      .select("id")
      .eq("id", id)
      .eq("user_id", userId)
      .single();

    if (topicError || !topic) {
      return NextResponse.json({ error: "Topic not found" }, { status: 404 });
    }

    // Verify resource ownership
    const { data: resource, error: resourceError } = await supabase
      .from("resources")
      .select("id")
      .eq("id", resourceId)
      .eq("user_id", userId)
      .single();

    if (resourceError || !resource) {
      return NextResponse.json({ error: "Resource not found" }, { status: 404 });
    }

    // Delete the assignment
    const { error: unassignError } = await supabase
      .from("resources_topics")
      .delete()
      .eq("resource_id", resourceId)
      .eq("topic_id", id);

    if (unassignError) throw unassignError;

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    if (error.message === "Topic not found") {
      return NextResponse.json({ error: "Topic not found" }, { status: 404 });
    }
    if (error.message === "Resource not found") {
      return NextResponse.json({ error: "Resource not found" }, { status: 404 });
    }
    console.error("Failed to unassign resource from topic:", error);
    return NextResponse.json(
      { error: "Failed to unassign resource from topic" },
      { status: 500 }
    );
  }
}