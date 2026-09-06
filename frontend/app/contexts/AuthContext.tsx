"use client";

import { link } from "node:fs";
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface User {
  user_id: string;
  username: string | null;
  email: string | null;
  steam_id: string | null;
  discord_id: string | null;
  twitch_id: string | null;
  twitch_login: string | null;
  is_partner?: boolean;
  patreon_id?: string | null;
  is_paid?: boolean;
  needs_email: boolean;
  is_admin?: boolean;
  profile_private?: boolean;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  loginSteam: string;
  loginDiscord: string;
  loginTwitch: string;
  loginPatreon: string;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const links = {
  loginSteam: `${API_BASE}/api/auth/steam/redirect`,
  loginDiscord: `${API_BASE}/api/auth/steam/redirect`,
  loginTwitch: `${API_BASE}/api/auth/steam/redirect`,
  loginPatreon: `${API_BASE}/api/auth/steam/redirect`,
};

const AuthContext = createContext<AuthContextType>({
  ...links,
  user: null,
  loading: true,
  logout: async () => {},
  refresh: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchMe = useCallback(async () => {
    try {
      const headers: Record<string, string> = {};
      const token = localStorage.getItem("spire_token");
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
      const res = await fetch(`${API_BASE}/api/auth/me`, {
        credentials: "include",
        headers,
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");

    // Clean auth-related params from the URL
    if (token || params.get("linked") || params.get("auth")) {
      params.delete("token");
      params.delete("auth");
      params.delete("linked");
      params.delete("error");
      const clean = params.toString();
      const path = window.location.pathname + (clean ? `?${clean}` : "");
      window.history.replaceState({}, "", path);
    }

    if (token) {
      // Save token first, then try cookie, then fetch user
      localStorage.setItem("spire_token", token);
      fetch(`${API_BASE}/api/auth/set-cookie`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      })
        .catch(() => {})
        .finally(() => fetchMe());
    } else {
      fetchMe();
    }
    // Run only once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const logout = useCallback(async () => {
    localStorage.removeItem("spire_token");
    try {
      await fetch(`${API_BASE}/api/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // Logout is best-effort
    }
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ ...links, user, loading, logout, refresh: fetchMe }}
    >
      {children}
    </AuthContext.Provider>
  );
}
