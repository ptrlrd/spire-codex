import { getApiEndpoint } from "../endpoint.server";
import { Run } from "./types";
import { cleanRun } from "./util";

export async function getRun(hash: string): Promise<Run | undefined> {
  try {
    const raw = await getApiEndpoint(`runs/shared/${hash}`);
    return raw && cleanRun(raw);
  } catch {
    return;
  }
}
