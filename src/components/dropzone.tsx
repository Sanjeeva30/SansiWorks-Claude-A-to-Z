"use client";
import React, { useState } from "react";

/* Real click-to-browse AND drag-and-drop file picker. Fires onFiles with the
   raw File objects — the caller decides whether to stage them (new task, not
   saved yet) or upload immediately (existing task). */
export function FileDropZone({ onFiles, inputId }: { onFiles: (files: File[]) => void; inputId: string }) {
  const [over, setOver] = useState(false);

  return (
    <label
      htmlFor={inputId}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const files = Array.from(e.dataTransfer.files || []);
        if (files.length) onFiles(files);
      }}
      style={{
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4,
        width: "100%", minHeight: 76, borderRadius: 10, cursor: "pointer", textAlign: "center", padding: 12,
        border: `1.5px dashed ${over ? "var(--crimson)" : "var(--sw-hair)"}`,
        background: over ? "rgba(122,13,32,0.06)" : "var(--sw-hover)",
        transition: "background .12s, border-color .12s",
      }}
    >
      <span style={{ fontSize: 19, color: "var(--sw-muted)" }}>📎</span>
      <span style={{ fontSize: 12.5, fontWeight: 400, color: "var(--sw-text)" }}>{over ? "Drop to attach" : "Click to attach files"}</span>
      <span style={{ fontSize: 11, color: "var(--sw-muted)" }}>or drag and drop — PDF, image, doc, spreadsheet, up to 25MB each</span>
      <input
        id={inputId} type="file" multiple
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          if (files.length) onFiles(files);
          e.target.value = "";
        }}
        style={{ display: "none" }}
      />
    </label>
  );
}
