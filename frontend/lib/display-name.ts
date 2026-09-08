const ID_PREFIX = /^(CARD|RELIC|ENCHANTMENT|MONSTER|ENCOUNTER|CHARACTER|ACT|POTION|EVENT|POWER|ORB|MODIFIER|REST)\./;
const BARE_ID = /^[A-Za-z0-9_+-]+$/;

export function cleanId(id: string): string {
  return id.replace(ID_PREFIX, "");
}

export function displayName(id: string): string {
  const bare = cleanId(id);
  if (!BARE_ID.test(bare)) return bare;
  return bare
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
