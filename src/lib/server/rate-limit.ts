/* Shared sliding-window limiter for the paid/outbound API routes.

   Extracted from api/sansi, which had this inline — the same brake was missing
   on summarize-sop (also Gemini-backed) and on notify (sends Brevo email), so
   either could burn quota or spam a mailbox in a loop.

   Deliberately in-memory: the cap is per warm serverless instance, not global,
   so it is a cheap brake rather than a hard guarantee. That is the right trade
   at this headcount. If a true global limit is ever needed, move the counter
   into Postgres or Upstash — the call signature here won't have to change.

   Note this cannot protect the public form portal: those rows are inserted
   straight into Postgres by the anon key, never passing through a route, so
   that throttle lives in the database instead (see the form_submissions
   BEFORE INSERT trigger). */

const buckets = new Map<string, number[]>();

export interface RateLimit {
  windowMs: number;
  max: number;
}

export const AI_LIMIT: RateLimit = { windowMs: 60_000, max: 15 };
export const EMAIL_LIMIT: RateLimit = { windowMs: 60_000, max: 20 };

/** Returns true when the caller is inside its budget, false when it should 429. */
export function allowRequest(key: string, limit: RateLimit): boolean {
  const now = Date.now();
  const recent = (buckets.get(key) || []).filter((t) => now - t < limit.windowMs);
  if (recent.length >= limit.max) {
    buckets.set(key, recent);
    return false;
  }
  recent.push(now);
  buckets.set(key, recent);
  // Opportunistic cleanup so the map can't grow without bound on a long-lived instance.
  if (buckets.size > 500) {
    for (const [k, v] of buckets) {
      if (!v.some((t) => now - t < limit.windowMs)) buckets.delete(k);
    }
  }
  return true;
}
