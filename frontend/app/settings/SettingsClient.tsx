"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/app/contexts/AuthContext";
import { useToast } from "@/app/components/Toast";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function SettingsClient() {
  const { user, loading, refresh, loginSteam, loginDiscord } = useAuth();
  const { toast } = useToast();

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [changesRemaining, setChangesRemaining] = useState(3);
  const [saving, setSaving] = useState<"username" | "email" | null>(null);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [checkingUsername, setCheckingUsername] = useState(false);

  useEffect(() => {
    if (user) {
      setUsername(user.username || "");
      setEmail(user.email || "");
    }
  }, [user]);

  useEffect(() => {
    if (!username.trim() || username === user?.username) {
      setUsernameAvailable(null);
      return;
    }
    const timer = setTimeout(async () => {
      setCheckingUsername(true);
      try {
        const res = await fetch(
          `${API_BASE}/api/auth/username/check?username=${encodeURIComponent(username)}`,
        );
        if (res.ok) {
          const data = await res.json();
          setUsernameAvailable(data.available);
        }
      } catch {
        // Non-fatal
      } finally {
        setCheckingUsername(false);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [username, user?.username]);

  const saveUsername = async () => {
    if (!username.trim()) return;
    setSaving("username");
    try {
      const res = await fetch(`${API_BASE}/api/auth/username`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
      if (res.ok) {
        const data = await res.json();
        toast("Username updated", "success");
        setChangesRemaining(data.changes_remaining ?? changesRemaining - 1);
        refresh();
      } else if (res.status === 429) {
        toast("Username can only be changed 3 times per day", "error");
      } else {
        const err = await res.json().catch(() => null);
        toast(err?.detail || "Failed to update username", "error");
      }
    } catch {
      toast("Network error", "error");
    } finally {
      setSaving(null);
    }
  };

  const saveEmail = async () => {
    if (!email.trim()) return;
    setSaving("email");
    try {
      const res = await fetch(`${API_BASE}/api/auth/email`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (res.ok) {
        toast("Email updated", "success");
        refresh();
      } else {
        const err = await res.json().catch(() => null);
        toast(err?.detail || "Failed to update email", "error");
      }
    } catch {
      toast("Network error", "error");
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="h-8 w-32 bg-[var(--bg-card)] rounded animate-pulse" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-4">Sign in to view settings</h1>
        <p className="text-[var(--text-secondary)]">Connect your Steam or Discord account.</p>
      </div>
    );
  }

  const usernameChanged = username !== (user.username || "");
  const emailChanged = email !== (user.email || "");

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
      <h1 className="text-2xl font-bold text-[var(--text-primary)]">Settings</h1>

      {/* Display name */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">Display Name</h2>
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex-1 relative">
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              maxLength={25}
              placeholder="Enter display name"
              className="w-full px-3 py-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--border-accent)]"
            />
            {checkingUsername && (
              <span className="absolute right-3 top-2.5 text-xs text-[var(--text-tertiary)]">...</span>
            )}
            {!checkingUsername && usernameAvailable === false && usernameChanged && (
              <span className="absolute right-3 top-2.5 text-xs text-red-400">Taken</span>
            )}
            {!checkingUsername && usernameAvailable === true && usernameChanged && (
              <span className="absolute right-3 top-2.5 text-xs text-green-400">Available</span>
            )}
          </div>
          <button
            onClick={saveUsername}
            disabled={!usernameChanged || saving === "username" || usernameAvailable === false}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-[var(--border-accent)] text-white hover:opacity-90 disabled:opacity-30 transition-opacity shrink-0"
          >
            {saving === "username" ? "Saving..." : "Save"}
          </button>
        </div>
        <p className="text-xs text-[var(--text-tertiary)]">
          Letters, numbers, spaces, hyphens, underscores. Max 25 characters. {changesRemaining} changes remaining today.
        </p>
      </section>

      {/* Email */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">Email</h2>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter email address"
            className="flex-1 px-3 py-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--border-accent)]"
          />
          <button
            onClick={saveEmail}
            disabled={!emailChanged || saving === "email"}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-[var(--border-accent)] text-white hover:opacity-90 disabled:opacity-30 transition-opacity shrink-0"
          >
            {saving === "email" ? "Saving..." : "Save"}
          </button>
        </div>
        {user.needs_email && (
          <p className="text-xs text-yellow-400">
            Add an email to unlock API keys and future features.
          </p>
        )}
      </section>

      {/* Connected accounts */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">Connected Accounts</h2>
        <div className="space-y-2">
          {user.steam_id ? (
            <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)]">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-[var(--text-secondary)]" viewBox="0 0 24 24" fill="currentColor"><path d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658a3.387 3.387 0 0 1 1.912-.593c.064 0 .127.003.19.007l2.862-4.146v-.058a4.533 4.533 0 0 1 4.53-4.53 4.533 4.533 0 0 1 4.53 4.53 4.533 4.533 0 0 1-4.53 4.53h-.106l-4.08 2.91c0 .053.003.107.003.161a3.4 3.4 0 0 1-3.4 3.4 3.404 3.404 0 0 1-3.367-2.936L.256 15.21C1.542 20.2 6.218 24 11.979 24 18.627 24 24 18.627 24 11.979 24 5.373 18.627 0 11.979 0z"/></svg>
                <span className="text-sm text-[var(--text-primary)]">Steam</span>
              </div>
              <span className="text-xs text-green-400">Connected</span>
            </div>
          ) : (
            <button
              onClick={loginSteam}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] hover:border-[var(--border-accent)] transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-[var(--text-secondary)]" viewBox="0 0 24 24" fill="currentColor"><path d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658a3.387 3.387 0 0 1 1.912-.593c.064 0 .127.003.19.007l2.862-4.146v-.058a4.533 4.533 0 0 1 4.53-4.53 4.533 4.533 0 0 1 4.53 4.53 4.533 4.533 0 0 1-4.53 4.53h-.106l-4.08 2.91c0 .053.003.107.003.161a3.4 3.4 0 0 1-3.4 3.4 3.404 3.404 0 0 1-3.367-2.936L.256 15.21C1.542 20.2 6.218 24 11.979 24 18.627 24 24 18.627 24 11.979 24 5.373 18.627 0 11.979 0z"/></svg>
                <span className="text-sm text-[var(--text-primary)]">Steam</span>
              </div>
              <span className="text-xs text-[var(--text-secondary)]">Connect</span>
            </button>
          )}
          {user.discord_id ? (
            <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)]">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-[var(--text-secondary)]" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/></svg>
                <span className="text-sm text-[var(--text-primary)]">Discord</span>
              </div>
              <span className="text-xs text-green-400">Connected</span>
            </div>
          ) : (
            <button
              onClick={loginDiscord}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] hover:border-[var(--border-accent)] transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-[var(--text-secondary)]" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/></svg>
                <span className="text-sm text-[var(--text-primary)]">Discord</span>
              </div>
              <span className="text-xs text-[var(--text-secondary)]">Connect</span>
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
