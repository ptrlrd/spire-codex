"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter, usePathname } from "next/navigation";
import { setBetaVersion, clearCache } from "@/lib/fetch-cache";
import { ApiConfigContext } from "./ApiConfigContext";
import { inBeta } from "@/lib/langPrefix";

const STORAGE_KEY = "spire-codex-beta-version";

interface VersionInfo {
  version: string;
  is_latest: boolean;
}

interface BetaVersionContextType {
  version: string | null; // null = latest
  versions: VersionInfo[];
  setVersion: (v: string | null) => void;
}

const BetaVersionContext = createContext<BetaVersionContextType>({
  version: null,
  versions: [],
  setVersion: () => {},
});

export function BetaVersionProvider({ children }: { children: ReactNode }) {
  const [version, setVersionState] = useState<string | null>(null);
  const [versions] = useState<VersionInfo[]>([]);
  const router = useRouter();
  const pathname = usePathname();

  const apiConfig = useMemo(
    () => ({ beta: inBeta(pathname) ?? false }),
    [pathname],
  );
  // window.location.search instead of useSearchParams() on purpose: the
  // params are only read inside effects and handlers (never for render),
  // and useSearchParams in a provider that wraps every page forces a
  // Suspense boundary around the whole app — which made dynamic pages
  // stream their entire body after the shell, invisible to non-JS
  // crawlers (no h1, no text in the raw HTML).
  const currentParams = () =>
    new URLSearchParams(
      typeof window === "undefined" ? "" : window.location.search,
    );

  const setVersion = (v: string | null) => {
    setVersionState(v);
    setBetaVersion(v);
    clearCache();
    if (v) {
      localStorage.setItem(STORAGE_KEY, v);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
    // Update URL with version param
    const params = currentParams();
    if (v) {
      params.set("version", v);
    } else {
      params.delete("version");
    }
    const qs = params.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
  };

  // Key changes on version switch, forcing all children to remount and re-fetch
  const versionKey = version || "latest";
  // todo: maybe merge api context?
  return (
    <BetaVersionContext.Provider value={{ version, versions, setVersion }}>
      <ApiConfigContext value={apiConfig}>
        <div key={versionKey}>{children}</div>
      </ApiConfigContext>
    </BetaVersionContext.Provider>
  );
}

export function useBetaVersion() {
  return useContext(BetaVersionContext);
}
