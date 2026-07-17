"use client";
import React, { useEffect, useState } from "react";
import { useStore } from "@/lib/store";

const CHECKLIST_BY_ROLE: Record<string, { id: string; label: string; hint: string }[]> = {
  staff: [
    { id: "profile", label: "Add your profile photo", hint: "Helps teammates recognize you at a glance" },
    { id: "task", label: "Create your first task", hint: "Try it in My List — takes 10 seconds" },
    { id: "list", label: "Open your team's list", hint: "Find it under Spaces in the sidebar" },
    { id: "sansi", label: "Try Sansi document summarization", hint: "Upload a file to a task and let Sansi summarize it" },
  ],
  dept_head: [
    { id: "profile", label: "Add your profile photo", hint: "Helps teammates recognize you at a glance" },
    { id: "invite", label: "Invite your first team member", hint: "Admin console → Invites — you can approve Staff & Managers directly" },
    { id: "board_request", label: "Review a board request", hint: "Admin console → Approvals → Board requests" },
    { id: "sansi", label: "Try Sansi document summarization", hint: "Upload a file to a task and let Sansi summarize it" },
  ],
};

export function OnboardingChecklist() {
  const { me } = useStore();
  const [stage, setStage] = useState<"hidden" | "welcome" | "checklist" | "closed">("hidden");
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [justChecked, setJustChecked] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (localStorage.getItem("sw-show-onboarding") === "1") setStage("welcome");
  }, []);

  if (stage === "hidden" || !me) return null;

  const role = ["l1", "l2", "l3"].includes(me.level_id) ? "dept_head" : "staff";
  const items = CHECKLIST_BY_ROLE[role];
  const doneCount = Object.values(done).filter(Boolean).length;
  const pct = Math.round((doneCount / items.length) * 100);
  const allDone = doneCount === items.length;
  const firstName = me.name.split(" ")[0];

  const finish = () => {
    localStorage.removeItem("sw-show-onboarding");
    setStage("hidden");
  };

  return (
    <>
      {stage === "welcome" && (
        <div style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(23,18,15,0.35)", backdropFilter: "blur(2px)", zIndex: 88 }}>
          <div style={{ width: 420, maxWidth: "92vw", background: "var(--sw-card)", borderRadius: 18, boxShadow: "0 30px 90px rgba(23,18,15,0.35)", padding: 32, textAlign: "center", animation: "swFadeUp .3s ease" }}>
            <span style={{ fontSize: 28 }}>✦</span>
            <h2 style={{ margin: "14px 0 8px", fontFamily: "var(--font-serif)", fontWeight: 400, fontSize: 24 }}>
              Welcome, <em style={{ fontStyle: "italic" }}>{firstName}</em>
            </h2>
            <p style={{ margin: "0 0 24px", fontSize: 14, lineHeight: 1.6, color: "var(--sw-text-soft)" }}>
              You&apos;re in. Instead of a long tour, here&apos;s a short checklist to get oriented — do it at your own pace, and dismiss it anytime.
            </p>
            <button onClick={() => setStage("checklist")} style={{ padding: "12px 26px", borderRadius: 999, border: "none", background: "var(--crimson)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", boxShadow: "0 8px 20px rgba(122,13,32,.3)" }}>
              Show me →
            </button>
          </div>
        </div>
      )}

      {stage === "checklist" && !allDone && (
        <div style={{ position: "fixed", bottom: 24, right: 24, width: 340, maxWidth: "88vw", background: "var(--sw-card)", borderRadius: 16, boxShadow: "0 30px 90px rgba(23,18,15,0.28)", border: "1px solid var(--sw-hair)", overflow: "hidden", animation: "swFadeUp .25s ease", zIndex: 88 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 18px", borderBottom: "1px solid var(--sw-hair)" }}>
            <span style={{ color: "var(--crimson)", fontSize: 15 }}>✦</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 800 }}>Getting started</div>
              <div style={{ fontSize: 11, color: "var(--sw-muted)", fontWeight: 600 }}>{doneCount} of {items.length} complete</div>
            </div>
            <button onClick={() => setStage("closed")} style={{ border: "none", background: "var(--sw-sidebar)", width: 24, height: 24, borderRadius: 99, cursor: "pointer", fontSize: 12, color: "var(--sw-text-soft)" }}>✕</button>
          </div>
          <div style={{ height: 4, background: "var(--sw-hover)" }}>
            <div style={{ height: "100%", background: "var(--crimson)", width: `${pct}%`, transition: "width .3s" }} />
          </div>
          <div style={{ padding: "8px 10px" }}>
            {items.map((ci) => {
              const isDone = !!done[ci.id];
              return (
                <button
                  key={ci.id}
                  onClick={() => {
                    const nowDone = !isDone;
                    setDone({ ...done, [ci.id]: nowDone });
                    if (nowDone) setJustChecked({ ...justChecked, [ci.id]: true });
                    if (nowDone && Object.values({ ...done, [ci.id]: nowDone }).filter(Boolean).length === items.length) {
                      setTimeout(finish, 2600);
                    }
                  }}
                  className="sw-row"
                  style={{ display: "flex", alignItems: "flex-start", gap: 10, width: "100%", textAlign: "left", padding: "10px 8px", border: "none", background: "none", cursor: "pointer", borderRadius: 8 }}
                >
                  <span style={{ width: 18, height: 18, borderRadius: 99, border: `1.5px solid ${isDone ? "#0D4F31" : "var(--sw-hair)"}`, background: isDone ? "#0D4F31" : "transparent", color: "#fff", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center", flex: "none", marginTop: 1, animation: isDone && justChecked[ci.id] ? "swCheckPop .35s ease" : "none" }}>
                    {isDone ? "✓" : ""}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: isDone ? "var(--sw-muted)" : "var(--sw-text)", textDecoration: isDone ? "line-through" : "none" }}>{ci.label}</div>
                    <div style={{ fontSize: 11, color: "var(--sw-muted)", marginTop: 1 }}>{ci.hint}</div>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {stage === "checklist" && allDone && (
        <div style={{ position: "fixed", bottom: 24, right: 24, width: 300, background: "#17120F", color: "#fff", borderRadius: 14, padding: "16px 18px", boxShadow: "0 20px 60px rgba(23,18,15,0.4)", display: "flex", alignItems: "center", gap: 10, animation: "swToastIn .25s ease", zIndex: 88 }}>
          <span style={{ color: "#BDDA5F", fontSize: 18 }}>✓</span>
          <span style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.4 }}>You&apos;re all set — welcome to SansiWorks.</span>
        </div>
      )}

      {stage === "closed" && (
        <button
          onClick={() => setStage("checklist")}
          title="Getting started"
          style={{ position: "fixed", bottom: 24, right: 24, width: 52, height: 52, borderRadius: 99, border: "none", background: "var(--crimson)", color: "#fff", fontSize: 19, cursor: "pointer", boxShadow: "0 8px 20px rgba(122,13,32,.35)", zIndex: 88 }}
        >
          ✦
        </button>
      )}
    </>
  );
}
