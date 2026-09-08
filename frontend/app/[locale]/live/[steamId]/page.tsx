import type { Metadata } from "next";
import LivePlayerClient from "./LivePlayerClient";

export const metadata: Metadata = {
  title: "Live",
  robots: { index: false, follow: false },
};

export default function LivePlayerPage() {
  return <LivePlayerClient />;
}
