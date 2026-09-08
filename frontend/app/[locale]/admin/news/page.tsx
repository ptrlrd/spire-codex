import type { Metadata } from "next";
import NewsAdminClient from "./NewsAdminClient";

export const metadata: Metadata = {
  title: "News admin",
  robots: { index: false, follow: false },
};

export default function NewsAdminPage() {
  return <NewsAdminClient />;
}
