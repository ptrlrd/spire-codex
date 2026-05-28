import type { Metadata } from "next";
import SettingsClient from "./SettingsClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Settings | Spire Codex",
  description: "Manage your display name, email, and connected accounts.",
  robots: { index: false },
};

export default function SettingsPage() {
  return <SettingsClient />;
}
