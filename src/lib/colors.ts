// Colour-codes people by department and rank, using only Sansico's own brand
// colours — hue comes from the person's department (its own `color` field,
// already editable in the Organisation admin panel), shade comes from rank:
// heads render at full brand saturation, staff render progressively lighter.
import { Level, Profile } from "./types";

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const n = parseInt(clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Pick black or white text for a background, by WCAG relative luminance.
 *  Avatars used a hardcoded white, but colorForPerson() lightens the department
 *  hue by rank — so junior staff ended up with near-pastel circles where white
 *  initials measured 1.4:1 against a 4.5:1 requirement, illegible in BOTH themes.
 *  Threshold 0.45 is where switching to dark ink wins on contrast. */
export function readableTextOn(color: string): string {
  if (!color || !color.startsWith("#")) return "#fff";
  const [r, g, b] = hexToRgb(color);
  const chan = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const L = 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
  /* 0.179 is the exact crossover where white and pure black give equal contrast
     (both 4.58:1), so picking the better of the two ALWAYS clears AA whatever the
     background. A softer ink like #17120F only reaches 4.31:1 at the crossover and
     would leave mid-tone avatars failing, which is what a hand-picked 0.45 did:
     #95B2A4 (L=0.41) kept white text at 2.29:1 when dark would have given 8.13:1. */
  return L > 0.179 ? "#000" : "#fff";
}

/** Blend a hex colour toward white by `amount` (0 = unchanged, 1 = white). */
export function lighten(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(r + (255 - r) * amount, g + (255 - g) * amount, b + (255 - b) * amount);
}

/** Rank 1 (heads) renders at full department colour; each rank below lightens
 *  a further ~14%, so juniors are visibly the same family, softer. */
export function colorForPerson(profile: Pick<Profile, "id" | "level_id">, deptColor: string, levels: Level[]): string {
  const level = levels.find((l) => l.id === profile.level_id);
  const rankIndex = Math.max(0, (level?.sort ?? levels.length) - 1); // 0 = most senior
  const step = Math.min(rankIndex, 4) * 0.14;
  return lighten(deptColor, step);
}

/** Heads (top 3 ranks) get a bold ring on their avatar; everyone else doesn't. */
export function isHeadRank(profile: Pick<Profile, "level_id">, levels: Level[]): boolean {
  const level = levels.find((l) => l.id === profile.level_id);
  return (level?.sort ?? 99) <= 3;
}



/* A short code for an org unit.

   With 26 departments, hue alone cannot carry identity: the palette runs out,
   the shades collide, and none of it survives colourblindness, greyscale
   printing or a 20px avatar. A code does. Derived rather than stored so a unit
   renamed in the admin console cannot end up wearing a stale label.

   "Sourcing & Trade" -> S&T · "IGP Production" -> IGP · "QA/QC" -> QA. */
export function unitCode(name: string): string {
  const clean = name.replace(/\b(and|the|of|for|group|department|dept\.?)\b/gi, " ").trim();

  // An existing acronym in the name is already the code people say out loud.
  const acronym = clean.match(/\b[A-Z]{2,4}\b/);
  if (acronym) return acronym[0];

  const parts = clean.split(/[\s/]+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 3).toUpperCase();

  const joiner = /&/.test(name) ? "&" : "";
  const letters = parts.filter((w) => w !== "&").slice(0, 3).map((w) => w[0].toUpperCase());
  // Trim to the cap first, then strip any separator the cut left dangling —
  // "Finance & Shared Services" was coming out as "F&S&".
  return letters.join(joiner).slice(0, 4).replace(/[^A-Z0-9]+$/, "");
}
