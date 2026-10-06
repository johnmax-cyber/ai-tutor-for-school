import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/topics
 * List user's topics
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  
  if (authError || !auth?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = auth.user.id;

  try {
    const { data: topics, error } = await supabase
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
      .eq("user_id", userId)
      .order("created_at", { descending: true });

    if (error) throw error;

    return NextResponse.json({ 
      topics: (topics || []).map(topic => ({
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
      }))
    });
  } catch (error) {
    console.error("Failed to load topics:", error);
    return NextResponse.json(
      { error: "Failed to load topics" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/topics
 * Create a new topic
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  
  if (authError || !auth?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = auth.user.id;

  try {
    const body = await request.json();
    const { name, subject, description } = z.object({
      name: z.string().min(1).max(100),
      subject: z.string().optional(),
      description: z.string().optional()
    }).parse(body);

    let subjectId = null;
    let subjectName = null;

    // If subject provided, find or create it
    if (subject) {
      const { data: existingSubject, error: subjectError } = await supabase
        .from("subjects")
        .select("id")
        .eq("user_id", userId)
        .eq("name", subject)
        .single();

      if (subjectError && subjectError.code !== "PGRST116") { // Not found error
        throw subjectError;
      }

      if (existingSubject) {
        subjectId = existingSubject.id;
        subjectName = existingSubject.name;
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
        subjectName = newSubject.name;
      }
    }

    // Create the topic
    const { data: topic, error: topicError } = await supabase
      .from("topics")
      .insert({
        user_id: userId,
        subject_id: subjectId,
        name,
        description: description ?? ""
      })
      .select()
      .single();

    if (topicError || !topic) {
      throw new Error("Failed to create topic");
    }

    return NextResponse.json({
      topic: {
        id: topic.id,
        name: topic.name,
        description: topic.description,
        subject_name: subjectName,
        subject_id: subjectId,
        mastery_state: topic.mastery_state,
        total_attempts: topic.total_attempts,
        correct_attempts: topic.correct_attempts,
        last_studied: topic.last_studied,
        next_review_at: topic.next_review_at
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    console.error("Failed to create topic:", error);
    return NextResponse.json(
      { error: "Failed to create topic" },
      { status: 500 }
    );
  }
}