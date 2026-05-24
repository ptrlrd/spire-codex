import type { Metadata } from "next";
import ProfileClient from "./ProfileClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Profile | Spire Codex",
  description: "View your runs, upload run files, and see your personal stats.",
  robots: { index: false },
};

export default function ProfilePage() {
  return <ProfileClient />;
}
