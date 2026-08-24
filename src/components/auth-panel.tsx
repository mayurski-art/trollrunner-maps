"use client";

import { useState } from "react";
import { useSession } from "@/lib/accounts/session-context";

/** Login / signup against the shared TrollRunner account system. */
export function AuthPanel({ onDone }: { onDone?: () => void }) {
  const { login, register } = useSession();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [identifier, setIdentifier] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "login") await login({ identifier, password });
      else await register({ username, email: email || undefined, password });
      onDone?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">
          {mode === "login" ? "Log in to drop your pin" : "Create your troll account"}
        </h2>
        <p className="mt-1 text-sm text-muted">
          One account works across every TrollRunner site.
        </p>
      </div>

      <div className="flex rounded-xl border border-line bg-white/5 p-1">
        {(["login", "register"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              setError(null);
            }}
            className={`flex-1 rounded-lg py-1.5 text-sm font-medium transition-colors ${
              mode === m ? "bg-raised text-foreground" : "text-muted"
            }`}
          >
            {m === "login" ? "Log in" : "Sign up"}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        {mode === "login" ? (
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted">Username or email</span>
            <input
              className="field"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              autoComplete="username"
              required
            />
          </label>
        ) : (
          <>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-muted">Username</span>
              <input
                className="field"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                maxLength={20}
                required
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-muted">Email (optional)</span>
              <input
                className="field"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </label>
          </>
        )}

        <label className="block space-y-1">
          <span className="text-xs font-medium text-muted">Password</span>
          <input
            className="field"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            required
          />
        </label>

        {error ? (
          <p role="alert" className="text-sm text-[#ff8098]">
            {error}
          </p>
        ) : null}

        <button type="submit" className="btn btn--primary w-full" disabled={busy}>
          {busy ? "Working…" : mode === "login" ? "Log in" : "Create account"}
        </button>
      </form>
    </div>
  );
}
