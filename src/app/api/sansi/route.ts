import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Sansi AI assistant — Gemini free tier with live workspace context.
export async function POST(req: NextRequest) {
  const { query } = await req.json();
  if (!query || typeof query !== "string") {
    return NextResponse.json({ reply: "Ask me something about your workspace." });
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ reply: "Please sign in first." }, { status: 401 });

  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return NextResponse.json({
      reply: `Got it — I'll look into "${query}". (Sansi's AI brain isn't connected yet: add GEMINI_API_KEY to enable real answers.)`,
    });
  }

  // Build compact workspace context
  const [profileRes, tasksRes, assigneesRes, profilesRes] = await Promise.all([
    supabase.from("profiles").select("id,name").eq("id", auth.user.id).single(),
    supabase.from("tasks").select("id,name,status,priority,due,description,list_id").neq("status", "Done").order("due").limit(60),
    supabase.from("task_assignees").select("task_id,profile_id"),
    supabase.from("profiles").select("id,name"),
  ]);
  const nameOf = new Map((profilesRes.data || []).map((p) => [p.id, p.name]));
  const assignees = new Map<string, string[]>();
  for (const a of assigneesRes.data || []) {
    if (!assignees.has(a.task_id)) assignees.set(a.task_id, []);
    assignees.get(a.task_id)!.push(nameOf.get(a.profile_id) || "?");
  }
  const taskLines = (tasksRes.data || [])
    .map((t) => `- ${t.name} [${t.status}, ${t.priority}${t.due ? `, due ${t.due}` : ""}] assigned to ${(assignees.get(t.id) || []).join(", ") || "no one"}`)
    .join("\n");

  const prompt = `You are Sansi, the AI assistant inside SansiWorks — Sansico Group's internal work-management app (an Indonesian packaging company). The user asking is ${profileRes.data?.name || "a team member"}. Today is ${new Date().toISOString().slice(0, 10)}.

Open tasks in the workspace:
${taskLines}

Answer the user's question concisely (2-5 sentences, plain text, no markdown headers). If asked to summarize workload, draft an update, or find something, do it using the task data above.

User question: ${query}`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      }
    );
    const data = await res.json();
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    return NextResponse.json({ reply: reply || "I couldn't come up with an answer just now — try rephrasing?" });
  } catch {
    return NextResponse.json({ reply: "Sansi hit a network snag — try again in a moment." });
  }
}
