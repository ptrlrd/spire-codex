const CDN_URL = process.env.NEXT_PUBLIC_CDN_URL?.replace(/\/$/, "") || "";
const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export function imageUrl(path: string | null | undefined): string {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  if (CDN_URL && path.startsWith("/static/images/")) {
    return `${CDN_URL}${path.replace("/static/images/", "/")}`;
  }
  return `${API}${path}`;
}
