import { imageUrl } from "@/lib/image-url";
import { intentIcons } from "@/lib/fight";

export default function IntentIcons({
  intent,
  size = 24,
  t,
}: {
  intent: string | null | undefined;
  size?: number;
  t: (key: string) => string;
}) {
  return (
    <span className="inline-flex shrink-0 items-center gap-0.5">
      {intentIcons(intent).map((icon) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={icon.name}
          src={imageUrl(icon.src)}
          alt={t(icon.name)}
          title={t(icon.name)}
          width={size}
          height={size}
          loading="lazy"
          className="object-contain"
          style={{ width: size, height: size }}
        />
      ))}
    </span>
  );
}
