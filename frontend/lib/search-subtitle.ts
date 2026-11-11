export function subtitleLabels(subtitle: string): string[] {
  const out: string[] = [];
  for (const raw of subtitle.split(" · ")) {
    const part = raw.trim();
    const label = /^[a-z][a-z ]*$/.test(part)
      ? part.replace(/(^| )[a-z]/g, (c) => c.toUpperCase())
      : part;
    if (label && !out.includes(label)) out.push(label);
  }
  return out;
}
