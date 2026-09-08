"use client";

import { useT } from "@/lib/i18n";
import { useState, useEffect } from "react";
import { useAuth } from "@/app/contexts/AuthContext";
import ApiKeysSection from "@/app/components/ApiKeysSection";
import { useToast } from "@/app/components/Toast";
import DiscordIcon from "@/app/components/DiscordIcon";
import TwitchIcon from "@/app/components/TwitchIcon";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function SettingsClient() {
  const t = useT();
  const { user, loading, refresh, loginSteam, loginDiscord, loginTwitch, loginPatreon } = useAuth();
  const [tab, setTab] = useState<"account" | "api">("account");
  const { toast } = useToast();

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [disconnecting, setDisconnecting] = useState<"steam" | "discord" | "twitch" | "patreon" | null>(
    null,
  );
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
        toast(t("Username updated"), "success");
        setChangesRemaining(data.changes_remaining ?? changesRemaining - 1);
        refresh();
      } else if (res.status === 429) {
        toast(t("Username can only be changed 3 times per day"), "error");
      } else {
        const err = await res.json().catch(() => null);
        toast(err?.detail || t("Failed to update username"), "error");
      }
    } catch {
      toast(t("Network error"), "error");
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
        toast(t("Email updated"), "success");
        refresh();
      } else {
        const err = await res.json().catch(() => null);
        toast(err?.detail || t("Failed to update email"), "error");
      }
    } catch {
      toast(t("Network error"), "error");
    } finally {
      setSaving(null);
    }
  };

  const disconnect = async (provider: "steam" | "discord" | "twitch" | "patreon") => {
    const label = provider.charAt(0).toUpperCase() + provider.slice(1);
    setDisconnecting(provider);
    try {
      const res = await fetch(`${API_BASE}/api/auth/${provider}/disconnect`, {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        toast(t("{provider} disconnected", { provider: label }), "success");
        refresh();
      } else {
        const err = await res.json().catch(() => null);
        toast(err?.detail || t("Failed to disconnect {provider}", { provider: label }), "error");
      }
    } catch {
      toast(t("Network error"), "error");
    } finally {
      setDisconnecting(null);
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
        <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-4">{t("Sign in to view settings")}</h1>
        <p className="text-[var(--text-secondary)]">{t("Connect your Steam or Discord account.")}</p>
      </div>
    );
  }

  const usernameChanged = username !== (user.username || "");
  const emailChanged = email !== (user.email || "");

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
      <h1 className="text-2xl font-bold text-[var(--text-primary)]">{t("Settings")}</h1>

      {/* Sub menu: account settings vs the API key manager */}
      <nav className="flex gap-1.5">
        {(
          [
            { key: "account", label: t("Account") },
            { key: "api", label: t("API Key") },
          ] as const
        ).map((s_) => (
          <button
            key={s_.key}
            type="button"
            onClick={() => setTab(s_.key)}
            className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
              tab === s_.key
                ? "bg-[var(--accent-gold)]/10 border-[var(--accent-gold)]/40 text-[var(--accent-gold)]"
                : "border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            {s_.label}
          </button>
        ))}
      </nav>

      {tab === "api" && <ApiKeysSection />}

      {tab === "account" && (
        <>
      {/* Display name */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">{t("Display Name")}</h2>
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex-1 relative">
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              maxLength={32}
              placeholder={t("Enter display name")}
              className="w-full px-3 py-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--border-accent)]"
            />
            {checkingUsername && (
              <span className="absolute right-3 top-2.5 text-xs text-[var(--text-tertiary)]">...</span>
            )}
            {!checkingUsername && usernameAvailable === false && usernameChanged && (
              <span className="absolute right-3 top-2.5 text-xs text-red-400">{t("Taken")}</span>
            )}
            {!checkingUsername && usernameAvailable === true && usernameChanged && (
              <span className="absolute right-3 top-2.5 text-xs text-green-400">{t("Available")}</span>
            )}
          </div>
          <button
            onClick={saveUsername}
            disabled={!usernameChanged || saving === "username" || usernameAvailable === false}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-[var(--border-accent)] text-white hover:opacity-90 disabled:opacity-30 transition-opacity shrink-0"
          >
            {saving === "username" ? t("Saving...") : t("Save")}
          </button>
        </div>
        <p className="text-xs text-[var(--text-tertiary)]">
          {t("Letters, numbers, spaces, hyphens, underscores. Max 32 characters.")} {changesRemaining} {t("changes remaining today.")}
        </p>
      </section>

      {/* Email */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">{t("Email")}</h2>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("Enter email address")}
            className="flex-1 px-3 py-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--border-accent)]"
          />
          <button
            onClick={saveEmail}
            disabled={!emailChanged || saving === "email"}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-[var(--border-accent)] text-white hover:opacity-90 disabled:opacity-30 transition-opacity shrink-0"
          >
            {saving === "email" ? t("Saving...") : t("Save")}
          </button>
        </div>
        {user.needs_email && (
          <p className="text-xs text-yellow-400">
            {t("Add an email to unlock API keys and future features.")}
          </p>
        )}
      </section>

      {/* Connected accounts */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">{t("Connected Accounts")}</h2>
        <div className="space-y-2">
          {user.steam_id ? (
            <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)]">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-[var(--text-secondary)]" viewBox="0 0 24 24" fill="currentColor"><path d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658a3.387 3.387 0 0 1 1.912-.593c.064 0 .127.003.19.007l2.862-4.146v-.058a4.533 4.533 0 0 1 4.53-4.53 4.533 4.533 0 0 1 4.53 4.53 4.533 4.533 0 0 1-4.53 4.53h-.106l-4.08 2.91c0 .053.003.107.003.161a3.4 3.4 0 0 1-3.4 3.4 3.404 3.404 0 0 1-3.367-2.936L.256 15.21C1.542 20.2 6.218 24 11.979 24 18.627 24 24 18.627 24 11.979 24 5.373 18.627 0 11.979 0z"/></svg>
                <span className="text-sm text-[var(--text-primary)]">Steam</span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-xs text-[var(--text-muted)]">{t("Connected")}</span>
                <button
                  onClick={() => disconnect("steam")}
                  disabled={disconnecting === "steam"}
                  className="text-xs text-[var(--text-secondary)] hover:text-red-400 disabled:opacity-40"
                >
                  {disconnecting === "steam" ? "..." : t("Disconnect")}
                </button>
              </div>
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
              <span className="text-xs text-[var(--text-secondary)]">{t("Connect")}</span>
            </button>
          )}
          {user.discord_id ? (
            <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)]">
              <div className="flex items-center gap-2">
                <DiscordIcon className="w-4 h-4 text-[var(--text-secondary)]" />
                <span className="text-sm text-[var(--text-primary)]">Discord</span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-xs text-[var(--text-muted)]">{t("Connected")}</span>
                <button
                  onClick={() => disconnect("discord")}
                  disabled={disconnecting === "discord"}
                  className="text-xs text-[var(--text-secondary)] hover:text-red-400 disabled:opacity-40"
                >
                  {disconnecting === "discord" ? "..." : t("Disconnect")}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={loginDiscord}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] hover:border-[var(--border-accent)] transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <DiscordIcon className="w-4 h-4 text-[var(--text-secondary)]" />
                <span className="text-sm text-[var(--text-primary)]">Discord</span>
              </div>
              <span className="text-xs text-[var(--text-secondary)]">{t("Connect")}</span>
            </button>
          )}
          {user.twitch_id ? (
            <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)]">
              <div className="flex items-center gap-2 min-w-0">
                <TwitchIcon className="w-4 h-4 text-[#9146FF]" />
                <span className="text-sm text-[var(--text-primary)] shrink-0">Twitch</span>
                {user.twitch_login && (
                  <a
                    href={`https://twitch.tv/${user.twitch_login}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-[var(--text-muted)] truncate hover:text-[#9146FF]"
                  >
                    @{user.twitch_login}
                  </a>
                )}
                {user.is_partner && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#9146FF]/15 text-[#9146FF] border border-[#9146FF]/30 shrink-0">
                    {t("Partner")}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-xs text-[var(--text-muted)]">{t("Connected")}</span>
                <button
                  onClick={() => disconnect("twitch")}
                  disabled={disconnecting === "twitch"}
                  className="text-xs text-[var(--text-secondary)] hover:text-red-400 disabled:opacity-40"
                >
                  {disconnecting === "twitch" ? "..." : t("Disconnect")}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={loginTwitch}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] hover:border-[var(--border-accent)] transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <TwitchIcon className="w-4 h-4 text-[var(--text-secondary)]" />
                <span className="text-sm text-[var(--text-primary)]">Twitch</span>
              </div>
              <span className="text-xs text-[var(--text-secondary)]">{t("Connect")}</span>
            </button>
          )}
          {user.patreon_id ? (
            <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)]">
              <div className="flex items-center gap-2 min-w-0">
                <svg className="w-4 h-4 text-[#FF424D]" viewBox="0 0 24 24" fill="currentColor" aria-hidden><circle cx="14.5" cy="9.5" r="7.5" /><rect x="2" y="2" width="4" height="20" /></svg>
                <span className="text-sm text-[var(--text-primary)] shrink-0">Patreon</span>
                {user.is_paid && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[var(--accent-gold)]/15 text-[var(--accent-gold)] border border-[var(--accent-gold)]/30 shrink-0">
                    {t("Supporter")}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-xs text-[var(--text-muted)]">{t("Connected")}</span>
                <button
                  onClick={() => disconnect("patreon")}
                  disabled={disconnecting === "patreon"}
                  className="text-xs text-[var(--text-secondary)] hover:text-red-400 disabled:opacity-40"
                >
                  {disconnecting === "patreon" ? "..." : t("Disconnect")}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={loginPatreon}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] hover:border-[var(--border-accent)] transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-[var(--text-secondary)]" viewBox="0 0 24 24" fill="currentColor" aria-hidden><circle cx="14.5" cy="9.5" r="7.5" /><rect x="2" y="2" width="4" height="20" /></svg>
                <span className="text-sm text-[var(--text-primary)]">Patreon</span>
              </div>
              <span className="text-xs text-[var(--text-secondary)]">{t("Connect")}</span>
            </button>
          )}
        </div>
        <p className="text-xs text-[var(--text-tertiary)]">
          {t("Connect Twitch to show a “Watch on Twitch” link on your live run when you are streaming.")}
        </p>
      </section>
        </>
      )}
    </div>
  );
}
