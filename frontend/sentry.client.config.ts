import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    // Filter non-actionable noise:
    // - Aborted fetches from bots/crawlers or users navigating away mid-request
    // - Errors thrown by browser extensions (wallet proxies, etc.) — not our code
    ignoreErrors: [
      "TypeError: Failed to fetch",
      "TypeError: NetworkError when attempting to fetch resource.",
      "TypeError: Load failed",
      // Browser extension proxy conflicts (TronLink, MetaMask, etc.)
      /trap returned falsish for property/,
    ],
    // Drop errors with stacktraces that point only to extension-injected code
    denyUrls: [/\/injected\/injected\.js/],
  });
}
