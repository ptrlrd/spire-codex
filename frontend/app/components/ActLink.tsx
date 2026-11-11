import { Fragment } from "react";
import { Link } from "@/i18n/navigation";
import { actHref } from "@/lib/link-targets";

export default function ActLink({
  act,
  bp = "",
}: {
  act: string;
  bp?: string;
}) {
  const href = actHref(act);
  if (!href) return <>{act}</>;
  return (
    <Link prefetch={false} href={`${bp}${href}`} className="entity-inline-link">
      {act}
    </Link>
  );
}

export function ActLinks({ acts, bp = "" }: { acts: string[]; bp?: string }) {
  return (
    <>
      {acts.map((act, i) => (
        <Fragment key={act}>
          {i > 0 && ", "}
          <ActLink act={act} bp={bp} />
        </Fragment>
      ))}
    </>
  );
}
