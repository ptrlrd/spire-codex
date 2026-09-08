"use client";

import { useState } from "react";
import { fullCardUrl } from "@/lib/image-url";

/** Card art in the page's language, falling back to the English render when a
 * locale has no image for that card. The displayed URL is derived from the
 * props on every render and only the URL that failed is state, so changing
 * locale or card retries the localized art instead of keeping a stale image. */
export default function LocalizedCardImage({
  id,
  lang,
  alt,
  className,
  upgraded = false,
  loading = "lazy",
}: {
  id: string;
  lang: string;
  alt: string;
  className?: string;
  upgraded?: boolean;
  loading?: "lazy" | "eager";
}) {
  const localized = fullCardUrl(id, upgraded, "stable", lang);
  const english = fullCardUrl(id, upgraded);
  const [failed, setFailed] = useState<string | null>(null);
  const src = failed === localized ? english : localized;
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      loading={loading}
      crossOrigin="anonymous"
      onError={() => {
        if (src !== english) setFailed(src);
      }}
    />
  );
}
