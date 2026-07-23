<p align="center">
  <img src="frontend/public/spire-codex-white-silent-black-background.png" alt="Spire Codex-Logo" width="200" />
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

Eine umfassende Datenbank und API für Spieldaten von **Slay the Spire 2**, erstellt durch Reverse Engineering der Spieldateien. Unterstützt alle **15 Sprachen**, die mit dem Spiel ausgeliefert werden.

**Live-Website**: [spire-codex.com](https://spire-codex.com)

**Steam-App-ID**: 2868840

## Wie es erstellt wurde

Slay the Spire 2 wurde mit Godot 4 entwickelt, aber die gesamte Spiellogik befindet sich in einer C#/.NET-8-DLL (`sts2.dll`) und nicht in GDScript. Die Datenpipeline:

1. **PCK-Extraktion** - [GDRE Tools](https://github.com/bruvzg/gdsdecomp) extrahiert die Godot-Datei `.pck`, um Bilder, Spine-Animationen und Lokalisierungsdaten wiederherzustellen (~9.947 Dateien).

2. **DLL-Dekompilierung** - [ILSpy](https://github.com/icsharpcode/ILSpy) dekompiliert `sts2.dll` in ~3.300 lesbare C#-Quelldateien, die alle Spielmodelle enthalten.

3. **Datenparsing** - 22 auf regulären Python-Ausdrücken basierende Parser extrahieren strukturierte Daten aus dem dekompilierten C#-Quellcode und geben sprachspezifisches JSON unter `data/{lang}/` aus:
   - **Karten**: Konstruktoren vom Typ `base(cost, CardType, CardRarity, TargetType)` sowie `DamageVar`, `BlockVar`, `PowerVar<T>` für Werte
   - **Charaktere**: `StartingHp`, `StartingGold`, `MaxEnergy`, `StartingDeck`, `StartingRelics`
   - **Relikte/Tränke**: Seltenheit, Pool und aus SmartFormat-Vorlagen aufgelöste Beschreibungen
   - **Monster**: TP-Bereiche, Aufstiegs-Skalierung über `AscensionHelper`, Zug-Zustandsautomaten mit Absichten pro Zug (Attack/Defend/Buff/Debuff/Status/Summon/Heal), Schadenswerte, Mehrfachtrefferanzahl (einschließlich AscensionHelper-Mustern), angeborene Kräfte aus `AfterAddedToRoom` (42 Monster mit Aufstiegsvarianten), pro Zug angewendete Kräfte (Ziel + Menge aus `PowerCmd.Apply<T>`), Block, Heilung, Begegnungskontext (Akt, Raumtyp), aus `GenerateMoveStateMachine()` geparste **Angriffsmuster** (112 Monster - zyklisch, zufällig, bedingt, gemischt)
   - **Verzauberungen**: Einschränkungen nach Kartentyp, Stapelbarkeit, auf Amount basierende Skalierung
   - **Begegnungen**: Monsterzusammenstellungen, Raumtyp (Boss/Elite/Monster), Platzierung im Akt, Tags
   - **Ereignisse**: Mehrseitige Entscheidungsbäume (56 von 66 Ereignissen), Auswahlmöglichkeiten mit Ergebnissen, Platzierung im Akt, zu Anzeigenamen aufgelöste `StringVar`-Modellreferenzen, zur Laufzeit berechnete Werte (steigende Kosten über `GetDecipherCost()`, Goldbereiche über `CalculateVars` mit `NextInt`/`NextFloat`, Muster für vollständige Heilung), **Vorbedingungen** aus `IsAllowed()` (25 Ereignisse - Bedingungen zu Gold, TP, Akt, Deck, Relikt und Trank)
   - **Uralte**: 8 uralte NSCs mit Beinamen, charakterspezifischen Dialogen, Reliktangeboten und Porträtsymbolen
   - **Kräfte**: PowerType (Buff/Debuff), PowerStackType (Counter/Single), DynamicVars, Beschreibungen
   - **Epochen/Geschichten**: Daten zum Fortschritt in der Zeitlinie mit Freischaltvoraussetzungen
   - **Sphären**: Passive-/Hervorrufungswerte, Beschreibungen
   - **Gebrechen**: Stapelbarkeit, zusätzlicher Kartentext, Beschreibungen
   - **Modifikatoren**: Beschreibungen von Laufmodifikatoren
   - **Schlüsselwörter**: Definitionen von Kartenschlüsselwörtern (Exhaust, Ethereal, Innate usw.)
   - **Absichten**: Beschreibungen von Monsterabsichten mit Symbolen
   - **Erfolge**: Freischaltbedingungen, Beschreibungen, Kategorien, Charakterzuordnung und Schwellenwerte aus dem C#-Quellcode (33 Erfolge)
   - **Akte**: Reihenfolge der Bossentdeckung, Begegnungen, Ereignisse, Uralte, Raumanzahl
   - **Aufstiegsstufen**: 11 Stufen (0–10) mit Beschreibungen aus der Lokalisierung
   - **Trank-Pools**: Charakterspezifische Pools, geparst aus Pool-Klassen und Epochenreferenzen
   - **Übersetzungen**: Sprachspezifische Filterzuordnungen (Kartentypen, Seltenheiten, Schlüsselwörter → lokalisierte Namen) und UI-Zeichenfolgen (Abschnittstitel, Beschreibungen, Charakternamen) zur Verwendung im Frontend

4. **Beschreibungsauflösung** - Ein gemeinsam genutztes Modul `description_resolver.py` löst SmartFormat-Lokalisierungsvorlagen (`{Damage:diff()}`, `{Energy:energyIcons()}`, `{Cards:plural:card|cards}`) in menschenlesbaren Text mit Rich-Text-Markierungen für die Darstellung im Frontend auf. Zur Laufzeit dynamische Variablen (z. B. `{Card}`, `{Relic}`) bleiben als lesbare Platzhalter erhalten. `StringVar`-Referenzen in Ereignissen (z. B. `{Enchantment1}` → `ModelDb.Enchantment<Sharp>().Title`) werden mithilfe der Lokalisierungssuche in Anzeigenamen aufgelöst.

5. **Spine-Rendering** - Charaktere und Monster sind Spine-Skelettanimationen und keine statischen Bilder. Ein Headless-Node.js-Renderer setzt Ruheposen zu 512×512-Porträt-PNGs zusammen. Alle 111 Monster verfügen über Bilder: 100 wurden aus Spine-Skeletten gerendert, 6 über gemeinsam genutzte Skelette zugeordnet (Flyconid→flying_mushrooms, Ovicopter→egg_layer, Crusher/Rocket→kaiser_crab) und 5 stammen aus statischen Spielressourcen (Doormaker). Außerdem werden alle 5 Charaktere (Kampf-, Raststätten- und Charakterauswahlposen), NSCs und Hintergründe gerendert. Skin-basierte Varianten (Cultists, Bowlbugs, Cubex) werden einzeln gerendert. Siehe unten unter [Spine-Renderer](#spine-renderer).

6. **Bilder** - Kartenporträts, Relikt-/Tranksymbole, Charaktergrafiken, Monstersprites, Porträtsymbole der Uralten und Symbole für Bossbegegnungen werden aus Spielressourcen extrahiert und als statische Dateien bereitgestellt.

7. **Changelog-Differenzbildung** - Ein Diff-Werkzeug vergleicht JSON-Daten zwischen Spielversionen (über Git-Referenzen oder Verzeichnisse) und verfolgt hinzugefügte, entfernte oder geänderte Entitäten pro Kategorie mit Unterschieden auf Feldebene. Changelogs werden anhand der Steam-Spielversion und einer optionalen Codex-Revisionsnummer indiziert.

## Projektstruktur

```
spire-codex/
├── backend/                    # FastAPI-Backend
│   ├── app/
│   │   ├── main.py             # App-Einstieg, CORS, GZip, Ratenbegrenzung, statische Dateien
│   │   ├── dependencies.py     # Gemeinsame Abhängigkeiten (Sprachvalidierung, Sprachnamen)
│   │   ├── routers/            # API-Endpunkte (über 25 Router)
│   │   ├── models/schemas.py   # Pydantic-Modelle
│   │   ├── services/           # Laden von JSON-Daten (LRU-gecacht, Unterstützung für 14 Sprachen)
│   │   └── parsers/            # C#-Quellcode → JSON-Parser
│   │       ├── card_parser.py
│   │       ├── character_parser.py
│   │       ├── monster_parser.py
│   │       ├── relic_parser.py
│   │       ├── potion_parser.py
│   │       ├── enchantment_parser.py
│   │       ├── encounter_parser.py
│   │       ├── event_parser.py
│   │       ├── power_parser.py
│   │       ├── keyword_parser.py        # Schlüsselwörter, Absichten, Sphären, Gebrechen, Modifikatoren, Erfolge (mit Freischaltbedingungen)
│   │       ├── guide_parser.py          # Markdown-Leitfäden mit YAML-Frontmatter
│   │       ├── epoch_parser.py
│   │       ├── act_parser.py
│   │       ├── ascension_parser.py
│   │       ├── pool_parser.py            # Fügt Tränken den Charakter-Pool hinzu
│   │       ├── translation_parser.py    # Erzeugt translations.json pro Sprache
│   │       ├── description_resolver.py   # Gemeinsamer SmartFormat-Resolver
│   │       ├── parser_paths.py           # Gemeinsame Pfadkonfiguration (Überschreibungen durch Umgebungsvariablen für Beta)
│   │       └── parse_all.py              # Koordiniert alle Parser (15 Sprachen)
│   ├── static/images/          # Spielbilder (nicht eingecheckt)
│   ├── scripts/copy_images.py  # Kopiert Bilder aus der Extraktion → static
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/                   # Next.js 16 + TypeScript + Tailwind CSS
│   ├── app/
│   │   ├── contexts/           # LanguageContext, BetaVersionContext
│   │   ├── components/         # CardGrid, RichDescription, SearchFilter,
│   │   │                       #   GlobalSearch, Navbar, Footer, LanguageSelector, VersionSelector
│   │   └── ...                 # Seiten: Karten, Charaktere, Relikte, Monster, Tränke,
│   │                           #   Verzauberungen, Begegnungen, Ereignisse, Kräfte, Zeitlinie,
│   │                           #   Referenz, Bilder, Changelog, Über, Händler, Vergleich,
│   │                           #   mechanics/[slug], guides/[slug], guides/submit,
│   │                           #   Bestenlisten, leaderboards/submit, leaderboards/stats,
│   │                           #   runs/[hash] (gemeinsame Laufansicht)
│   │                           #   Detailseiten: cards/[id], characters/[id], relics/[id],
│   │                           #   monsters/[id], potions/[id], enchantments/[id],
│   │                           #   encounters/[id], events/[id], powers/[id], keywords/[id],
│   │                           #   acts/[id], ascensions/[id], intents/[id], orbs/[id],
│   │                           #   afflictions/[id], modifiers/[id], achievements/[id]
│   │                           #   i18n: [lang]/... spiegelt alle Routen für 14 nicht englische Sprachen
│   ├── lib/
│   │   ├── api.ts              # API-Client + TypeScript-Schnittstellen
│   │   ├── fetch-cache.ts      # Clientseitiger In-Memory-Fetch-Cache (5 Min. TTL)
│   │   ├── seo.ts              # Gemeinsame SEO-Hilfsfunktionen (stripTags, SITE_URL, SITE_NAME)
│   │   ├── jsonld.ts           # JSON-LD-Schema-Builder (BreadcrumbList, CollectionPage, Article, WebSite, FAQPage)
│   │   ├── ui-translations.ts # Übersetzungen von UI-Zeichenfolgen für 14 nicht englische Sprachen
│   │   ├── languages.ts       # i18n-Konfiguration - 14 Sprachcodes, hreflang-Zuordnungen
│   │   └── use-lang-prefix.ts # Hook für sprachabhängige URL-Erstellung
│   └── Dockerfile
├── tools/
│   ├── spine-renderer/         # Headless-Renderer für Spine-Skelette
│   │   ├── render_webgl.mjs     # WebGL-Renderer (einzelnes Skelett) - keine Nahtartefakte
│   │   ├── render_all_webgl.mjs # WebGL-Batch-Renderer (alle .skel-Dateien)
│   │   ├── render_gif.mjs      # Animationsrenderer (WebP/GIF/APNG mit Skin- und Animationsunterstützung)
│   │   ├── render.mjs           # Veralteter Canvas-Renderer (weist Dreiecksnähte auf)
│   │   ├── render_all.mjs       # Veralteter Canvas-Batch-Renderer
│   │   ├── render_skins2.mjs    # Renderer für Skin-Varianten
│   │   ├── render_utils.mjs     # Gemeinsame Canvas-Rendering-Hilfsfunktionen
│   │   └── package.json
│   ├── diff_data.py            # Changelog-Diff-Generator
│   ├── update.py               # Plattformübergreifende Aktualisierungspipeline
│   └── deploy.py               # Lokaler Docker-Build + Push zu Docker Hub
├── data/                       # Geparste JSON-Datendateien
│   ├── {lang}/                 # Sprachspezifische Verzeichnisse (eng, kor, jpn, fra usw.)
│   ├── changelogs/             # Changelog-JSON-Dateien (nach Spielversion indiziert)
│   ├── guides/                 # Markdown-Leitfadendateien mit YAML-Frontmatter
│   ├── guides.json             # Geparste Leitfadendaten
│   ├── runs/                   # Eingereichte Lauf-JSON-Dateien (pro Spieler-Hash)
│   └── runs.db                 # Veraltetes SQLite (durch MongoDB ersetzt; als Offline-Fallback beibehalten)
├── extraction/                 # Rohe Spieldateien (nicht eingecheckt)
│   ├── raw/                    # Mit GDRE extrahiertes Godot-Projekt (stabil)
│   ├── decompiled/             # ILSpy-Ausgabe (stabil)
│   └── beta/                   # Steam-Beta-Branch (raw/ + decompiled/)
├── data-beta/                  # Geparste Beta-Daten (versioniert: v0.102.0/, v0.103.0/, latest → Symlink)
├── docker-compose.yml          # Lokale Entwicklung
├── docker-compose.prod.yml     # Produktion
├── .github/workflows/
│   └── ci.yml                  # GitHub Actions CI: Linting, Typprüfung, Geheimnisscan, Docker-Build+Push, SSH-Deployment
└── .forgejo/workflows/
    └── build.yml               # Beibehaltener Forgejo-CI-Fallback (Buildah-basiert, nicht aktiv)
```

## Öffentliche Dienste

| Host | Zweck |
|---|---|
| [`spire-codex.com`](https://spire-codex.com) | Öffentliche Website und Same-Origin-API. Der aktive Beta-Kanal befindet sich unter `/beta`. |
| `cdn.spire-codex.com` | Cloudflare-R2-Objekthost für Spielgrafiken, vollständige Kartenrenderings, lokalisierte Renderings und archivierte Beta-Ressourcen. |
| [`bot.spire-codex.com`](https://bot.spire-codex.com) | Landingpage von Knowledge Demon und über Discord authentifiziertes Mitarbeiter-Dashboard. Der Bot verwendet die Haupt-API von Codex. |
| `analytics.spire-codex.com` | Selbst gehostetes Umami-Skript und -Dashboard. Die zugehörige PostgreSQL-Datenbank verbleibt in einem privaten Docker-Netzwerk. |
| `tierlists.spire-codex.com` | Dedizierter R2-Objekthost für generierte Vorschaubilder von Ranglisten. |
| `beta.spire-codex.com` | Stillgelegter öffentlicher Host. Cloudflare leitet Anfragen auf denselben Pfad der Apex-Domain um. |

Die CDN- und Ranglisten-Hosts sind Objektspeicher und keine durchsuchbaren Websites, weshalb ein `404` im jeweiligen Stammverzeichnis zu erwarten ist.

## Website-Seiten

| Seite | Route | Beschreibung |
|---|---|---|
| Startseite | `/` | Dashboard mit Entitätsanzahl, Kategoriekarten und Charakterlinks |
| Karten | `/cards` | Filterbares Kartenraster mit modaler Detailansicht |
| Kartendetails | `/cards/[id]` | Vollständige Kartenwerte, Aufwertungsinformationen, Bild |
| Charaktere | `/characters` | Übersichtsgrid der Charaktere |
| Charakterdetails | `/characters/[id]` | Werte, Startdeck/-relikte, Zitate, NSC-Dialogbäume |
| Relikte | `/relics` | Filterbares Reliktraster |
| Reliktdetails | `/relics/[id]` | Vollständige Reliktinformationen mit atmosphärischem Rich Text |
| Monster | `/monsters` | Monsterraster mit TP, Zügen und Spine-Renderings |
| Monsterdetails | `/monsters/[id]` | TP, Züge mit Absichten/Schaden/Kräften/Block, Begegnungslinks, Kraft-Tooltips |
| Tränke | `/potions` | Filterbares Trankraster (Seltenheit, Charakter-Pool) |
| Trankdetails | `/potions/[id]` | Vollständige Trankinformationen |
| Verzauberungen | `/enchantments` | Verzauberungsliste mit Kartentypfiltern |
| Verzauberungsdetails | `/enchantments/[id]` | Vollständige Verzauberungsinformationen |
| Begegnungen | `/encounters` | Begegnungszusammenstellungen nach Akt/Raumtyp |
| Begegnungsdetails | `/encounters/[id]` | Monsteraufstellung, Raumtyp, Tags |
| Ereignisse | `/events` | Mehrseitige Ereignisbäume mit ausklappbaren Auswahlmöglichkeiten |
| Ereignisdetails | `/events/[id]` | Vollständige Ereignisseiten, Optionen, Dialoge der Uralten |
| Kräfte | `/powers` | Buffs, Debuffs und neutrale Kräfte |
| Kraftdetails | `/powers/[id]` | Kraftinformationen mit Karten, die diese Kraft anwenden |
| Schlüsselwörter | `/keywords` | Liste der Kartenschlüsselwörter |
| Schlüsselwortdetails | `/keywords/[id]` | Schlüsselwortbeschreibung mit filterbarem Kartenraster |
| Händler | `/merchant` | Preise für Karten/Relikte/Tränke, Kosten für Kartenentfernung, falscher Händler |
| Vergleich | `/compare` | Zentrale für Charaktervergleiche (10 Paare) |
| Vergleichsdetails | `/compare/[pair]` | Direkter Charaktervergleich |
| Entwickler | `/developers` | API-Dokumentation, Widget-Dokumentation, Datenexporte |
| Showcase | `/showcase` | Galerie der Community-Projekte |
| Zeitlinie | `/timeline` | Epochenfortschritt mit Äragruppierung und Freischaltvoraussetzungen |
| Aktdetails | `/acts/[id]` | Bosse, Begegnungen, Ereignisse und Uralte eines Akts |
| Aufstiegsdetails | `/ascensions/[id]` | Beschreibung der Aufstiegsstufe mit Vor-/Zurück-Navigation |
| Absichtsdetails | `/intents/[id]` | Absichtssymbol, Beschreibung |
| Sphärendetails | `/orbs/[id]` | Sphärensymbol, Passiv-/Hervorrufungsbeschreibung |
| Gebrechendetails | `/afflictions/[id]` | Beschreibung des Gebrechens, Stapelbarkeit |
| Modifikatordetails | `/modifiers/[id]` | Beschreibung des Laufmodifikators |
| Erfolgsdetails | `/achievements/[id]` | Erfolgsbeschreibung |
| Abzeichen | `/badges` | Alle 25 Laufabschlussabzeichen, gruppiert nach abgestuft / einstufig / nur Mehrspieler |
| Abzeichendetails | `/badges/[id]` | Aufschlüsselung nach Stufe (Bronze / Silber / Gold), Sieg-erforderlich- und Mehrspieler-Flags, Symbol |
| Mechaniken | `/mechanics` | Zentrale für Spielmechaniken - 27 anklickbare Abschnitte mit einzelnen SEO-Seiten |
| Mechanikdetails | `/mechanics/[slug]` | Kartenwahrscheinlichkeiten, Reliktverteilung, Trank-Drops, Kartengenerierung, Boss-Pools, Kampf, Geheimnisse und Wissenswertes |
| Leitfäden | `/guides` | Community-Strategieleitfäden mit Suche/Filter |
| Leitfadendetails | `/guides/[slug]` | Vollständiger Leitfaden mit Markdown-Darstellung + Tooltip-Widget |
| Leitfaden einreichen | `/guides/submit` | Formular zur Einreichung von Leitfäden (Discord-Webhook) |
| Bestenlisten | `/leaderboards` | Ranglisten für schnellste Siege und höchsten Aufstieg mit Einzel-/Koop- und Spielmodusfiltern (standard / daily / Today / custom). Der gesamte Filterstatus befindet sich in der URL, sodass jede Ansicht geteilt werden kann |
| Läufe durchsuchen | `/runs` | Vollständiger Lauf-Browser mit Ausdruckssuchleiste (`user:`, `char:`, `asc:`-Bereiche, `card:`/`relic:`-Mehrfachwert-UND, `version:`-Bereiche, `mode:`, `result:`, `players:`) sowie Dropdown-Filtern, Sortierung und teilbaren URLs |
| Lauf einreichen | `/leaderboards/submit` | Drag-and-drop-Upload von `.run` mit Link zur Overwolf-Begleitanwendung, Steam-/Discord-Anmeldung zur automatischen Zuordnung von Läufen und den eigenen letzten Läufen |
| Statistiken | `/leaderboards/stats` | Ranglisten (Auswahlrate, Siegesrate, Anzahl) für Karten, Relikte, Tränke und Begegnungen. Filterung nach Charakter / Aufstieg / Ergebnis |
| Profil | `/profile` | Statistiken des angemeldeten Benutzers (Top-Karten/-Relikte/-Tränke, Charakteraufschlüsselung), persönliche Bestleistungen, Wettbewerbsvergleich (heutige tägliche Bestenliste, globale Ränge, Siegesrate gegenüber der Community) und Laufverwaltung |
| Einstellungen | `/settings` | Kontoeinstellungen: Benutzername, E-Mail, verknüpftes Steam/Discord |
| Geteilter Lauf | `/runs/[hash]` | Sieg-/Niederlagenzusammenfassung im Spielstil mit anklickbaren Kartenknotensymbolen, Reliktleiste und Mini-Kartenraster |
| Referenz | `/reference` | Alle Elemente anklickbar - Akte, Aufstiege, Schlüsselwörter, Sphären, Gebrechen, Absichten, Modifikatoren, Erfolge |
| Bilder | `/images` | Durchsuchbare Spielressourcen mit ZIP-Download pro Kategorie |
| Changelog | `/changelog` | Datenunterschiede zwischen Spielaktualisierungen |
| Über | `/about` | Projektinformationen, Statistiken, Visualisierung der Pipeline |
| Danke | `/thank-you` | Ko-fi-Unterstützer und Community-Mitwirkende (von „Über“ getrennt, damit die Seite direkt verlinkt werden kann) |
| Knowledge Demon | `/knowledge-demon` | Informationsseite für den Discord-Bot - Slash-Befehle, Moderationsfunktionen, Installations-CTA |
| Neuigkeiten | `/news` | Gespiegelter Feed mit Steam-Ankündigungen; kanonische Links verweisen zurück zu Steam, sodass er ergänzend und nicht duplizierend ist |
| Nachrichtenartikel | `/news/[gid]` | Einzelne Steam-Ankündigung mit bereinigtem BBCode-Inhalt und `NewsArticle`-JSON-LD |
| Rangliste | `/tier-list` | Zentrale für Codex-Score-Ranglisten (Stufen S → F) für Karten / Relikte / Tränke |
| Ranglistendetails | `/tier-list/[type]` | Visuelle S/A/B/C/D/F-Zeilen für einen Entitätstyp, gespeist aus `/api/runs/scores/{type}` |
| Bewertung | `/leaderboards/scoring` | Methodikseite für Codex Score - Bayessche Schrumpfung, Prior-Gewicht, Skalenbereich, Stufengrenzen |

## API-Endpunkte

Alle Datenendpunkte akzeptieren einen optionalen Abfrageparameter `?lang=` (Standard: `eng`). Antworten sind **GZip-komprimiert** und werden mit `Cache-Control: public, max-age=300` zwischengespeichert.

| Endpunkt | Beschreibung | Filter |
|---|---|---|
| `GET /api/cards` | Alle Karten | `color`, `type`, `rarity`, `keyword`, `search`, `lang` |
| `GET /api/cards/{id}` | Einzelne Karte | `lang` |
| `GET /api/characters` | Alle Charaktere | `search`, `lang` |
| `GET /api/characters/{id}` | Einzelner Charakter (mit Zitaten, Dialogen) | `lang` |
| `GET /api/relics` | Alle Relikte | `rarity`, `pool`, `search`, `lang` |
| `GET /api/relics/{id}` | Einzelnes Relikt | `lang` |
| `GET /api/monsters` | Alle Monster | `type`, `search`, `lang` |
| `GET /api/monsters/{id}` | Einzelnes Monster | `lang` |
| `GET /api/potions` | Alle Tränke | `rarity`, `pool`, `search`, `lang` |
| `GET /api/potions/{id}` | Einzelner Trank | `lang` |
| `GET /api/enchantments` | Alle Verzauberungen | `card_type`, `search`, `lang` |
| `GET /api/enchantments/{id}` | Einzelne Verzauberung | `lang` |
| `GET /api/encounters` | Alle Begegnungen | `room_type`, `act`, `search`, `lang` |
| `GET /api/encounters/{id}` | Einzelne Begegnung | `lang` |
| `GET /api/events` | Alle Ereignisse | `type`, `act`, `search`, `lang` |
| `GET /api/events/{id}` | Einzelnes Ereignis | `lang` |
| `GET /api/powers` | Alle Kräfte | `type`, `stack_type`, `search`, `lang` |
| `GET /api/powers/{id}` | Einzelne Kraft | `lang` |
| `GET /api/keywords` | Definitionen von Kartenschlüsselwörtern | `lang` |
| `GET /api/keywords/{id}` | Einzelnes Schlüsselwort | `lang` |
| `GET /api/intents` | Typen von Monsterabsichten | `lang` |
| `GET /api/intents/{id}` | Einzelne Absicht | `lang` |
| `GET /api/orbs` | Alle Sphären | `lang` |
| `GET /api/orbs/{id}` | Einzelne Sphäre | `lang` |
| `GET /api/afflictions` | Kartengebrechen | `lang` |
| `GET /api/afflictions/{id}` | Einzelnes Gebrechen | `lang` |
| `GET /api/modifiers` | Laufmodifikatoren | `lang` |
| `GET /api/modifiers/{id}` | Einzelner Modifikator | `lang` |
| `GET /api/achievements` | Alle Erfolge | `lang` |
| `GET /api/achievements/{id}` | Einzelner Erfolg | `lang` |
| `GET /api/badges` | Alle Laufabschlussabzeichen | `tiered`, `multiplayer_only`, `requires_win`, `search`, `lang` |
| `GET /api/badges/{id}` | Einzelnes Abzeichen mit Stufenaufschlüsselung | `lang` |
| `GET /api/history/{entity_type}/{entity_id}` | Versionsverlauf pro Entität (ohne Beachtung der Groß-/Kleinschreibung, neueste zuerst) | - |
| `GET /api/epochs` | Epochen der Zeitlinie | `era`, `search`, `lang` |
| `GET /api/epochs/{id}` | Einzelne Epoche | `lang` |
| `GET /api/stories` | Geschichtseinträge | `lang` |
| `GET /api/stories/{id}` | Einzelne Geschichte | `lang` |
| `GET /api/acts` | Alle Akte | `lang` |
| `GET /api/acts/{id}` | Einzelner Akt | `lang` |
| `GET /api/ascensions` | Aufstiegsstufen (0–10) | `lang` |
| `GET /api/ascensions/{id}` | Einzelne Aufstiegsstufe | `lang` |
| `GET /api/stats` | Entitätsanzahl über alle Kategorien hinweg | `lang` |
| `GET /api/languages` | Verfügbare Sprachen mit Anzeigenamen | - |
| `GET /api/translations` | Übersetzungszuordnungen für Filterwerte und UI-Zeichenfolgen | `lang` |
| `GET /api/images` | Bildkategorien mit Dateilisten. Kategorien mit Beta-Präfix akzeptieren `?version=`. | - |
| `GET /api/images/beta/versions` | Verfügbare Versionen des Beta-Bildarchivs + Ziel des `latest`-Symlinks | - |
| `GET /api/images/{category}/download` | ZIP-Download einer Bildkategorie. Beta-Kategorien akzeptieren `?version=`. | - |
| `GET /api/changelogs` | Changelog-Zusammenfassungen (alle Versionen) | - |
| `GET /api/changelogs/{tag}` | Vollständiges Changelog für einen Versions-Tag | - |
| `GET /api/guides` | Community-Leitfäden | `category`, `difficulty`, `tag`, `search` |
| `GET /api/guides/{slug}` | Einzelner Leitfaden (mit Markdown-Inhalt) | - |
| `POST /api/guides` | Leitfaden einreichen (an Discord weitergeleitet) | - |
| `POST /api/runs` | Lauf einreichen (JSON einer .run-Datei) | `username` |
| `GET /api/runs/list` | Eingereichte Läufe auflisten/durchsuchen | `character`, `win`, `username`, `seed`, `build_id`, `build_ids`, `players`, `game_mode`, `ascension`, `ascension_min`, `ascension_max`, `card`, `relic`, `today`, `sort`, `page`, `limit` |
| `GET /api/runs/shared/{hash}` | Vollständige Laufdaten anhand des Hashs (führt `username` aus der DB zusammen) | - |
| `GET /api/runs/stats` | Aggregierte Community-Statistiken | `character`, `win`, `ascension`, `game_mode`, `players` |
| `GET /api/runs/leaderboard` | Rangliste ausschließlich für Siege | `category` (`fastest`, `highest_ascension`), `character`, `players`, `game_mode`, `today`, `page`, `limit` |
| `GET /api/runs/leaderboard/rank/{hash}` | Rang eines einzelnen siegreichen Laufs innerhalb seiner Rangliste | `category` |
| `GET /api/runs/scores/{type}` | Codex Score (Bayessch geschrumpfte Siegesratenbewertung + Stufe S/A/B/C/D/F) pro Entität | `type` = `cards`/`relics`/`potions` |
| `GET /api/runs/encounter-stats` | Aggregate pro Begegnung (Auftreten, Todesrate, durchschnittlicher Schaden/Züge) | `act`, `room_type`, `multiplayer`, `page`, `limit` |
| `POST /api/runs/claim` | Benutzername anhand des Hashs an zuvor eingereichte Läufe anhängen | - |
| `GET /api/runs/versions` | Unterschiedliche Spielversionen über eingereichte Läufe hinweg | - |
| `GET /api/exports/{lang}` | ZIP mit sämtlichem Entitäts-JSON für eine Sprache | `lang` |
| `GET /api/news` | Steam-Ankündigungen + Community-Neuigkeiten (lokal archiviert) | `feed_type`, `feedname`, `tag`, `since`, `search`, `limit`, `offset` |
| `GET /api/news/{gid}` | Einzelner Nachrichtenartikel (roher HTML-/BBCode-Inhalt) | - |
| `GET /api/merchant/config` | Automatisch extrahierte Preiskonfiguration des Händlers | - |
| `POST /api/feedback` | Feedback einreichen (an Discord weitergeleitet) | - |
| `GET /api/versions` | Vom aktiven Datenstamm bereitgestellte Versionsmetadaten | - |

**Benutzerkonten** (Cookie-/JWT-Sitzung; Anmeldung mit Steam oder Discord):

| Endpunkt | Beschreibung |
|---|---|
| `GET /api/auth/me` | Aktuell angemeldeter Benutzer |
| `GET /api/auth/steam/redirect` | Steam-OpenID-Anmeldung starten |
| `GET /api/auth/discord/start` | Discord-OAuth-Anmeldung starten |
| `POST /api/auth/logout` | Sitzungscookie löschen |
| `PATCH /api/auth/username` / `PATCH /api/auth/email` | Profilfelder aktualisieren |
| `GET /api/auth/runs` / `POST /api/auth/runs/upload` / `DELETE /api/auth/runs/{hash}` | Läufe des Benutzers auflisten, hochladen und entfernen |
| `GET /api/auth/stats` | Aggregierte Statistiken pro Benutzer (Profilseite) |
| `GET /api/auth/personal-bests` | Schnellster Einzel-/Koop-Lauf, höchster Aufstieg, heutige und ewige tägliche Bestleistung |
| `GET /api/auth/competitive` | Heutige tägliche Bestenliste, globale Ränge, Siegesrate gegenüber der Community |

Ratenbegrenzung auf **60 Anfragen pro Minute** und IP. Feedback- und Leitfadeneinreichungen sind auf **3–5 pro Minute** und IP begrenzt. Interaktive Dokumentation unter `/docs` (Swagger UI).

### Lokalisierung

Alle Spieldaten werden mithilfe der eigenen Lokalisierungsdateien von Slay the Spire 2 in 15 Sprachen bereitgestellt. Übergeben Sie `?lang=` an einen beliebigen Datenendpunkt. Verwenden Sie `?channel=beta` für die Daten der aktiven öffentlichen Beta; archivierte Beta-Bildsätze verwenden `?version=`.

| Code | Sprache | Code | Sprache |
|------|----------|------|----------|
| `eng` | Englisch | `kor` | 한국어 |
| `deu` | Deutsch | `pol` | Polski |
| `esp` | Español (ES) | `ptb` | Português (BR) |
| `fra` | Français | `rus` | Русский |
| `ita` | Italiano | `spa` | Español (LA) |
| `jpn` | 日本語 | `tha` | ไทย |
| `tur` | Türkçe | `zhs` | 简体中文 |
| `zht` | 繁體中文 | | |

**Was lokalisiert wird**: Aus dem Spiel stammende Entitätsnamen und -beschreibungen, Kartentypen, Seltenheiten, Schlüsselwörter, Kräfte, Begegnungen, Charakternamen, Abschnittstitel, lokalisierte Routen und die meisten gemeinsamen UI-Beschriftungen.

**Was englisch bleibt**: API-Bezeichner und strukturelle Filterwerte wie `room_type`, Kraft-`type`/`stack_type` und `pool` sowie Produktmarken und einige redaktionelle oder von der Community verfasste Inhalte.

Filterparameter (`type=Attack`, `rarity=Rare`, `keyword=Exhaust`) verwenden unabhängig von der Sprache immer englische Werte - das Backend übersetzt sie vor dem Abgleich in die lokalisierten Entsprechungen.

Beispiel: `GET /api/cards?lang=kor&type=Attack` gibt koreanische Kartendaten zurück, bei denen der Typ „공격“ lautet, obwohl der Parameter englisch ist.

### Rich-Text-Formatierung

Textfelder (`description`, `loss_text`, `flavor`, Dialog-`text`, Options-`title`/`description`) können BBCode-ähnliche Godot-Tags enthalten, die aus den Lokalisierungsdaten des Spiels übernommen wurden:

| Tag | Typ | Beispiel | Darstellung |
|---|---|---|---|
| `[gold]...[/gold]` | Farbe | `[gold]Enchant[/gold]` | Goldfarbener Text |
| `[red]...[/red]` | Farbe | `[red]blood[/red]` | Roter Text |
| `[blue]...[/blue]` | Farbe | `[blue]2[/blue]` | Blauer Text |
| `[green]...[/green]` | Farbe | `[green]healed[/green]` | Grüner Text |
| `[purple]...[/purple]` | Farbe | `[purple]Sharp[/purple]` | Violetter Text |
| `[orange]...[/orange]` | Farbe | `[orange]hulking figure[/orange]` | Orangefarbener Text |
| `[pink]...[/pink]` | Farbe | - | Rosafarbener Text |
| `[aqua]...[/aqua]` | Farbe | `[aqua]Ascending Spirit[/aqua]` | Cyanfarbener Text |
| `[sine]...[/sine]` | Effekt | `[sine]swirling vortex[/sine]` | Wellenförmig animierter Text |
| `[jitter]...[/jitter]` | Effekt | `[jitter]CLANG![/jitter]` | Zitternd animierter Text |
| `[b]...[/b]` | Effekt | `[b]bold text[/b]` | Fett gedruckter Text |
| `[i]...[/i]` | Effekt | `[i]whispers[/i]` | Kursiver Text |
| `[energy:N]` | Symbol | `[energy:2]` | Energiesymbol(e) |
| `[star:N]` | Symbol | `[star:1]` | Sternsymbol(e) |
| `[Card]`, `[Relic]` | Platzhalter | `[Card]` | Zur Laufzeit dynamisch (kursiv) |

Tags können verschachtelt werden: `[b][jitter]CLANG![/jitter][/b]`, `[gold][sine]swirling vortex[/sine][/gold]`.

Wenn Sie die API direkt verwenden, können Sie diese mit einem regulären Ausdruck wie `\[/?[a-z]+(?::\d+)?\]` entfernen oder in Ihrem eigenen Frontend darstellen. Das Feld `description_raw` enthält, sofern vorhanden, die nicht aufgelöste SmartFormat-Vorlage.

## Lokale Ausführung

### Voraussetzungen

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

Das Backend läuft unter **http://localhost:8000**.

### Frontend

```bash
cd frontend
npm install
NEXT_PUBLIC_API_URL=http://localhost:8000 npm run dev
```

Das Frontend läuft unter **http://localhost:3000**.

### Docker

```bash
docker compose up --build
```

Startet beide Dienste (Backend auf 8000, Frontend auf 3000).

### Umgebungsvariablen

Die zentrale schreibgeschützte API benötigt keine Konfiguration. Die folgenden optionalen Funktionen werden über Umgebungsvariablen aktiviert (in der Backend-Umgebung oder der Compose-Datei festgelegt):

| Variable | Verwendet von | Hinweise |
|---|---|---|
| `MONGO_URL` | Backend | Laufdatenbank (Community-Statistiken, Bestenlisten, Konten). Wenn nicht gesetzt, greift das Backend auf den veralteten SQLite-Pfad (`data/runs.db`) zurück. |
| `JWT_SECRET` | Backend | Signiert Sitzungstoken für Benutzerkonten. |
| `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` | Backend | Discord-OAuth-Anmeldung. |
| `FRONTEND_URL`, `SPIRE_CODEX_PUBLIC_BASE` | Backend | OAuth-Weiterleitungs-/Rückkehr-URLs. |
| `ENVIRONMENT` | Backend | `production` aktiviert das Verhalten sicherer Cookies. |
| `NEXT_PUBLIC_API_URL` | Frontend (Build) | API-Basis; in der Produktion leer, damit Bilder/Daten über denselben Origin aufgelöst werden. |
| `NEXT_PUBLIC_CDN_URL` | Frontend (Build) | Wenn gesetzt (z. B. `https://cdn.spire-codex.com`), werden Bilder aus dem CDN statt aus `/static` geladen. |
| `NEXT_PUBLIC_SITE_URL` | Frontend (Build) | Kanonische Website-URL für Metadaten. |

Benutzerkonten und das CDN sind standardmäßig deaktiviert, sodass das Projekt ohne diese Variablen vollständig ausgeführt werden kann.

## Aktualisierungspipeline

Ein plattformübergreifendes Python-Skript übernimmt den vollständigen Aktualisierungsablauf, wenn eine neue Spielversion veröffentlicht wird:

```bash
# Vollständige Pipeline - Spieldateien extrahieren, Daten parsen, Sprites rendern, Bilder kopieren:
python3 tools/update.py

# Installationspfad des Spiels manuell angeben:
python3 tools/update.py --game-dir "/path/to/Slay the Spire 2"

# Extraktion überspringen (aktuelles extraction/-Verzeichnis ist bereits vorhanden):
python3 tools/update.py --skip-extract

# Nur Daten erneut parsen (keine Extraktion oder Darstellung):
python3 tools/update.py --parse-only

# Nur Spine-Sprites erneut rendern:
python3 tools/update.py --render-only

# Nach der Aktualisierung ein Changelog erzeugen:
python3 tools/update.py --changelog --game-version "0.98.2" --build-id "22238966"
```

Das Skript erkennt Ihr Betriebssystem automatisch und findet das Steam-Installationsverzeichnis. Anforderungen pro Schritt:

| Schritt | Werkzeug | Installation |
|---|---|---|
| PCK-Extraktion | `gdre_tools` | [GDRE-Tools-Releases](https://github.com/bruvzg/gdsdecomp/releases) |
| DLL-Dekompilierung | `ilspycmd` | `dotnet tool install ilspycmd -g` |
| Datenparsing | Python 3.10+ | Integriert |
| Kopieren von Bildern | Python 3.10+ | Integriert |
| Spine-Rendering | Node.js 20+ | [nodejs.org](https://nodejs.org) |

### Manuelle Schritte

Wenn Sie die Schritte lieber einzeln ausführen möchten:

```bash
# Alle Daten parsen (alle 15 Sprachen)
cd backend/app/parsers && python3 parse_all.py

# Eine einzelne Sprache parsen
cd backend/app/parsers && python3 parse_all.py --lang eng

# Bilder aus der Extraktion nach static kopieren (PNG + WebP aus derselben Quelle - keine
# verlustbehaftete Kette über ein bestehendes Backend-WebP). WebP mit quality=95, method=6.
python3 backend/scripts/copy_images.py

# Spine-Sprites rendern (WebGL - keine Artefakte an Dreiecksnähten)
cd tools/spine-renderer && npm install
npx playwright install chromium           # Nur beim ersten Mal
node render_all_webgl.mjs                 # Alle 138 Skelette über Headless Chrome
node render_webgl.mjs <skel_dir> <out> [size] [--skin=a,b] [--anim=name] [--anim-time=N]

# Häufige Überschreibungen pro Monster:
#   --skin=moss1,diamondeye   Varianten-Skins mit dem Standard kombinieren (cubex_construct)
#   --skin=skin1              Standard durch eine Variante ersetzen (scroll_of_biting)
#   --anim-time=0.5           Animation vor dem Schnappschuss um N Sekunden vorspulen
#   --anim=attack             Automatisch ausgewählte Ruheanimation überschreiben
#
# Ersetzung von Rauchplatzhaltern: gas_bomb_2.png, the_forgotten_2.png und
# living_smog_2.png werden in der Quelle als magentafarbene „Smoke Placeholder“-Flächen ausgeliefert.
# render_webgl.mjs ersetzt sie vor dem GL-Upload durch eine prozedural erzeugte
# dunkelpflaumenfarbene Wolke mit denselben Abmessungen und erzwingt anschließend
# slot.color.a = 1.0 für ersetzte Slots (die Künstler haben in Erwartung eines Shaders
# eine niedrige Deckkraft festgelegt).

# Zu klein gerenderte Monstersprites neu einrahmen (Nachbearbeitung - auf die tatsächliche Alpha-
# Bounding-Box zuschneiden und skalieren, damit ~92 % des 512x512-Rahmens ausgefüllt werden):
python3 tools/rescale_bestiary.py fuzzy_wurm_crawler thieving_hopper terror_eel

# Veralteter Canvas-Renderer (weist Artefakte an Dreiecksnähten auf - vermeiden)
# node render_all.mjs / node render.mjs
```

## Changelog-System

Verfolgen Sie mithilfe von Unterschieden auf Feldebene über alle Entitätskategorien hinweg, was sich zwischen Spielaktualisierungen ändert.

### Changelog erzeugen

```bash
# Aktuelle Daten mit einer Git-Referenz vergleichen:
python3 tools/diff_data.py HEAD~1 --format json \
    --game-version "0.98.2" --build-id "22238966" \
    --title "March Update"

# Vorschau als Text oder Markdown:
python3 tools/diff_data.py HEAD~1 --format text
python3 tools/diff_data.py HEAD~1 --format md
```

### Changelog-Schema

Jede Changelog-JSON-Datei enthält:

| Feld | Beschreibung |
|---|---|
| `app_id` | Steam-App-ID (2868840) |
| `game_version` | Steam-Spielversion (z. B. `"0.98.2"`) |
| `build_id` | Steam-Build-ID |
| `tag` | Eindeutiger Versionsschlüssel (z. B. `"1.0.3"`) |
| `date` | Datum der Aktualisierung |
| `title` | Menschenlesbarer Titel |
| `summary` | Anzahlen: `{ added, removed, changed }` |
| `features` / `fixes` / `api_changes` | Manuell kuratierte Versionshinweise. Bleiben bei der Neuerzeugung eines vorhandenen Tags durch `diff_data.py` erhalten - der Daten-Diff wird überschrieben, diese Arrays werden jedoch zusammengeführt. |
| `categories` | Kategoriespezifische Diffs mit hinzugefügten/entfernten/geänderten Entitäten. Feldänderungen werden rekursiv in verschachtelten Wörterbüchern/Listen verarbeitet, sodass jedes Blatt eine eigene Zeile erhält (z. B. `vars.DamageVar: 8 → 10`) statt einer undurchsichtigen Angabe wie `vars: 2 fields → 2 fields`. |

### Einmalig beschreibbare Aufbewahrung

Dateien unter `data/changelogs/` sind einmalig beschreibbare historische Datensätze. `.github/workflows/changelog-guard.yml` blockiert jeden PR, der ein vorhandenes Changelog **ändert oder löscht**. Neue Dateien (`A`) sind immer zulässig; Änderungen erfordern das Label `changelog-edit-approved` am PR. Richtlinien und Ablauf für Ausnahmen finden Sie unter `CONTRIBUTING.md → Changelog Retention`.

### Verlauf pro Entität

`GET /api/history/{entity_type}/{entity_id}` durchläuft alle Changelogs und gibt die Einträge zurück, die die angeforderte Entität betreffen, neueste zuerst. Die Versionsverlaufsleiste auf jeder Detailseite (`/cards/{id}`, `/monsters/{id}` usw.) wird von diesem Endpunkt gespeist.

## Deployment

### CI/CD (GitHub Actions)

Pushes auf `main` lösen `.github/workflows/ci.yml` auf dem selbst gehosteten Kubernetes-Runner aus. Der Workflow führt Geheimnisscans, ESLint- und TypeScript-Prüfungen sowie ruff-Linting und Formatprüfungen aus und erstellt und pusht anschließend die stabilen Images unter `:latest`. Er erstellt weiterhin auch die eigenständigen Beta-Images unter `:beta` für `docker-compose.beta.yml`; diese Images werden betrieblich beibehalten, die öffentlichen Beta-Seiten werden jedoch vom Haupt-Deployment unter `/beta` bereitgestellt.

Das stabile Frontend erhält `UMAMI_WEBSITE_ID`. Das eigenständige Beta-Image erhält `UMAMI_BETA_WEBSITE_ID`, obwohl der öffentliche `/beta`-Datenverkehr das stabile Frontend und dessen Analytics-Property verwendet.

CI führt **kein** Deployment durch. Der stündliche Autodeploy-Job auf dem DigitalOcean-Host übernimmt das Deployment.

> **Hinweis:** `.forgejo/workflows/build.yml` wird als inaktiver Buildah-basierter Fallback beibehalten.

### Lokaler Build + Push

Überspringen Sie CI und pushen Sie direkt von Ihrem Rechner:

```bash
# Beide Images erstellen und pushen:
python3 tools/deploy.py

# Nur Frontend:
python3 tools/deploy.py --frontend

# Nur Backend:
python3 tools/deploy.py --backend

# Build testen, ohne zu pushen:
python3 tools/deploy.py --no-push

# Ein Release taggen:
python3 tools/deploy.py --tag v0.98.2

# Beta-Images erstellen und pushen (:beta-Tag, überspringt IndexNow):
python3 tools/deploy.py --beta
```

Erkennt Apple Silicon automatisch und kompiliert über `docker buildx` plattformübergreifend für `linux/amd64`. Erfordert zuvor `docker login`.

### Produktion

Die öffentliche Anwendung und der beibehaltene eigenständige Beta-Stack werden auf demselben DigitalOcean-Host ausgeführt. Der öffentliche Datenverkehr verwendet `spire-codex.com`; auf dem sekundären Lightsail-Host läuft MongoDB.

**Autodeploy** - Ein stündlicher Cronjob auf dem DigitalOcean-Host führt um :03 `/usr/local/bin/spire-codex-autodeploy` aus. Wenn der ausgecheckte Commit fortgeschritten ist, führt er einen Pull durch und erstellt sowohl `docker-compose.prod.yml` als auch `docker-compose.beta.yml` neu, ausgenommen Aktualisierungen, die auf `data/news/*` beschränkt sind. Anschließend leert er den Cloudflare-Cache. Protokolle werden unter `/var/log/spire-codex-autodeploy.log` geschrieben. Informationen zu Installation und Betrieb finden Sie unter [`infrastructure/ansible/README.md`](infrastructure/ansible/README.md).

**Manuelles Deployment**:

```bash
cd infrastructure/ansible
./bin/do-ansible playbooks/deploy.yml

# Beibehaltener eigenständiger Beta-Stack
./bin/do-ansible playbooks/deploy.yml -e compose_file=docker-compose.beta.yml
```

Produktionsdaten werden per Bind-Mount eingebunden (`./data:/data:ro` für das Frontend und mit Schreibzugriff für das Backend). Nachrichten- und Laufstatus werden zur Anfragezeit aus den eingebundenen Daten gelesen, sodass Aktualisierungen von `data/news/*.json` keinen Neustart des Containers erfordern.

### Beta-Kanal (spire-codex.com/beta)

Die öffentliche Anwendung stellt stabile Daten und Steam-`public-beta`-Daten als zwei Inhaltskanäle bereit. Beta-Seiten befinden sich unter [`spire-codex.com/beta`](https://spire-codex.com/beta), mit lokalisierten Routen unter `/{lang}/beta/...`. Die Hauptseite `/images` stellt außerdem die archivierten Versionen der Beta-Ressourcen bereit.

`beta.spire-codex.com` wird nicht mehr öffentlich verwendet. Cloudflare sendet derzeit einen pfaderhaltenden `302` an die Apex-Domain, fügt jedoch weder `/beta` noch `channel=beta` hinzu. Alte Seitenlinks landen daher auf der entsprechenden stabilen Seite, und alte API-Anfragen erhalten nach dem Befolgen der Weiterleitung stabile Daten. Neue API-Clients müssen die Haupt-API mit einem expliziten Kanal verwenden, beispielsweise `https://spire-codex.com/api/cards?channel=beta`.

**Architektur**: `get_channel` löst `?channel=beta|stable` in eine Python-`ContextVar` auf; für direkten Origin-Datenverkehr versteht es außerdem einen `beta.*`-Host-Header. `data_service.py` lädt Beta-Anfragen aus `data-beta/<latest>/` und greift pro Datei auf die stabilen Daten zurück. `GET /api/beta/diff` und `GET /api/beta/version` beschreiben die aktive Beta, und das Frontend stellt den ausgewählten Kanal unter `/beta` dar.

Der separate Stack `docker-compose.beta.yml` und die `:beta`-Images werden weiterhin von der Deployment-Automatisierung erstellt und neu erzeugt. Solange die Cloudflare-Weiterleitung aktiv ist, bilden sie nicht die öffentliche Beta-Website.

**Datenlayout**: Jeder archivierte Build befindet sich unter `data-beta/<version>/`, und der Zeiger `latest` wählt den aktiven Build aus. Jede Version verfügt über ihr eigenes Verzeichnis `changelogs/`. Beta-Bildarchive spiegeln dieses Layout unter `backend/static/images/beta/<version>/{cards,monsters,misc,ui,vfx}/`.

**Automatisierte Aufnahme** - `tools/beta-watch/` läuft donnerstags von 15:00 bis 22:45 Uhr alle 15 Minuten als launchd-Job auf dem Entwicklungs-Mac. Wenn SteamCMD eine neue Build-ID für `public-beta` meldet, extrahiert und dekompiliert der Job das Spiel, parst jede Sprache, erzeugt den Diff, synchronisiert versionierte Bilder und öffnet einen PR vom Typ `auto/beta-<version>`. Informationen zu Installation und Betrieb finden Sie unter [`tools/beta-watch/README.md`](tools/beta-watch/README.md).

**Manuelle Aufnahme**:

```bash
VERSION=vX.Y.Z
PREVIOUS=vA.B.C

# Zuerst die Beta-Spieldateien extrahieren und dekompilieren, dann aus dem Repository-Stamm parsen.
(cd backend/app/parsers && \
  EXTRACTION_DIR=../../../extraction/beta \
  DATA_DIR="../../../data-beta/$VERSION" \
  python3 parse_all.py)

VERSION="$VERSION" tools/beta-watch/sync-images.sh

python3 tools/diff_data.py "data-beta/$PREVIOUS/eng" "data-beta/$VERSION/eng" \
  --format json --output-dir "data-beta/$VERSION/changelogs" \
  --game-version "${VERSION#v}" --title "Beta ${VERSION#v}"
```

`sync-images.sh` aktualisiert den Bild-Symlink `latest`. Der Aufnahme-PR enthält die versionierten Daten- und Bildänderungen; nach dem Zusammenführen aktualisiert Autodeploy beide beibehaltenen Stacks.

## Spine-Renderer

Monstersprites in StS2 sind [Spine](http://esotericsoftware.com/)-Skelettanimationen - jedes Monster besteht aus einem `.skel` (Binärskelett) + `.atlas` + `.png`-Spritesheet und nicht aus einem einzelnen Bild. Der Renderer setzt diese zu statischen Porträt-PNGs zusammen.

### WebGL-Renderer (aktuell)

Der WebGL-Renderer (`render_webgl.mjs`, `render_all_webgl.mjs`) verwendet **Playwright + spine-webgl**, um Skelette über die GPU von Headless Chrome zu rendern. Dadurch entstehen saubere Renderings **ohne Artefakte an Dreiecksnähten**.

**Funktionsweise:**
1. Startet Headless Chrome über Playwright mit aktiviertem WebGL
2. Lädt Skelettdaten + Atlas + Texturen als Base64 in die Browserseite
3. Erstellt eine WebGL-Canvas und richtet den spine-webgl-Shader + Polygon-Batcher ein
4. Wendet die Ruheanimation an und berechnet die Grenzen (unter Ausschluss von Schatten-/Boden-Slots)
5. Rendert über GPU-Dreiecksrasterung - keine Canvas-Clippfade, keine Nähte
6. Liest Rohpixel über `gl.readPixels` und spiegelt sie vertikal (WebGL verläuft von unten nach oben)
7. Schreibt das PNG über node-canvas, um Transparenz zu erhalten

**Einzelnes Skelett:**
```bash
node render_webgl.mjs <skel_dir> <output_path> [size]
node render_webgl.mjs ../../extraction/raw/animations/backgrounds/neow_room ../../backend/static/images/misc/neow.png 2048
```

**Alle Skelette im Batch:**
```bash
node render_all_webgl.mjs  # Rendert 138 Skelette nach backend/static/images/renders/
```

### Rendering-Abdeckung

| Kategorie | Gerendert | Gesamt | Hinweise |
|---|---|---|---|
| Monster | 99 | 103 Verzeichnisse | Alle 111 Spielmonster verfügen über Bilder (99 gerendert + Aliasse/statische Bilder) |
| Charaktere | 16 | 16 | Kampf-, Raststätten- und Auswahlposen |
| Hintergründe/NSCs | 14 | 17 | Neow, Tezcatara, Händlerräume, Hauptmenü |
| VFX/UI | 9 | 22 | Die meisten VFX benötigen bestimmte Animationsframes |
| **Gesamt** | **138** | **158** | 20 übersprungen (kein Atlas, nur VFX, leer) |

### Animationsrenderer

Der Animationsrenderer (`render_gif.mjs`) rendert Spine-Ruhe-/Angriffsanimationen als animiertes WebP, GIF oder APNG. Er unterstützt Skin-Varianten, die Auswahl von Animationen und das Streaming von Frames auf die Festplatte für große Animationen.

**Unterstützte Ausgabeformate:**
- **`.webp`** (empfohlen) - verlustfreies animiertes WebP mit vollständigem Alphakanal, ~33 % kleiner als APNG. Frames werden auf die Festplatte gestreamt, um Speicherüberläufe zu vermeiden.
- **`.gif`** - 256 Farben, binäre Transparenz. Kleinste Dateien, aber niedrigste Qualität.
- **`.apng`** - vollständiger Alphakanal wie WebP, aber größere Dateien.

```bash
# Verlustfreies animiertes WebP rendern (empfohlen)
NODE_OPTIONS="--max-old-space-size=8192" node render_gif.mjs <skel_dir> <output.webp> [size] [--fps=N]

# Mit Skin-Variante (für bowlbug, cultists, cubex usw.)
node render_gif.mjs <skel_dir> output.webp 256 --fps=10 --skin=rock

# Bestimmte Animation (Standard: Ruhe-Schleife)
node render_gif.mjs <skel_dir> output.webp 256 --fps=12 --anim=attack

# Modus mit weißer Silhouette (für Boss-Kartenknotensymbole)
node render_gif.mjs <skel_dir> output.webp 256 --white
```

**Animationsbibliothek:** 209 verlustfreie animierte WebPs:
- 15 Charakteranimationen (Kampf/Auswahl/Rast × 5 Charaktere) mit 512×512
- 103 Monster-Ruheanimationen mit 256×256
- 91 Monster-Angriffsanimationen mit 256×256

**Skin-Varianten:** 13 Monster verfügen über Skin-Varianten (bowlbug, cubex_construct, cultists usw.). Verwenden Sie `--skin=` zur Auswahl. Der Standard-Skin zeigt häufig nur das Basisskelett ohne Körper.

**Shader für Boss-Kartenknoten:** Das Spiel verwendet `boss_map_point.gdshader`, der RGB-Kanäle als Masken behandelt:
- **Rotkanal** × `map_color` (Standard: Beige `0.671, 0.58, 0.478`) → Füllfarbe
- **Blaukanal** × `black_layer_color` (Standard: Schwarz `0, 0, 0`) → Konturfarbe
- **Grünkanal** × Weiß `1, 1, 1` → Hervorhebungen

### Veralteter Canvas-Renderer

Der Canvas-Renderer (`render.mjs`, `render_all.mjs`) verwendet `spine-canvas` mit `triangleRendering = true`. Dies erzeugt aufgrund des Canvas-`clip()`-Pfad-Anti-Aliasings zwischen benachbarten Dreiecken **sichtbare Drahtgitterartefakte**. Verwenden Sie stattdessen den WebGL-Renderer.

### Abhängigkeiten

- `@esotericsoftware/spine-webgl` ^4.2.107 - Spine-Laufzeit für WebGL (aktuell)
- `playwright` - Headless Chrome für WebGL-Rendering
- `gif-encoder-2` - GIF-Codierung für den Animationsrenderer
- `canvas` ^3.1.0 - Node.js-Canvas-Implementierung (Frame-Puffer für den Animationsrenderer)
- `Pillow` (Python) - setzt WebP/APNG aus gerenderten PNG-Frames zusammen
- `@esotericsoftware/spine-canvas` ^4.2.106 - Spine-Laufzeit für Canvas (veraltet)

## Spieldateien extrahieren

Wenn Sie von Grund auf extrahieren müssen:

```bash
# PCK extrahieren (GDRE Tools)
/path/to/gdre_tools --headless --recover="/path/to/sts2.pck" --output-dir=extraction/raw

# DLL dekompilieren (ILSpy CLI)
ilspycmd -p -o extraction/decompiled "/path/to/sts2.dll"
```

Steam-Installationsorte:
- **Windows**: `C:\Program Files (x86)\Steam\steamapps\common\Slay the Spire 2\`
- **macOS**: `~/Library/Application Support/Steam/steamapps/common/Slay the Spire 2/`
- **Linux**: `~/.local/share/Steam/steamapps/common/Slay the Spire 2/`

## Versionierung

Spire Codex verwendet die semantische Versionierung **`1.X.Y`**:

| Segment | Bedeutung |
|---------|---------|
| **1** | Hauptversion von Spire Codex (bleibt unverändert, sofern keine vollständige Neuentwicklung erfolgt) |
| **X** | Wird erhöht, wenn Mega Crit einen Spiel-Patch veröffentlicht |
| **Y** | Wird für unsere eigenen Parser-/Frontend-Korrekturen und Verbesserungen erhöht |

Beispiele: `v1.0.0` = erste Veröffentlichung, `v1.0.1` = unsere Fehlerkorrekturen, `v1.1.0` = erster integrierter Patch von Mega Crit.

## SEO

- **Strukturierte Daten (JSON-LD)**: WebSite + VideoGame (Startseite), CollectionPage + ItemList (Listenseiten), Article + BreadcrumbList + FAQPage (Detailseiten), SoftwareApplication (Entwickler), NewsArticle (news/[gid])
- **Titelformat**: `"Slay the Spire 2 (sts2) {Page Title} | Spire Codex"` - über alle Seiten hinweg standardisiert. Läufe verwenden `"{username} - {char} - Ascension {N} {win/loss} - Slay the Spire 2 (sts2) | Spire Codex"`. „(sts2)“ steht inline, damit sprachübergreifende Suchanfragen wie `sts2 tier list` / `sts2 card list` übereinstimmen.
- **Sitemap**: Flaches XML unter `/sitemap.xml` mit `force-dynamic` (wird serverseitig und nicht zur Build-Zeit gerendert). ~20.000+ URLs einschließlich Entitätsdetailseiten, Browse-Matrix-Seiten, Ranglistenseiten, Bewertungsmethodik, runs/[hash]-Details und i18n-Spiegelungen für alle Entitätstypen
- **Internationales SEO**: `/{lang}/`-Routen für 14 nicht englische Sprachen mit **bidirektionalen** hreflang-Alternativen - englische Stammseiten geben über `buildLanguageAlternates(path)` in `lib/seo.ts` ebenfalls Alternativen für jedes Gebietsschema + `x-default` aus (behebt den GSC-Duplicate-Content-Cluster „Crawled - not indexed“, bei dem Google lokalisierte Seiten ohne Rückverweise als Duplikate behandelte)
- **Programmatisches SEO**: 41 Karten-Browse-Seiten unter `/cards/browse/` (rare-attacks, ironclad-skills usw.) + 3 Ranglistenseiten (`/tier-list/{cards,relics,potions}`)
- **Gebietsschemaabhängige EntityProse**: Detailseiten zeigen einen kurzen gebietsschemaspezifischen Absatz statt identischer englischer Inhalte in jedem Gebietsschema
- **Interne Verlinkung**: Kräfte ↔ Karten, Begegnungen → Monster, Kartenschlüsselwörter → Schlüsselwort-Zentralseiten, Monsterzüge → Kraftseiten (mit Tooltips), Aktseiten → Begegnungen/Ereignisse, Ranglistenzeilen → Statistik-Tab der Entitätsdetails
- **Open Graph & Twitter Cards**: Entitätsspezifische OG-Bilder, `summary_large_image`-Twitter-Cards
- **Kanonische URLs**: Jede Seite deklariert eine kanonische URL

## Einbettbare Widgets

### Tooltip-Widget
Fügen Sie jeder Website Hover-Tooltips für alle 13 Entitätstypen hinzu:
```html
<script src="https://spire-codex.com/widget/spire-codex-tooltip.js"></script>
<p>Start with [[Bash]] and [[relic:Burning Blood]].</p>
```

### Changelog-Widget
Betten Sie eine interaktive Changelog-Anzeige ein:
```html
<div id="scx-changelog"></div>
<script src="https://spire-codex.com/widget/spire-codex-changelog.js"></script>
```

Vollständige Dokumentation: [spire-codex.com/developers](https://spire-codex.com/developers)

## Roadmap

- ~~Einzelne Detailseiten~~ ✅
- ~~Globale Suche~~ ✅
- ~~Mehrsprachige Unterstützung (15 Sprachen)~~ ✅
- ~~SEO (JSON-LD, OG/Twitter, Sitemap, hreflang)~~ ✅
- ~~Tooltip-Widget (alle 13 Entitätstypen)~~ ✅
- ~~Charaktervergleichsseiten (10 Paare)~~ ✅
- ~~Zentralseiten für Schlüsselwörter~~ ✅
- ~~Händlerleitfaden (Preise aus dekompiliertem C#)~~ ✅
- ~~Entwicklerdokumentation + Datenexporte~~ ✅
- ~~Internationales SEO (13 Sprach-Landingpages)~~ ✅
- ~~Karten-Browse-Matrix (41 programmatische SEO-Seiten)~~ ✅
- ~~Community-Leitfäden~~ ✅ - Markdown mit YAML-Frontmatter, Einreichungsformular, Tooltip-Widget, soziale Profile der Autoren
- ~~Spielmechanikseite~~ ✅ - 27 einzelne SEO-Seiten: Drop-Raten, Kampf, Karte, Bosse, Geheimnisse und Wissenswertes
- ~~Community-Läufe~~ ✅ - Laufeinreichung, Browser, geteilte Läufe, Live-Statistiken
- ~~Beschreibungen von Kartenaufwertungen~~ ✅ - upgrade_description für alle 403 aufwertbaren Karten
- ~~Angeborene Monsterkräfte~~ ✅ - 42 Monster mit Kräften aus AfterAddedToRoom
- ~~Freischaltbedingungen für Erfolge~~ ✅ - Kategorie, Charakter und Schwellenwert aus dem C#-Quellcode
- ~~Monster-Angriffsmuster~~ ✅ - 112 Monster mit zyklischer/zufälliger/bedingter/gemischter KI aus C#-Zustandsautomaten
- ~~Ereignisvorbedingungen~~ ✅ - 25 Ereignisse mit aus dem C#-Quellcode geparsten IsAllowed()-Bedingungen
- ~~Aufbewahrung des Beta-Archivs~~ ✅ - Versionierte Beta-Daten und -Bilder bleiben erhalten; `/beta` stellt den aktiven Build bereit und `/images` ermöglicht das Durchsuchen archivierter Ressourcen
- ~~Discord-Bot~~ ✅ - [Knowledge Demon](https://bot.spire-codex.com): Slash-Befehle für jede Entität (`/card`, `/relic`, `/monster`, `/potion`, `/character`, `/event`, `/power`, `/enchantment`, `/lookup`, `/meta`), RSS für Steam-Neuigkeiten sowie ein vollständiges, von [Kernel](https://github.com/ptrlrd/kernel) geforktes Moderations-Toolkit
- ~~Codex Score & Rangliste~~ ✅ - Pro Entität berechnete Bewertung aus Community-Läufen mithilfe von **Bayesscher Schrumpfung**: `shrunk = (wins + PRIOR_WEIGHT × baseline) / (n + PRIOR_WEIGHT)`, anschließend auf 0–100 skaliert und S/A/B/C/D/F zugeordnet. Verhindert Rauschen durch kleine Stichproben (eine Karte mit 1/1 in einem einzigen Spiel erhält kein S - sie wird zum Prior zurückgeführt). Beim Backend-Start vorgewärmt. Wird als `ScoreBadge` im Statistik-Tab der Detailseite, auf dedizierten Ranglistenseiten und auf der Methodikseite unter `/leaderboards/scoring` angezeigt.
- ~~Statistik-Tab auf Detailseiten~~ ✅ - Hervorgehobenes Bewertungsabzeichen + Textzusammenfassung + Links zu aktuellen Läufen über `EntityRunStats`.
- **Deck-Builder** - Interaktive theoretische Deckzusammenstellung
- **Datenbank-Backend** - Sprachspezifisches Laden von JSON durch PostgreSQL JSONB (oder eine Alternative) ersetzen. Die Speicherung eingereichter Läufe wurde bereits von SQLite zu MongoDB migriert (Mai 2026).

## Danksagungen

Vielen Dank an **vesper-arch**, **terracubist**, **U77654**, **Purple Aspired Dreaming**, **Kobaru** und **Severi** für Qualitätssicherungstests, Fehlerberichte und Beiträge. Die vollständige Unterstützerliste - einschließlich der Ko-fi-Spender, die den Betrieb ermöglichen - befindet sich unter [spire-codex.com/thank-you](https://spire-codex.com/thank-you).

## Technologie-Stack

- **Backend**: Python, FastAPI, Pydantic, slowapi, GZip-Komprimierung
- **Laufdatenbank**: MongoDB (Community-Statistiken, Bestenlisten, Benutzerkonten), mit einer materialisierten `stats_summary`-Sammlung und einem per Leader-Wahl bestimmten Hintergrundaktualisierer. Der veraltete SQLite-Pfad bleibt als Offline-Fallback erhalten.
- **Konten**: Steam OpenID + Discord OAuth, JWT-Sitzungscookies
- **Frontend**: Next.js 16 (App Router), TypeScript, Tailwind CSS, Unterstützung für 15 Sprachen
- **Bilder/CDN**: Cloudflare R2, bereitgestellt über `cdn.spire-codex.com` (webp)
- **Analytics & Beobachtbarkeit**: selbst gehostetes Umami, Prometheus + node-exporter
- **Spine-Renderer**: Node.js, Playwright, @esotericsoftware/spine-webgl (WebGL über Headless Chrome)
- **Infrastruktur**: Docker, GitHub Actions CI (selbst gehosteter Runner) mit Registry-gestütztem BuildKit-Cache, Ansible-/SSH-Deployment
- **Werkzeuge**: Python (Aktualisierungspipeline, Changelog-Differenzbildung, Kopieren von Bildern)

## Lizenz

- **Quellcode**: [PolyForm Noncommercial 1.0.0](LICENSE.md) - darf für nicht kommerzielle Zwecke kostenlos verwendet, verändert und weiterverbreitet werden. Der Verkauf der Software ist nicht gestattet.
- **Gehostete API**: [API_TERMS.md](API_TERMS.md) - kann innerhalb der veröffentlichten Ratenbegrenzungen für jeden Zweck kostenlos verwendet werden; kontaktieren Sie uns auf Discord oder über ein Issue, wenn Sie mehr benötigen.
- **Spieldaten** (Karten, Relikte, Monster usw.): © Mega Crit Games. Werden hier als Community-Referenz unter Fair-Use-/Bildungsbedingungen bereitgestellt. Verwenden Sie diese Daten nicht, um das Spiel neu zu kompilieren, neu zu verpacken oder weiterzuverbreiten.

Beiträge werden unter denselben Bedingungen der PolyForm Noncommercial 1.0.0 akzeptiert - siehe [CONTRIBUTING.md](CONTRIBUTING.md#license).
