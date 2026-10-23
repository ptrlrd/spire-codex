import { LANG_PREFIXES } from "./../languages";

export function inBeta(pathname: string): boolean {
  const parts = pathname.split("/");
  return (
    parts[1] === "beta" || (LANG_PREFIXES.has(parts[1]) && parts[2] === "beta")
  );
}
