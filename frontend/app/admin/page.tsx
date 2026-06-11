import type { Metadata } from "next";
import AdminClient from "./AdminClient";

// Unlinked, unindexed operator page. The UI being public is fine: every
// /api/admin route checks the server-side allowlist, and Cloudflare Access
// fronts these paths in production on top of that.
export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return <AdminClient />;
}
