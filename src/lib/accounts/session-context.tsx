"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { getClient } from "./client";
import { adoptSsoCookie } from "./sso";
import {
  getSession,
  login as accountsLogin,
  logout as accountsLogout,
  register as accountsRegister,
  type PublicSession,
} from "./index";

type SessionStatus = "loading" | "anon" | "authed";

type SessionContextValue = {
  status: SessionStatus;
  session: PublicSession | null;
  login: (args: { identifier: string; password: string }) => Promise<void>;
  register: (args: {
    username: string;
    email?: string;
    password: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>("loading");
  const [session, setSession] = useState<PublicSession | null>(null);

  const refresh = useCallback(async () => {
    const next = await getSession();
    setSession(next);
    setStatus(next ? "authed" : "anon");
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await adoptSsoCookie();
      if (!cancelled) await refresh();
    })();

    const sb = getClient();
    const { data: sub } = sb.auth.onAuthStateChange(() => {
      void refresh();
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [refresh]);

  const login: SessionContextValue["login"] = async (args) => {
    await accountsLogin(args);
    await refresh();
  };

  const register: SessionContextValue["register"] = async (args) => {
    await accountsRegister(args);
    await refresh();
  };

  const logout = async () => {
    await accountsLogout();
    await refresh();
  };

  return (
    <SessionContext.Provider
      value={{ status, session, login, register, logout }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}
