"use client";

import { useEffect, useState } from "react";
import { viewerMode, type PaletteMode } from "@/lib/theme-palette";

export function useViewerMode(): PaletteMode {
  const [mode, setMode] = useState<PaletteMode>("dark");
  useEffect(() => {
    const update = () => setMode(viewerMode());
    update();
    const obs = new MutationObserver(update);
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => obs.disconnect();
  }, []);
  return mode;
}
