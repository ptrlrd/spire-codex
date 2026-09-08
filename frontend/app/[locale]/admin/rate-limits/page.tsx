import type { Metadata } from "next";
import RateLimitsClient from "./RateLimitsClient";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

export default function AdminRateLimitsPage() {
  return <RateLimitsClient />;
}
