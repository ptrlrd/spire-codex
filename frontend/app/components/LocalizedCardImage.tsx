"use client";

import { useState } from "react";
import { fullCardUrl } from "@/lib/image-url";

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
  const english = fullCardUrl(id, upgraded);
  const [src, setSrc] = useState(fullCardUrl(id, upgraded, "stable", lang));
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      loading={loading}
      crossOrigin="anonymous"
      onError={() => {
        if (src !== english) setSrc(english);
      }}
    />
  );
}
