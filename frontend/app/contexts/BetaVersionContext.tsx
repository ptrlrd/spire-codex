"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import { useRouter, usePathname } from "next/navigation";
import { IS_BETA } from "@/lib/seo";
import { setBetaVersion, clearCache } from "@/lib/fetch-cache";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
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
  const [versions, setVersions] = useState<VersionInfo[]>([]);
  const router = useRouter();
  const pathname = usePathname();
  // window.location.search instead of useSearchParams() on purpose: the
  // params are only read inside effects and handlers (never for render),
  // and useSearchParams in a provider that wraps every page forces a
  // Suspense boundary around the whole app — which made dynamic pages
  // stream their entire body after the shell, invisible to non-JS
  // crawlers (no h1, no text in the raw HTML).
  const currentParams = () =>
    new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);

  // Fetch available versions on mount (only on beta)
  useEffect(() => {
    if (!IS_BETA) return;
    fetch(`${API}/api/versions`)
      .then((r) => r.json())
      .then((data: VersionInfo[]) => {
        setVersions(data);
      })
      .catch(() => {});
  }, []);

  // On mount + URL change: URL param takes priority, then localStorage
  useEffect(() => {
    if (!IS_BETA) return;
    const params = currentParams();
    const urlVersion = params.get("version");
    if (urlVersion && urlVersion !== "latest") {
      setVersionState(urlVersion);
      setBetaVersion(urlVersion);
      localStorage.setItem(STORAGE_KEY, urlVersion);
    } else if (!urlVersion) {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && stored !== "latest") {
        setVersionState(stored);
        setBetaVersion(stored);
        // Re-add version to URL so links are always shareable
        params.set("version", stored);
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

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

  return (
    <BetaVersionContext.Provider value={{ version, versions, setVersion }}>
      <div key={versionKey}>{children}</div>
    </BetaVersionContext.Provider>
  );
}

export function useBetaVersion() {
  return useContext(BetaVersionContext);
}
