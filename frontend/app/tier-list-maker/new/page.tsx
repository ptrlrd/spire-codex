import BuilderLoader from "../BuilderLoader";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const { type } = await searchParams;
  return <BuilderLoader entityType={type} />;
}
