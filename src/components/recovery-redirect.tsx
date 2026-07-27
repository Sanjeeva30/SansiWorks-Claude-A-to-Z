"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Set only by this component, consumed once by /reset-password. */
export const RECOVERY_FLAG = "sw-password-recovery";

/* Makes emailed password-recovery links work, wherever they land.

   Three things conspire here, and all of them had to be handled:

   1. Supabase only honours a `redirect_to` that is on its allow-list. Ours is
      not (that is a dashboard setting), so the link falls back to the project's
      Site URL — "/" — instead of /auth/callback.
   2. That fallback link carries its tokens in the URL FRAGMENT (implicit flow).
      A server route cannot see a fragment, so /auth/callback could never have
      handled it even if the path had survived.
   3. @supabase/ssr's browser client defaults to the PKCE flow, so it does NOT
      consume implicit fragment tokens. Nothing picked them up at all: the
      person landed signed-out on /login with a live recovery token sitting
      unused in the address bar.

   So the fragment is exchanged explicitly below. setSession() also REPLACES any
   session already in the browser, which matters: an earlier version navigated
   to the reset page while a colleague's session was still active, and the reset
   changed the colleague's password instead of the requester's. The reset page
   additionally refuses to act without RECOVERY_FLAG, so both halves must agree.

   The PKCE path is still supported — if the callback URL is added to the
   Supabase allow-list, links arrive as ?code= at /auth/callback and the
   onAuthStateChange listener below covers the handoff. */
export function RecoveryRedirect() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    let sub: { unsubscribe: () => void } | undefined;

    const go = () => {
      try { sessionStorage.setItem(RECOVERY_FLAG, "1"); } catch {}
      if (window.location.pathname !== "/reset-password") router.replace("/reset-password");
    };

    import("@/lib/supabase/client").then(async ({ createClient }) => {
      if (cancelled) return;
      const supabase = createClient();

      // PKCE / already-established recovery sessions.
      const { data } = supabase.auth.onAuthStateChange((event) => {
        if (event === "PASSWORD_RECOVERY") go();
      });
      sub = data.subscription;

      // Implicit flow: tokens in the fragment.
      const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
      if (!hash) return;
      const params = new URLSearchParams(hash);
      if (params.get("type") !== "recovery") return;

      const access_token = params.get("access_token");
      const refresh_token = params.get("refresh_token");
      if (!access_token || !refresh_token) return;

      const { error } = await supabase.auth.setSession({ access_token, refresh_token });
      // Strip the tokens from the address bar either way — they should not sit
      // in history, or be re-used by a back navigation.
      window.history.replaceState({}, "", window.location.pathname + window.location.search);
      if (cancelled) return;
      if (error) {
        router.replace("/forgot-password?state=expired");
        return;
      }
      go();
    });

    return () => { cancelled = true; sub?.unsubscribe(); };
  }, [router]);

  return null;
}
