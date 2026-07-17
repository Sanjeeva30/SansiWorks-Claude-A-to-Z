"use client";
import React, { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface PortalForm {
  id: string;
  title: string;
  list_id: string | null;
  fields: { id: number; label: string; type: string }[];
}

function PortalInner() {
  const params = useSearchParams();
  const [supabase] = useState(() => createClient());
  const [forms, setForms] = useState<PortalForm[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(params.get("form"));
  const [sent, setSent] = useState(false);
  const [refNo, setRefNo] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});

  useEffect(() => {
    supabase.from("forms").select("id,title,list_id,fields").eq("active", true).then(({ data }) => setForms((data as PortalForm[]) || []));
  }, [supabase]);

  const current = forms.find((f) => f.id === currentId);

  const submit = async () => {
    if (!current) return;
    await supabase.from("form_submissions").insert({ form_id: current.id, answers });
    setRefNo(`SW-${Math.floor(1000 + Math.random() * 9000)}`);
    setSent(true);
    setAnswers({});
  };

  return (
    <div style={{ minHeight: "100vh", background: "#FFFFFF", fontFamily: "var(--font-sans)", color: "#17120F" }}>
      <div style={{ display: "flex", height: 4 }}>
        <span style={{ flex: 1, background: "#7A0D20" }} /><span style={{ flex: 1, background: "#22409E" }} /><span style={{ flex: 1, background: "#0D4F31" }} /><span style={{ flex: 1, background: "#F3263E" }} /><span style={{ flex: 1, background: "#BDDA5F" }} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "16px 28px", borderBottom: "1px solid #E5DFD8", background: "#FFFFFF" }}>
        <span style={{ fontWeight: 800, letterSpacing: "0.07em", fontSize: 12, color: "#7A0D20" }}>SANSICO</span>
        <span style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 13, color: "#4A423D" }}>Group</span>
        <span style={{ fontSize: 12, color: "#9A918A", marginLeft: 6 }}>Request portal</span>
      </div>
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "48px 28px 80px" }}>
        {current ? (
          sent ? (
            <div style={{ maxWidth: 520, margin: "40px auto", background: "#fff", border: "1px solid #E5DFD8", borderRadius: 16, boxShadow: "var(--shadow-card)", padding: 36, textAlign: "center" }}>
              <div style={{ width: 52, height: 52, borderRadius: 99, background: "rgba(13,79,49,0.1)", color: "#0D4F31", fontSize: 22, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>✓</div>
              <h2 style={{ fontFamily: "var(--font-serif)", fontWeight: 400, fontSize: 26, margin: "0 0 8px" }}>Request <em style={{ fontStyle: "italic" }}>received</em>.</h2>
              <p style={{ margin: "0 0 6px", fontSize: 13, color: "#4A423D" }}>Your reference number is <b style={{ fontWeight: 800, color: "#17120F" }}>{refNo}</b>.</p>
              <p style={{ margin: "0 0 22px", fontSize: 12.5, color: "#9A918A" }}>The owning team has been notified in SansiWorks and will follow up on the contact you provided.</p>
              <button onClick={() => { setSent(false); setCurrentId(null); }} style={{ padding: "9px 22px", borderRadius: 999, border: "1px solid #E5DFD8", background: "#F5F2EC", color: "#17120F", fontSize: 12.5, fontWeight: 400, cursor: "pointer" }}>Submit another request</button>
            </div>
          ) : (
            <>
              <button onClick={() => setCurrentId(null)} style={{ border: "none", background: "none", color: "#7A0D20", fontSize: 12.5, fontWeight: 400, cursor: "pointer", padding: 0, marginBottom: 18 }}>← All request types</button>
              <div style={{ maxWidth: 560, background: "#fff", border: "1px solid #E5DFD8", borderRadius: 16, boxShadow: "var(--shadow-card)", padding: "28px 30px" }}>
                <h2 style={{ fontFamily: "var(--font-serif)", fontWeight: 400, fontSize: 26, margin: "0 0 18px" }}>{current.title}</h2>
                <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
                  {["Your name", "Company or facility", "Email or WhatsApp number"].map((label) => (
                    <label key={label} style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12, color: "#4A423D" }}>
                      {label}
                      <input value={answers[label] || ""} onChange={(e) => setAnswers({ ...answers, [label]: e.target.value })} style={{ height: 36, borderRadius: 9, border: "1px solid #E5DFD8", background: "#FAF8F4", padding: "0 12px", fontSize: 12.5, outline: "none" }} />
                    </label>
                  ))}
                  {(current.fields || []).map((f) => (
                    <label key={f.id} style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12, color: "#4A423D" }}>
                      {f.label}
                      {f.type === "Paragraph" ? (
                        <textarea rows={4} value={answers[f.label] || ""} onChange={(e) => setAnswers({ ...answers, [f.label]: e.target.value })} style={{ borderRadius: 9, border: "1px solid #E5DFD8", background: "#FAF8F4", padding: "9px 12px", fontSize: 12.5, outline: "none", resize: "vertical" }} />
                      ) : (
                        <input value={answers[f.label] || ""} onChange={(e) => setAnswers({ ...answers, [f.label]: e.target.value })} style={{ height: 36, borderRadius: 9, border: "1px solid #E5DFD8", background: "#FAF8F4", padding: "0 12px", fontSize: 12.5, outline: "none" }} />
                      )}
                    </label>
                  ))}
                </div>
                <button onClick={submit} style={{ marginTop: 20, padding: "10px 26px", borderRadius: 999, border: "none", background: "#7A0D20", color: "#fff", fontSize: 13, fontWeight: 400, cursor: "pointer", boxShadow: "0 8px 20px rgba(122,13,32,.25)" }}>Send request</button>
              </div>
            </>
          )
        ) : (
          <>
            <h1 style={{ fontFamily: "var(--font-serif)", fontWeight: 400, fontSize: 38, margin: "0 0 8px", letterSpacing: "-0.01em" }}>How can we <em style={{ fontStyle: "italic" }}>help</em>?</h1>
            <p style={{ margin: "0 0 30px", fontSize: 14, color: "#4A423D", maxWidth: 520 }}>Submit a request to any Sansico team — vendors, facilities and partners welcome. No login needed; your request lands directly on the owning team&apos;s board.</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14 }}>
              {forms.map((f) => (
                <button key={f.id} onClick={() => setCurrentId(f.id)} className="sw-card-h" style={{ textAlign: "left", background: "#fff", border: "1px solid #E5DFD8", borderRadius: 14, boxShadow: "var(--shadow-card)", padding: 20, cursor: "pointer" }}>
                  <div style={{ fontSize: 15, fontWeight: 400, color: "#17120F", marginBottom: 6 }}>{f.title}</div>
                  <div style={{ fontSize: 11.5, color: "#9A918A" }}>{(f.fields || []).length} questions · takes ~2 minutes</div>
                  <div style={{ marginTop: 12, fontSize: 12, fontWeight: 400, color: "#7A0D20" }}>Open form →</div>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function PortalPage() {
  return (
    <Suspense fallback={null}>
      <PortalInner />
    </Suspense>
  );
}
