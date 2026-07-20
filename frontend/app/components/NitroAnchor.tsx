"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    nitroAds?: {
      createAd: (id: string, config: Record<string, unknown>) => Promise<unknown>;
    };
  }
}

/** The site's single ad unit: the dashboard-configured "scnp-anchor"
 * floating bottom anchor. The head stub queues this call if the loader
 * hasn't arrived yet, and data-spa="auto" keeps it fresh across
 * client-side navigations. Config mirrors the placement builder output. */
export default function NitroAnchor() {
  useEffect(() => {
    window.nitroAds?.createAd("scnp-anchor", {
      format: "anchor-v2",
      anchor: "bottom",
      anchorBgColor: "rgb(0 0 0 / 80%)",
      anchorClose: true,
      anchorPersistClose: false,
      anchorStickyOffset: 0,
      mediaQuery: "(min-width: 0px)",
      report: {
        enabled: true,
        icon: true,
        wording: "Report Ad",
        position: "top-right",
      },
    });
  }, []);
  return null;
}
