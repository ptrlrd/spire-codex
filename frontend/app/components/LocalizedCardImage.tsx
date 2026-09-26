"use client";

import CardImage from "@/app/components/CardImage";

/** Card art in the page's language, falling back to the English render, then
 * the beta render, then a labelled placeholder when the catalog has no card. */
export default function LocalizedCardImage({
  id,
  alt,
  className,
  upgraded = false,
  loading = "lazy",
}: {
  id: string;
  lang?: string;
  alt: string;
  className?: string;
  upgraded?: boolean;
  loading?: "lazy" | "eager";
}) {
  return (
    <CardImage
      id={id}
      upgraded={upgraded}
      alt={alt}
      className={className}
      loading={loading}
    />
  );
}
