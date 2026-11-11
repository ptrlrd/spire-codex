import type { Metadata } from "next";
import CheatReviewClient from "./CheatReviewClient";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

export default function AdminCheatReviewPage() {
  return <CheatReviewClient />;
}
