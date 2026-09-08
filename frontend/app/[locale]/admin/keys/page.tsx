import type { Metadata } from "next";
import KeysClient from "./KeysClient";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

export default function AdminKeysPage() {
  return <KeysClient />;
}
