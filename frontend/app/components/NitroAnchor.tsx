"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    nitroAds?: {
      createAd: (id: string, config: Record<string, unknown>) => Promise<unknown>;
    };
  }
}

/** The site's single ad unit: a dismissible bottom anchor. The head stub
 * queues this call if the loader hasn't arrived yet, and data-spa="auto"
 * keeps it fresh across client-side navigations. */
export default function NitroAnchor() {
  useEffect(() => {
    window.nitroAds?.createAd("anchor", {
      format: "anchor",
      anchor: "bottom",
      anchorPersistClose: true,
      mediaQuery: "(min-width: 320px)",
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
