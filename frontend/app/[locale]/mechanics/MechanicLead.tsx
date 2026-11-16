import { splitLead } from "./mechanic-groups";

export default function MechanicLead({
  slug,
  description,
}: {
  slug: string;
  description: string;
}) {
  const parts = splitLead(slug, description);
  if (!parts) return <>{description}</>;
  return (
    <>
      {parts.before}
      <strong className="font-semibold text-[var(--accent-gold)]">
        {parts.lead}
      </strong>
      {parts.after}
    </>
  );
}
