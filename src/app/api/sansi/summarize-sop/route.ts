import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Sansi's SOP summary — author-assisted, not file-parsing. Word/PPT/PDF are
// binary; we don't extract their text. Sansi cleans up the submitter's own
// change note into a consistent summary instead of reading the file itself.
export async function POST(req: NextRequest) {
  const { title, changeNote, isRevision } = await req.json();
  if (!title || typeof title !== "string") {
    return NextResponse.json({ summary: "" });
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ summary: "" }, { status: 401 });

  const key = process.env.GEMINI_API_KEY;
  const fallback = (changeNote || "").trim();
  if (!key) return NextResponse.json({ summary: fallback });

  const prompt = isRevision
    ? `An employee submitted a revision to the company SOP "${title}". Their own description of what changed is: "${changeNote || "(no description given)"}". Rewrite this as one tight, neutral sentence summarizing what changed, suitable for a reviewer skimming a version history. Do not invent details not present in their description.`
    : `An employee submitted a new company SOP titled "${title}". Their own description is: "${changeNote || "(no description given)"}". Rewrite this as one tight, neutral sentence summarizing what the SOP covers, suitable for a reviewer skimming a version history. Do not invent details not present in their description.`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      }
    );
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    return NextResponse.json({ summary: text || fallback });
  } catch {
    return NextResponse.json({ summary: fallback });
  }
}
