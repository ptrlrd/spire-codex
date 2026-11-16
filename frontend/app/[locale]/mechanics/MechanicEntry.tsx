import { Link } from "@/i18n/navigation";
import { imageUrl } from "@/lib/image-url";
import MechanicLead from "./MechanicLead";
import { entryIcon, type MechanicSectionMeta } from "./mechanic-groups";

export default function MechanicEntry({
  section,
  title,
  description,
}: {
  section: MechanicSectionMeta;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={`/mechanics/${section.slug}`}
      className="group flex gap-4 items-start min-h-[44px] py-4 px-3 -mx-3 rounded-lg hover:bg-[var(--bg-card-hover)] transition-colors"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageUrl(entryIcon(section))}
        alt=""
        width={48}
        height={48}
        loading="lazy"
        className="w-12 h-12 object-contain shrink-0"
      />
      <div className="min-w-0">
        <h3 className="text-base font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent-gold)] transition-colors">
          {title}
        </h3>
        <p className="mt-1 text-sm text-[var(--text-secondary)] leading-relaxed">
          <MechanicLead slug={section.slug} description={description} />
        </p>
      </div>
    </Link>
  );
}
