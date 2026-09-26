"use client";

import { usePathname } from "@/i18n/navigation";
import { inBeta } from "@/lib/api/prefix.common";
import { ReactNode } from "react";
import { ApiConfigContext } from "./ApiConfigContext";

export default function DefaultApiConfigProvider({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();
  const config = { beta: inBeta(pathname) ?? false };
  return <ApiConfigContext value={config}>{children}</ApiConfigContext>;
}
