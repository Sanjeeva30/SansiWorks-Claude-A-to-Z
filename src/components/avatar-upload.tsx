"use client";
import React, { useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { useUI } from "@/lib/ui";

const OUT_SIZE = 256;

/** Loads the picked image, lets the person drag it within a square frame to
    choose what's kept, then exports exactly that square at a fixed size. */
function CropModal({ file, onDone, onCancel }: { file: File; onDone: (blob: Blob) => void; onCancel: () => void }) {
  const [url] = useState(() => URL.createObjectURL(file));
  const [offset, setOffset] = useState({ x: 0, y: 0 }); // % of image shifted, -50..50
  const dragging = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    dragging.current = { startX: e.clientX, startY: e.clientY, ox: offset.x, oy: offset.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const dx = ((e.clientX - dragging.current.startX) / 220) * 100;
    const dy = ((e.clientY - dragging.current.startY) / 220) * 100;
    setOffset({
      x: Math.max(-50, Math.min(50, dragging.current.ox + dx)),
      y: Math.max(-50, Math.min(50, dragging.current.oy + dy)),
    });
  };
  const onPointerUp = () => { dragging.current = null; };

  const crop = () => {
    const img = imgRef.current;
    if (!img) return;
    const canvas = document.createElement("canvas");
    canvas.width = OUT_SIZE;
    canvas.height = OUT_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const cx = img.naturalWidth / 2 - (offset.x / 100) * img.naturalWidth;
    const cy = img.naturalHeight / 2 - (offset.y / 100) * img.naturalHeight;
    ctx.drawImage(img, cx - side / 2, cy - side / 2, side, side, 0, 0, OUT_SIZE, OUT_SIZE);
    canvas.toBlob((blob) => { if (blob) onDone(blob); }, "image/jpeg", 0.9);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(23,18,15,0.55)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onCancel}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--sw-card)", borderRadius: 16, padding: 20, width: 300, textAlign: "center" }}>
        <div style={{ fontSize: 13, marginBottom: 10, color: "var(--sw-text)" }}>Drag to reposition, then save</div>
        <div
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
          style={{ width: 220, height: 220, borderRadius: 99, overflow: "hidden", margin: "0 auto", border: "2px solid var(--sw-hair)", cursor: "grab", touchAction: "none" }}
        >
          <img
            ref={imgRef} src={url} alt="Crop preview" draggable={false}
            style={{ width: "100%", height: "100%", objectFit: "cover", transform: `translate(${offset.x}%, ${offset.y}%)`, pointerEvents: "none" }}
          />
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "center" }}>
          <button onClick={onCancel} style={{ padding: "7px 16px", borderRadius: 999, border: "1px solid var(--sw-hair)", background: "none", color: "var(--sw-text-soft)", fontSize: 12.5, cursor: "pointer" }}>Cancel</button>
          <button onClick={crop} style={{ padding: "7px 16px", borderRadius: 999, border: "none", background: "var(--crimson)", color: "#fff", fontSize: 12.5, cursor: "pointer" }}>Save photo</button>
        </div>
      </div>
    </div>
  );
}

export function AvatarUploadButton({ profileId, size = 64 }: { profileId: string; size?: number }) {
  const { supabase, patch, profiles } = useStore();
  const { pushToast } = useUI();
  const [pending, setPending] = useState<File | null>(null);
  const inputId = `avatar-input-${profileId}`;

  const save = async (blob: Blob) => {
    const path = `${profileId}/${Date.now()}.jpg`;
    const { error: upErr } = await supabase.storage.from("avatars").upload(path, blob, { contentType: "image/jpeg", upsert: true });
    setPending(null);
    if (upErr) { pushToast("Couldn't upload the photo — try again."); return; }
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    const avatar_url = `${data.publicUrl}?v=${Date.now()}`;
    patch("profiles", profiles.map((p) => (p.id === profileId ? { ...p, avatar_url } : p)));
    await supabase.from("profiles").update({ avatar_url }).eq("id", profileId);
    pushToast("Profile photo updated");
  };

  return (
    <>
      <label htmlFor={inputId} title="Change profile photo" style={{ position: "relative", cursor: "pointer", display: "block", width: "100%", height: "100%" }}>
        <span style={{ position: "absolute", inset: 0, borderRadius: 99, background: "rgba(23,18,15,0.35)", color: "#fff", fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center", opacity: 0, transition: "opacity .12s" }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")} onMouseLeave={(e) => (e.currentTarget.style.opacity = "0")}>
          Change photo
        </span>
        <input id={inputId} type="file" accept="image/*" style={{ display: "none" }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) setPending(f); e.target.value = ""; }} />
      </label>
      {pending && <CropModal file={pending} onDone={save} onCancel={() => setPending(null)} />}
    </>
  );
}
