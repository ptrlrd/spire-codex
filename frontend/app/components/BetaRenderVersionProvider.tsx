"use client";

import {
  createContext,
  useContext,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  BETA_RENDER_VERSION_FALLBACK,
  peekBetaRenderVersion,
  seedBetaRenderVersion,
  subscribeBetaRenderVersion,
} from "@/lib/beta-render-version";

const ServerBetaRenderVersion = createContext(BETA_RENDER_VERSION_FALLBACK);

export function useBetaRenderVersion(): string {
  const server = useContext(ServerBetaRenderVersion);
  return useSyncExternalStore(
    subscribeBetaRenderVersion,
    () => peekBetaRenderVersion() ?? server,
    () => server,
  );
}

export default function BetaRenderVersionProvider({
  version,
  children,
}: {
  version: string;
  children: ReactNode;
}) {
  useEffect(() => {
    seedBetaRenderVersion(version);
  }, [version]);
  return (
    <ServerBetaRenderVersion value={version}>
      {children}
    </ServerBetaRenderVersion>
  );
}
