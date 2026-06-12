import type { Metadata } from "next";
import RunsClient from "./RunsClient";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

export default function AdminRunsPage() {
  return <RunsClient />;
}
