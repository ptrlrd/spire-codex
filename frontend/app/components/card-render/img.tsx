import type { CSSProperties } from "react";
import { LAYER } from "./tokens";

export function img(src: string, style: CSSProperties, extra?: CSSProperties) {
  return (
    <img
      src={src}
      alt=""
      draggable={false}
      style={{ ...LAYER, ...style, ...extra }}
    />
  );
}
