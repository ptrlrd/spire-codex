"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface User {
  user_id: string;
  username: string | null;
  email: string | null;
  steam_id: string | null;
  discord_id: string | null;
  needs_email: boolean;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  loginSteam: () => void;
  loginDiscord: () => void;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  loginSteam: () => {},
  loginDiscord: () => {},
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
      const res = await fetch(`${API_BASE}/api/auth/me`, {
        credentials: "include",
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
    fetchMe();
  }, [fetchMe]);

  const loginSteam = useCallback(() => {
    const width = 800;
    const height = 600;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    const popup = window.open(
      "about:blank",
      "steam_login",
      `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no`
    );

    if (!popup) {
      alert("Popup was blocked. Allow popups for this site and try again.");
      return;
    }

    fetch(`${API_BASE}/api/auth/steam/start`, {
      method: "POST",
      credentials: "include",
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.login_url) {
          popup.location.href = data.login_url;
          pollSteamSession(data.session_id, popup);
        } else {
          popup.close();
        }
      })
      .catch(() => {
        popup.close();
      });
  }, []);

  const pollSteamSession = useCallback(
    (sessionId: string, popup: Window) => {
      const interval = setInterval(async () => {
        if (popup.closed) {
          clearInterval(interval);
          fetchMe();
          return;
        }
        try {
          const res = await fetch(
            `${API_BASE}/api/auth/steam/poll/${sessionId}`,
            { credentials: "include" }
          );
          if (!res.ok) {
            clearInterval(interval);
            return;
          }
          const data = await res.json();
          if (data.status === "ok") {
            clearInterval(interval);
            popup.close();
            fetchMe();
          } else if (data.status === "error") {
            clearInterval(interval);
            popup.close();
          }
        } catch {
          // Network error during poll, keep trying
        }
      }, 2000);

      setTimeout(() => {
        clearInterval(interval);
        if (!popup.closed) popup.close();
      }, 300000);
    },
    [fetchMe]
  );

  const loginDiscord = useCallback(() => {
    window.location.href = `${API_BASE}/api/auth/discord/start`;
  }, []);

  const logout = useCallback(async () => {
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
      value={{ user, loading, loginSteam, loginDiscord, logout, refresh: fetchMe }}
    >
      {children}
    </AuthContext.Provider>
  );
}
