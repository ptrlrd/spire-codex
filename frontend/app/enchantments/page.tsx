import { Suspense } from "react";
import type { Enchantment } from "@/lib/api";
import JsonLd from "@/app/components/JsonLd";
import { buildCollectionPageJsonLd, buildBreadcrumbJsonLd } from "@/lib/jsonld";
import RecentlyAdded from "@/app/components/RecentlyAdded";
import EnchantmentsClient from "./EnchantmentsClient";

const API = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default async function EnchantmentsPage() {
  let enchantments: Enchantment[] = [];
  try {
    const res = await fetch(`${API}/api/enchantments?lang=eng`, { next: { revalidate: 300 } });
    if (res.ok) enchantments = await res.json();
  } catch {}

  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: "Home", href: "/" },
      { name: "Enchantments", href: "/enchantments" },
    ]),
    buildCollectionPageJsonLd({
      name: "Slay the Spire 2 Enchantments",
      description: "Browse every enchantment in Slay the Spire 2.",
      path: "/enchantments",
    }),
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <JsonLd data={jsonLd} />
      <h1 className="text-3xl font-bold mb-2">
        <span className="text-[var(--accent-gold)]">Slay the Spire 2 Enchantments</span>
      </h1>
      <p className="text-sm text-[var(--text-muted)] mb-6">
        Browse every enchantment in Slay the Spire 2. Filter by card type and view effects, stackability, and extra card text.
      </p>

      <RecentlyAdded entityType="enchantments" label="Enchantment" pathPrefix="/enchantments" />

      <Suspense>
        <EnchantmentsClient initialEnchantments={enchantments} />
      </Suspense>
    </div>
  );
}
