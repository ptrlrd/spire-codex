function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function kindPhrase(
  noun: string,
  ...qualifiers: (string | null | undefined)[]
): string {
  const tail = new RegExp(`(^|\\s+)${escapeRegExp(noun)}$`, "i");
  const kept: string[] = [];
  for (const raw of qualifiers) {
    const q = (raw ?? "").trim().replace(tail, "").trim();
    if (!q) continue;
    if (kept.some((k) => k.toLowerCase() === q.toLowerCase())) continue;
    kept.push(q);
  }
  const phrase = [...kept, noun].join(" ");
  const article = /^([aeiou]|8|x-)/i.test(phrase) ? "an" : "a";
  return `${article} ${phrase}`;
}
