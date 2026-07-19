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

