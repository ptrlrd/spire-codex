export const HYDRATION_CHUNK = 48;

export function chunked<T>(items: T[], size = HYDRATION_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size)
    out.push(items.slice(i, i + size));
  return out;
}
