"use client";
import React, { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { initials } from "@/lib/types";
import { CropModal } from "@/components/avatar-upload";

function AcceptInviteInner() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token");
  const [supabase] = useState(() => createClient());

  const [invite, setInvite] = useState<{ email: string; level_name: string; department_name: string; invited_by_name: string; expired: boolean } | null>(null);
  const [checked, setChecked] = useState(false);
  const [name, setName] = useState("");
  const [designation, setDesignation] = useState("");
  const [countryCode, setCountryCode] = useState("+62");
  const [phone, setPhone] = useState("");
  const [birthDay, setBirthDay] = useState("");
  const [birthMonth, setBirthMonth] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [password, setPassword] = useState("");
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  /* Storage requires an authenticated user, and this person doesn't have an
     account yet — the avatar circle here used to be purely decorative, with
     no file input behind it at all. The picked/cropped photo is held in
     memory and uploaded right after signInWithPassword succeeds below,
     before the redirect. */
  const [pendingPhoto, setPendingPhoto] = useState<File | null>(null);
  const [avatarBlob, setAvatarBlob] = useState<Blob | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!token) { setChecked(true); return; }
      const { data } = await supabase.rpc("get_invite", { invite_token: token });
      setInvite(data?.[0] || null);
      setChecked(true);
    })();
  }, [token, supabase]);

  // password strength — heuristic from the design
  const pw = password;
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const strengthColors = ["#E5DFD8", "#F3263E", "#B7791F", "#22409E", "#0D4F31"];
  const strengthLabels = ["", "Weak", "Fair", "Good", "Strong"];
  const pwMeetsRules = pw.length >= 8 && /[A-Z]/.test(pw) && /[0-9]/.test(pw) && /[^A-Za-z0-9]/.test(pw);
  const disabled = !terms || !name.trim() || !designation.trim() || !phone.trim() || !pwMeetsRules || busy;

  const complete = async () => {
    if (disabled || !invite || !token) return;
    setBusy(true);
    setErr("");

    /* Clear any session already on this device FIRST. Accepting an invite on a
       colleague's machine used to leave their session in place: sign-up creates
       no session while email confirmation is on, the sign-in below then failed,
       and the new joiner was redirected into whoever was already logged in. */
    await supabase.auth.signOut();

    const { data: signUp, error: suErr } = await supabase.auth.signUp({ email: invite.email, password });
    if (suErr || !signUp.user) {
      setErr(
        /already registered|already been registered/i.test(suErr?.message || "")
          ? "An account already exists for this email. Try signing in instead, or reset your password."
          : suErr?.message || "Could not create your account."
      );
      setBusy(false);
      return;
    }

    const fullPhone = `${countryCode} ${phone.trim()}`;
    const { error: ciErr } = await supabase.rpc("complete_invite", {
      invite_token: token, user_id: signUp.user.id, full_name: name.trim(), phone_number: fullPhone,
      designation_text: designation.trim(),
      birthday_day_in: birthDay ? Number(birthDay) : null,
      birthday_month_in: birthMonth ? Number(birthMonth) : null,
      birthday_year_in: birthYear ? Number(birthYear) : null,
    });
    if (ciErr) {
      /* The auth account now exists but has no profile. Say so explicitly rather
         than leaving someone on a dead form — re-submitting would fail with
         "already registered" and look like a different problem entirely. */
      setErr(`${ciErr.message} — your login was created but your profile wasn't. Ask your Department Head to re-send the invitation.`);
      setBusy(false);
      return;
    }

    // Redeeming the emailed token proves this address; confirm it server-side so
    // the sign-in below can succeed.
    await fetch("/api/invite/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, userId: signUp.user.id }),
    }).catch(() => {});

    const { error: siErr } = await supabase.auth.signInWithPassword({ email: invite.email, password });
    if (siErr) {
      // Never redirect on a failed sign-in — that is what hid this bug before.
      setErr("Your account was created, but we couldn't sign you in automatically. Please sign in with your new password.");
      setBusy(false);
      return;
    }

    if (avatarBlob) {
      const path = `${signUp.user.id}/${Date.now()}.jpg`;
      const { error: upErr } = await supabase.storage.from("avatars").upload(path, avatarBlob, { contentType: "image/jpeg", upsert: true });
      if (!upErr) {
        const { data } = supabase.storage.from("avatars").getPublicUrl(path);
        await supabase.from("profiles").update({ avatar_url: `${data.publicUrl}?v=${Date.now()}` }).eq("id", signUp.user.id);
      }
      // A failed photo upload here shouldn't block onboarding — the tour's
      // own upload step covers it as a fallback either way.
    }

    localStorage.setItem("sw-show-onboarding", "1");
    router.push("/");
    router.refresh();
  };

  const label: React.CSSProperties = { display: "block", fontSize: 12.5, fontWeight: 700, color: "#4A423D", marginBottom: 6 };
  const input: React.CSSProperties = { width: "100%", height: 42, borderRadius: 10, border: "1.5px solid #E5DFD8", background: "#FAF8F4", padding: "0 14px", fontSize: 14, outline: "none" };
  const cardShadow = "0 1px 2px rgba(23,18,15,.04), 0 8px 20px rgba(23,18,15,.06), 0 24px 64px rgba(23,18,15,.08)";

  return (
    <div className="sw-vh-min" style={{ width: "100%", fontFamily: "var(--font-sans)", color: "#17120F", display: "flex", flexDirection: "column", background: "#FAF8F4" }}>
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 20px" }}>
        <div style={{ width: 440, maxWidth: "100%" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 28 }}>
            <span style={{ fontWeight: 800, letterSpacing: "0.08em", fontSize: 14, color: "#7A0D20" }}>SANSICO</span>
            <span style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 15, color: "#4A423D" }}>Group</span>
          </div>

          {!checked ? null : !invite || !token ? (
            <div style={{ background: "#FFFFFF", border: "1px solid #E5DFD8", borderRadius: 14, boxShadow: cardShadow, padding: 36, textAlign: "center" }}>
              <span style={{ fontSize: 26 }}>✉️</span>
              <h1 style={{ margin: "14px 0 8px", fontFamily: "var(--font-serif)", fontWeight: 400, fontSize: 22 }}>No invitation <em style={{ fontStyle: "italic" }}>found</em></h1>
              <p style={{ margin: "0 0 22px", fontSize: 13.5, color: "#4A423D", lineHeight: 1.6 }}>This link is missing or invalid. Ask your Department Head to send you a fresh invitation from SansiWorks&apos; Admin console.</p>
              <a href="/login" style={{ display: "inline-block", padding: "10px 20px", borderRadius: 999, border: "1px solid #E5DFD8", color: "#4A423D", fontSize: 13, fontWeight: 700, textDecoration: "none" }}>Go to sign in</a>
            </div>
          ) : invite.expired ? (
            <div style={{ background: "#FFFFFF", border: "1px solid #E5DFD8", borderRadius: 14, boxShadow: cardShadow, padding: 36, textAlign: "center" }}>
              <span style={{ fontSize: 26 }}>⏳</span>
              <h1 style={{ margin: "14px 0 8px", fontFamily: "var(--font-serif)", fontWeight: 400, fontSize: 22 }}>This invitation has <em style={{ fontStyle: "italic" }}>expired</em></h1>
              <p style={{ margin: 0, fontSize: 13.5, color: "#4A423D", lineHeight: 1.6 }}>Invitations are valid for 7 days. Ask {invite.invited_by_name || "your Department Head"} to send you a new one from SansiWorks&apos; Admin console.</p>
            </div>
          ) : (
            <div style={{ background: "#FFFFFF", border: "1px solid #E5DFD8", borderRadius: 14, boxShadow: cardShadow, padding: 32 }}>
              <p style={{ margin: "0 0 4px", fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "#7A0D20" }}>Set up your account</p>
              <h1 style={{ margin: "0 0 6px", fontFamily: "var(--font-serif)", fontWeight: 400, fontSize: 24, letterSpacing: "-0.01em" }}>Welcome to <em style={{ fontStyle: "italic" }}>SansiWorks</em></h1>
              <p style={{ margin: "0 0 24px", fontSize: 13.5, color: "#4A423D" }}>
                You&apos;re joining as <b>{invite.email}</b>{invite.department_name ? <> · {invite.department_name}</> : null}{invite.level_name ? <> · {invite.level_name}</> : null}. Confirm your details and set a password.
              </p>

              <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 22 }}>
                <label
                  htmlFor="accept-invite-photo"
                  title="Choose a profile photo"
                  style={{ position: "relative", width: 56, height: 56, borderRadius: 99, overflow: "hidden", flex: "none", border: "2px solid #FAF8F4", boxShadow: "0 1px 2px rgba(23,18,15,.06)", cursor: "pointer", display: "block" }}
                >
                  {avatarPreviewUrl ? (
                    <img src={avatarPreviewUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <div style={{ position: "absolute", inset: 0, background: "#5A0915", color: "#fff", fontSize: 18, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {name.trim() ? initials(name) : "?"}
                    </div>
                  )}
                  <input
                    id="accept-invite-photo" type="file" accept="image/*" style={{ display: "none" }}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) setPendingPhoto(f); e.target.value = ""; }}
                  />
                </label>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 700 }}>Add a profile photo</div>
                  <div style={{ fontSize: 11.5, color: "#9A918A" }}>{avatarPreviewUrl ? "Looks good — click it again to change." : "Optional here — or you'll be prompted right after you sign in."}</div>
                </div>
              </div>
              {pendingPhoto && (
                <CropModal
                  file={pendingPhoto}
                  onCancel={() => setPendingPhoto(null)}
                  onDone={(blob) => {
                    setAvatarBlob(blob);
                    setAvatarPreviewUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(blob); });
                    setPendingPhoto(null);
                  }}
                />
              )}

              <label style={label}>Full name <span style={{ color: "#7A0D20" }}>*</span></label>
              <input value={name} onChange={(e) => setName(e.target.value)} style={{ ...input, marginBottom: 14 }} />

              <label style={label}>Job title / designation <span style={{ color: "#7A0D20" }}>*</span></label>
              <input value={designation} onChange={(e) => setDesignation(e.target.value)} placeholder="e.g. Finance & Accounting Manager" style={{ ...input, marginBottom: 14 }} />

              <label style={label}>Email</label>
              <input value={invite.email} disabled style={{ ...input, background: "#F5F2EC", color: "#9A918A", marginBottom: 14 }} />

              <label style={label}>Phone number <span style={{ color: "#7A0D20" }}>*</span></label>
              <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                <select value={countryCode} onChange={(e) => setCountryCode(e.target.value)} style={{ width: 110, flex: "none", height: 42, borderRadius: 10, border: "1.5px solid #E5DFD8", background: "#FAF8F4", padding: "0 10px", fontSize: 13.5, outline: "none" }}>
                  <option value="+62">🇮🇩 +62</option>
                  <option value="+65">🇸🇬 +65</option>
                  <option value="+60">🇲🇾 +60</option>
                  <option value="+86">🇨🇳 +86</option>
                  <option value="+1">🇺🇸 +1</option>
                </select>
                <input value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^0-9 ]/g, ""))} type="tel" inputMode="numeric" placeholder="812 3456 7890" style={{ ...input, flex: 1 }} />
              </div>

              <label style={label}>Birthday <span style={{ color: "#9A918A", fontWeight: 400 }}>(optional — year optional too)</span></label>
              <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                <select value={birthDay} onChange={(e) => setBirthDay(e.target.value)} style={{ ...input, flex: 1 }}>
                  <option value="">Day</option>
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
                <select value={birthMonth} onChange={(e) => setBirthMonth(e.target.value)} style={{ ...input, flex: 1 }}>
                  <option value="">Month</option>
                  {["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                </select>
                <input value={birthYear} onChange={(e) => setBirthYear(e.target.value.replace(/[^0-9]/g, ""))} placeholder="Year (optional)" style={{ ...input, flex: 1 }} />
              </div>

              <label style={label}>Create password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="8+ characters, 1 uppercase, 1 number, 1 symbol" style={{ ...input, marginBottom: 8 }} />
              <p style={{ margin: "0 0 8px", fontSize: 11, color: "#9A918A", lineHeight: 1.5 }}>Must include an uppercase letter, a number, and a symbol.</p>
              <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
                {[1, 2, 3, 4].map((i) => (
                  <span key={i} style={{ height: 4, flex: 1, borderRadius: 99, background: i <= score ? strengthColors[score] : "#E5DFD8" }} />
                ))}
              </div>
              <p style={{ margin: "0 0 18px", fontSize: 11.5, color: strengthColors[score] || "#9A918A", fontWeight: 600 }}>{strengthLabels[score]}&nbsp;</p>

              <label style={{ display: "flex", alignItems: "flex-start", gap: 9, marginBottom: 22, cursor: "pointer" }}>
                <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} style={{ width: 16, height: 16, marginTop: 2, flex: "none" }} />
                <span style={{ fontSize: 12, color: "#4A423D", lineHeight: 1.5 }}>I agree to Sansico Group&apos;s acceptable use policy and data handling terms.</span>
              </label>

              {err && <p style={{ margin: "0 0 12px", fontSize: 12, color: "#F3263E" }}>{err}</p>}

              <button
                onClick={complete}
                disabled={disabled}
                style={{ width: "100%", height: 46, borderRadius: 999, border: "none", background: disabled ? "#C9C1B9" : "#7A0D20", color: "#fff", fontSize: 14.5, fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer", boxShadow: "0 8px 20px rgba(122,13,32,.25)" }}
              >
                {busy ? "Creating account…" : "Create account & continue"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={null}>
      <AcceptInviteInner />
    </Suspense>
  );
}
