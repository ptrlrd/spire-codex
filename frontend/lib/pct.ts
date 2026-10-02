export function pct(value: number | null | undefined): string {
  return Number(value ?? 0).toFixed(1);
}
