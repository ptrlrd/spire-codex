import path from "path";
import { Locale } from "./routing";
import { cachedFetch } from "@/lib/fetch-cache";
export const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface TranslationsShape {
  card_types: Record<string, string>;
  card_rarities: Record<string, string>;
  relic_rarities: Record<string, string>;
  potion_rarities: Record<string, string>;
  keywords: Record<string, string>;
  sections: Record<string, string>;
  section_descs: Record<string, string>;
  character_names: Record<string, string>;
}

export interface GetApiEndpointParams {
  endpoint: string; // todo: restrict to known endpoints
  locale: Locale;
  beta: boolean;
}
// todo: add beta copy
// todo: TS signature that exposes only the parts of the data we actually expose for localisation/strip does to only those
// todo: I'm sure this only works locally, it's intended to be a demo.
const getListEndpoint = async <R, Entry = R & { id: string }>(
  args: GetApiEndpointParams,
): Promise<Record<string, R> | undefined> =>
  Object.fromEntries(
    (await getObjectEndpoint<Entry[]>(args)).map(({ id, ...data }: Entry) => [
      id,
      data,
    ]),
  );

const getObjectEndpoint = async <T>({
  endpoint,
  locale,
  beta,
}: GetApiEndpointParams): Promise<T> =>
  (await (
    await fetch(
      `${API}/api/${endpoint}?lang=${locale}&${beta ? "?channel=beta" : ""}`,
    )
  ).json()) as T;

/**
 * Provides localised text directly from extracted game data, using a key/path matching the location in game data. each return is either for the current main or beta, depending on the flag.
 * Note: the use of the `translations` section should be avoided over a more canonical reference in another section.
 * - Partly because other sections consistently key by upper case ID.
 * - For this reason, some subsections of `translations`, like character names, are deliberately omitted.
 * - However, some keywords, especially rarities, are only available under the translations path.
 * Later, a TS signature might be provided for ease of reference?
 */
export async function dataMessagesFor(locale: Locale, beta: boolean) {
  // TODO: THIS DYNAMIC IMPORT WILL NOT BE AS WELL OPTIMISED AS A PROPER SET OF STATIC JS FILES IMPORTING ALL THE THINGS STATICALLY ONE THING PER LOCALE AND PER BETA;
  // SO FOR PRODUCTION I WILL PROBABLY HAVE THE PYTHON BACKEND POPULATE ALL THIS TO A FOLDER OF JSONS AND THEN THIS METHOD WILL PULL FROM THERE
  // THIS IS JUST A QUICK AND DIRTY DEMO
  // todo: tailor each of these to only expose the fields we actually need for localisation, not all the others (e.g. we don't need ID)

  const { keywords, character_names, ...translations } =
    await getObjectEndpoint<TranslationsShape>({
      endpoint: "translations",
      locale,
      beta,
    });

  return {
    achievements: await getListEndpoint({
      endpoint: "achievements",
      locale,
      beta,
    }),
    acts: await getListEndpoint({ endpoint: "acts", locale, beta }),
    afflictions: await getListEndpoint({
      endpoint: "afflictions",
      locale,
      beta,
    }),
    ascensions: await getListEndpoint({ endpoint: "ascensions", locale, beta }),
    badges: await getListEndpoint({ endpoint: "badges", locale, beta }),
    cards: await getListEndpoint({ endpoint: "cards", locale, beta }),
    characters: await getListEndpoint({ endpoint: "characters", locale, beta }),
    enchantments: await getListEndpoint({
      endpoint: "enchantments",
      locale,
      beta,
    }),
    encounters: await getListEndpoint({ endpoint: "encounters", locale, beta }),
    epochs: await getListEndpoint({ endpoint: "epochs", locale, beta }),
    events: Object.fromEntries(
      (
        await getObjectEndpoint<any[]>({ endpoint: "events", locale, beta })
      ).map(({ id, ...event }) => [
        id,
        {
          ...event,
          options:
            event.options &&
            Object.fromEntries(
              event.options.map(({ id, ...option }: { id: string }) => [
                id,
                option,
              ]),
            ),
          pages:
            event.pages &&
            Object.fromEntries(
              event.pages.map(
                ({
                  id,
                  ...page
                }: {
                  id: string;
                  options?: { id: string }[];
                }) => [
                  id,
                  {
                    ...page,
                    options:
                      page.options &&
                      Object.fromEntries(
                        page.options.map(
                          ({ id, ...option }: { id: string }) => [id, option],
                        ),
                      ),
                  },
                ],
              ),
            ),
        },
      ]),
    ),
    glossary: await getListEndpoint({ endpoint: "glossary", locale, beta }),
    intents: await getListEndpoint({ endpoint: "intents", locale, beta }),
    keywords: await getListEndpoint({ endpoint: "keywords", locale, beta }),
    modifiers: await getListEndpoint({ endpoint: "modifiers", locale, beta }),
    monsters: await getListEndpoint({ endpoint: "monsters", locale, beta }),
    orbs: await getListEndpoint({ endpoint: "orbs", locale, beta }),
    potions: await getListEndpoint({ endpoint: "potions", locale, beta }),
    powers: await getListEndpoint({ endpoint: "powers", locale, beta }),
    relics: await getListEndpoint({ endpoint: "relics", locale, beta }),
    stories: await getListEndpoint({ endpoint: "stories", locale, beta }),
    translations,
  };
}
