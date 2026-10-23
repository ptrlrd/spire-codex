"use client";

import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { useAuth } from "@/app/contexts/AuthContext";
import { useToast } from "@/app/components/Toast";
import { SupporterBadge } from "@/app/components/SupporterBadge";
import { forgetFlair } from "@/lib/supporter-flair";
import { useT } from "@/lib/i18n";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const SOURCE_LABELS: Record<string, string> = {
  patreon: "Patreon",
  kofi: "Ko-fi",
  overwolf: "Overwolf",
};

export default function ProfileSettings() {
  const { user } = useAuth();
  const t = useT();
  const { toast } = useToast();
  const [profilePrivate, setProfilePrivate] = useState<boolean | null>(null);
  const [thanksListed, setThanksListed] = useState<boolean | null>(null);
  const [themePublic, setThemePublic] = useState<boolean | null>(null);

  useEffect(() => {
    if (user) {
      setProfilePrivate(Boolean(user.profile_private));
      setThanksListed(Boolean(user.supporter?.listed));
      setThemePublic(Boolean(user.supporter?.theme_public));
    }
  }, [user]);

  const toggleThemePublic = async (next: boolean) => {
    const prev = themePublic;
    setThemePublic(next);
    try {
      const res = await fetch(`${API_BASE}/api/auth/theme`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ public: next }),
      });
      if (!res.ok) throw new Error();
      forgetFlair(user?.username);
      toast(
        next
          ? t("Your theme now shows on your profile and runs.")
          : t("Your theme is only visible to you."),
        "success",
      );
    } catch {
      setThemePublic(prev);
      toast(t("Network error"), "error");
    }
  };

  const toggleThanksListing = async (next: boolean) => {
    const prev = thanksListed;
    setThanksListed(next);
    try {
      const res = await fetch(`${API_BASE}/api/auth/thanks-listing`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listed: next }),
      });
      if (!res.ok) throw new Error();
      toast(
        next
          ? t("Your name is now on the Thank You page.")
          : t("Your name is hidden from the Thank You page."),
        "success",
      );
    } catch {
      setThanksListed(prev);
      toast(t("Network error"), "error");
    }
  };

  const togglePrivacy = async (next: boolean) => {
    const prev = profilePrivate;
    setProfilePrivate(next);
    try {
      const res = await fetch(`${API_BASE}/api/auth/profile-privacy`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ private: next }),
      });
      if (!res.ok) throw new Error();
      toast(
        next
          ? t("Your profile is now private.")
          : t("Your profile is now public."),
        "success",
      );
    } catch {
      setProfilePrivate(prev);
      toast(t("Network error"), "error");
    }
  };

  if (!user) return null;
  return (
    <>
      {user.username && profilePrivate !== null && (
        <section className="bg-[var(--bg-card)] rounded-lg border border-[var(--border-subtle)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                {t("Public profile")}
              </h2>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                {profilePrivate
                  ? t(
                      "Your profile page is private. Your runs still appear on leaderboards.",
                    )
                  : t(
                      "Anyone can view your stats and insights at your player page.",
                    )}
              </p>
              {!profilePrivate && (
                <Link
                  href={`/players/${encodeURIComponent(user.username)}`}
                  className="inline-block mt-1 text-xs text-[var(--accent-gold)] hover:underline"
                >
                  {t("View public profile")}
                </Link>
              )}
            </div>
            <label className="flex items-center gap-2 cursor-pointer select-none shrink-0">
              <input
                type="checkbox"
                checked={profilePrivate}
                onChange={(e) => togglePrivacy(e.target.checked)}
                className="accent-[var(--accent-gold)] w-4 h-4"
              />
              <span className="text-sm text-[var(--text-secondary)]">
                {t("Private profile")}
              </span>
            </label>
          </div>
          {(user.supporter?.active || user.supporter?.thanks_eligible) && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-subtle)] pt-4">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-[var(--text-primary)]">
                  {user.supporter.active
                    ? t("You're a supporter, thank you. Ads are off for you.")
                    : t(
                        "Thanks for your Overwolf Common membership. You can list your name on the Thank You page.",
                      )}
                </div>
                {user.supporter.active && (
                  <p className="text-xs text-[var(--text-muted)]">
                    {user.supporter.sources
                      .map((s) => SOURCE_LABELS[s.source] ?? s.source)
                      .join(" · ")}
                  </p>
                )}
              </div>
              <label className="flex items-center gap-2 cursor-pointer select-none shrink-0">
                <input
                  type="checkbox"
                  checked={Boolean(thanksListed)}
                  onChange={(e) => toggleThanksListing(e.target.checked)}
                  className="accent-[var(--accent-gold)] w-4 h-4"
                />
                <span className="text-sm text-[var(--text-secondary)]">
                  {t("List me on the Thank You page")}
                </span>
              </label>
            </div>
          )}
          {user.supporter?.active && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-subtle)] pt-4">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-[var(--text-primary)]">
                  {t("Your theme")}{" "}
                  <SupporterBadge
                    theme={user.supporter.theme}
                    className="ml-1"
                  />
                </div>
                <p className="text-xs text-[var(--text-muted)]">
                  {user.supporter.theme
                    ? t(
                        "Pick a character or a custom color from the theme menu in the top bar. When shown, people see your colors on your profile, your runs and your replays, and your badge everywhere your name appears.",
                      )
                    : t(
                        "Pick a character or a custom color from the theme menu in the top bar to set your theme.",
                      )}
                </p>
              </div>
              <label className="flex items-center gap-2 cursor-pointer select-none shrink-0">
                <input
                  type="checkbox"
                  checked={Boolean(themePublic)}
                  onChange={(e) => toggleThemePublic(e.target.checked)}
                  className="accent-[var(--accent-gold)] w-4 h-4"
                />
                <span className="text-sm text-[var(--text-secondary)]">
                  {t("Show my theme to others")}
                </span>
              </label>
            </div>
          )}
        </section>
      )}
    </>
  );
}
