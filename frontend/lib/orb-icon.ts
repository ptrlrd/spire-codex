import { cleanId } from "./display-name";

export function orbIconPath(id: string): string {
  const bare = cleanId(id).toLowerCase().replace(/_orb$/, "");
  return `/static/images/orbs/${bare}_orb.png`;
}
