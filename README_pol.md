<p align="center">
  <img src="frontend/public/spire-codex-white-silent-black-background.png" alt="Logo Spire Codex" width="200" />
</p>

<p align="center">
  <a href="README.md">English</a> ·
  <a href="README_deu.md">Deutsch</a> ·
  <a href="README_esp.md">Español (ES)</a> ·
  <a href="README_fra.md">Français</a> ·
  <a href="README_ita.md">Italiano</a> ·
  <a href="README_jpn.md">日本語</a> ·
  <a href="README_kor.md">한국어</a> ·
  <a href="README_pol.md">Polski</a> ·
  <a href="README_ptb.md">Português (BR)</a> ·
  <a href="README_rus.md">Русский</a> ·
  <a href="README_spa.md">Español (LA)</a> ·
  <a href="README_tha.md">ไทย</a> ·
  <a href="README_tur.md">Türkçe</a> ·
  <a href="README_zhs.md">简体中文</a> ·
  <a href="README_zht.md">繁體中文</a>
</p>

# Spire Codex

Kompleksowa baza danych i API dla danych gry **Slay the Spire 2**, utworzone metodą inżynierii wstecznej plików gry. Obsługuje wszystkie **15 języków** dostarczanych z grą.

**Działająca witryna**: [spire-codex.com](https://spire-codex.com)

**Identyfikator aplikacji Steam**: 2868840

## Jak powstał projekt

Slay the Spire 2 korzysta z Godot 4, ale cała logika gry znajduje się w bibliotece DLL C#/.NET 8 (`sts2.dll`), a nie w GDScript. Potok danych:

1. **Ekstrakcja PCK** - [GDRE Tools](https://github.com/bruvzg/gdsdecomp) wyodrębnia plik `.pck` Godot w celu odzyskania obrazów, animacji Spine i danych lokalizacyjnych (około 9947 plików).

2. **Dekompilacja DLL** - [ILSpy](https://github.com/icsharpcode/ILSpy) dekompiluje `sts2.dll` do około 3300 czytelnych plików źródłowych C# zawierających wszystkie modele gry.

3. **Analiza danych** - 22 parsery Pythona oparte na wyrażeniach regularnych wyodrębniają ustrukturyzowane dane ze zdekompilowanego kodu źródłowego C#, zapisując pliki JSON dla poszczególnych języków w `data/{lang}/`:
   - **Karty**: konstruktory `base(cost, CardType, CardRarity, TargetType)` oraz `DamageVar`, `BlockVar`, `PowerVar<T>` dla statystyk
   - **Postacie**: `StartingHp`, `StartingGold`, `MaxEnergy`, `StartingDeck`, `StartingRelics`
   - **Relikty/mikstury**: rzadkość, pula i opisy rozwiązywane na podstawie szablonów SmartFormat
   - **Potwory**: zakresy PŻ, skalowanie poziomu trudności przez `AscensionHelper`, maszyny stanów ruchów z zamiarami poszczególnych ruchów (Attack/Defend/Buff/Debuff/Status/Summon/Heal), wartości obrażeń, liczby wielokrotnych trafień (w tym wzorce AscensionHelper), moce wrodzone z `AfterAddedToRoom` (42 potwory z wariantami zależnymi od poziomu trudności), moce nakładane przy każdym ruchu (cel i wartość z `PowerCmd.Apply<T>`), blok, leczenie, kontekst spotkania (akt, typ pomieszczenia), **wzorce ataków** analizowane z `GenerateMoveStateMachine()` (112 potworów - cykliczne, losowe, warunkowe i mieszane)
   - **Zaklęcia**: ograniczenia typów kart, możliwość kumulacji, skalowanie oparte na Amount
   - **Spotkania**: składy potworów, typ pomieszczenia (Boss/Elite/Monster), umiejscowienie w akcie, znaczniki
   - **Wydarzenia**: wielostronicowe drzewa decyzyjne (56 z 66 wydarzeń), wybory i ich rezultaty, umiejscowienie w akcie, odwołania modeli `StringVar` rozwiązywane do nazw wyświetlanych, wartości obliczane w czasie wykonywania (rosnące koszty przez `GetDecipherCost()`, zakresy złota przez `CalculateVars` z `NextInt`/`NextFloat`, wzorce pełnego leczenia), **warunki wstępne** z `IsAllowed()` (25 wydarzeń - warunki dotyczące złota, PŻ, aktu, talii, reliktów i mikstur)
   - **Pradawni**: 8 postaci niezależnych Ancient z przydomkami, dialogami właściwymi dla postaci, ofertami reliktów i ikonami portretów
   - **Moce**: PowerType (Buff/Debuff), PowerStackType (Counter/Single), DynamicVars, opisy
   - **Epoki/historie**: dane postępu osi czasu z wymaganiami odblokowania
   - **Kule**: wartości pasywne/wywołania, opisy
   - **Przypadłości**: możliwość kumulacji, dodatkowy tekst karty, opisy
   - **Modyfikatory**: opisy modyfikatorów rozgrywki
   - **Słowa kluczowe**: definicje słów kluczowych kart (Exhaust, Ethereal, Innate itd.)
   - **Zamiary**: opisy zamiarów potworów wraz z ikonami
   - **Osiągnięcia**: warunki odblokowania, opisy, kategorie, powiązanie z postacią i progi z kodu źródłowego C# (33 osiągnięcia)
   - **Akty**: kolejność odkrywania bossów, spotkania, wydarzenia, Pradawni, liczba pomieszczeń
   - **Poziomy trudności**: 11 poziomów (0–10) z opisami z lokalizacji
   - **Pule mikstur**: pule właściwe dla postaci analizowane z klas pul i odwołań epok
   - **Tłumaczenia**: mapy filtrów dla poszczególnych języków (typy kart, rzadkości, słowa kluczowe → zlokalizowane nazwy) oraz ciągi interfejsu użytkownika (tytuły sekcji, opisy, nazwy postaci) przeznaczone dla frontendu

4. **Rozwiązywanie opisów** - Współdzielony moduł `description_resolver.py` rozwiązuje szablony lokalizacyjne SmartFormat (`{Damage:diff()}`, `{Energy:energyIcons()}`, `{Cards:plural:card|cards}`) do czytelnego tekstu ze znacznikami tekstu sformatowanego przeznaczonymi do renderowania we frontendzie. Zmienne dynamiczne czasu wykonywania (np. `{Card}`, `{Relic}`) są zachowywane jako czytelne symbole zastępcze. Odwołania `StringVar` w wydarzeniach (np. `{Enchantment1}` → `ModelDb.Enchantment<Sharp>().Title`) są rozwiązywane do nazw wyświetlanych przez wyszukiwanie w lokalizacji.

5. **Renderowanie Spine** - Postacie i potwory są animacjami szkieletowymi Spine, a nie obrazami statycznymi. Bezinterfejsowy renderer Node.js składa pozy spoczynkowe w portretowe pliki PNG 512×512. Wszystkie 111 potworów ma obrazy: 100 wyrenderowano ze szkieletów Spine, 6 korzysta ze współdzielonych szkieletów przez aliasy (Flyconid→flying_mushrooms, Ovicopter→egg_layer, Crusher/Rocket→kaiser_crab), a 5 pochodzi ze statycznych zasobów gry (Doormaker). Renderowane są również wszystkie 5 postaci (pozy walki, miejsca odpoczynku i wyboru postaci), postacie niezależne oraz tła. Warianty oparte na skórkach (Cultists, Bowlbugs, Cubex) są renderowane oddzielnie. Zobacz sekcję [Renderer Spine](#renderer-spine) poniżej.

6. **Obrazy** - Portrety kart, ikony reliktów/mikstur, grafiki postaci, duszki potworów, ikony portretów Pradawnych i ikony spotkań z bossami są wyodrębniane z zasobów gry i udostępniane jako pliki statyczne.

7. **Porównywanie dzienników zmian** - Narzędzie porównuje dane JSON między wersjami gry (za pomocą odwołań git lub katalogów), śledząc dodane, usunięte i zmienione elementy w każdej kategorii, z różnicami na poziomie pól. Dzienniki zmian są identyfikowane przez wersję gry Steam i opcjonalny numer rewizji Codex.

## Struktura projektu

```
spire-codex/
├── backend/                    # Backend FastAPI
│   ├── app/
│   │   ├── main.py             # Punkt wejścia aplikacji, CORS, GZip, ograniczanie szybkości, pliki statyczne
│   │   ├── dependencies.py     # Współdzielone zależności (walidacja języka, nazwy języków)
│   │   ├── routers/            # Punkty końcowe API (ponad 25 routerów)
│   │   ├── models/schemas.py   # Modele Pydantic
│   │   ├── services/           # Wczytywanie danych JSON (pamięć podręczna LRU, obsługa 14 języków)
│   │   └── parsers/            # Parsery kodu źródłowego C# → JSON
│   │       ├── card_parser.py
│   │       ├── character_parser.py
│   │       ├── monster_parser.py
│   │       ├── relic_parser.py
│   │       ├── potion_parser.py
│   │       ├── enchantment_parser.py
│   │       ├── encounter_parser.py
│   │       ├── event_parser.py
│   │       ├── power_parser.py
│   │       ├── keyword_parser.py        # Słowa kluczowe, zamiary, kule, przypadłości, modyfikatory, osiągnięcia (z warunkami odblokowania)
│   │       ├── guide_parser.py          # Przewodniki Markdown z metadanymi YAML
│   │       ├── epoch_parser.py
│   │       ├── act_parser.py
│   │       ├── ascension_parser.py
│   │       ├── pool_parser.py            # Dodaje pulę postaci do mikstur
│   │       ├── translation_parser.py    # Generuje translations.json dla każdego języka
│   │       ├── description_resolver.py   # Współdzielony moduł rozwiązywania SmartFormat
│   │       ├── parser_paths.py           # Współdzielona konfiguracja ścieżek (zmienne środowiskowe nadpisujące ustawienia wersji beta)
│   │       └── parse_all.py              # Koordynuje wszystkie parsery (15 języków)
│   ├── static/images/          # Obrazy gry (niezatwierdzane w repozytorium)
│   ├── scripts/copy_images.py  # Kopiuje obrazy z ekstrakcji → zasoby statyczne
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/                   # Next.js 16 + TypeScript + Tailwind CSS
│   ├── app/
│   │   ├── contexts/           # LanguageContext, BetaVersionContext
│   │   ├── components/         # CardGrid, RichDescription, SearchFilter,
│   │   │                       #   GlobalSearch, Navbar, Footer, LanguageSelector, VersionSelector
│   │   └── ...                 # Strony: cards, characters, relics, monsters, potions,
│   │                           #   enchantments, encounters, events, powers, timeline,
│   │                           #   reference, images, changelog, about, merchant, compare,
│   │                           #   mechanics/[slug], guides/[slug], guides/submit,
│   │                           #   leaderboards, leaderboards/submit, leaderboards/stats,
│   │                           #   runs/[hash] (współdzielony widok rozgrywki)
│   │                           #   Strony szczegółów: cards/[id], characters/[id], relics/[id],
│   │                           #   monsters/[id], potions/[id], enchantments/[id],
│   │                           #   encounters/[id], events/[id], powers/[id], keywords/[id],
│   │                           #   acts/[id], ascensions/[id], intents/[id], orbs/[id],
│   │                           #   afflictions/[id], modifiers/[id], achievements/[id]
│   │                           #   i18n: [lang]/... odzwierciedla wszystkie trasy dla 14 języków innych niż angielski
│   ├── lib/
│   │   ├── api.ts              # Klient API i interfejsy TypeScript
│   │   ├── fetch-cache.ts      # Pamięć podręczna pobierania po stronie klienta (TTL 5 min)
│   │   ├── seo.ts              # Współdzielone narzędzia SEO (stripTags, SITE_URL, SITE_NAME)
│   │   ├── jsonld.ts           # Konstruktory schematów JSON-LD (BreadcrumbList, CollectionPage, Article, WebSite, FAQPage)
│   │   ├── ui-translations.ts # Tłumaczenia ciągów interfejsu dla 14 języków innych niż angielski
│   │   ├── languages.ts       # Konfiguracja i18n - 14 kodów języków, mapowania hreflang
│   │   └── use-lang-prefix.ts # Hook do tworzenia adresów URL uwzględniających język
│   └── Dockerfile
├── tools/
│   ├── spine-renderer/         # Bezinterfejsowy renderer szkieletów Spine
│   │   ├── render_webgl.mjs     # Renderer WebGL (pojedynczy szkielet) - bez artefaktów szwów
│   │   ├── render_all_webgl.mjs # Renderer wsadowy WebGL (wszystkie pliki .skel)
│   │   ├── render_gif.mjs      # Renderer animacji (WebP/GIF/APNG z obsługą skórek i animacji)
│   │   ├── render.mjs           # Starszy renderer canvas (ma trójkątne szwy)
│   │   ├── render_all.mjs       # Starszy renderer wsadowy canvas
│   │   ├── render_skins2.mjs    # Renderer wariantów skórek
│   │   ├── render_utils.mjs     # Współdzielone narzędzia renderowania canvas
│   │   └── package.json
│   ├── diff_data.py            # Generator różnic dziennika zmian
│   ├── update.py               # Wieloplatformowy potok aktualizacji
│   └── deploy.py               # Lokalna kompilacja Docker i wypychanie do Docker Hub
├── data/                       # Przeanalizowane pliki danych JSON
│   ├── {lang}/                 # Katalogi poszczególnych języków (eng, kor, jpn, fra itd.)
│   ├── changelogs/             # Pliki JSON dzienników zmian (według wersji gry)
│   ├── guides/                 # Pliki przewodników Markdown z metadanymi YAML
│   ├── guides.json             # Przeanalizowane dane przewodników
│   ├── runs/                   # Przesłane pliki JSON rozgrywek (według skrótu gracza)
│   └── runs.db                 # Starsza baza SQLite (zastąpiona przez MongoDB; zachowana jako rezerwowa baza offline)
├── extraction/                 # Surowe pliki gry (niezatwierdzane w repozytorium)
│   ├── raw/                    # Projekt Godot wyodrębniony przez GDRE (stabilny)
│   ├── decompiled/             # Dane wyjściowe ILSpy (stabilne)
│   └── beta/                   # Gałąź beta Steam (raw/ + decompiled/)
├── data-beta/                  # Przeanalizowane dane beta (wersjonowane: v0.102.0/, v0.103.0/, latest → dowiązanie symboliczne)
├── docker-compose.yml          # Lokalne środowisko programistyczne
├── docker-compose.prod.yml     # Środowisko produkcyjne
├── .github/workflows/
│   └── ci.yml                  # CI GitHub Actions: lint, sprawdzanie typów, skanowanie sekretów, kompilacja i wypychanie Docker, wdrożenie SSH
└── .forgejo/workflows/
    └── build.yml               # Zachowana awaryjna konfiguracja CI Forgejo (oparta na buildah, nieaktywna)
```

## Usługi publiczne

| Host | Przeznaczenie |
|---|---|
| [`spire-codex.com`](https://spire-codex.com) | Publiczna witryna i API z tego samego źródła. Aktywny kanał beta znajduje się pod `/beta`. |
| `cdn.spire-codex.com` | Host obiektów Cloudflare R2 dla grafik z gry, pełnych renderów kart, renderów zlokalizowanych i zarchiwizowanych zasobów beta. |
| [`bot.spire-codex.com`](https://bot.spire-codex.com) | Strona docelowa Knowledge Demon i panel personelu uwierzytelniany przez Discord. Bot korzysta z głównego API Codex. |
| `analytics.spire-codex.com` | Samodzielnie hostowany skrypt i panel Umami. Jego baza PostgreSQL pozostaje w prywatnej sieci Docker. |
| `tierlists.spire-codex.com` | Dedykowany host obiektów R2 dla wygenerowanych obrazów podglądu list poziomów. |
| `beta.spire-codex.com` | Wycofany host publiczny. Cloudflare przekierowuje żądania do tej samej ścieżki w domenie głównej. |

Hosty CDN i list poziomów są magazynami obiektów, a nie witrynami przeznaczonymi do przeglądania, dlatego odpowiedź `404` w katalogu głównym każdego z nich jest oczekiwana.

## Strony witryny

| Strona | Trasa | Opis |
|---|---|---|
| Strona główna | `/` | Panel z licznikami elementów, kartami kategorii i odnośnikami do postaci |
| Karty | `/cards` | Filtrowalna siatka kart z modalnym widokiem szczegółów |
| Szczegóły karty | `/cards/[id]` | Pełne statystyki karty, informacje o ulepszeniu i obraz |
| Postacie | `/characters` | Siatka przeglądu postaci |
| Szczegóły postaci | `/characters/[id]` | Statystyki, początkowa talia/relikty, cytaty i drzewa dialogów postaci niezależnych |
| Relikty | `/relics` | Filtrowalna siatka reliktów |
| Szczegóły reliktu | `/relics/[id]` | Pełne informacje o relikcie z tekstem fabularnym w formacie rich text |
| Potwory | `/monsters` | Siatka potworów z PŻ, ruchami i renderami Spine |
| Szczegóły potwora | `/monsters/[id]` | PŻ, ruchy z zamiarami/obrażeniami/mocami/blokiem, odnośniki do spotkań i podpowiedzi mocy |
| Mikstury | `/potions` | Filtrowalna siatka mikstur (rzadkość, pula postaci) |
| Szczegóły mikstury | `/potions/[id]` | Pełne informacje o miksturze |
| Zaklęcia | `/enchantments` | Lista zaklęć z filtrami typów kart |
| Szczegóły zaklęcia | `/enchantments/[id]` | Pełne informacje o zaklęciu |
| Spotkania | `/encounters` | Składy spotkań według aktu/typu pomieszczenia |
| Szczegóły spotkania | `/encounters/[id]` | Skład potworów, typ pomieszczenia i znaczniki |
| Wydarzenia | `/events` | Wielostronicowe drzewa wydarzeń z rozwijanymi wyborami |
| Szczegóły wydarzenia | `/events/[id]` | Pełne strony wydarzenia, opcje i dialog Pradawnego |
| Moce | `/powers` | Wzmocnienia, osłabienia i moce neutralne |
| Szczegóły mocy | `/powers/[id]` | Informacje o mocy wraz z kartami, które ją nakładają |
| Słowa kluczowe | `/keywords` | Lista słów kluczowych kart |
| Szczegóły słowa kluczowego | `/keywords/[id]` | Opis słowa kluczowego z filtrowalną siatką kart |
| Kupiec | `/merchant` | Ceny kart/reliktów/mikstur, koszty usuwania kart, fałszywy kupiec |
| Porównanie | `/compare` | Centrum porównywania postaci (10 par) |
| Szczegóły porównania | `/compare/[pair]` | Porównanie postaci obok siebie |
| Dla programistów | `/developers` | Dokumentacja API, dokumentacja widżetów i eksporty danych |
| Prezentacja | `/showcase` | Galeria projektów społeczności |
| Oś czasu | `/timeline` | Postęp epok z grupowaniem według er i wymaganiami odblokowania |
| Szczegóły aktu | `/acts/[id]` | Bossowie, spotkania, wydarzenia i Pradawni dla danego aktu |
| Szczegóły poziomu trudności | `/ascensions/[id]` | Opis poziomu trudności z nawigacją poprzedni/następny |
| Szczegóły zamiaru | `/intents/[id]` | Ikona i opis zamiaru |
| Szczegóły kuli | `/orbs/[id]` | Ikona kuli, opis efektu pasywnego/wywołania |
| Szczegóły przypadłości | `/afflictions/[id]` | Opis przypadłości i możliwość kumulacji |
| Szczegóły modyfikatora | `/modifiers/[id]` | Opis modyfikatora rozgrywki |
| Szczegóły osiągnięcia | `/achievements/[id]` | Opis osiągnięcia |
| Odznaki | `/badges` | Wszystkie 25 odznak końca rozgrywki pogrupowanych jako wielopoziomowe, jednopoziomowe i wyłącznie wieloosobowe |
| Szczegóły odznaki | `/badges/[id]` | Podział według poziomu (Bronze / Silver / Gold), flagi wymaganego zwycięstwa i trybu wieloosobowego, ikona |
| Mechaniki | `/mechanics` | Centrum mechanik gry - 27 klikalnych sekcji z osobnymi stronami SEO |
| Szczegóły mechaniki | `/mechanics/[slug]` | Szanse kart, rozkład reliktów, wypadanie mikstur, generowanie mapy, pule bossów, walka, sekrety i ciekawostki |
| Przewodniki | `/guides` | Przewodniki strategiczne społeczności z wyszukiwaniem/filtrowaniem |
| Szczegóły przewodnika | `/guides/[slug]` | Pełny przewodnik renderowany z Markdown i widżetem podpowiedzi |
| Prześlij przewodnik | `/guides/submit` | Formularz przesyłania przewodnika (webhook Discord) |
| Rankingi | `/leaderboards` | Rankingi najszybszych zwycięstw i najwyższego poziomu trudności z filtrami gry pojedynczej/kooperacyjnej oraz trybu gry (standard / daily / Today / custom). Cały stan filtrów znajduje się w adresie URL, dzięki czemu każdy widok można udostępnić |
| Przeglądaj rozgrywki | `/runs` | Pełna przeglądarka rozgrywek z paskiem wyszukiwania wyrażeń (zakresy `user:`, `char:`, `asc:`, wielowartościowe AND dla `card:`/`relic:`, zakresy `version:`, `mode:`, `result:`, `players:`), filtrami rozwijanymi, sortowaniem i udostępnialnymi adresami URL |
| Prześlij rozgrywkę | `/leaderboards/submit` | Przesyłanie pliku `.run` metodą „przeciągnij i upuść”, odnośnik do aplikacji towarzyszącej Overwolf, logowanie przez Steam/Discord w celu automatycznego powiązania rozgrywek oraz ostatnie rozgrywki użytkownika |
| Statystyki | `/leaderboards/stats` | Tabele rankingowe (częstotliwość wyboru, współczynnik zwycięstw, liczba) dla kart, reliktów, mikstur i spotkań. Filtrowanie według postaci, poziomu trudności i wyniku |
| Profil | `/profile` | Statystyki zalogowanego użytkownika (najlepsze karty/relikty/mikstury, podział według postaci), rekordy osobiste, porównanie rywalizacyjne (dzisiejszy ranking dzienny, pozycje globalne, współczynnik zwycięstw na tle społeczności) i zarządzanie rozgrywkami |
| Ustawienia | `/settings` | Ustawienia konta: nazwa użytkownika, e-mail, połączone konta Steam/Discord |
| Udostępniona rozgrywka | `/runs/[hash]` | Podsumowanie zwycięstwa/porażki w stylu gry z klikalnymi ikonami węzłów mapy, paskiem reliktów i siatką miniaturowych kart |
| Materiały referencyjne | `/reference` | Wszystkie elementy są klikalne - akty, poziomy trudności, słowa kluczowe, kule, przypadłości, zamiary, modyfikatory i osiągnięcia |
| Obrazy | `/images` | Zasoby gry możliwe do przeglądania i pobierania jako ZIP dla każdej kategorii |
| Dziennik zmian | `/changelog` | Różnice danych między aktualizacjami gry |
| O projekcie | `/about` | Informacje o projekcie, statystyki i wizualizacja potoku |
| Podziękowania | `/thank-you` | Wspierający w Ko-fi i współtwórcy społeczności (oddzieleni od strony O projekcie, aby można było bezpośrednio odsyłać do tej strony) |
| Knowledge Demon | `/knowledge-demon` | Strona informacyjna bota Discord - polecenia ukośnikowe, funkcje moderacyjne i wezwanie do instalacji |
| Aktualności | `/news` | Lustrzany kanał ogłoszeń Steam; odnośniki kanoniczne prowadzą z powrotem do Steam, dzięki czemu treści są uzupełniające, a nie powielone |
| Artykuł aktualności | `/news/[gid]` | Pojedyncze ogłoszenie Steam z oczyszczoną treścią BBCode i JSON-LD `NewsArticle` |
| Lista poziomów | `/tier-list` | Centrum list poziomów Codex Score (poziomy S → F) dla kart, reliktów i mikstur |
| Szczegóły listy poziomów | `/tier-list/[type]` | Wizualne wiersze S/A/B/C/D/F dla jednego typu elementu, pobierane z `/api/runs/scores/{type}` |
| Punktacja | `/leaderboards/scoring` | Strona metodologii Codex Score - estymacja bayesowska, waga rozkładu a priori, zakres skali i progi poziomów |

## Punkty końcowe API

Wszystkie punkty końcowe danych przyjmują opcjonalny parametr zapytania `?lang=` (domyślnie: `eng`). Odpowiedzi są **kompresowane za pomocą GZip** i buforowane z nagłówkiem `Cache-Control: public, max-age=300`.

| Punkt końcowy | Opis | Filtry |
|---|---|---|
| `GET /api/cards` | Wszystkie karty | `color`, `type`, `rarity`, `keyword`, `search`, `lang` |
| `GET /api/cards/{id}` | Pojedyncza karta | `lang` |
| `GET /api/characters` | Wszystkie postacie | `search`, `lang` |
| `GET /api/characters/{id}` | Pojedyncza postać (z cytatami i dialogami) | `lang` |
| `GET /api/relics` | Wszystkie relikty | `rarity`, `pool`, `search`, `lang` |
| `GET /api/relics/{id}` | Pojedynczy relikt | `lang` |
| `GET /api/monsters` | Wszystkie potwory | `type`, `search`, `lang` |
| `GET /api/monsters/{id}` | Pojedynczy potwór | `lang` |
| `GET /api/potions` | Wszystkie mikstury | `rarity`, `pool`, `search`, `lang` |
| `GET /api/potions/{id}` | Pojedyncza mikstura | `lang` |
| `GET /api/enchantments` | Wszystkie zaklęcia | `card_type`, `search`, `lang` |
| `GET /api/enchantments/{id}` | Pojedyncze zaklęcie | `lang` |
| `GET /api/encounters` | Wszystkie spotkania | `room_type`, `act`, `search`, `lang` |
| `GET /api/encounters/{id}` | Pojedyncze spotkanie | `lang` |
| `GET /api/events` | Wszystkie wydarzenia | `type`, `act`, `search`, `lang` |
| `GET /api/events/{id}` | Pojedyncze wydarzenie | `lang` |
| `GET /api/powers` | Wszystkie moce | `type`, `stack_type`, `search`, `lang` |
| `GET /api/powers/{id}` | Pojedyncza moc | `lang` |
| `GET /api/keywords` | Definicje słów kluczowych kart | `lang` |
| `GET /api/keywords/{id}` | Pojedyncze słowo kluczowe | `lang` |
| `GET /api/intents` | Typy zamiarów potworów | `lang` |
| `GET /api/intents/{id}` | Pojedynczy zamiar | `lang` |
| `GET /api/orbs` | Wszystkie kule | `lang` |
| `GET /api/orbs/{id}` | Pojedyncza kula | `lang` |
| `GET /api/afflictions` | Przypadłości kart | `lang` |
| `GET /api/afflictions/{id}` | Pojedyncza przypadłość | `lang` |
| `GET /api/modifiers` | Modyfikatory rozgrywki | `lang` |
| `GET /api/modifiers/{id}` | Pojedynczy modyfikator | `lang` |
| `GET /api/achievements` | Wszystkie osiągnięcia | `lang` |
| `GET /api/achievements/{id}` | Pojedyncze osiągnięcie | `lang` |
| `GET /api/badges` | Wszystkie odznaki końca rozgrywki | `tiered`, `multiplayer_only`, `requires_win`, `search`, `lang` |
| `GET /api/badges/{id}` | Pojedyncza odznaka z podziałem na poziomy | `lang` |
| `GET /api/history/{entity_type}/{entity_id}` | Historia wersji elementu (bez rozróżniania wielkości liter, od najnowszych) | - |
| `GET /api/epochs` | Epoki osi czasu | `era`, `search`, `lang` |
| `GET /api/epochs/{id}` | Pojedyncza epoka | `lang` |
| `GET /api/stories` | Wpisy historii | `lang` |
| `GET /api/stories/{id}` | Pojedyncza historia | `lang` |
| `GET /api/acts` | Wszystkie akty | `lang` |
| `GET /api/acts/{id}` | Pojedynczy akt | `lang` |
| `GET /api/ascensions` | Poziomy trudności (0–10) | `lang` |
| `GET /api/ascensions/{id}` | Pojedynczy poziom trudności | `lang` |
| `GET /api/stats` | Liczba elementów we wszystkich kategoriach | `lang` |
| `GET /api/languages` | Dostępne języki z nazwami wyświetlanymi | - |
| `GET /api/translations` | Mapy tłumaczeń wartości filtrów i ciągów interfejsu | `lang` |
| `GET /api/images` | Kategorie obrazów z listami plików. Kategorie z prefiksem beta przyjmują `?version=`. | - |
| `GET /api/images/beta/versions` | Dostępne wersje archiwum obrazów beta i cel dowiązania symbolicznego `latest` | - |
| `GET /api/images/{category}/download` | Pobieranie kategorii obrazów jako ZIP. Kategorie beta przyjmują `?version=`. | - |
| `GET /api/changelogs` | Podsumowania dzienników zmian (wszystkie wersje) | - |
| `GET /api/changelogs/{tag}` | Pełny dziennik zmian dla znacznika wersji | - |
| `GET /api/guides` | Przewodniki społeczności | `category`, `difficulty`, `tag`, `search` |
| `GET /api/guides/{slug}` | Pojedynczy przewodnik (z treścią Markdown) | - |
| `POST /api/guides` | Prześlij przewodnik (przekazywany do Discord) | - |
| `POST /api/runs` | Prześlij rozgrywkę (JSON z pliku .run) | `username` |
| `GET /api/runs/list` | Wyświetl/przeglądaj przesłane rozgrywki | `character`, `win`, `username`, `seed`, `build_id`, `build_ids`, `players`, `game_mode`, `ascension`, `ascension_min`, `ascension_max`, `card`, `relic`, `today`, `sort`, `page`, `limit` |
| `GET /api/runs/shared/{hash}` | Pełne dane rozgrywki według skrótu (scala `username` z bazy danych) | - |
| `GET /api/runs/stats` | Zagregowane statystyki społeczności | `character`, `win`, `ascension`, `game_mode`, `players` |
| `GET /api/runs/leaderboard` | Ranking obejmujący wyłącznie zwycięstwa | `category` (`fastest`, `highest_ascension`), `character`, `players`, `game_mode`, `today`, `page`, `limit` |
| `GET /api/runs/leaderboard/rank/{hash}` | Pozycja pojedynczej zwycięskiej rozgrywki w jej rankingu | `category` |
| `GET /api/runs/scores/{type}` | Codex Score (wynik współczynnika zwycięstw skorygowany metodą bayesowską oraz poziom S/A/B/C/D/F) dla każdego elementu | `type` = `cards`/`relics`/`potions` |
| `GET /api/runs/encounter-stats` | Agregaty dla poszczególnych spotkań (wystąpienia, współczynnik śmiertelności, średnie obrażenia/tury) | `act`, `room_type`, `multiplayer`, `page`, `limit` |
| `POST /api/runs/claim` | Przypisz nazwę użytkownika do wcześniej przesłanych rozgrywek według skrótu | - |
| `GET /api/runs/versions` | Odrębne wersje gry w przesłanych rozgrywkach | - |
| `GET /api/exports/{lang}` | ZIP ze wszystkimi danymi JSON elementów w jednym języku | `lang` |
| `GET /api/news` | Ogłoszenia Steam i aktualności społeczności (archiwizowane lokalnie) | `feed_type`, `feedname`, `tag`, `since`, `search`, `limit`, `offset` |
| `GET /api/news/{gid}` | Pojedynczy artykuł aktualności (surowa treść HTML/BBCode) | - |
| `GET /api/merchant/config` | Automatycznie wyodrębniona konfiguracja cen kupca | - |
| `POST /api/feedback` | Prześlij opinię (przekazywaną do Discord) | - |
| `GET /api/versions` | Metadane wersji udostępniane przez aktywny katalog główny danych | - |

**Konta użytkowników** (sesja cookie/JWT; logowanie przez Steam lub Discord):

| Punkt końcowy | Opis |
|---|---|
| `GET /api/auth/me` | Aktualnie zalogowany użytkownik |
| `GET /api/auth/steam/redirect` | Rozpocznij logowanie przez Steam OpenID |
| `GET /api/auth/discord/start` | Rozpocznij logowanie przez Discord OAuth |
| `POST /api/auth/logout` | Usuń cookie sesji |
| `PATCH /api/auth/username` / `PATCH /api/auth/email` | Zaktualizuj pola profilu |
| `GET /api/auth/runs` / `POST /api/auth/runs/upload` / `DELETE /api/auth/runs/{hash}` | Wyświetl, prześlij i usuń rozgrywki użytkownika |
| `GET /api/auth/stats` | Zagregowane statystyki użytkownika (strona profilu) |
| `GET /api/auth/personal-bests` | Najszybsza gra pojedyncza/kooperacyjna, najwyższy poziom trudności, dzisiejsza i historyczna rozgrywka dzienna |
| `GET /api/auth/competitive` | Dzisiejszy ranking dzienny, pozycje globalne i współczynnik zwycięstw na tle społeczności |

Limit wynosi **60 żądań na minutę** na adres IP. Przesyłanie opinii i przewodników jest ograniczone do **3–5 na minutę** na adres IP. Interaktywna dokumentacja jest dostępna pod `/docs` (Swagger UI).

### Lokalizacja

Wszystkie dane gry są udostępniane w 15 językach z użyciem własnych plików lokalizacyjnych Slay the Spire 2. Przekaż `?lang=` do dowolnego punktu końcowego danych. Użyj `?channel=beta` dla aktywnych publicznych danych beta; zarchiwizowane zestawy obrazów beta używają `?version=`.

| Kod | Język | Kod | Język |
|------|----------|------|----------|
| `eng` | English | `kor` | 한국어 |
| `deu` | Deutsch | `pol` | Polski |
| `esp` | Español (ES) | `ptb` | Português (BR) |
| `fra` | Français | `rus` | Русский |
| `ita` | Italiano | `spa` | Español (LA) |
| `jpn` | 日本語 | `tha` | ไทย |
| `tur` | Türkçe | `zhs` | 简体中文 |
| `zht` | 繁體中文 | | |

**Elementy lokalizowane**: pochodzące z gry nazwy i opisy elementów, typy kart, rzadkości, słowa kluczowe, moce, spotkania, nazwy postaci, tytuły sekcji, zlokalizowane trasy i większość współdzielonych etykiet interfejsu.

**Elementy pozostające po angielsku**: identyfikatory API i strukturalne wartości filtrów, takie jak `room_type`, `type`/`stack_type` mocy i `pool`, a także nazwy produktów oraz niektóre treści redakcyjne lub tworzone przez społeczność.

Parametry filtrów (`type=Attack`, `rarity=Rare`, `keyword=Exhaust`) zawsze używają wartości angielskich niezależnie od języka - backend tłumaczy je na zlokalizowane odpowiedniki przed dopasowaniem.

Przykład: `GET /api/cards?lang=kor&type=Attack` zwraca koreańskie dane kart, w których typem jest „공격”, prawidłowo odfiltrowane mimo angielskiego parametru.

### Formatowanie rich text

Pola tekstowe (`description`, `loss_text`, `flavor`, `text` dialogu, `title`/`description` opcji) mogą zawierać znaczniki w stylu BBCode Godot zachowane z danych lokalizacyjnych gry:

| Znacznik | Typ | Przykład | Renderowanie |
|---|---|---|---|
| `[gold]...[/gold]` | Kolor | `[gold]Enchant[/gold]` | Tekst w kolorze złotym |
| `[red]...[/red]` | Kolor | `[red]blood[/red]` | Tekst w kolorze czerwonym |
| `[blue]...[/blue]` | Kolor | `[blue]2[/blue]` | Tekst w kolorze niebieskim |
| `[green]...[/green]` | Kolor | `[green]healed[/green]` | Tekst w kolorze zielonym |
| `[purple]...[/purple]` | Kolor | `[purple]Sharp[/purple]` | Tekst w kolorze fioletowym |
| `[orange]...[/orange]` | Kolor | `[orange]hulking figure[/orange]` | Tekst w kolorze pomarańczowym |
| `[pink]...[/pink]` | Kolor | - | Tekst w kolorze różowym |
| `[aqua]...[/aqua]` | Kolor | `[aqua]Ascending Spirit[/aqua]` | Tekst w kolorze cyjanowym |
| `[sine]...[/sine]` | Efekt | `[sine]swirling vortex[/sine]` | Animowany, falujący tekst |
| `[jitter]...[/jitter]` | Efekt | `[jitter]CLANG![/jitter]` | Animowany, drżący tekst |
| `[b]...[/b]` | Efekt | `[b]bold text[/b]` | Tekst pogrubiony |
| `[i]...[/i]` | Efekt | `[i]whispers[/i]` | Tekst pisany kursywą |
| `[energy:N]` | Ikona | `[energy:2]` | Ikony energii |
| `[star:N]` | Ikona | `[star:1]` | Ikony gwiazd |
| `[Card]`, `[Relic]` | Symbol zastępczy | `[Card]` | Element dynamiczny czasu wykonywania (kursywa) |

Znaczniki można zagnieżdżać: `[b][jitter]CLANG![/jitter][/b]`, `[gold][sine]swirling vortex[/sine][/gold]`.

Jeśli korzystasz bezpośrednio z API, możesz usunąć te znaczniki za pomocą wyrażenia regularnego, takiego jak `\[/?[a-z]+(?::\d+)?\]`, albo renderować je we własnym frontendzie. Pole `description_raw` (tam, gdzie jest dostępne) zawiera nierozwiązany szablon SmartFormat.

## Uruchamianie lokalne

### Wymagania wstępne

- Python 3.10+
- Node.js 20+

### Backend

```bash
python -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r backend/requirements.txt

cd backend
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Backend działa pod adresem **http://localhost:8000**.

### Frontend

```bash
cd frontend
npm install
NEXT_PUBLIC_API_URL=http://localhost:8000 npm run dev
```

Frontend działa pod adresem **http://localhost:3000**.

### Docker

```bash
docker compose up --build
```

Uruchamia obie usługi (backend na porcie 8000, frontend na porcie 3000).

### Zmienne środowiskowe

Podstawowe API tylko do odczytu nie wymaga konfiguracji. Poniższe funkcje opcjonalne są włączane za pomocą zmiennych środowiskowych (ustawianych w środowisku backendu lub pliku compose):

| Zmienna | Używana przez | Uwagi |
|---|---|---|
| `MONGO_URL` | Backend | Baza danych rozgrywek (statystyki społeczności, rankingi, konta). Gdy zmienna nie jest ustawiona, backend używa starszej ścieżki SQLite (`data/runs.db`). |
| `JWT_SECRET` | Backend | Podpisuje tokeny sesji kont użytkowników. |
| `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` | Backend | Logowanie przez Discord OAuth. |
| `FRONTEND_URL`, `SPIRE_CODEX_PUBLIC_BASE` | Backend | Adresy URL przekierowania/powrotu OAuth. |
| `ENVIRONMENT` | Backend | Wartość `production` włącza bezpieczne zachowanie cookies. |
| `NEXT_PUBLIC_API_URL` | Frontend (kompilacja) | Adres bazowy API; pusty w środowisku produkcyjnym, aby obrazy/dane korzystały z tego samego źródła. |
| `NEXT_PUBLIC_CDN_URL` | Frontend (kompilacja) | Po ustawieniu (np. `https://cdn.spire-codex.com`) obrazy są wczytywane z CDN zamiast z `/static`. |
| `NEXT_PUBLIC_SITE_URL` | Frontend (kompilacja) | Kanoniczny adres URL witryny dla metadanych. |

Konta użytkowników i CDN są domyślnie wyłączone, dlatego projekt działa od początku do końca bez żadnej z tych zmiennych.

## Potok aktualizacji

Wieloplatformowy skrypt Pythona obsługuje cały proces aktualizacji po wydaniu nowej wersji gry:

```bash
# Pełny potok - wyodrębnij pliki gry, przeanalizuj dane, wyrenderuj duszki, skopiuj obrazy:
python3 tools/update.py

# Ręcznie określ ścieżkę instalacji gry:
python3 tools/update.py --game-dir "/path/to/Slay the Spire 2"

# Pomiń ekstrakcję (katalog extraction/ zawiera już świeże dane):
python3 tools/update.py --skip-extract

# Tylko ponownie przeanalizuj dane (bez ekstrakcji ani renderowania):
python3 tools/update.py --parse-only

# Tylko ponownie wyrenderuj duszki Spine:
python3 tools/update.py --render-only

# Wygeneruj dziennik zmian po aktualizacji:
python3 tools/update.py --changelog --game-version "0.98.2" --build-id "22238966"
```

Skrypt automatycznie wykrywa system operacyjny i znajduje katalog instalacyjny Steam. Wymagania dla poszczególnych etapów:

| Etap | Narzędzie | Instalacja |
|---|---|---|
| Ekstrakcja PCK | `gdre_tools` | [Wydania GDRE Tools](https://github.com/bruvzg/gdsdecomp/releases) |
| Dekompilacja DLL | `ilspycmd` | `dotnet tool install ilspycmd -g` |
| Analiza danych | Python 3.10+ | Wbudowane |
| Kopiowanie obrazów | Python 3.10+ | Wbudowane |
| Renderowanie Spine | Node.js 20+ | [nodejs.org](https://nodejs.org) |

### Czynności ręczne

Jeśli wolisz uruchamiać poszczególne etapy oddzielnie:

```bash
# Przeanalizuj wszystkie dane (wszystkie 15 języków)
cd backend/app/parsers && python3 parse_all.py

# Przeanalizuj jeden język
cd backend/app/parsers && python3 parse_all.py --lang eng

# Skopiuj obrazy z ekstrakcji do zasobów statycznych (PNG i WebP z tego samego źródła - bez
# stratnego łańcucha przez istniejący plik WebP backendu). WebP: quality=95, method=6.
python3 backend/scripts/copy_images.py

# Wyrenderuj duszki Spine (WebGL - bez artefaktów trójkątnych szwów)
cd tools/spine-renderer && npm install
npx playwright install chromium           # Tylko za pierwszym razem
node render_all_webgl.mjs                 # Wszystkie 138 szkieletów przez bezinterfejsowy Chrome
node render_webgl.mjs <skel_dir> <out> [size] [--skin=a,b] [--anim=name] [--anim-time=N]

# Typowe nadpisania dla poszczególnych potworów:
#   --skin=moss1,diamondeye   połącz skórki wariantów ze skórką domyślną (cubex_construct)
#   --skin=skin1              zamień skórkę domyślną na wariant (scroll_of_biting)
#   --anim-time=0.5           przesuń animację o N sekund przed wykonaniem obrazu
#   --anim=attack             zastąp automatycznie wybraną animację spoczynkową
#
# Zastępowanie symboli zastępczych dymu: gas_bomb_2.png, the_forgotten_2.png oraz
# living_smog_2.png są dostarczane w źródle jako purpurowe plansze „Smoke Placeholder”.
# render_webgl.mjs zastępuje je proceduralnie wygenerowaną ciemnośliwkową chmurą
# o tych samych wymiarach przed przesłaniem do GL, a następnie wymusza slot.color.a = 1.0
# w zastąpionych slotach (artyści ustawili niską alfę z myślą o shaderze).

# Ponownie skadruj zbyt małe duszki potworów (obróbka końcowa - przycina do rzeczywistej
# ramki ograniczającej alfa i skaluje, aby wypełnić około 92% ramki 512×512):
python3 tools/rescale_bestiary.py fuzzy_wurm_crawler thieving_hopper terror_eel

# Starszy renderer canvas (ma artefakty trójkątnych szwów - unikaj)
# node render_all.mjs / node render.mjs
```

## System dziennika zmian

Śledź zmiany między aktualizacjami gry za pomocą różnic na poziomie pól we wszystkich kategoriach elementów.

### Generowanie dziennika zmian

```bash
# Porównaj bieżące dane z odwołaniem git:
python3 tools/diff_data.py HEAD~1 --format json \
    --game-version "0.98.2" --build-id "22238966" \
    --title "March Update"

# Wyświetl podgląd jako tekst lub Markdown:
python3 tools/diff_data.py HEAD~1 --format text
python3 tools/diff_data.py HEAD~1 --format md
```

### Schemat dziennika zmian

Każdy plik JSON dziennika zmian zawiera:

| Pole | Opis |
|---|---|
| `app_id` | Identyfikator aplikacji Steam (2868840) |
| `game_version` | Wersja gry Steam (np. `"0.98.2"`) |
| `build_id` | Identyfikator kompilacji Steam |
| `tag` | Unikatowy klucz wersji (np. `"1.0.3"`) |
| `date` | Data aktualizacji |
| `title` | Tytuł czytelny dla człowieka |
| `summary` | Liczniki: `{ added, removed, changed }` |
| `features` / `fixes` / `api_changes` | Ręcznie opracowane informacje o wydaniu. Są zachowywane przy ponownym generowaniu istniejącego znacznika przez `diff_data.py` - różnice danych są nadpisywane, ale te tablice zostają scalone. |
| `categories` | Różnice dla poszczególnych kategorii z dodanymi/usuniętymi/zmienionymi elementami. Zmiany pól rekurencyjnie obejmują zagnieżdżone słowniki/listy, dzięki czemu każdy liść stanowi osobny wiersz (np. `vars.DamageVar: 8 → 10`) zamiast nieprzejrzystego `vars: 2 fields → 2 fields`. |

### Jednorazowy zapis i zachowywanie historii

Pliki w `data/changelogs/` są historycznymi rekordami przeznaczonymi do jednokrotnego zapisu. `.github/workflows/changelog-guard.yml` blokuje każde żądanie PR, które **modyfikuje lub usuwa** istniejący dziennik zmian. Nowe pliki (`A`) są zawsze dozwolone; modyfikacje wymagają etykiety `changelog-edit-approved` w żądaniu PR. Zasady i procedurę nadpisywania opisano w `CONTRIBUTING.md → Changelog Retention`.

### Historia poszczególnych elementów

`GET /api/history/{entity_type}/{entity_id}` przegląda każdy dziennik zmian i zwraca wpisy dotyczące żądanego elementu, zaczynając od najnowszych. Panel historii wersji na każdej stronie szczegółów (`/cards/{id}`, `/monsters/{id}` itd.) korzysta z tego punktu końcowego.

## Wdrażanie

### CI/CD (GitHub Actions)

Wypchnięcia do `main` uruchamiają `.github/workflows/ci.yml` na samodzielnie hostowanym runnerze Kubernetes. Przepływ wykonuje skanowanie sekretów, kontrole ESLint i TypeScript oraz sprawdzanie lintowania i formatowania przez ruff, a następnie buduje i wypycha stabilne obrazy z tagiem `:latest`. Nadal buduje także samodzielne obrazy beta z tagiem `:beta` dla `docker-compose.beta.yml`; obrazy te są zachowane operacyjnie, ale publiczne strony beta są obsługiwane przez główne wdrożenie pod `/beta`.

Stabilny frontend otrzymuje `UMAMI_WEBSITE_ID`. Samodzielny obraz beta otrzymuje `UMAMI_BETA_WEBSITE_ID`, chociaż publiczny ruch `/beta` korzysta ze stabilnego frontendu i jego usługi analitycznej.

CI **nie** wykonuje wdrożenia. Wdrożeniem zajmuje się uruchamiane co godzinę zadanie automatycznego wdrażania na hoście DigitalOcean.

> **Uwaga:** `.forgejo/workflows/build.yml` zachowano jako nieaktywną konfigurację awaryjną opartą na buildah.

### Lokalna kompilacja i wypychanie

Pomiń CI i wypchnij obrazy bezpośrednio ze swojego komputera:

```bash
# Zbuduj i wypchnij oba obrazy:
python3 tools/deploy.py

# Tylko frontend:
python3 tools/deploy.py --frontend

# Tylko backend:
python3 tools/deploy.py --backend

# Kompilacja testowa bez wypychania:
python3 tools/deploy.py --no-push

# Oznacz wydanie:
python3 tools/deploy.py --tag v0.98.2

# Zbuduj i wypchnij obrazy beta (tag :beta, pomija IndexNow):
python3 tools/deploy.py --beta
```

Skrypt automatycznie wykrywa Apple Silicon i wykonuje kompilację krzyżową do `linux/amd64` za pomocą `docker buildx`. Wymaga wcześniejszego wykonania `docker login`.

### Środowisko produkcyjne

Aplikacja publiczna i zachowany samodzielny stos beta działają na tym samym hoście DigitalOcean. Ruch publiczny korzysta z `spire-codex.com`; pomocniczy host Lightsail obsługuje MongoDB.

**Automatyczne wdrażanie** - zadanie cron na hoście DigitalOcean uruchamia co godzinę, o :03, `/usr/local/bin/spire-codex-autodeploy`. Gdy sprawdzony commit zmieni się na nowszy, zadanie pobiera zmiany i odtwarza zarówno `docker-compose.prod.yml`, jak i `docker-compose.beta.yml`, z wyjątkiem aktualizacji ograniczonych do `data/news/*`. Następnie czyści pamięć podręczną Cloudflare. Dzienniki są zapisywane w `/var/log/spire-codex-autodeploy.log`. Instrukcje instalacji i obsługi znajdują się w [`infrastructure/ansible/README.md`](infrastructure/ansible/README.md).

**Wdrożenie ręczne**:

```bash
cd infrastructure/ansible
./bin/do-ansible playbooks/deploy.yml

# Zachowany samodzielny stos beta
./bin/do-ansible playbooks/deploy.yml -e compose_file=docker-compose.beta.yml
```

Dane produkcyjne są montowane za pomocą bind mount (`./data:/data:ro` dla frontendu oraz z prawem odczytu i zapisu dla backendu). Aktualności i stan rozgrywek są odczytywane z zamontowanych danych w czasie obsługi żądania, dlatego aktualizacje `data/news/*.json` nie wymagają restartu kontenera.

### Kanał beta (spire-codex.com/beta)

Aplikacja publiczna udostępnia dane stabilne i dane Steam `public-beta` jako dwa kanały treści. Strony beta znajdują się pod [`spire-codex.com/beta`](https://spire-codex.com/beta), a zlokalizowane trasy pod `/{lang}/beta/...`. Główna strona `/images` udostępnia również zarchiwizowane wersje zasobów beta.

`beta.spire-codex.com` został wycofany z użytku publicznego. Cloudflare wysyła obecnie zachowujące ścieżkę przekierowanie `302` do domeny głównej, ale nie dodaje `/beta` ani `channel=beta`. Stare odnośniki do stron trafiają zatem na odpowiadające im strony stabilne, a stare żądania API po przekierowaniu otrzymują dane stabilne. Nowi klienci API muszą korzystać z głównego API z jawnym kanałem, na przykład `https://spire-codex.com/api/cards?channel=beta`.

**Architektura**: `get_channel` rozwiązuje `?channel=beta|stable` do Pythonowego `ContextVar`; rozpoznaje również nagłówek hosta `beta.*` dla bezpośredniego ruchu do serwera źródłowego. `data_service.py` wczytuje żądania beta z `data-beta/<latest>/` i w razie braku danego pliku korzysta ze stabilnej wersji. `GET /api/beta/diff` i `GET /api/beta/version` opisują aktywną wersję beta, a frontend renderuje wybrany kanał pod `/beta`.

Oddzielny stos `docker-compose.beta.yml` i obrazy `:beta` są nadal budowane i odtwarzane przez automatyzację wdrażania. Gdy przekierowanie Cloudflare jest aktywne, nie stanowią publicznej witryny beta.

**Układ danych**: każda zarchiwizowana kompilacja znajduje się w `data-beta/<version>/`, a wskaźnik `latest` wybiera aktywną kompilację. Każda wersja ma własny katalog `changelogs/`. Archiwa obrazów beta odzwierciedlają ten układ w `backend/static/images/beta/<version>/{cards,monsters,misc,ui,vfx}/`.

**Automatyczne pobieranie** - `tools/beta-watch/` działa jako zadanie launchd na programistycznym komputerze Mac w czwartki od 15:00 do 22:45, co 15 minut. Gdy SteamCMD zgłosi nowy identyfikator kompilacji `public-beta`, narzędzie wyodrębnia i dekompiluje grę, analizuje każdy język, generuje różnice, synchronizuje wersjonowane obrazy i otwiera żądanie PR `auto/beta-<version>`. Instrukcje instalacji i obsługi znajdują się w [`tools/beta-watch/README.md`](tools/beta-watch/README.md).

**Pobieranie ręczne**:

```bash
VERSION=vX.Y.Z
PREVIOUS=vA.B.C

# Najpierw wyodrębnij i zdekompiluj pliki gry beta, a następnie uruchom analizę z katalogu głównego repozytorium.
(cd backend/app/parsers && \
  EXTRACTION_DIR=../../../extraction/beta \
  DATA_DIR="../../../data-beta/$VERSION" \
  python3 parse_all.py)

VERSION="$VERSION" tools/beta-watch/sync-images.sh

python3 tools/diff_data.py "data-beta/$PREVIOUS/eng" "data-beta/$VERSION/eng" \
  --format json --output-dir "data-beta/$VERSION/changelogs" \
  --game-version "${VERSION#v}" --title "Beta ${VERSION#v}"
```

`sync-images.sh` aktualizuje dowiązanie symboliczne obrazów `latest`. Żądanie PR pobierania zawiera wersjonowane zmiany danych i obrazów; po scaleniu automatyczne wdrożenie odświeża oba zachowane stosy.

## Renderer Spine

Duszki potworów w StS2 są animacjami szkieletowymi [Spine](http://esotericsoftware.com/) - każdy potwór składa się z pliku `.skel` (binarny szkielet), pliku `.atlas` i arkusza duszków `.png`, a nie z pojedynczego obrazu. Renderer składa je w statyczne portrety PNG.

### Renderer WebGL (obecny)

Renderer WebGL (`render_webgl.mjs`, `render_all_webgl.mjs`) używa **Playwright + spine-webgl** do renderowania szkieletów za pomocą GPU bezinterfejsowego Chrome. Daje to czyste rendery **bez artefaktów trójkątnych szwów**.

**Sposób działania:**
1. Uruchamia bezinterfejsowy Chrome przez Playwright z włączonym WebGL
2. Wczytuje dane szkieletu, atlas i tekstury jako base64 na stronę przeglądarki
3. Tworzy canvas WebGL i konfiguruje shader spine-webgl oraz moduł wsadowego renderowania wielokątów
4. Stosuje animację spoczynkową i oblicza granice (z wyłączeniem slotów cienia/podłoża)
5. Renderuje przez rasteryzację trójkątów GPU - bez ścieżek przycinania canvas i bez szwów
6. Odczytuje surowe piksele przez `gl.readPixels` i odwraca je pionowo (WebGL działa od dołu do góry)
7. Zapisuje PNG przez node-canvas, aby zachować przezroczystość

**Pojedynczy szkielet:**
```bash
node render_webgl.mjs <skel_dir> <output_path> [size]
node render_webgl.mjs ../../extraction/raw/animations/backgrounds/neow_room ../../backend/static/images/misc/neow.png 2048
```

**Wszystkie szkielety wsadowo:**
```bash
node render_all_webgl.mjs  # Renderuje 138 szkieletów do backend/static/images/renders/
```

### Zakres renderowania

| Kategoria | Wyrenderowane | Łącznie | Uwagi |
|---|---|---|---|
| Potwory | 99 | 103 katalogi | Wszystkie 111 potworów w grze ma obrazy (99 wyrenderowanych oraz aliasy/obrazy statyczne) |
| Postacie | 16 | 16 | Pozy walki, miejsca odpoczynku i wyboru |
| Tła/postacie niezależne | 14 | 17 | Neow, Tezcatara, pomieszczenia kupca, menu główne |
| VFX/interfejs | 9 | 22 | Większość VFX wymaga konkretnych klatek animacji |
| **Łącznie** | **138** | **158** | Pominięto 20 (brak atlasu, wyłącznie VFX, puste) |

### Renderer animacji

Renderer animacji (`render_gif.mjs`) renderuje animacje spoczynkowe/ataku Spine jako animowane pliki WebP, GIF lub APNG. Obsługuje warianty skórek, wybór animacji i strumieniowe zapisywanie klatek na dysk w przypadku dużych animacji.

**Obsługiwane formaty wyjściowe:**
- **`.webp`** (zalecany) - bezstratny animowany WebP z pełnym kanałem alfa, około 33% mniejszy niż APNG. Klatki są strumieniowo zapisywane na dysk, aby zapobiec wyczerpaniu pamięci.
- **`.gif`** - 256 kolorów, przezroczystość binarna. Najmniejsze pliki, ale najniższa jakość.
- **`.apng`** - pełny kanał alfa jak w WebP, ale większe pliki.

```bash
# Wyrenderuj bezstratny animowany WebP (zalecane)
NODE_OPTIONS="--max-old-space-size=8192" node render_gif.mjs <skel_dir> <output.webp> [size] [--fps=N]

# Z wariantem skórki (dla bowlbug, cultists, cubex itd.)
node render_gif.mjs <skel_dir> output.webp 256 --fps=10 --skin=rock

# Konkretna animacja (domyślnie: zapętlona animacja spoczynkowa)
node render_gif.mjs <skel_dir> output.webp 256 --fps=12 --anim=attack

# Tryb białej sylwetki (dla ikon węzłów bossów na mapie)
node render_gif.mjs <skel_dir> output.webp 256 --white
```

**Biblioteka animacji:** 209 bezstratnych animowanych plików WebP:
- 15 animacji postaci (walka/wybór/odpoczynek × 5 postaci) w rozdzielczości 512×512
- 103 animacje spoczynkowe potworów w rozdzielczości 256×256
- 91 animacji ataku potworów w rozdzielczości 256×256

**Warianty skórek:** 13 potworów ma warianty skórek (bowlbug, cubex_construct, cultists itd.). Użyj `--skin=`, aby wybrać wariant. Domyślna skórka często pokazuje tylko szkielet bazowy bez ciała.

**Shader węzła bossa na mapie:** gra korzysta z `boss_map_point.gdshader`, który traktuje kanały RGB jako maski:
- **Kanał czerwony** × `map_color` (domyślnie: beżowy `0.671, 0.58, 0.478`) → kolor wypełnienia
- **Kanał niebieski** × `black_layer_color` (domyślnie: czarny `0, 0, 0`) → kolor konturu
- **Kanał zielony** × biały `1, 1, 1` → rozjaśnienia

### Starszy renderer canvas

Renderer canvas (`render.mjs`, `render_all.mjs`) używa `spine-canvas` z `triangleRendering = true`. Powoduje to **widoczne artefakty siatki wielokątów** z powodu antyaliasingu ścieżki `clip()` canvas między sąsiednimi trójkątami. Zamiast niego używaj renderera WebGL.

### Zależności

- `@esotericsoftware/spine-webgl` ^4.2.107 - środowisko uruchomieniowe Spine dla WebGL (obecne)
- `playwright` - bezinterfejsowy Chrome do renderowania WebGL
- `gif-encoder-2` - kodowanie GIF dla renderera animacji
- `canvas` ^3.1.0 - implementacja Canvas dla Node.js (bufor klatek renderera animacji)
- `Pillow` (Python) - składa WebP/APNG z wyrenderowanych klatek PNG
- `@esotericsoftware/spine-canvas` ^4.2.106 - środowisko uruchomieniowe Spine dla Canvas (starsze)

## Wyodrębnianie plików gry

Jeśli musisz zacząć ekstrakcję od zera:

```bash
# Wyodrębnij PCK (GDRE Tools)
/path/to/gdre_tools --headless --recover="/path/to/sts2.pck" --output-dir=extraction/raw

# Zdekompiluj DLL (ILSpy CLI)
ilspycmd -p -o extraction/decompiled "/path/to/sts2.dll"
```

Lokalizacje instalacji Steam:
- **Windows**: `C:\Program Files (x86)\Steam\steamapps\common\Slay the Spire 2\`
- **macOS**: `~/Library/Application Support/Steam/steamapps/common/Slay the Spire 2/`
- **Linux**: `~/.local/share/Steam/steamapps/common/Slay the Spire 2/`

## Wersjonowanie

Spire Codex używa semantycznego wersjonowania **`1.X.Y`**:

| Segment | Znaczenie |
|---------|---------|
| **1** | Główna wersja Spire Codex (nie zmienia się bez pełnego przepisania projektu) |
| **X** | Zwiększany, gdy Mega Crit wydaje aktualizację gry |
| **Y** | Zwiększany dla naszych poprawek i ulepszeń parsera/frontendu |

Przykłady: `v1.0.0` = wydanie początkowe, `v1.0.1` = nasze poprawki błędów, `v1.1.0` = uwzględniona pierwsza aktualizacja Mega Crit.

## SEO

- **Dane strukturalne (JSON-LD)**: WebSite + VideoGame (strona główna), CollectionPage + ItemList (strony list), Article + BreadcrumbList + FAQPage (strony szczegółów), SoftwareApplication (dla programistów), NewsArticle (news/[gid])
- **Format tytułu**: `"Slay the Spire 2 (sts2) {Page Title} | Spire Codex"` - ustandaryzowany na wszystkich stronach. Rozgrywki używają `"{username} - {char} - Ascension {N} {win/loss} - Slay the Spire 2 (sts2) | Spire Codex"`. „(sts2)” znajduje się wewnątrz tytułu, aby pasowały zapytania międzyjęzykowe `sts2 tier list` / `sts2 card list`.
- **Mapa witryny**: płaski XML pod `/sitemap.xml` z `force-dynamic` (renderowany po stronie serwera, a nie podczas kompilacji). Ponad 20 000 adresów URL, w tym strony szczegółów elementów, strony macierzy przeglądania, strony list poziomów, metodologia punktacji, szczegóły runs/[hash] i odpowiedniki i18n dla wszystkich typów elementów
- **Międzynarodowe SEO**: trasy `/{lang}/` dla 14 języków innych niż angielski z **dwukierunkowymi** alternatywami hreflang - angielskie strony główne także emitują alternatywy dla każdego języka i `x-default` przez `buildLanguageAlternates(path)` w `lib/seo.ts` (naprawia klaster zduplikowanej treści „Crawled - not indexed” w GSC, w którym Google traktował zlokalizowane strony jako duplikaty bez odwołań zwrotnych)
- **Programatyczne SEO**: 41 stron przeglądania kart pod `/cards/browse/` (rare-attacks, ironclad-skills itd.) oraz 3 strony list poziomów (`/tier-list/{cards,relics,potions}`)
- **EntityProse uwzględniające ustawienia regionalne**: strony szczegółów renderują krótki akapit właściwy dla danego języka zamiast identycznej angielskiej treści w każdej wersji językowej
- **Linkowanie wewnętrzne**: moce ↔ karty, spotkania → potwory, słowa kluczowe kart → strony centrum słów kluczowych, ruchy potworów → strony mocy (z podpowiedziami), strony aktów → spotkania/wydarzenia, wiersze list poziomów → karta Statystyki szczegółów elementu
- **Open Graph i Twitter Cards**: obrazy OG dla poszczególnych elementów, karty Twitter `summary_large_image`
- **Kanoniczne adresy URL**: każda strona deklaruje kanoniczny adres URL

## Osadzane widżety

### Widżet podpowiedzi
Dodaj do dowolnej witryny podpowiedzi wyświetlane po najechaniu dla wszystkich 13 typów elementów:
```html
<script src="https://spire-codex.com/widget/spire-codex-tooltip.js"></script>
<p>Start with [[Bash]] and [[relic:Burning Blood]].</p>
```

### Widżet dziennika zmian
Osadź interaktywną przeglądarkę dziennika zmian:
```html
<div id="scx-changelog"></div>
<script src="https://spire-codex.com/widget/spire-codex-changelog.js"></script>
```

Pełna dokumentacja: [spire-codex.com/developers](https://spire-codex.com/developers)

## Plan rozwoju

- ~~Osobne strony szczegółów~~ ✅
- ~~Wyszukiwanie globalne~~ ✅
- ~~Obsługa wielu języków (15 języków)~~ ✅
- ~~SEO (JSON-LD, OG/Twitter, mapa witryny, hreflang)~~ ✅
- ~~Widżet podpowiedzi (wszystkie 13 typów elementów)~~ ✅
- ~~Strony porównywania postaci (10 par)~~ ✅
- ~~Strony centrum słów kluczowych~~ ✅
- ~~Przewodnik kupca (ceny ze zdekompilowanego C#)~~ ✅
- ~~Dokumentacja dla programistów i eksporty danych~~ ✅
- ~~Międzynarodowe SEO (13 stron docelowych języków)~~ ✅
- ~~Macierz przeglądania kart (41 programatycznych stron SEO)~~ ✅
- ~~Przewodniki społeczności~~ ✅ - Markdown z metadanymi YAML, formularz przesyłania, widżet podpowiedzi, profile społecznościowe autorów
- ~~Strona mechanik gry~~ ✅ - 27 indywidualnych stron SEO: częstotliwości wypadania, walka, mapa, bossowie, sekrety i ciekawostki
- ~~Rozgrywki społeczności~~ ✅ - przesyłanie rozgrywek, przeglądarka, udostępnione rozgrywki, statystyki na żywo
- ~~Opisy ulepszeń kart~~ ✅ - `upgrade_description` dla wszystkich 403 kart możliwych do ulepszenia
- ~~Wrodzone moce potworów~~ ✅ - 42 potwory z mocami z `AfterAddedToRoom`
- ~~Warunki odblokowania osiągnięć~~ ✅ - kategoria, postać i próg z kodu źródłowego C#
- ~~Wzorce ataków potworów~~ ✅ - 112 potworów z cykliczną/losową/warunkową/mieszaną SI z maszyn stanów C#
- ~~Warunki wstępne wydarzeń~~ ✅ - 25 wydarzeń z warunkami `IsAllowed()` przeanalizowanymi z kodu źródłowego C#
- ~~Zachowywanie archiwum beta~~ ✅ - wersjonowane dane i obrazy beta pozostają zachowane; `/beta` udostępnia aktywną kompilację, a `/images` umożliwia przeglądanie zarchiwizowanych zasobów
- ~~Bot Discord~~ ✅ - [Knowledge Demon](https://bot.spire-codex.com): polecenia ukośnikowe dla każdego elementu (`/card`, `/relic`, `/monster`, `/potion`, `/character`, `/event`, `/power`, `/enchantment`, `/lookup`, `/meta`), RSS aktualności Steam oraz pełny zestaw narzędzi moderacyjnych rozwidlony z [Kernel](https://github.com/ptrlrd/kernel)
- ~~Codex Score i lista poziomów~~ ✅ - ocena poszczególnych elementów obliczana na podstawie rozgrywek społeczności za pomocą **estymacji bayesowskiej**: `shrunk = (wins + PRIOR_WEIGHT × baseline) / (n + PRIOR_WEIGHT)`, następnie skalowana do zakresu 0–100 i mapowana na S/A/B/C/D/F. Zapobiega szumowi małych próbek (karta z wynikiem 1/1 po jednej grze nie otrzyma S - wynik zostanie przybliżony do rozkładu a priori). Wstępnie obliczana podczas uruchamiania backendu. Wyświetlana jako `ScoreBadge` na karcie Statystyki strony szczegółów, na dedykowanych stronach list poziomów i stronie metodologii pod `/leaderboards/scoring`.
- ~~Karta Statystyki na stronie szczegółów~~ ✅ - główna odznaka wyniku, podsumowanie tekstowe i odnośniki do ostatnich rozgrywek przez `EntityRunStats`.
- **Kreator talii** - interaktywne teoretyczne konstruowanie talii
- **Backend bazy danych** - zastąpienie wczytywania plików JSON dla poszczególnych języków przez PostgreSQL JSONB (lub rozwiązanie alternatywne). Magazyn przesyłanych rozgrywek został już przeniesiony z SQLite do MongoDB (maj 2026).

## Podziękowania

Dziękujemy **vesper-arch**, **terracubist**, **U77654**, **Purple Aspired Dreaming**, **Kobaru** i **Severi** za testy jakości, zgłoszenia błędów i wkład w projekt. Pełna lista wspierających - w tym darczyńców Ko-fi, dzięki którym projekt może działać - znajduje się pod adresem [spire-codex.com/thank-you](https://spire-codex.com/thank-you).

## Stos technologiczny

- **Backend**: Python, FastAPI, Pydantic, slowapi, kompresja GZip
- **Baza danych rozgrywek**: MongoDB (statystyki społeczności, rankingi, konta użytkowników), z materializowaną kolekcją `stats_summary` i procesem odświeżania w tle wybierającym lidera. Starsza ścieżka SQLite jest zachowana jako rozwiązanie awaryjne offline.
- **Konta**: Steam OpenID + Discord OAuth, sesyjne cookies JWT
- **Frontend**: Next.js 16 (App Router), TypeScript, Tailwind CSS, obsługa 15 języków
- **Obrazy/CDN**: Cloudflare R2 udostępniany przez `cdn.spire-codex.com` (webp)
- **Analityka i obserwowalność**: samodzielnie hostowany Umami, Prometheus + node-exporter
- **Renderer Spine**: Node.js, Playwright, @esotericsoftware/spine-webgl (WebGL przez bezinterfejsowy Chrome)
- **Infrastruktura**: Docker, CI GitHub Actions (samodzielnie hostowany runner) z pamięcią podręczną BuildKit opartą na rejestrze, wdrożenie Ansible/SSH
- **Narzędzia**: Python (potok aktualizacji, porównywanie dzienników zmian, kopiowanie obrazów)

## Licencja

- **Kod źródłowy**: [PolyForm Noncommercial 1.0.0](LICENSE.md) - można go bezpłatnie używać, modyfikować i rozpowszechniać do celów niekomercyjnych. Sprzedaż oprogramowania jest niedozwolona.
- **Hostowane API**: [API_TERMS.md](API_TERMS.md) - bezpłatne do dowolnego użytku w ramach opublikowanych limitów szybkości; jeśli potrzebujesz większych limitów, skontaktuj się przez Discord lub zgłoszenie.
- **Dane gry** (karty, relikty, potwory itd.): © Mega Crit Games. Udostępniane tutaj jako społecznościowy materiał referencyjny na zasadach dozwolonego użytku / do celów edukacyjnych. Nie używaj tych danych do ponownego kompilowania, przepakowywania ani rozpowszechniania gry.

Wkład w projekt jest przyjmowany na tych samych warunkach PolyForm Noncommercial 1.0.0 - zobacz [CONTRIBUTING.md](CONTRIBUTING.md#license).
