export const REST_KEYS: Record<string, string> = {
  REST: "Rest",
  SMITH: "Smith",
  HEAL: "Heal",
  MEND: "Mend",
  DIG: "Dig",
  CLONE: "Clone",
  COOK: "Cook",
  LIFT: "Lift",
  HATCH: "Hatch",
  KINDLE: "Kindle",
  ENHANCE_RELIC: "Enhance relic",
};

export function restSiteLabel(id: string, t: (k: string) => string): string {
  const key = REST_KEYS[id.toUpperCase()];
  if (key) return t(key);
  const words = id
    .toLowerCase()
    .split(/[_\s]+/)
    .filter(Boolean)
    .join(" ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
