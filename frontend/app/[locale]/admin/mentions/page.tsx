import type { Metadata } from "next";
import MentionsClient from "./MentionsClient";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

export default function AdminMentionsPage() {
  return <MentionsClient />;
}
