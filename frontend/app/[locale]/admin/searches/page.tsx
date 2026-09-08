import type { Metadata } from "next";
import SearchesClient from "./SearchesClient";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

export default function AdminSearchesPage() {
  return <SearchesClient />;
}
