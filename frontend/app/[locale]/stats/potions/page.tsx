import type { Metadata } from "next";
import { GridPage, gridMetadata, type GridPageProps } from "../_grid/GridPage";

export const dynamic = "force-dynamic";

export async function generateMetadata(
  props: GridPageProps,
): Promise<Metadata> {
  return gridMetadata("potions", props);
}

export default async function Page(props: GridPageProps) {
  return <GridPage kind="potions" {...props} />;
}
