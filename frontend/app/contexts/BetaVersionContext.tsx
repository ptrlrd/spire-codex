"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";
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

  // Fetch available versions on mount (only on beta)
  useEffect(() => {
    if (!IS_BETA) return;
    fetch(`${API}/api/versions`)
      .then((r) => r.json())
      .then((data: VersionInfo[]) => {
        setVersions(data);
      })
      .catch(() => {});

    // Restore from localStorage
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && stored !== "latest") {
      setVersionState(stored);
      setBetaVersion(stored);
    }
  }, []);

  const setVersion = (v: string | null) => {
    setVersionState(v);
    setBetaVersion(v);
    clearCache();
    if (v) {
      localStorage.setItem(STORAGE_KEY, v);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  };

  return (
    <BetaVersionContext.Provider value={{ version, versions, setVersion }}>
      {children}
    </BetaVersionContext.Provider>
  );
}

export function useBetaVersion() {
  return useContext(BetaVersionContext);
}
