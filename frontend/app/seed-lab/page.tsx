import type { Metadata } from "next";
import SeedLabClient from "./SeedLabClient";

export const metadata: Metadata = {
  title: "Seed Lab",
  robots: { index: false, follow: false },
};

export default function SeedLabPage() {
  return <SeedLabClient />;
}
