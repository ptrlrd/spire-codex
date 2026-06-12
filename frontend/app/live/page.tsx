import type { Metadata } from "next";
import LiveClient from "./LiveClient";

export const metadata: Metadata = {
  title: "Live",
  robots: { index: false, follow: false },
};

export default function LivePage() {
  return <LiveClient />;
}
