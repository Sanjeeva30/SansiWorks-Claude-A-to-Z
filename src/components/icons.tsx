"use client";
import React from "react";

const S = (p: { size?: number; sw?: number; children: React.ReactNode; fill?: string; join?: boolean }) => (
  <svg
    width={p.size || 14}
    height={p.size || 14}
    viewBox="0 0 24 24"
    fill={p.fill || "none"}
    stroke={p.fill ? undefined : "currentColor"}
    strokeWidth={p.sw ?? 2.2}
    strokeLinecap="round"
    strokeLinejoin={p.join === false ? undefined : "round"}
    style={{ verticalAlign: "middle" }}
  >
    {p.children}
  </svg>
);

export const IconX = ({ size = 11 }: { size?: number }) => (
  <S size={size} sw={2.4}><path d="M6 6l12 12M18 6L6 18" /></S>
);
export const IconSparkle = ({ size = 12 }: { size?: number }) => (
  <S size={size}><path d="M12 3l2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2z" /></S>
);
export const IconSun = ({ size = 14 }: { size?: number }) => (
  <S size={size} sw={2.4}><circle cx="12" cy="12" r="4.2" /><path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M5 5l1.7 1.7M17.3 17.3L19 19M19 5l-1.7 1.7M6.7 17.3L5 19" /></S>
);
export const IconMoon = ({ size = 14 }: { size?: number }) => (
  <S size={size} sw={2.4}><path d="M20 13A8 8 0 1 1 11 4a6.5 6.5 0 0 0 9 9z" /></S>
);
export const IconBell = ({ size = 14 }: { size?: number }) => (
  <S size={size}><path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8" /><path d="M10.3 21a2 2 0 0 0 3.4 0" /></S>
);
export const IconChevLeft = ({ size = 13 }: { size?: number }) => (
  <S size={size} sw={2.4}><path d="M15 6l-6 6 6 6" /></S>
);
export const IconChevRight = ({ size = 13 }: { size?: number }) => (
  <S size={size} sw={2.4}><path d="M9 6l6 6-6 6" /></S>
);
export const IconTaskPlus = ({ size = 18 }: { size?: number }) => (
  <S size={size} sw={2.4}><rect x="3" y="3" width="13" height="13" rx="3" /><path d="M6.5 9.5l2.2 2.2 4.3-4.4" /><path d="M19 12v7" /><path d="M15.5 15.5h7" /></S>
);
export const IconSquare = ({ size = 14 }: { size?: number }) => (
  <S size={size}><rect x="4" y="4" width="16" height="16" rx="4" /></S>
);
export const IconClock = ({ size = 14 }: { size?: number }) => (
  <S size={size}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></S>
);
export const IconFlag = ({ size = 14 }: { size?: number }) => (
  <S size={size}><path d="M5 21V4h13l-3.5 4.5L18 13H5" /></S>
);
export const IconCheckSquare = ({ size = 14 }: { size?: number }) => (
  <S size={size}><rect x="4" y="4" width="16" height="16" rx="4" /><path d="M8.5 12.2l2.4 2.4 4.6-4.8" /></S>
);
export const IconGrid = ({ size = 14 }: { size?: number }) => (
  <S size={size}><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></S>
);
export const IconSearch = ({ size = 13 }: { size?: number }) => (
  <S size={size} sw={2.4}><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></S>
);
export const IconStar = ({ size = 12, filled = false }: { size?: number; filled?: boolean }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: "middle" }}>
    <path d="M12 2.8l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.6l-5.8 3.1 1.1-6.5L2.6 9.6l6.5-.9z" />
  </svg>
);
export const IconChevDown = ({ size = 12 }: { size?: number }) => (
  <S size={size} sw={2.4}><path d="M6 9l6 6 6-6" /></S>
);
export const IconLink = ({ size = 12 }: { size?: number }) => (
  <S size={size}><path d="M10 14a5 5 0 0 0 7.1 0l3-3a5 5 0 0 0-7.1-7.1l-1.6 1.6" /><path d="M14 10a5 5 0 0 0-7.1 0l-3 3a5 5 0 0 0 7.1 7.1l1.6-1.6" /></S>
);
export const IconWhatsApp = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" style={{ flex: "none" }}>
    <path d="M12.04 2c-5.52 0-10 4.48-10 10 0 1.76.46 3.48 1.34 4.99L2 22l5.16-1.35a9.96 9.96 0 0 0 4.88 1.24h.01c5.52 0 10-4.48 10-10s-4.49-9.89-10.01-9.89zm0 18.24c-1.53 0-3.03-.41-4.34-1.19l-.31-.18-3.06.8.82-2.98-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.25-8.24 2.2 0 4.27.86 5.83 2.42a8.18 8.18 0 0 1 2.41 5.82c0 4.55-3.7 8.24-8.24 8.24zm4.52-6.17c-.25-.12-1.47-.72-1.7-.81-.23-.08-.39-.12-.56.13-.17.25-.64.81-.78.97-.14.17-.29.19-.53.06-.25-.12-1.05-.39-2-1.23-.74-.66-1.24-1.47-1.39-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.12-.14.16-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.42-.14-.01-.31-.01-.47-.01-.17 0-.43.06-.66.31-.23.25-.86.84-.86 2.05 0 1.21.88 2.38 1 2.54.12.17 1.74 2.65 4.21 3.72.59.25 1.05.4 1.41.52.59.19 1.13.16 1.55.1.47-.07 1.47-.6 1.68-1.18.21-.58.21-1.08.14-1.18-.06-.11-.23-.17-.48-.29z" />
  </svg>
);
