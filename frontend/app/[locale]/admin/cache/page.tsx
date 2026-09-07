import type { Metadata } from "next";
import CacheClient from "./CacheClient";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

export default function AdminCachePage() {
  return <CacheClient />;
}
