import { notFound } from "next/navigation";

// Every unmatched path under a locale lands here so the 404 renders inside
// the locale's layout, in the locale's language.
export default function CatchAllPage() {
  notFound();
}
