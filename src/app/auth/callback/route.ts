import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/* Landing point for every emailed auth link (password recovery today; magic-link
   or email-change later). Supabase sends the user here with a one-time `code`,
   which has to be exchanged for a session cookie server-side before the app can
   act as that user.

   There was no route at all before, so the "reset password" link in a Supabase
   email had nowhere to land — which is one reason password recovery was
   effectively missing rather than merely unfinished. */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  // `next` lets one callback serve several flows; default to the reset screen.
  const next = req.nextUrl.searchParams.get("next") || "/reset-password";
  const errorDescription = req.nextUrl.searchParams.get("error_description");

  const origin = siteOrigin(req);

  if (errorDescription) {
    // Supabase puts expired/used links here rather than failing the exchange.
    return NextResponse.redirect(`${origin}/forgot-password?state=expired`);
  }
  if (!code) {
    return NextResponse.redirect(`${origin}/forgot-password?state=invalid`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    // A recovery link is single-use and time-limited; say so instead of dumping
    // the raw error, and put them straight back on the request form.
    return NextResponse.redirect(`${origin}/forgot-password?state=expired`);
  }
  return NextResponse.redirect(`${origin}${next}`);
}

/* Prefer the configured public URL over the request's own origin. Behind
   Vercel's proxy req.nextUrl.origin can resolve to an internal host, and in
   local development it is localhost — either way the user would be redirected
   somewhere they cannot reach. */
function siteOrigin(req: NextRequest): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/$/, "");
  const forwardedHost = req.headers.get("x-forwarded-host");
  const forwardedProto = req.headers.get("x-forwarded-proto") || "https";
  if (forwardedHost) return `${forwardedProto}://${forwardedHost}`;
  return req.nextUrl.origin;
}
