import type { Session } from "@supabase/supabase-js";
import { getClient } from "./client";

/**
 * Every TrollRunner subdomain shares the registrable domain trollrunner.net,
 * so a cookie set with Domain=.trollrunner.net is visible to all of them on
 * a normal top-level load — no iframe bridge needed. This mirrors the
 * current session into that cookie on auth changes, and adopts it on init
 * if this origin doesn't already have one, giving free cross-subdomain SSO
 * (e.g. already logged into trollrunner.net → already logged in here).
 * Same trust model as localStorage: a JWT re-verified server-side by RLS.
 */
const SSO_COOKIE = "trollrunner_sso";

function ssoCookieDomain(): string | null {
  return /(^|\.)trollrunner\.net$/i.test(window.location.hostname)
    ? ".trollrunner.net"
    : null;
}

export function writeSsoCookie(session: Session | null) {
  const domain = ssoCookieDomain();
  if (!domain) return;
  if (!session) {
    document.cookie = `${SSO_COOKIE}=; Domain=${domain}; Path=/; Max-Age=0; SameSite=Lax; Secure`;
    return;
  }
  const value = encodeURIComponent(
    JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    })
  );
  document.cookie = `${SSO_COOKIE}=${value}; Domain=${domain}; Path=/; Max-Age=2592000; SameSite=Lax; Secure`;
}

function readSsoCookie(): { access_token: string; refresh_token: string } | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${SSO_COOKIE}=([^;]*)`));
  if (!match) return null;
  try {
    return JSON.parse(decodeURIComponent(match[1]));
  } catch {
    return null;
  }
}

export async function adoptSsoCookie() {
  if (!ssoCookieDomain()) return;
  const sb = getClient();
  const { data } = await sb.auth.getSession();
  if (data?.session) return; // this origin already has its own session
  const cookieSession = readSsoCookie();
  if (!cookieSession?.access_token || !cookieSession?.refresh_token) return;
  try {
    await sb.auth.setSession(cookieSession);
  } catch {
    // stale/expired — ignore
  }
}
