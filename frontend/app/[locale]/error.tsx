"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { useT } from "@/lib/i18n";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useT();
  useEffect(() => {
    Sentry.captureException(error);
    console.error("Unhandled error:", error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-2">
          {t("Something went wrong")}
        </h2>
        <p className="text-sm text-[var(--text-muted)] mb-6">
          {error.message || t("An unexpected error occurred.")}
        </p>
        <button
          onClick={reset}
          className="px-5 py-2 rounded-lg text-sm font-medium bg-[var(--accent-gold)] text-[var(--bg-primary)] hover:opacity-90 transition-opacity"
        >
          {t("Try again")}
        </button>
      </div>
    </div>
  );
}
