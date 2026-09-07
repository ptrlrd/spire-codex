import type { Metadata } from "next";
import EloClient from "./EloClient";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

export default function AdminEloPage() {
  return <EloClient />;
}
