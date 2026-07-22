// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://986c156ca60cf70b733c2e2b9c675d8a@o4511214402273280.ingest.us.sentry.io/4511214419443712",

  // Replay is added below via lazyLoadIntegration so its engine (the
  // single biggest piece of the Sentry client) stays out of the bundle.
  integrations: [],

  // Sample traces instead of tracing every page load; errors are
  // unaffected, this only throttles performance-monitoring events.
  tracesSampleRate: 0.1,
  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Error replays only: sampling 10% of ALL sessions burned the Sentry
  // quota, and every visitor's console then filled with envelope 429s.
  replaysSessionSampleRate: 0,

  // Define how likely Replay events are sampled when an error occurs.
  replaysOnErrorSampleRate: 1.0,

  // Enable sending user PII (Personally Identifiable Information)
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#sendDefaultPii
  sendDefaultPii: true,
});

// Fetch the Replay integration from the Sentry CDN after startup instead of
// bundling it. Sample rates above still apply once it attaches; sessions
// that error before it loads just lack a replay, which is an acceptable
// trade for removing the engine from every page's first-load JS.
Sentry.lazyLoadIntegration("replayIntegration")
  .then((replayIntegration) => Sentry.addIntegration(replayIntegration()))
  .catch(() => {});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
