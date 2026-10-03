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
};

export function restSiteLabel(id: string, t: (k: string) => string): string {
  const key = REST_KEYS[id.toUpperCase()];
  return key ? t(key) : id.charAt(0) + id.slice(1).toLowerCase();
}
