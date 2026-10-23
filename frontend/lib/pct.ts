export function pct(value: number | null | undefined): string {
  return Number(value ?? 0).toFixed(1);
}

export function pct2(value: number): number {
  return Number(value.toFixed(2));
}

export function fmtNum(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value))
    return String(value);
  return Number.isInteger(value)
    ? String(value)
    : String(Number(value.toFixed(2)));
}
