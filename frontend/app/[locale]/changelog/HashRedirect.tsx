"use client";

import { useEffect } from "react";
import { useRouter } from "@/i18n/navigation";
import { changelogPath } from "@/lib/changelog";

export default function HashRedirect({ tags }: { tags: string[] }) {
  const router = useRouter();
  useEffect(() => {
    const hash = decodeURIComponent(window.location.hash.replace(/^#/, ""));
    if (hash && tags.includes(hash)) router.replace(changelogPath(hash));
  }, [router, tags]);
  return null;
}
