import type { Metadata } from "next";
import ThanksClient from "./ThanksClient";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

export default function AdminThanksPage() {
  return <ThanksClient />;
}
