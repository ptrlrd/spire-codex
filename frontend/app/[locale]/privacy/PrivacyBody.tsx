import { localePath, type Locale } from "@/lib/locale";
import { getT } from "@/lib/i18n-server";
import { Link } from "@/i18n/navigation";
import JsonLd from "@/app/components/JsonLd";
import { buildBreadcrumbJsonLd } from "@/lib/jsonld";

const LAST_UPDATED = "July 20, 2026";

export default async function PrivacyBody({ lang }: { lang: Locale }) {
  const t = await getT(lang);
  const jsonLd = buildBreadcrumbJsonLd([
    { name: t("Home"), href: localePath(lang, "/") },
    { name: t("Privacy Policy"), href: localePath(lang, "/privacy") },
  ]);
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <JsonLd data={jsonLd} />
      <h1 className="text-3xl font-bold mb-2">
        <span className="text-[var(--accent-gold)]">{t("Privacy")}</span>{" "}
        <span className="text-[var(--text-primary)]">{t("Policy")}</span>
      </h1>
      <p className="text-sm text-[var(--text-muted)] mb-8">
        {t("Last updated:")} {LAST_UPDATED}
      </p>

      <div className="space-y-6 text-[var(--text-secondary)] leading-relaxed">
        {lang !== "eng" && (
          <p className="text-sm text-[var(--text-muted)]">
            {t(
              "This is a machine-assisted translation. The English version is the authoritative one.")}
          </p>
        )}

        <p>
          {t(
            "Spire Codex (“the Service”) is a fan-made database, API, and overlay for Slay the Spire 2. This page describes what we collect when you use the website (")}
          <a href="https://spire-codex.com" className="text-[var(--accent-gold)] hover:underline">spire-codex.com</a>
          {t("), the public API, the embeddable widgets, and the Overwolf overlay.")}
        </p>

        <section>
          <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">{t("What we collect")}</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li>
              <strong className="text-[var(--text-primary)]">{t("Run data.")}</strong>{" "}
              {t(
                "When you submit a run from the desktop app or the Overwolf overlay, we store the run JSON: character, ascension, deck, relics, encounters, floor-by-floor history, and the result. Run files are immutable once submitted.")}
            </li>
            <li>
              <strong className="text-[var(--text-primary)]">{t("Steam identifiers.")}</strong>{" "}
              {t(
                "When you sign in with Steam, we receive your 64-bit SteamID and your public persona name from Steam’s OpenID endpoint. We use these to attribute submitted runs and to surface your name on leaderboards.")}
            </li>
            <li>
              <strong className="text-[var(--text-primary)]">{t("Request metadata.")}</strong>{" "}
              {t(
                "Standard server logs (timestamp, request path, HTTP status, user-agent) and the source IP address. IPs are used for rate limiting and abuse prevention.")}
            </li>
            <li>
              <strong className="text-[var(--text-primary)]">{t("Feedback you send.")}</strong>{" "}
              {t(
                "If you submit feedback through the website or overlay, we store the contact field you provide (Discord handle, email, or GitHub username, whatever you type) along with the message body.")}
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">{t("What we don’t collect")}</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li>{t("No password, OAuth token, or Steam session token. Steam sign-in is one-shot OpenID; we never see your credentials.")}</li>
            <li>{t("No email address (unless you voluntarily provide one as a contact value when submitting feedback).")}</li>
            <li>{t("No cross-site tracking beyond what's described in the Advertising section. We use Google Analytics and self-hosted Umami for aggregate traffic statistics, and NitroPay for advertising, nothing else, no Meta Pixel, no data brokers.")}</li>
            <li>{t("No payment information. Donations are handled by Ko-fi on its own site.")}</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">{t("How we use it")}</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li>{t("Run data powers leaderboards, community statistics, and shareable run links.")}</li>
            <li>{t("Steam identifiers tie submitted runs to a profile so you can claim and manage your own history.")}</li>
            <li>{t("Server logs are used to debug issues, monitor performance, and stop abuse.")}</li>
            <li>{t("Feedback is forwarded to a private Discord channel and a GitHub issue tracker so we can act on it.")}</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">{t("Advertising")}</h2>
          <p>
            {t(
              "The website shows ads served by NitroPay (GG Software, Ltd). To serve and measure ads, NitroPay and its advertising partners may process: your IP address, approximate (city-level) location derived from it, device and browser information, and cookies or similar identifiers used to cap ad frequency, detect fraud, and, where you have consented, personalize ads.")}
          </p>
          <p className="mt-2">
            <strong className="text-[var(--text-primary)]">{t("If you are in the EEA, UK, or Switzerland")}</strong>
            {t(
              ", a consent dialog appears before any personalized advertising happens. Personalized ads run only if you opt in; declining shows non-personalized ads instead. You can change your answer at any time using the Manage Consent link in the footer of every page, which reopens the consent dialog with the full list of advertising partners and purposes.")}
          </p>
          <p className="mt-2">
            <strong className="text-[var(--text-primary)]">{t("If you are a California resident")}</strong>
            {t(
              ", some of this ad-related data sharing may be considered a “sale” or “sharing” of personal information under the CCPA/CPRA. You can opt out at any time using the Do Not Sell My Personal Information link in the footer of every page. Opting out stops the sale/sharing of your data for personalized advertising; you will still see ads, just not personalized ones. We do not knowingly sell or share the personal information of anyone under 16.")}
          </p>
          <p className="mt-2">
            {t(
              "Ads appear only on the website. The API, widgets, desktop app, and overlay carry no advertising.")}
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">{t("Retention")}</h2>
          <p>
            {t(
              "Run data, leaderboard entries, and submitted feedback are retained indefinitely so the community archive remains complete. Server logs are kept for up to 30 days.")}
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">{t("Sharing")}</h2>
          <p>
            {t(
              "Outside of the advertising described above, we do not sell or rent any data. Submitted runs and persona names are public by design, they appear on leaderboards and on the public API at")}{" "}
            <a href="https://spire-codex.com/api/runs/list" className="text-[var(--accent-gold)] hover:underline">
              /api/runs/list
            </a>
            {t(". Treat anything you submit as public.")}
          </p>
          <p className="mt-2">
            {t(
              "Sub-processors used by the Service: Steam (OpenID sign-in and persona lookup), GitHub (issue tracking for feedback), Discord (real-time feedback notifications), Ko-fi (donations, optional), NitroPay (advertising), Google (analytics).")}
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">{t("Deletion requests")}</h2>
          <p>
            {t("To request deletion of your submitted runs, leaderboard entries, or feedback, email")}{" "}
            <a href="mailto:im@ptrlrd.com" className="text-[var(--accent-gold)] hover:underline">
              im@ptrlrd.com
            </a>{" "}
            {t("or open an issue on")}{" "}
            <a
              href="https://github.com/ptrlrd/spire-codex/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--accent-gold)] hover:underline"
            >
              GitHub
            </a>
            {t(". Include the SteamID or run hash you’d like removed. We process requests within a reasonable time and confirm by reply.")}
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">{t("Your California privacy rights")}</h2>
          <p>
            {t(
              "California residents have the right to know what personal information we collect (described above), the right to request deletion, the right to opt out of the sale or sharing of personal information (the footer link, or the Global Privacy Control signal, which we honor), and the right not to be discriminated against for exercising any of these rights. To exercise the know or delete rights, email")}{" "}
            <a href="mailto:im@ptrlrd.com" className="text-[var(--accent-gold)] hover:underline">
              im@ptrlrd.com
            </a>
            {t(
              ". We verify requests by asking you to demonstrate control of the SteamID or run hashes involved, and respond within 45 days.")}
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">{t("Children")}</h2>
          <p>
            {t(
              "The Service is not directed to children under 13. We do not knowingly collect data from children. If you believe a child has submitted data to the Service, contact us and we will remove it.")}
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">{t("Changes")}</h2>
          <p>
            {t(
              "We may update this policy as the Service evolves. Material changes will be noted by updating the “Last updated” date at the top of this page. Continued use of the Service after a change indicates acceptance of the revised policy.")}
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">{t("Contact")}</h2>
          <p>
            {t("Questions, concerns, or deletion requests:")}{" "}
            <a href="mailto:im@ptrlrd.com" className="text-[var(--accent-gold)] hover:underline">
              im@ptrlrd.com
            </a>
            .
          </p>
        </section>

        <p className="text-xs text-[var(--text-muted)] border-t border-[var(--border-subtle)] pt-6">
          {t(
            "Spire Codex is an independent fan project and is not affiliated with, endorsed by, or sponsored by Mega Crit Games. See the")}{" "}
          <Link href="/terms" className="text-[var(--accent-gold)] hover:underline">
            {t("Terms of Service")}
          </Link>{" "}
          {t("for use restrictions and disclaimers.")}
        </p>
      </div>
    </div>
  );
}
