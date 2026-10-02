"use client";

import { useEffect } from "react";
import { useFlairFor } from "@/lib/supporter-flair";
import {
  applyPalette,
  paletteFor,
  restoreViewerPalette,
  viewerMode,
} from "@/lib/theme-palette";
import { useViewerMode } from "./useViewerMode";

const ATTR = "data-owner-theme";

export function OwnerTheme({
  username,
}: {
  username: string | null | undefined;
}) {
  const flair = useFlairFor(username);
  const mode = useViewerMode();
  const theme = flair?.theme ?? null;

  useEffect(() => {
    if (!theme) return;
    const root = document.documentElement;
    const apply = () => applyPalette(paletteFor(theme, viewerMode()));
    apply();
    root.setAttribute(ATTR, theme);
    return () => {
      restoreViewerPalette();
      root.removeAttribute(ATTR);
    };
  }, [theme, mode]);

  return null;
}
