import { getClient } from "./client";
import { writeSsoCookie } from "./sso";

const LOGIN_EMAIL_DOMAIN = "login.trollrunner.net";
const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export type TrollProfile = {
  id: string;
  username: string;
  avatar_url: string | null;
  bio: string;
  level: number;
  xp: number;
  created_at: string;
};

export type PublicSession = {
  userId: string;
  username: string;
  level: number;
  xp: number;
  avatarUrl: string | null;
  joinedAt: string;
};

function toPublicSession(profile: TrollProfile): PublicSession {
  return {
    userId: profile.id,
    username: profile.username,
    level: profile.level || 1,
    xp: profile.xp || 0,
    avatarUrl: profile.avatar_url,
    joinedAt: profile.created_at,
  };
}

function loginEmailFor(username: string) {
  return `u_${username.toLowerCase()}@${LOGIN_EMAIL_DOMAIN}`;
}

function friendlyError(error: unknown, fallback: string): Error {
  const raw = String((error as { message?: string })?.message || error || "");
  if (/invalid login credentials/i.test(raw))
    return new Error("Wrong username or password.");
  if (/already registered|already exists/i.test(raw))
    return new Error("That account already exists. Try logging in.");
  if (/already taken/i.test(raw))
    return new Error("That username is already taken.");
  if (/rate limit|security purposes/i.test(raw))
    return new Error("Too many attempts — wait a minute and try again.");
  if (/email.*(taken|exists|in use)|address.*already/i.test(raw))
    return new Error("That email is already on another account.");
  if (/invalid.*email|unable to validate email/i.test(raw))
    return new Error("That email address looks wrong.");
  return new Error(raw || fallback);
}

export async function loadProfile(userId: string): Promise<TrollProfile | null> {
  const sb = getClient();
  const { data } = await sb
    .from("troll_profiles")
    .select("id, username, avatar_url, bio, level, xp, created_at")
    .eq("id", userId)
    .maybeSingle();
  return (data as TrollProfile | null) || null;
}

export async function getSession(): Promise<PublicSession | null> {
  const sb = getClient();
  const { data } = await sb.auth.getSession();
  const user = data?.session?.user;
  if (!user) return null;
  const profile = await loadProfile(user.id);
  return profile ? toPublicSession(profile) : null;
}

/** JWT for authenticated server-side calls (e.g. the coach chat API route). */
export async function getAccessToken(): Promise<string | null> {
  const sb = getClient();
  const { data } = await sb.auth.getSession();
  return data?.session?.access_token ?? null;
}

async function isUsernameTaken(username: string): Promise<boolean> {
  const sb = getClient();
  const { data } = await sb
    .from("troll_profiles")
    .select("id")
    .eq("username_lower", username.toLowerCase())
    .maybeSingle();
  return Boolean(data);
}

export async function register({
  username,
  email,
  password,
}: {
  username: string;
  email?: string;
  password: string;
}): Promise<PublicSession> {
  const sb = getClient();
  const name = username.trim();
  const contact = (email || "").trim().toLowerCase();
  if (!USERNAME_RE.test(name))
    throw new Error("Usernames are 3–20 letters, numbers, or underscores.");
  if (contact && !EMAIL_RE.test(contact))
    throw new Error("That email address looks wrong.");
  if (password.length < 8)
    throw new Error("Use a password with at least 8 characters.");
  if (await isUsernameTaken(name))
    throw new Error("That username is already taken.");

  const authEmail = contact || loginEmailFor(name);
  const { data, error } = await sb.auth.signUp({
    email: authEmail,
    password,
    options: { data: { username: name, contact_email: contact || null } },
  });
  if (error) throw friendlyError(error, "Could not create the account.");

  if (!data.session) {
    const { error: loginError } = await sb.auth.signInWithPassword({
      email: authEmail,
      password,
    });
    if (loginError) {
      throw friendlyError(
        loginError,
        "Account created — but login failed. Try logging in."
      );
    }
  }

  const { data: sessionData } = await sb.auth.getSession();
  if (sessionData?.session) writeSsoCookie(sessionData.session);
  const profile = await loadProfile(data.user!.id);
  if (!profile) throw new Error("Account created — refresh and log in.");
  return toPublicSession(profile);
}

export async function login({
  identifier,
  password,
}: {
  identifier: string;
  password: string;
}): Promise<PublicSession> {
  const sb = getClient();
  const id = identifier.trim();
  if (!id || !password) {
    throw new Error("Enter your username (or email) and password.");
  }

  let { error } = await sb.auth.signInWithPassword({
    email: id.includes("@") ? id : loginEmailFor(id),
    password,
  });

  if (error && !id.includes("@") && /invalid login credentials/i.test(error.message)) {
    // Username whose auth email is a real address (recovery-enabled account):
    // resolve it server-side — the RPC only answers when the password matches.
    let realEmail: string | null = null;
    try {
      const rpcResult = await sb.rpc("troll_login_email", {
        p_username: id,
        p_password: password,
      });
      realEmail = (rpcResult.data as string | null) ?? null;
    } catch {
      realEmail = null;
    }
    if (realEmail) {
      ({ error } = await sb.auth.signInWithPassword({
        email: realEmail,
        password,
      }));
    }
  }
  if (error) throw friendlyError(error, "Login failed. Check your details and try again.");

  const { data: sessionData } = await sb.auth.getSession();
  const user = sessionData?.session?.user;
  if (!user) throw new Error("Login failed. Try again.");
  if (sessionData.session) writeSsoCookie(sessionData.session);
  const profile = await loadProfile(user.id);
  if (!profile) throw new Error("Login succeeded but no profile was found.");
  return toPublicSession(profile);
}

export async function logout() {
  const sb = getClient();
  await sb.auth.signOut();
  writeSsoCookie(null);
}
