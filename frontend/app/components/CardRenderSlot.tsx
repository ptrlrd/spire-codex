"use client";

import { useEffect, useRef, useState } from "react";
import type { Card } from "@/lib/api/types";
import { imageUrl } from "@/lib/image-url";
import CardRender from "./CardRender";
import { LANG_FONTS } from "./card-render/fonts";

const BOX = { w: 400, h: 520, x: 60, y: 65, card: 300 };

export default function CardRenderSlot({
  card,
  upgraded,
  lang,
  label,
  keywordNames,
}: {
  keywordNames?: Record<string, string>;
  card: Card;
  upgraded: boolean;
  lang: string;
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ w: width, h: height });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const lf = LANG_FONTS[lang];
  const k = size ? Math.min(size.w / BOX.w, size.h / BOX.h) : 0;
  return (
    <div
      className="cardimg render cardframe card-html"
      role="img"
      aria-label={label}
    >
      {lf?.file && (
        <style>{`@font-face{font-family:"${lf.regular}";src:url("${imageUrl(lf.file)}") format("woff2");font-display:swap;}`}</style>
      )}
      <div ref={ref} className="relative h-full w-full overflow-hidden">
        {size && k > 0 && (
          <div
            className="absolute"
            style={{
              left: (size.w - BOX.w * k) / 2 + BOX.x * k,
              top: (size.h - BOX.h * k) / 2 + BOX.y * k,
            }}
          >
            <CardRender
              card={card}
              width={BOX.card * k}
              upgraded={upgraded}
              lang={lang}
              keywordNames={keywordNames}
            />
          </div>
        )}
      </div>
    </div>
  );
}
