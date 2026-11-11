"use client";

import { useEffect } from "react";
import { useRouter } from "@/i18n/navigation";
import { changelogPath } from "@/lib/changelog";

function hashTag(): string {
  const raw = window.location.hash.replace(/^#/, "");
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export default function HashRedirect({ tags }: { tags: string[] }) {
  const router = useRouter();
  useEffect(() => {
    const hash = hashTag();
    if (hash && tags.includes(hash)) router.replace(changelogPath(hash));
  }, [router, tags]);
  return null;
}
