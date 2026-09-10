import { Locale } from "./routing";

// todo: add beta copy
// todo: TS signature that exposes only the parts of the data we actually expose for localisation/strip does to only those
// todo: I'm sure this only works locally, it's intended to be a demo.

/**
 * Provides localised text directly from extracted game data, using a key/path matching the location in game data. each return is either for the current main or beta, depending on the flag.
 * Note: the use of the `translations` section should be avoided over a more canonical reference in another section.
 * - Partly because other sections consistently key by upper case ID.
 * - For this reason, some subsections of `translations`, like character names, are deliberately omitted.
 * - However, some keywords, especially rarities, are only available under the translations path.
 * Later, a TS signature might be provided for ease of reference?
 */
export async function dataMessagesFor(locale: Locale, beta: boolean) {
  const versionPath = beta ? "data" : "data-beta/latest";
  const pathBase = `../../${versionPath}/${locale}`;

  // TODO: THIS DYNAMIC IMPORT WILL NOT BE AS WELL OPTIMISED AS A PROPER SET OF STATIC JS FILES IMPORTING ALL THE THINGS STATICALLY ONE THING PER LOCALE AND PER BETA;
  // SO FOR PRODUCTION I WILL PROBABLY HAVE THE PYTHON BACKEND POPULATE ALL THIS TO A FOLDER OF JSONS AND THEN THIS METHOD WILL PULL FROM THERE
  // THIS IS JUST A QUICK AND DIRTY DEMO
  // todo: tailor each of these to only expose the fields we actually need for localisation, not all the others (e.g. we don't need ID)

  const achievements = await import(`${pathBase}/achievements`, {
    with: { type: "json" },
  });
  const acts = await import(`${pathBase}/acts`, { with: { type: "json" } });
  const afflictions = await import(`${pathBase}/afflictions`, {
    with: { type: "json" },
  });
  const ascensions = await import(`${pathBase}/ascensions`, {
    with: { type: "json" },
  });
  const badges = await import(`${pathBase}/badges`, {
    with: { type: "json" },
  });
  const cards = await import(`${pathBase}/cards`, {
    with: { type: "json" },
  });
  const characters = await import(`${pathBase}/characters`, {
    with: { type: "json" },
  });
  const enchantments = await import(`${pathBase}/enchantments`, {
    with: { type: "json" },
  });
  const encounters = await import(`${pathBase}/encounters`, {
    with: { type: "json" },
  });
  const epochs = await import(`${pathBase}/epochs`, {
    with: { type: "json" },
  });
  const events = await import(`${pathBase}/events`, {
    with: { type: "json" },
  });
  const glossary = await import(`${pathBase}/glossary`, {
    with: { type: "json" },
  });
  const intents = await import(`${pathBase}/intents`, {
    with: { type: "json" },
  });
  const keywords = await import(`${pathBase}/keywords`, {
    with: { type: "json" },
  });
  const modifiers = await import(`${pathBase}/modifiers`, {
    with: { type: "json" },
  });
  const monsters = await import(`${pathBase}/monsters`, {
    with: { type: "json" },
  });
  const orbs = await import(`${pathBase}/orbs`, {
    with: { type: "json" },
  });
  const potions = await import(`${pathBase}/potions`, {
    with: { type: "json" },
  });
  const powers = await import(`${pathBase}/ascensions`, {
    with: { type: "json" },
  });
  const relics = await import(`${pathBase}/relics`, {
    with: { type: "json" },
  });
  const stories = await import(`${pathBase}/stories`, {
    with: { type: "json" },
  });
  const {
    keywords: _keywords,
    character_names: _charNames,
    ...translations
  } = await import(`${pathBase}/translations`, {
    with: { type: "json" },
  });

  return {
    ...Object.fromEntries(
      Object.entries({
        achievements,
        acts,
        afflictions,
        ascensions,
        badges,
        cards,
        characters,
        enchantments,
        encounters,
        epochs,
        events,
        glossary,
        intents,
        keywords,
        modifiers,
        monsters,
        orbs,
        potions,
        powers,
        relics,
        stories,
      }).map(([section, items]) => [
        section,
        Object.fromEntries(
          items.map(({ id, ...data }: { id: string }) => [id, data]),
        ),
      ]),
    ),
    translations,
  };
}
