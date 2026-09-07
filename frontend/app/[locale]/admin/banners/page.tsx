import type { Metadata } from "next";
import BannersClient from "./BannersClient";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

export default function AdminBannersPage() {
  return <BannersClient />;
}
