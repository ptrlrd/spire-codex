import BuilderLoader from "../BuilderLoader";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <BuilderLoader tierlistId={id} />;
}
