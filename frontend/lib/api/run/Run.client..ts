"use client";
import { CodexApiConfig } from "../../../app/contexts/ApiConfigContext";
import { useApiEndpoint } from "../endpoint.client";
import { Run } from "./types";
import { cleanRun } from "./util";

export const useRun = (
  hash: string,
  config?: CodexApiConfig,
): Run | undefined => {
  const raw = useApiEndpoint(`runs/shared/${hash}`, config);
  return raw ? cleanRun(raw) : undefined;
};
