"use client";

import { useT } from "@/lib/i18n";

export default function LoadFailed({ onRetry }: { onRetry: () => void }) {
  const t = useT();
  return (
    <p role="alert" className="text-center py-8 text-[var(--text-muted)]">
      {t("Something went wrong")}{" "}
      <button
        type="button"
        onClick={onRetry}
        className="underline hover:text-[var(--text-primary)]"
      >
        {t("Try again")}
      </button>
    </p>
  );
}
