<p align="center">
  <img src="frontend/public/spire-codex-white-silent-black-background.png" alt="Logo di Spire Codex" width="200" />
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

Un database e un'API completi per i dati di gioco di **Slay the Spire 2**, realizzati tramite reverse engineering dei file di gioco. Supporta tutte le **15 lingue** incluse nel gioco.

**Sito online**: [spire-codex.com](https://spire-codex.com)

**ID app Steam**: 2868840

## Come è stato realizzato

Slay the Spire 2 è sviluppato con Godot 4, ma tutta la logica di gioco risiede in una DLL C#/.NET 8 (`sts2.dll`), non in GDScript. La pipeline dei dati:

1. **Estrazione PCK** - [GDRE Tools](https://github.com/bruvzg/gdsdecomp) estrae il file `.pck` di Godot per recuperare immagini, animazioni Spine e dati di localizzazione (~9.947 file).

2. **Decompilazione della DLL** - [ILSpy](https://github.com/icsharpcode/ILSpy) decompila `sts2.dll` in circa 3.300 file sorgente C# leggibili contenenti tutti i modelli di gioco.

3. **Analisi dei dati** - 22 parser Python basati su espressioni regolari estraggono dati strutturati dal codice sorgente C# decompilato, generando JSON per ciascuna lingua in `data/{lang}/`:
   - **Carte**: costruttori `base(cost, CardType, CardRarity, TargetType)` + `DamageVar`, `BlockVar`, `PowerVar<T>` per le statistiche
   - **Personaggi**: `StartingHp`, `StartingGold`, `MaxEnergy`, `StartingDeck`, `StartingRelics`
   - **Reliquie/Pozioni**: rarità, insieme, descrizioni risolte dai modelli SmartFormat
   - **Mostri**: intervalli di PV, progressione dell'ascensione tramite `AscensionHelper`, macchine a stati delle mosse con intenti per ciascuna mossa (Attack/Defend/Buff/Debuff/Status/Summon/Heal), valori dei danni, numero di colpi multipli (inclusi i modelli AscensionHelper), poteri innati da `AfterAddedToRoom` (42 mostri con varianti di ascensione), poteri applicati per mossa (bersaglio + quantità da `PowerCmd.Apply<T>`), blocco, cure, contesto dello scontro (atto, tipo di stanza), **schemi di attacco** analizzati da `GenerateMoveStateMachine()` (112 mostri - ciclici, casuali, condizionali, misti)
   - **Incantamenti**: restrizioni sul tipo di carta, cumulabilità, progressione basata su Amount
   - **Scontri**: composizioni dei mostri, tipo di stanza (Boss/Elite/Monster), collocazione nell'atto, tag
   - **Eventi**: alberi decisionali multipagina (56 eventi su 66), scelte con esiti, collocazione nell'atto, riferimenti del modello `StringVar` risolti in nomi visualizzati, valori calcolati durante l'esecuzione (costi crescenti tramite `GetDecipherCost()`, intervalli di oro tramite `CalculateVars` con `NextInt`/`NextFloat`, schemi di cura completa), **precondizioni** da `IsAllowed()` (25 eventi - condizioni relative a oro, PV, atto, mazzo, reliquia e pozione)
   - **Antichi**: 8 PNG Antichi con epiteti, dialoghi specifici per personaggio, offerte di reliquie e icone ritratto
   - **Poteri**: PowerType (Buff/Debuff), PowerStackType (Counter/Single), DynamicVars, descrizioni
   - **Epoche/Storie**: dati di avanzamento della cronologia con requisiti di sblocco
   - **Sfere**: valori passivi/di evocazione, descrizioni
   - **Afflizioni**: cumulabilità, testo aggiuntivo delle carte, descrizioni
   - **Modificatori**: descrizioni dei modificatori delle partite
   - **Parole chiave**: definizioni delle parole chiave delle carte (Exhaust, Ethereal, Innate, ecc.)
   - **Intenti**: descrizioni degli intenti dei mostri con icone
   - **Obiettivi**: condizioni di sblocco, descrizioni, categorie, associazione al personaggio, soglie dal codice sorgente C# (33 obiettivi)
   - **Atti**: ordine di scoperta dei boss, scontri, eventi, Antichi, numero di stanze
   - **Livelli di ascensione**: 11 livelli (0–10) con descrizioni ricavate dalla localizzazione
   - **Insiemi di pozioni**: insiemi specifici per personaggio analizzati dalle classi degli insiemi e dai riferimenti alle epoche
   - **Traduzioni**: mappe dei filtri per lingua (tipi di carta, rarità, parole chiave → nomi localizzati) e stringhe dell'interfaccia utente (titoli delle sezioni, descrizioni, nomi dei personaggi) destinate al frontend

4. **Risoluzione delle descrizioni** - Un modulo condiviso `description_resolver.py` risolve i modelli di localizzazione SmartFormat (`{Damage:diff()}`, `{Energy:energyIcons()}`, `{Cards:plural:card|cards}`) in testo leggibile con marcatori di testo formattato per il rendering nel frontend. Le variabili dinamiche durante l'esecuzione (ad es. `{Card}`, `{Relic}`) vengono mantenute come segnaposto leggibili. I riferimenti `StringVar` negli eventi (ad es. `{Enchantment1}` → `ModelDb.Enchantment<Sharp>().Title`) vengono risolti nei nomi visualizzati tramite la ricerca nella localizzazione.

5. **Rendering Spine** - Personaggi e mostri sono animazioni scheletriche Spine, non immagini statiche. Un renderer Node.js headless compone le pose inattive in ritratti PNG 512×512. Tutti i 111 mostri dispongono di immagini: 100 renderizzati da scheletri Spine, 6 associati a scheletri condivisi (Flyconid→flying_mushrooms, Ovicopter→egg_layer, Crusher/Rocket→kaiser_crab) e 5 ricavati da risorse statiche del gioco (Doormaker). Vengono inoltre renderizzati tutti e 5 i personaggi (pose di combattimento, sito di riposo e selezione del personaggio), i PNG e gli sfondi. Le varianti basate sulle skin (Cultists, Bowlbugs, Cubex) vengono renderizzate singolarmente. Consulta [Renderer Spine](#renderer-spine) più avanti.

6. **Immagini** - Ritratti delle carte, icone di reliquie/pozioni, illustrazioni dei personaggi, sprite dei mostri, icone ritratto degli Antichi e icone degli scontri con i boss estratti dalle risorse di gioco e forniti come file statici.

7. **Confronto dei changelog** - Uno strumento di confronto mette a confronto i dati JSON tra versioni del gioco (tramite riferimenti git o directory), tracciando le entità aggiunte/rimosse/modificate per categoria con differenze a livello di campo. I changelog sono identificati dalla versione Steam del gioco + un numero di revisione Codex facoltativo.

## Struttura del progetto

```
spire-codex/
├── backend/                    # Backend FastAPI
│   ├── app/
│   │   ├── main.py             # Avvio dell'app, CORS, GZip, limitazione delle richieste, file statici
│   │   ├── dependencies.py     # Dipendenze condivise (convalida della lingua, nomi delle lingue)
│   │   ├── routers/            # Endpoint API (oltre 25 router)
│   │   ├── models/schemas.py   # Modelli Pydantic
│   │   ├── services/           # Caricamento dei dati JSON (cache LRU, supporto per 14 lingue)
│   │   └── parsers/            # Parser da sorgente C# a JSON
│   │       ├── card_parser.py
│   │       ├── character_parser.py
│   │       ├── monster_parser.py
│   │       ├── relic_parser.py
│   │       ├── potion_parser.py
│   │       ├── enchantment_parser.py
│   │       ├── encounter_parser.py
│   │       ├── event_parser.py
│   │       ├── power_parser.py
│   │       ├── keyword_parser.py        # Parole chiave, intenti, sfere, afflizioni, modificatori, obiettivi (con condizioni di sblocco)
│   │       ├── guide_parser.py          # Guide Markdown con frontmatter YAML
│   │       ├── epoch_parser.py
│   │       ├── act_parser.py
│   │       ├── ascension_parser.py
│   │       ├── pool_parser.py            # Aggiunge alle pozioni l'insieme del personaggio
│   │       ├── translation_parser.py    # Genera translations.json per ogni lingua
│   │       ├── description_resolver.py   # Risolutore SmartFormat condiviso
│   │       ├── parser_paths.py           # Configurazione condivisa dei percorsi (sostituzioni tramite variabili d'ambiente per la beta)
│   │       └── parse_all.py              # Coordina tutti i parser (15 lingue)
│   ├── static/images/          # Immagini di gioco (non incluse nel repository)
│   ├── scripts/copy_images.py  # Copia le immagini dall'estrazione alla directory statica
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/                   # Next.js 16 + TypeScript + Tailwind CSS
│   ├── app/
│   │   ├── contexts/           # LanguageContext, BetaVersionContext
│   │   ├── components/         # CardGrid, RichDescription, SearchFilter,
│   │   │                       #   GlobalSearch, Navbar, Footer, LanguageSelector, VersionSelector
│   │   └── ...                 # Pagine: carte, personaggi, reliquie, mostri, pozioni,
│   │                           #   incantamenti, scontri, eventi, poteri, cronologia,
│   │                           #   riferimento, immagini, changelog, informazioni, mercante, confronto,
│   │                           #   mechanics/[slug], guides/[slug], guides/submit,
│   │                           #   classifiche, leaderboards/submit, leaderboards/stats,
│   │                           #   runs/[hash] (vista della partita condivisa)
│   │                           #   Pagine di dettaglio: cards/[id], characters/[id], relics/[id],
│   │                           #   monsters/[id], potions/[id], enchantments/[id],
│   │                           #   encounters/[id], events/[id], powers/[id], keywords/[id],
│   │                           #   acts/[id], ascensions/[id], intents/[id], orbs/[id],
│   │                           #   afflictions/[id], modifiers/[id], achievements/[id]
│   │                           #   i18n: [lang]/... replica tutti i percorsi per le 14 lingue diverse dall'inglese
│   ├── lib/
│   │   ├── api.ts              # Client API + interfacce TypeScript
│   │   ├── fetch-cache.ts      # Cache in memoria lato client per le richieste (TTL di 5 min)
│   │   ├── seo.ts              # Utilità SEO condivise (stripTags, SITE_URL, SITE_NAME)
│   │   ├── jsonld.ts           # Generatori di schemi JSON-LD (BreadcrumbList, CollectionPage, Article, WebSite, FAQPage)
│   │   ├── ui-translations.ts # Traduzioni delle stringhe dell'interfaccia per 14 lingue diverse dall'inglese
│   │   ├── languages.ts       # Configurazione i18n - 14 codici lingua, mappature hreflang
│   │   └── use-lang-prefix.ts # Hook per la costruzione di URL compatibili con la lingua
│   └── Dockerfile
├── tools/
│   ├── spine-renderer/         # Renderer headless degli scheletri Spine
│   │   ├── render_webgl.mjs     # Renderer WebGL (singolo scheletro) - nessun artefatto sulle giunzioni
│   │   ├── render_all_webgl.mjs # Renderer WebGL in batch (tutti i file .skel)
│   │   ├── render_gif.mjs      # Renderer di animazioni (WebP/GIF/APNG con supporto per skin + animazioni)
│   │   ├── render.mjs           # Renderer canvas precedente (presenta giunzioni tra triangoli)
│   │   ├── render_all.mjs       # Renderer canvas in batch precedente
│   │   ├── render_skins2.mjs    # Renderer delle varianti di skin
│   │   ├── render_utils.mjs     # Utilità condivise per il rendering canvas
│   │   └── package.json
│   ├── diff_data.py            # Generatore delle differenze del changelog
│   ├── update.py               # Pipeline di aggiornamento multipiattaforma
│   └── deploy.py               # Build Docker locale + push su Docker Hub
├── data/                       # File di dati JSON analizzati
│   ├── {lang}/                 # Directory per lingua (eng, kor, jpn, fra, ecc.)
│   ├── changelogs/             # File JSON dei changelog (identificati dalla versione del gioco)
│   ├── guides/                 # File delle guide Markdown con frontmatter YAML
│   ├── guides.json             # Dati delle guide analizzati
│   ├── runs/                   # File JSON delle partite inviate (per hash del giocatore)
│   └── runs.db                 # SQLite precedente (sostituito da MongoDB; mantenuto come ripiego offline)
├── extraction/                 # File di gioco non elaborati (non inclusi nel repository)
│   ├── raw/                    # Progetto Godot estratto da GDRE (stabile)
│   ├── decompiled/             # Output di ILSpy (stabile)
│   └── beta/                   # Ramo beta di Steam (raw/ + decompiled/)
├── data-beta/                  # Dati beta analizzati (con versione: v0.102.0/, v0.103.0/, latest → collegamento simbolico)
├── docker-compose.yml          # Sviluppo locale
├── docker-compose.prod.yml     # Produzione
├── .github/workflows/
│   └── ci.yml                  # CI di GitHub Actions: lint, controllo dei tipi, scansione dei segreti, build+push Docker, distribuzione SSH
└── .forgejo/workflows/
    └── build.yml               # Ripiego CI Forgejo mantenuto (basato su buildah, non attivo)
```

## Servizi pubblici

| Host | Scopo |
|---|---|
| [`spire-codex.com`](https://spire-codex.com) | Sito web pubblico e API same-origin. Il canale beta attivo si trova in `/beta`. |
| `cdn.spire-codex.com` | Host di oggetti Cloudflare R2 per illustrazioni di gioco, rendering completi delle carte, rendering localizzati e risorse beta archiviate. |
| [`bot.spire-codex.com`](https://bot.spire-codex.com) | Pagina di presentazione di Knowledge Demon e dashboard del personale autenticata tramite Discord. Il bot utilizza l'API principale di Codex. |
| `analytics.spire-codex.com` | Script e dashboard Umami ospitati autonomamente. Il relativo database PostgreSQL rimane su una rete Docker privata. |
| `tierlists.spire-codex.com` | Host di oggetti R2 dedicato alle immagini di anteprima generate per le classifiche a livelli. |
| `beta.spire-codex.com` | Host pubblico ritirato. Cloudflare reindirizza le richieste allo stesso percorso sul dominio principale. |

Gli host CDN e delle classifiche a livelli sono archivi di oggetti e non siti web esplorabili, pertanto un errore `404` alla radice di entrambi è previsto.

## Pagine del sito web

| Pagina | Percorso | Descrizione |
|---|---|---|
| Home | `/` | Dashboard con conteggi delle entità, schede delle categorie e collegamenti ai personaggi |
| Carte | `/cards` | Griglia filtrabile delle carte con vista modale dei dettagli |
| Dettagli carta | `/cards/[id]` | Statistiche complete della carta, informazioni sul potenziamento, immagine |
| Personaggi | `/characters` | Griglia panoramica dei personaggi |
| Dettagli personaggio | `/characters/[id]` | Statistiche, mazzo/reliquie iniziali, citazioni, alberi di dialogo dei PNG |
| Reliquie | `/relics` | Griglia filtrabile delle reliquie |
| Dettagli reliquia | `/relics/[id]` | Informazioni complete sulla reliquia con testo narrativo formattato |
| Mostri | `/monsters` | Griglia dei mostri con PV, mosse e rendering Spine |
| Dettagli mostro | `/monsters/[id]` | PV, mosse con intenti/danni/poteri/blocco, collegamenti agli scontri, descrizioni comandi dei poteri |
| Pozioni | `/potions` | Griglia filtrabile delle pozioni (rarità, insieme del personaggio) |
| Dettagli pozione | `/potions/[id]` | Informazioni complete sulla pozione |
| Incantamenti | `/enchantments` | Elenco degli incantamenti con filtri per tipo di carta |
| Dettagli incantamento | `/enchantments/[id]` | Informazioni complete sull'incantamento |
| Scontri | `/encounters` | Composizioni degli scontri per atto/tipo di stanza |
| Dettagli scontro | `/encounters/[id]` | Formazione dei mostri, tipo di stanza, tag |
| Eventi | `/events` | Alberi di eventi multipagina con scelte espandibili |
| Dettagli evento | `/events/[id]` | Pagine complete dell'evento, opzioni, dialoghi degli Antichi |
| Poteri | `/powers` | Potenziamenti, penalità e poteri neutrali |
| Dettagli potere | `/powers/[id]` | Informazioni sul potere con le carte che lo applicano |
| Parole chiave | `/keywords` | Elenco delle parole chiave delle carte |
| Dettagli parola chiave | `/keywords/[id]` | Descrizione della parola chiave con griglia filtrabile delle carte |
| Mercante | `/merchant` | Prezzi di carte/reliquie/pozioni, costi di rimozione delle carte, falso mercante |
| Confronto | `/compare` | Centro di confronto dei personaggi (10 coppie) |
| Dettagli confronto | `/compare/[pair]` | Confronto affiancato dei personaggi |
| Sviluppatori | `/developers` | Documentazione API, documentazione dei widget, esportazioni dei dati |
| Vetrina | `/showcase` | Galleria dei progetti della community |
| Cronologia | `/timeline` | Avanzamento delle epoche con raggruppamento per era e requisiti di sblocco |
| Dettagli atto | `/acts/[id]` | Boss, scontri, eventi e Antichi di un atto |
| Dettagli ascensione | `/ascensions/[id]` | Descrizione del livello di ascensione con navigazione precedente/successivo |
| Dettagli intento | `/intents/[id]` | Icona e descrizione dell'intento |
| Dettagli sfera | `/orbs/[id]` | Icona della sfera, descrizione passiva/di evocazione |
| Dettagli afflizione | `/afflictions/[id]` | Descrizione e cumulabilità dell'afflizione |
| Dettagli modificatore | `/modifiers/[id]` | Descrizione del modificatore della partita |
| Dettagli obiettivo | `/achievements/[id]` | Descrizione dell'obiettivo |
| Distintivi | `/badges` | Tutti i 25 distintivi di fine partita raggruppati per livelli / livello singolo / solo multigiocatore |
| Dettagli distintivo | `/badges/[id]` | Suddivisione per livello (Bronzo / Argento / Oro), indicatori di vittoria richiesta + multigiocatore, icona |
| Meccaniche | `/mechanics` | Centro delle meccaniche di gioco - 27 sezioni selezionabili con singole pagine SEO |
| Dettagli meccanica | `/mechanics/[slug]` | Probabilità delle carte, distribuzione delle reliquie, ottenimento delle pozioni, generazione della mappa, insiemi dei boss, combattimento, segreti e curiosità |
| Guide | `/guides` | Guide strategiche della community con ricerca/filtro |
| Dettagli guida | `/guides/[slug]` | Guida completa con rendering Markdown + widget delle descrizioni comandi |
| Invia guida | `/guides/submit` | Modulo di invio delle guide (webhook Discord) |
| Classifiche | `/leaderboards` | Classifiche delle Vittorie più veloci e dell'Ascensione più alta con filtri per giocatore singolo/co-op e modalità di gioco (standard / giornaliera / Oggi / personalizzata). L'intero stato dei filtri è nell'URL, quindi ogni vista può essere condivisa |
| Esplora partite | `/runs` | Browser completo delle partite con barra di ricerca per espressioni (`user:`, `char:`, intervalli `asc:`, AND multivalore `card:`/`relic:`, intervalli `version:`, `mode:`, `result:`, `players:`), oltre a filtri a discesa, ordinamento e URL condivisibili |
| Invia una partita | `/leaderboards/submit` | Caricamento tramite trascinamento di file `.run` con collegamento all'app complementare Overwolf, accesso Steam/Discord per associare automaticamente le partite e visualizzazione delle partite recenti |
| Statistiche | `/leaderboards/stats` | Tabelle ordinate (tasso di scelta, percentuale di vittorie, conteggio) per carte, reliquie, pozioni e scontri. Filtrabili per personaggio / ascensione / esito |
| Profilo | `/profile` | Statistiche dell'utente autenticato (carte/reliquie/pozioni principali, suddivisione per personaggio), record personali, confronto competitivo (classifica giornaliera odierna, posizioni globali, percentuale di vittorie rispetto alla community) e gestione delle partite |
| Impostazioni | `/settings` | Impostazioni dell'account: nome utente, email, account Steam/Discord collegati |
| Partita condivisa | `/runs/[hash]` | Riepilogo di vittoria/sconfitta in stile gioco con icone selezionabili dei nodi della mappa, striscia delle reliquie e griglia di carte in miniatura |
| Riferimento | `/reference` | Tutti gli elementi selezionabili - atti, ascensioni, parole chiave, sfere, afflizioni, intenti, modificatori, obiettivi |
| Immagini | `/images` | Risorse di gioco esplorabili con download ZIP per categoria |
| Changelog | `/changelog` | Differenze dei dati tra aggiornamenti del gioco |
| Informazioni | `/about` | Informazioni sul progetto, statistiche, visualizzazione della pipeline |
| Ringraziamenti | `/thank-you` | Sostenitori Ko-fi e collaboratori della community (separata da Informazioni per poter collegare direttamente la pagina) |
| Knowledge Demon | `/knowledge-demon` | Pagina informativa del bot Discord - comandi slash, funzionalità di moderazione, invito all'installazione |
| Notizie | `/news` | Feed replicato degli annunci Steam; i collegamenti canonici rimandano a Steam affinché il contenuto sia aggiuntivo, non duplicato |
| Articolo di notizie | `/news/[gid]` | Singolo annuncio Steam con corpo BBCode sanificato e JSON-LD `NewsArticle` |
| Classifica a livelli | `/tier-list` | Centro delle classifiche a livelli del Codex Score (livelli S → F) per carte / reliquie / pozioni |
| Dettagli classifica a livelli | `/tier-list/[type]` | Righe visive S/A/B/C/D/F per un tipo di entità, ottenute da `/api/runs/scores/{type}` |
| Punteggio | `/leaderboards/scoring` | Pagina della metodologia del Codex Score - regolarizzazione bayesiana, peso dell'a priori, intervallo della scala, soglie dei livelli |

## Endpoint API

Tutti gli endpoint dei dati accettano un parametro di query facoltativo `?lang=` (valore predefinito: `eng`). Le risposte sono **compresse con GZip** e memorizzate nella cache con `Cache-Control: public, max-age=300`.

| Endpoint | Descrizione | Filtri |
|---|---|---|
| `GET /api/cards` | Tutte le carte | `color`, `type`, `rarity`, `keyword`, `search`, `lang` |
| `GET /api/cards/{id}` | Singola carta | `lang` |
| `GET /api/characters` | Tutti i personaggi | `search`, `lang` |
| `GET /api/characters/{id}` | Singolo personaggio (con citazioni e dialoghi) | `lang` |
| `GET /api/relics` | Tutte le reliquie | `rarity`, `pool`, `search`, `lang` |
| `GET /api/relics/{id}` | Singola reliquia | `lang` |
| `GET /api/monsters` | Tutti i mostri | `type`, `search`, `lang` |
| `GET /api/monsters/{id}` | Singolo mostro | `lang` |
| `GET /api/potions` | Tutte le pozioni | `rarity`, `pool`, `search`, `lang` |
| `GET /api/potions/{id}` | Singola pozione | `lang` |
| `GET /api/enchantments` | Tutti gli incantamenti | `card_type`, `search`, `lang` |
| `GET /api/enchantments/{id}` | Singolo incantamento | `lang` |
| `GET /api/encounters` | Tutti gli scontri | `room_type`, `act`, `search`, `lang` |
| `GET /api/encounters/{id}` | Singolo scontro | `lang` |
| `GET /api/events` | Tutti gli eventi | `type`, `act`, `search`, `lang` |
| `GET /api/events/{id}` | Singolo evento | `lang` |
| `GET /api/powers` | Tutti i poteri | `type`, `stack_type`, `search`, `lang` |
| `GET /api/powers/{id}` | Singolo potere | `lang` |
| `GET /api/keywords` | Definizioni delle parole chiave delle carte | `lang` |
| `GET /api/keywords/{id}` | Singola parola chiave | `lang` |
| `GET /api/intents` | Tipi di intento dei mostri | `lang` |
| `GET /api/intents/{id}` | Singolo intento | `lang` |
| `GET /api/orbs` | Tutte le sfere | `lang` |
| `GET /api/orbs/{id}` | Singola sfera | `lang` |
| `GET /api/afflictions` | Afflizioni delle carte | `lang` |
| `GET /api/afflictions/{id}` | Singola afflizione | `lang` |
| `GET /api/modifiers` | Modificatori delle partite | `lang` |
| `GET /api/modifiers/{id}` | Singolo modificatore | `lang` |
| `GET /api/achievements` | Tutti gli obiettivi | `lang` |
| `GET /api/achievements/{id}` | Singolo obiettivo | `lang` |
| `GET /api/badges` | Tutti i distintivi di fine partita | `tiered`, `multiplayer_only`, `requires_win`, `search`, `lang` |
| `GET /api/badges/{id}` | Singolo distintivo con suddivisione per livello | `lang` |
| `GET /api/history/{entity_type}/{entity_id}` | Cronologia delle versioni per entità (senza distinzione tra maiuscole e minuscole, dalla più recente) | - |
| `GET /api/epochs` | Epoche della cronologia | `era`, `search`, `lang` |
| `GET /api/epochs/{id}` | Singola epoca | `lang` |
| `GET /api/stories` | Voci della storia | `lang` |
| `GET /api/stories/{id}` | Singola storia | `lang` |
| `GET /api/acts` | Tutti gli atti | `lang` |
| `GET /api/acts/{id}` | Singolo atto | `lang` |
| `GET /api/ascensions` | Livelli di ascensione (0–10) | `lang` |
| `GET /api/ascensions/{id}` | Singolo livello di ascensione | `lang` |
| `GET /api/stats` | Conteggi delle entità in tutte le categorie | `lang` |
| `GET /api/languages` | Lingue disponibili con nomi visualizzati | - |
| `GET /api/translations` | Mappe di traduzione per i valori dei filtri e le stringhe dell'interfaccia | `lang` |
| `GET /api/images` | Categorie di immagini con elenchi dei file. Le categorie con prefisso beta accettano `?version=`. | - |
| `GET /api/images/beta/versions` | Versioni disponibili dell'archivio delle immagini beta + destinazione del collegamento simbolico `latest` | - |
| `GET /api/images/{category}/download` | Download ZIP della categoria di immagini. Le categorie beta accettano `?version=`. | - |
| `GET /api/changelogs` | Riepiloghi dei changelog (tutte le versioni) | - |
| `GET /api/changelogs/{tag}` | Changelog completo per un tag di versione | - |
| `GET /api/guides` | Guide della community | `category`, `difficulty`, `tag`, `search` |
| `GET /api/guides/{slug}` | Singola guida (con contenuto Markdown) | - |
| `POST /api/guides` | Invia una guida (inoltrata a Discord) | - |
| `POST /api/runs` | Invia una partita (JSON del file .run) | `username` |
| `GET /api/runs/list` | Elenca/esplora le partite inviate | `character`, `win`, `username`, `seed`, `build_id`, `build_ids`, `players`, `game_mode`, `ascension`, `ascension_min`, `ascension_max`, `card`, `relic`, `today`, `sort`, `page`, `limit` |
| `GET /api/runs/shared/{hash}` | Dati completi della partita per hash (unisce `username` dal DB) | - |
| `GET /api/runs/stats` | Statistiche aggregate della community | `character`, `win`, `ascension`, `game_mode`, `players` |
| `GET /api/runs/leaderboard` | Classifica ordinata delle sole vittorie | `category` (`fastest`, `highest_ascension`), `character`, `players`, `game_mode`, `today`, `page`, `limit` |
| `GET /api/runs/leaderboard/rank/{hash}` | Posizione di una singola partita vinta nella relativa classifica | `category` |
| `GET /api/runs/scores/{type}` | Codex Score (punteggio della percentuale di vittorie regolarizzato con metodo bayesiano + livello S/A/B/C/D/F) per entità | `type` = `cards`/`relics`/`potions` |
| `GET /api/runs/encounter-stats` | Aggregati per scontro (presenza, tasso di mortalità, media danni/turni) | `act`, `room_type`, `multiplayer`, `page`, `limit` |
| `POST /api/runs/claim` | Associa un nome utente alle partite inviate in precedenza tramite hash | - |
| `GET /api/runs/versions` | Versioni di gioco distinte tra le partite inviate | - |
| `GET /api/exports/{lang}` | ZIP di tutti i JSON delle entità per una lingua | `lang` |
| `GET /api/news` | Annunci Steam + notizie della community (archiviati localmente) | `feed_type`, `feedname`, `tag`, `since`, `search`, `limit`, `offset` |
| `GET /api/news/{gid}` | Singolo articolo di notizie (corpo HTML/BBCode non elaborato) | - |
| `GET /api/merchant/config` | Configurazione dei prezzi del mercante estratta automaticamente | - |
| `POST /api/feedback` | Invia un commento (inoltrato a Discord) | - |
| `GET /api/versions` | Metadati delle versioni esposti dalla radice dati attiva | - |

**Account utente** (sessione cookie/JWT; accesso con Steam o Discord):

| Endpoint | Descrizione |
|---|---|
| `GET /api/auth/me` | Utente attualmente autenticato |
| `GET /api/auth/steam/redirect` | Avvia l'accesso Steam OpenID |
| `GET /api/auth/discord/start` | Avvia l'accesso Discord OAuth |
| `POST /api/auth/logout` | Cancella il cookie di sessione |
| `PATCH /api/auth/username` / `PATCH /api/auth/email` | Aggiorna i campi del profilo |
| `GET /api/auth/runs` / `POST /api/auth/runs/upload` / `DELETE /api/auth/runs/{hash}` | Elenca, carica e rimuove le partite dell'utente |
| `GET /api/auth/stats` | Statistiche aggregate per utente (pagina del profilo) |
| `GET /api/auth/personal-bests` | Partita più veloce in singolo/co-op, ascensione più alta, giornaliera odierna e di tutti i tempi |
| `GET /api/auth/competitive` | Classifica giornaliera odierna, posizioni globali, percentuale di vittorie rispetto alla community |

Il limite è di **60 richieste al minuto** per IP. L'invio di commenti e guide è limitato a **3-5 al minuto** per IP. Documentazione interattiva disponibile in `/docs` (Swagger UI).

### Localizzazione

Tutti i dati di gioco vengono forniti in 15 lingue usando i file di localizzazione di Slay the Spire 2. Passa `?lang=` a qualsiasi endpoint dei dati. Usa `?channel=beta` per i dati della beta pubblica attiva; gli insiemi archiviati di immagini beta usano `?version=`.

| Codice | Lingua | Codice | Lingua |
|------|----------|------|----------|
| `eng` | English | `kor` | 한국어 |
| `deu` | Deutsch | `pol` | Polski |
| `esp` | Español (ES) | `ptb` | Português (BR) |
| `fra` | Français | `rus` | Русский |
| `ita` | Italiano | `spa` | Español (LA) |
| `jpn` | 日本語 | `tha` | ไทย |
| `tur` | Türkçe | `zhs` | 简体中文 |
| `zht` | 繁體中文 | | |

**Elementi localizzati**: nomi e descrizioni delle entità ricavati dal gioco, tipi di carta, rarità, parole chiave, poteri, scontri, nomi dei personaggi, titoli delle sezioni, percorsi localizzati e la maggior parte delle etichette condivise dell'interfaccia.

**Elementi che rimangono in inglese**: identificatori API e valori strutturali dei filtri come `room_type`, `type`/`stack_type` dei poteri e `pool`, oltre ai marchi dei prodotti e ad alcuni contenuti editoriali o creati dalla community.

I parametri dei filtri (`type=Attack`, `rarity=Rare`, `keyword=Exhaust`) usano sempre valori in inglese indipendentemente dalla lingua: il backend li traduce negli equivalenti localizzati prima di eseguire la corrispondenza.

Esempio: `GET /api/cards?lang=kor&type=Attack` restituisce i dati delle carte in coreano, dove il tipo è "공격", filtrati correttamente anche se il parametro è in inglese.

### Formattazione del testo avanzato

I campi di testo (`description`, `loss_text`, `flavor`, `text` dei dialoghi, `title`/`description` delle opzioni) possono contenere tag in stile BBCode di Godot mantenuti dai dati di localizzazione del gioco:

| Tag | Tipo | Esempio | Reso come |
|---|---|---|---|
| `[gold]...[/gold]` | Colore | `[gold]Enchant[/gold]` | Testo color oro |
| `[red]...[/red]` | Colore | `[red]blood[/red]` | Testo rosso |
| `[blue]...[/blue]` | Colore | `[blue]2[/blue]` | Testo blu |
| `[green]...[/green]` | Colore | `[green]healed[/green]` | Testo verde |
| `[purple]...[/purple]` | Colore | `[purple]Sharp[/purple]` | Testo viola |
| `[orange]...[/orange]` | Colore | `[orange]hulking figure[/orange]` | Testo arancione |
| `[pink]...[/pink]` | Colore | - | Testo rosa |
| `[aqua]...[/aqua]` | Colore | `[aqua]Ascending Spirit[/aqua]` | Testo color ciano |
| `[sine]...[/sine]` | Effetto | `[sine]swirling vortex[/sine]` | Testo ondulato animato |
| `[jitter]...[/jitter]` | Effetto | `[jitter]CLANG![/jitter]` | Testo tremolante animato |
| `[b]...[/b]` | Effetto | `[b]bold text[/b]` | Testo in grassetto |
| `[i]...[/i]` | Effetto | `[i]whispers[/i]` | Testo in corsivo |
| `[energy:N]` | Icona | `[energy:2]` | Icona/e energia |
| `[star:N]` | Icona | `[star:1]` | Icona/e stella |
| `[Card]`, `[Relic]` | Segnaposto | `[Card]` | Dinamico durante l'esecuzione (corsivo) |

I tag possono essere annidati: `[b][jitter]CLANG![/jitter][/b]`, `[gold][sine]swirling vortex[/sine][/gold]`.

Se utilizzi direttamente l'API, puoi rimuoverli con un'espressione regolare come `\[/?[a-z]+(?::\d+)?\]` oppure renderizzarli nel tuo frontend. Il campo `description_raw` (dove disponibile) contiene il modello SmartFormat non risolto.

## Esecuzione locale

### Prerequisiti

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

Il backend viene eseguito su **http://localhost:8000**.

### Frontend

```bash
cd frontend
npm install
NEXT_PUBLIC_API_URL=http://localhost:8000 npm run dev
```

Il frontend viene eseguito su **http://localhost:3000**.

### Docker

```bash
docker compose up --build
```

Avvia entrambi i servizi (backend sulla porta 8000, frontend sulla 3000).

### Variabili d'ambiente

L'API principale di sola lettura non richiede alcuna configurazione. Le funzionalità facoltative riportate di seguito vengono abilitate tramite variabili d'ambiente (impostate nell'ambiente del backend o nel file Compose):

| Variabile | Utilizzata da | Note |
|---|---|---|
| `MONGO_URL` | Backend | Database delle partite (statistiche della community, classifiche, account). Quando non impostata, il backend ricorre al precedente percorso SQLite (`data/runs.db`). |
| `JWT_SECRET` | Backend | Firma i token di sessione degli account utente. |
| `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` | Backend | Accesso Discord OAuth. |
| `FRONTEND_URL`, `SPIRE_CODEX_PUBLIC_BASE` | Backend | URL di reindirizzamento / ritorno OAuth. |
| `ENVIRONMENT` | Backend | `production` attiva il comportamento dei cookie sicuri. |
| `NEXT_PUBLIC_API_URL` | Frontend (build) | Base dell'API; vuota in produzione, affinché immagini e dati vengano risolti con la stessa origine. |
| `NEXT_PUBLIC_CDN_URL` | Frontend (build) | Quando impostata (ad es. `https://cdn.spire-codex.com`), le immagini vengono caricate dalla CDN anziché da `/static`. |
| `NEXT_PUBLIC_SITE_URL` | Frontend (build) | URL canonico del sito per i metadati. |

Gli account utente e la CDN sono disattivati per impostazione predefinita, pertanto il progetto funziona integralmente senza nessuna di queste variabili.

## Pipeline di aggiornamento

Uno script Python multipiattaforma gestisce l'intero flusso di aggiornamento quando viene pubblicata una nuova versione del gioco:

```bash
# Pipeline completa - estrae i file di gioco, analizza i dati, renderizza gli sprite, copia le immagini:
python3 tools/update.py

# Specifica manualmente il percorso di installazione del gioco:
python3 tools/update.py --game-dir "/path/to/Slay the Spire 2"

# Salta l'estrazione (la directory extraction/ contiene già dati aggiornati):
python3 tools/update.py --skip-extract

# Esegue nuovamente solo l'analisi dei dati (senza estrazione o rendering):
python3 tools/update.py --parse-only

# Esegue nuovamente solo il rendering degli sprite Spine:
python3 tools/update.py --render-only

# Genera un changelog dopo l'aggiornamento:
python3 tools/update.py --changelog --game-version "0.98.2" --build-id "22238966"
```

Lo script rileva automaticamente il sistema operativo e individua la directory di installazione di Steam. Requisiti per ciascun passaggio:

| Passaggio | Strumento | Installazione |
|---|---|---|
| Estrazione PCK | `gdre_tools` | [Versioni di GDRE Tools](https://github.com/bruvzg/gdsdecomp/releases) |
| Decompilazione DLL | `ilspycmd` | `dotnet tool install ilspycmd -g` |
| Analisi dei dati | Python 3.10+ | Integrato |
| Copia delle immagini | Python 3.10+ | Integrato |
| Rendering Spine | Node.js 20+ | [nodejs.org](https://nodejs.org) |

### Passaggi manuali

Se preferisci eseguire i passaggi singolarmente:

```bash
# Analizza tutti i dati (tutte le 15 lingue)
cd backend/app/parsers && python3 parse_all.py

# Analizza una singola lingua
cd backend/app/parsers && python3 parse_all.py --lang eng

# Copia le immagini dall'estrazione alla directory statica (PNG + WebP dalla stessa origine - nessuna
# catena con perdita attraverso un WebP del backend già esistente). WebP con quality=95, method=6.
python3 backend/scripts/copy_images.py

# Renderizza gli sprite Spine (WebGL - nessun artefatto sulle giunzioni dei triangoli)
cd tools/spine-renderer && npm install
npx playwright install chromium           # Solo la prima volta
node render_all_webgl.mjs                 # Tutti i 138 scheletri tramite Chrome headless
node render_webgl.mjs <skel_dir> <out> [size] [--skin=a,b] [--anim=name] [--anim-time=N]

# Sostituzioni comuni per singolo mostro:
#   --skin=moss1,diamondeye   combina le skin varianti con quella predefinita (cubex_construct)
#   --skin=skin1              sostituisce quella predefinita con una variante (scroll_of_biting)
#   --anim-time=0.5           fa avanzare l'animazione di N secondi prima dell'istantanea
#   --anim=attack             sostituisce l'animazione inattiva selezionata automaticamente
#
# Sostituzione dei segnaposto del fumo: gas_bomb_2.png, the_forgotten_2.png e
# living_smog_2.png sono distribuiti nel sorgente come pannelli magenta "Smoke Placeholder".
# render_webgl.mjs li sostituisce con una nube color prugna scuro generata proceduralmente
# delle stesse dimensioni prima del caricamento GL, quindi imposta forzatamente slot.color.a = 1.0
# sugli slot sostituiti (gli artisti hanno impostato un'alfa basso prevedendo uno shader).

# Reinquadratura degli sprite dei mostri sottodimensionati (post-elaborazione - ritaglia sul vero
# riquadro di delimitazione alfa, ridimensiona per riempire circa il 92% del fotogramma 512x512):
python3 tools/rescale_bestiary.py fuzzy_wurm_crawler thieving_hopper terror_eel

# Renderer canvas precedente (presenta artefatti sulle giunzioni dei triangoli - da evitare)
# node render_all.mjs / node render.mjs
```

## Sistema dei changelog

Tieni traccia delle modifiche tra gli aggiornamenti del gioco con differenze a livello di campo per tutte le categorie di entità.

### Generazione di un changelog

```bash
# Confronta i dati attuali con un riferimento git:
python3 tools/diff_data.py HEAD~1 --format json \
    --game-version "0.98.2" --build-id "22238966" \
    --title "March Update"

# Anteprima come testo o Markdown:
python3 tools/diff_data.py HEAD~1 --format text
python3 tools/diff_data.py HEAD~1 --format md
```

### Schema del changelog

Ogni file JSON del changelog contiene:

| Campo | Descrizione |
|---|---|
| `app_id` | ID app Steam (2868840) |
| `game_version` | Versione Steam del gioco (ad es. `"0.98.2"`) |
| `build_id` | ID build Steam |
| `tag` | Chiave univoca della versione (ad es. `"1.0.3"`) |
| `date` | Data dell'aggiornamento |
| `title` | Titolo leggibile |
| `summary` | Conteggi: `{ added, removed, changed }` |
| `features` / `fixes` / `api_changes` | Note di rilascio curate manualmente. Vengono mantenute quando `diff_data.py` rigenera un tag esistente: le differenze dei dati vengono sovrascritte, ma questi array vengono uniti. |
| `categories` | Differenze per categoria con entità aggiunte/rimosse/modificate. Le modifiche dei campi analizzano ricorsivamente dizionari/elenchi annidati, affinché ogni foglia costituisca una riga distinta (ad es. `vars.DamageVar: 8 → 10`) anziché un'opaca voce `vars: 2 fields → 2 fields`. |

### Conservazione a scrittura singola

I file in `data/changelogs/` sono registri storici a scrittura singola. `.github/workflows/changelog-guard.yml` blocca qualsiasi PR che **modifichi o elimini** un changelog esistente. I nuovi file (`A`) sono sempre consentiti; le modifiche richiedono l'etichetta `changelog-edit-approved` sulla PR. Consulta `CONTRIBUTING.md → Changelog Retention` per i criteri e la procedura di sostituzione.

### Cronologia per entità

`GET /api/history/{entity_type}/{entity_id}` esamina ogni changelog e restituisce, dal più recente, le voci che hanno interessato l'entità richiesta. Il pannello Cronologia versioni di ogni pagina di dettaglio (`/cards/{id}`, `/monsters/{id}`, ecc.) utilizza questo endpoint.

## Distribuzione

### CI/CD (GitHub Actions)

I push su `main` attivano `.github/workflows/ci.yml` sull'esecutore Kubernetes self-hosted. Il flusso di lavoro esegue la scansione dei segreti, i controlli ESLint e TypeScript, i controlli di lint e formattazione ruff, quindi crea e pubblica le immagini stabili con il tag `:latest`. Continua inoltre a creare le immagini beta autonome con il tag `:beta` per `docker-compose.beta.yml`; queste immagini vengono mantenute a livello operativo, ma le pagine beta pubbliche sono servite dalla distribuzione principale in `/beta`.

Il frontend stabile riceve `UMAMI_WEBSITE_ID`. L'immagine beta autonoma riceve `UMAMI_BETA_WEBSITE_ID`, anche se il traffico pubblico su `/beta` utilizza il frontend stabile e la relativa proprietà di analisi.

La CI **non** esegue la distribuzione. La distribuzione è gestita dal processo di distribuzione automatica orario sull'host DigitalOcean.

> **Nota:** `.forgejo/workflows/build.yml` viene mantenuto come ripiego inattivo basato su buildah.

### Build locale + push

Salta la CI ed esegui il push direttamente dal tuo computer:

```bash
# Crea ed esegue il push di entrambe le immagini:
python3 tools/deploy.py

# Solo frontend:
python3 tools/deploy.py --frontend

# Solo backend:
python3 tools/deploy.py --backend

# Verifica la build senza eseguire il push:
python3 tools/deploy.py --no-push

# Assegna un tag a una versione:
python3 tools/deploy.py --tag v0.98.2

# Crea ed esegue il push delle immagini beta (tag :beta, salta IndexNow):
python3 tools/deploy.py --beta
```

Rileva automaticamente Apple Silicon ed esegue la compilazione incrociata per `linux/amd64` tramite `docker buildx`. Richiede prima l'esecuzione di `docker login`.

### Produzione

L'applicazione pubblica e lo stack beta autonomo mantenuto vengono eseguiti sullo stesso host DigitalOcean. Il traffico pubblico utilizza `spire-codex.com`; l'host Lightsail secondario esegue MongoDB.

**Distribuzione automatica** - un cron orario sull'host DigitalOcean esegue `/usr/local/bin/spire-codex-autodeploy` al minuto :03. Quando il commit estratto avanza, esegue il pull e ricrea sia `docker-compose.prod.yml` sia `docker-compose.beta.yml`, eccetto per gli aggiornamenti limitati a `data/news/*`. Successivamente svuota la cache Cloudflare. I log vengono scritti in `/var/log/spire-codex-autodeploy.log`. Consulta [`infrastructure/ansible/README.md`](infrastructure/ansible/README.md) per l'installazione e le operazioni.

**Distribuzione manuale**:

```bash
cd infrastructure/ansible
./bin/do-ansible playbooks/deploy.yml

# Stack beta autonomo mantenuto
./bin/do-ansible playbooks/deploy.yml -e compose_file=docker-compose.beta.yml
```

I dati di produzione vengono montati tramite bind (`./data:/data:ro` per il frontend e in lettura/scrittura per il backend). Lo stato delle notizie e delle partite viene letto dai dati montati al momento della richiesta, pertanto gli aggiornamenti di `data/news/*.json` non richiedono il riavvio del contenitore.

### Canale beta (spire-codex.com/beta)

L'applicazione pubblica fornisce i dati stabili e quelli Steam `public-beta` come due canali di contenuto. Le pagine beta si trovano in [`spire-codex.com/beta`](https://spire-codex.com/beta), con percorsi localizzati in `/{lang}/beta/...`. La pagina principale `/images` espone inoltre le versioni archiviate delle risorse beta.

`beta.spire-codex.com` è stato ritirato dall'uso pubblico. Attualmente Cloudflare invia un reindirizzamento `302` che mantiene il percorso verso il dominio principale, ma non aggiunge `/beta` né `channel=beta`. I vecchi collegamenti alle pagine conducono quindi alla pagina stabile corrispondente e le vecchie richieste API ricevono dati stabili dopo aver seguito il reindirizzamento. I nuovi client API devono usare l'API principale con un canale esplicito, ad esempio `https://spire-codex.com/api/cards?channel=beta`.

**Architettura**: `get_channel` risolve `?channel=beta|stable` in una `ContextVar` Python; riconosce inoltre un'intestazione host `beta.*` per il traffico diretto all'origine. `data_service.py` carica le richieste beta da `data-beta/<latest>/` e, per ogni file mancante, ricorre ai dati stabili. `GET /api/beta/diff` e `GET /api/beta/version` descrivono la beta attiva, mentre il frontend renderizza il canale selezionato in `/beta`.

Lo stack `docker-compose.beta.yml` separato e le immagini `:beta` continuano a essere creati e ricreati dall'automazione della distribuzione. Finché il reindirizzamento Cloudflare è attivo, non costituiscono il sito beta pubblico.

**Struttura dei dati**: ogni build archiviata risiede in `data-beta/<version>/` e il puntatore `latest` seleziona la build attiva. Ogni versione dispone della propria directory `changelogs/`. Gli archivi delle immagini beta replicano questa struttura in `backend/static/images/beta/<version>/{cards,monsters,misc,ui,vfx}/`.

**Acquisizione automatizzata** - `tools/beta-watch/` viene eseguito come processo launchd sul Mac di sviluppo il giovedì dalle 15:00 alle 22:45, ogni 15 minuti. Quando SteamCMD segnala un nuovo ID build `public-beta`, estrae e decompila il gioco, analizza ogni lingua, genera le differenze, sincronizza le immagini con versione e apre una PR `auto/beta-<version>`. Consulta [`tools/beta-watch/README.md`](tools/beta-watch/README.md) per l'installazione e le operazioni.

**Acquisizione manuale**:

```bash
VERSION=vX.Y.Z
PREVIOUS=vA.B.C

# Prima estrae e decompila i file del gioco beta, quindi esegue l'analisi dalla radice del repository.
(cd backend/app/parsers && \
  EXTRACTION_DIR=../../../extraction/beta \
  DATA_DIR="../../../data-beta/$VERSION" \
  python3 parse_all.py)

VERSION="$VERSION" tools/beta-watch/sync-images.sh

python3 tools/diff_data.py "data-beta/$PREVIOUS/eng" "data-beta/$VERSION/eng" \
  --format json --output-dir "data-beta/$VERSION/changelogs" \
  --game-version "${VERSION#v}" --title "Beta ${VERSION#v}"
```

`sync-images.sh` aggiorna il collegamento simbolico `latest` delle immagini. La PR di acquisizione contiene le modifiche con versione ai dati e alle immagini; dopo l'unione, la distribuzione automatica aggiorna entrambi gli stack mantenuti.

## Renderer Spine

Gli sprite dei mostri in StS2 sono animazioni scheletriche [Spine](http://esotericsoftware.com/): ogni mostro è composto da uno scheletro binario `.skel` + un atlante `.atlas` + uno spritesheet `.png`, non da una singola immagine. Il renderer li compone in ritratti PNG statici.

### Renderer WebGL (attuale)

Il renderer WebGL (`render_webgl.mjs`, `render_all_webgl.mjs`) usa **Playwright + spine-webgl** per renderizzare gli scheletri tramite la GPU di Chrome headless. Produce rendering puliti **senza artefatti sulle giunzioni dei triangoli**.

**Funzionamento:**
1. Avvia Chrome headless tramite Playwright con WebGL abilitato
2. Carica nella pagina del browser i dati dello scheletro + l'atlante + le texture come base64
3. Crea un canvas WebGL e configura lo shader spine-webgl + il batcher di poligoni
4. Applica l'animazione inattiva e calcola i limiti (escludendo gli slot di ombre/terreno)
5. Esegue il rendering tramite rasterizzazione GPU dei triangoli - nessun percorso di ritaglio canvas, nessuna giunzione
6. Legge i pixel non elaborati tramite `gl.readPixels` e li capovolge verticalmente (WebGL procede dal basso verso l'alto)
7. Scrive il PNG tramite node-canvas per mantenere la trasparenza

**Singolo scheletro:**
```bash
node render_webgl.mjs <skel_dir> <output_path> [size]
node render_webgl.mjs ../../extraction/raw/animations/backgrounds/neow_room ../../backend/static/images/misc/neow.png 2048
```

**Tutti gli scheletri in batch:**
```bash
node render_all_webgl.mjs  # Renderizza 138 scheletri in backend/static/images/renders/
```

### Copertura del rendering

| Categoria | Renderizzati | Totale | Note |
|---|---|---|---|
| Mostri | 99 | 103 directory | Tutti i 111 mostri del gioco dispongono di immagini (99 renderizzati + alias/immagini statiche) |
| Personaggi | 16 | 16 | Pose di combattimento, sito di riposo e selezione |
| Sfondi/PNG | 14 | 17 | Neow, Tezcatara, stanze del mercante, menu principale |
| VFX/UI | 9 | 22 | La maggior parte dei VFX richiede fotogrammi di animazione specifici |
| **Totale** | **138** | **158** | 20 ignorati (senza atlante, solo VFX, vuoti) |

### Renderer delle animazioni

Il renderer delle animazioni (`render_gif.mjs`) renderizza le animazioni inattive/di attacco di Spine come WebP, GIF o APNG animati. Supporta varianti di skin, selezione dell'animazione e scrittura in streaming dei fotogrammi su disco per le animazioni di grandi dimensioni.

**Formati di output supportati:**
- **`.webp`** (consigliato) - WebP animato senza perdita con alfa completo, circa il 33% più piccolo di APNG. I fotogrammi vengono scritti in streaming su disco per evitare l'esaurimento della memoria.
- **`.gif`** - 256 colori, trasparenza binaria. File più piccoli, ma qualità più bassa.
- **`.apng`** - alfa completo come WebP, ma file più grandi.

```bash
# Renderizza WebP animato senza perdita (consigliato)
NODE_OPTIONS="--max-old-space-size=8192" node render_gif.mjs <skel_dir> <output.webp> [size] [--fps=N]

# Con una variante di skin (per bowlbug, cultists, cubex, ecc.)
node render_gif.mjs <skel_dir> output.webp 256 --fps=10 --skin=rock

# Animazione specifica (predefinita: ciclo inattivo)
node render_gif.mjs <skel_dir> output.webp 256 --fps=12 --anim=attack

# Modalità sagoma bianca (per le icone dei nodi dei boss sulla mappa)
node render_gif.mjs <skel_dir> output.webp 256 --white
```

**Libreria delle animazioni:** 209 WebP animati senza perdita:
- 15 animazioni dei personaggi (combattimento/selezione/riposo × 5 personaggi) a 512×512
- 103 animazioni inattive dei mostri a 256×256
- 91 animazioni di attacco dei mostri a 256×256

**Varianti di skin:** 13 mostri dispongono di varianti di skin (bowlbug, cubex_construct, cultists, ecc.). Usa `--skin=` per selezionarle. Spesso la skin predefinita mostra solo lo scheletro di base senza corpo.

**Shader dei nodi dei boss sulla mappa:** il gioco usa `boss_map_point.gdshader`, che tratta i canali RGB come maschere:
- **Canale rosso** × `map_color` (predefinito: beige `0.671, 0.58, 0.478`) → colore di riempimento
- **Canale blu** × `black_layer_color` (predefinito: nero `0, 0, 0`) → colore del contorno
- **Canale verde** × bianco `1, 1, 1` → punti luce

### Renderer canvas precedente

Il renderer canvas (`render.mjs`, `render_all.mjs`) usa `spine-canvas` con `triangleRendering = true`. Produce **artefatti visibili a reticolo** a causa dell'antialiasing dei percorsi `clip()` del canvas tra triangoli adiacenti. Usa invece il renderer WebGL.

### Dipendenze

- `@esotericsoftware/spine-webgl` ^4.2.107 - Runtime Spine per WebGL (attuale)
- `playwright` - Chrome headless per il rendering WebGL
- `gif-encoder-2` - Codifica GIF per il renderer delle animazioni
- `canvas` ^3.1.0 - Implementazione Canvas per Node.js (buffer dei fotogrammi per il renderer delle animazioni)
- `Pillow` (Python) - compone WebP/APNG dai fotogrammi PNG renderizzati
- `@esotericsoftware/spine-canvas` ^4.2.106 - Runtime Spine per Canvas (precedente)

## Estrazione dei file di gioco

Se devi eseguire l'estrazione da zero:

```bash
# Estrae il PCK (GDRE Tools)
/path/to/gdre_tools --headless --recover="/path/to/sts2.pck" --output-dir=extraction/raw

# Decompila la DLL (ILSpy CLI)
ilspycmd -p -o extraction/decompiled "/path/to/sts2.dll"
```

Percorsi di installazione di Steam:
- **Windows**: `C:\Program Files (x86)\Steam\steamapps\common\Slay the Spire 2\`
- **macOS**: `~/Library/Application Support/Steam/steamapps/common/Slay the Spire 2/`
- **Linux**: `~/.local/share/Steam/steamapps/common/Slay the Spire 2/`

## Controllo delle versioni

Spire Codex utilizza il controllo delle versioni semantico **`1.X.Y`**:

| Segmento | Significato |
|---------|---------|
| **1** | Versione principale di Spire Codex (rimane invariata salvo una riscrittura completa) |
| **X** | Aumenta quando Mega Crit pubblica una patch del gioco |
| **Y** | Aumenta per le nostre correzioni e migliorie al parser/frontend |

Esempi: `v1.0.0` = versione iniziale, `v1.0.1` = nostre correzioni di errori, `v1.1.0` = prima patch di Mega Crit integrata.

## SEO

- **Dati strutturati (JSON-LD)**: WebSite + VideoGame (home), CollectionPage + ItemList (pagine elenco), Article + BreadcrumbList + FAQPage (pagine di dettaglio), SoftwareApplication (sviluppatori), NewsArticle (news/[gid])
- **Formato del titolo**: `"Slay the Spire 2 (sts2) {Page Title} | Spire Codex"` - standardizzato in tutte le pagine. Le partite usano `"{username} - {char} - Ascension {N} {win/loss} - Slay the Spire 2 (sts2) | Spire Codex"`. "(sts2)" è incluso affinché corrispondano le query multilingue `sts2 tier list` / `sts2 card list`.
- **Sitemap**: XML piatto in `/sitemap.xml` con `force-dynamic` (renderizzato lato server, non durante la build). Oltre 20.000 URL, incluse pagine di dettaglio delle entità, pagine della matrice di esplorazione, pagine delle classifiche a livelli, metodologia di calcolo del punteggio, dettagli runs/[hash] e repliche i18n per tutti i tipi di entità
- **SEO internazionale**: percorsi `/{lang}/` per 14 lingue diverse dall'inglese con alternative hreflang **bidirezionali** - anche le pagine radice inglesi emettono alternative per ogni impostazione locale + `x-default` tramite `buildLanguageAlternates(path)` in `lib/seo.ts` (risolve il gruppo di contenuti duplicati "Scansionata - attualmente non indicizzata" di GSC, in cui Google considerava duplicate le pagine localizzate prive di riferimenti di ritorno)
- **SEO programmatico**: 41 pagine di esplorazione delle carte in `/cards/browse/` (rare-attacks, ironclad-skills, ecc.) + 3 pagine di classifiche a livelli (`/tier-list/{cards,relics,potions}`)
- **EntityProse sensibile alle impostazioni locali**: le pagine di dettaglio renderizzano un breve paragrafo specifico per le impostazioni locali anziché corpi inglesi identici in ogni lingua
- **Collegamenti interni**: poteri ↔ carte, scontri → mostri, parole chiave delle carte → pagine centrali delle parole chiave, mosse dei mostri → pagine dei poteri (con descrizioni comandi), pagine degli atti → scontri/eventi, righe delle classifiche a livelli → scheda Statistiche dei dettagli dell'entità
- **Open Graph e Twitter Cards**: immagini OG per entità, Twitter Card `summary_large_image`
- **URL canonici**: ogni pagina dichiara un URL canonico

## Widget incorporabili

### Widget delle descrizioni comandi
Aggiungi descrizioni comandi al passaggio del mouse per tutti i 13 tipi di entità a qualsiasi sito web:
```html
<script src="https://spire-codex.com/widget/spire-codex-tooltip.js"></script>
<p>Start with [[Bash]] and [[relic:Burning Blood]].</p>
```

### Widget del changelog
Incorpora un visualizzatore interattivo del changelog:
```html
<div id="scx-changelog"></div>
<script src="https://spire-codex.com/widget/spire-codex-changelog.js"></script>
```

Documentazione completa: [spire-codex.com/developers](https://spire-codex.com/developers)

## Tabella di marcia

- ~~Pagine di dettaglio individuali~~ ✅
- ~~Ricerca globale~~ ✅
- ~~Supporto multilingue (15 lingue)~~ ✅
- ~~SEO (JSON-LD, OG/Twitter, sitemap, hreflang)~~ ✅
- ~~Widget delle descrizioni comandi (tutti i 13 tipi di entità)~~ ✅
- ~~Pagine di confronto dei personaggi (10 coppie)~~ ✅
- ~~Pagine centrali delle parole chiave~~ ✅
- ~~Guida del mercante (prezzi dal C# decompilato)~~ ✅
- ~~Documentazione per sviluppatori + esportazioni dei dati~~ ✅
- ~~SEO internazionale (13 pagine di destinazione linguistiche)~~ ✅
- ~~Matrice di esplorazione delle carte (41 pagine SEO programmatiche)~~ ✅
- ~~Guide della community~~ ✅ - Markdown con frontmatter YAML, modulo di invio, widget delle descrizioni comandi, profili social dell'autore
- ~~Pagina delle meccaniche di gioco~~ ✅ - 27 pagine SEO individuali: probabilità di ottenimento, combattimento, mappa, boss, segreti e curiosità
- ~~Partite della community~~ ✅ - Invio delle partite, browser, partite condivise, statistiche in tempo reale
- ~~Descrizioni dei potenziamenti delle carte~~ ✅ - upgrade_description per tutte le 403 carte potenziabili
- ~~Poteri innati dei mostri~~ ✅ - 42 mostri con poteri da AfterAddedToRoom
- ~~Condizioni di sblocco degli obiettivi~~ ✅ - Categoria, personaggio, soglia dal codice sorgente C#
- ~~Schemi di attacco dei mostri~~ ✅ - 112 mostri con IA ciclica/casuale/condizionale/mista dalle macchine a stati C#
- ~~Precondizioni degli eventi~~ ✅ - 25 eventi con condizioni IsAllowed() analizzate dal codice sorgente C#
- ~~Conservazione dell'archivio beta~~ ✅ - I dati e le immagini beta con versione rimangono conservati; `/beta` fornisce la build attiva e `/images` consente di esplorare le risorse archiviate
- ~~Bot Discord~~ ✅ - [Knowledge Demon](https://bot.spire-codex.com): comandi slash per ogni entità (`/card`, `/relic`, `/monster`, `/potion`, `/character`, `/event`, `/power`, `/enchantment`, `/lookup`, `/meta`), RSS delle notizie Steam e un insieme completo di strumenti di moderazione derivato da [Kernel](https://github.com/ptrlrd/kernel)
- ~~Codex Score e classifica a livelli~~ ✅ - Valutazione per entità calcolata dalle partite della community tramite **regolarizzazione bayesiana**: `shrunk = (wins + PRIOR_WEIGHT × baseline) / (n + PRIOR_WEIGHT)`, quindi convertita in una scala 0–100 e associata ai livelli S/A/B/C/D/F. Evita il rumore dei campioni troppo piccoli (una carta usata in una sola partita e con risultato 1/1 non ottiene una S: regredisce verso l'a priori). Preriscaldato all'avvio del backend. Esposto come `ScoreBadge` nella scheda Statistiche delle pagine di dettaglio, in pagine dedicate alle classifiche a livelli e nella pagina della metodologia in `/leaderboards/scoring`.
- ~~Scheda Statistiche nelle pagine di dettaglio~~ ✅ - Distintivo principale del punteggio + riepilogo testuale + collegamenti alle partite recenti tramite `EntityRunStats`.
- **Costruttore di mazzi** - Creazione teorica interattiva dei mazzi
- **Backend del database** - Sostituzione del caricamento dei JSON per lingua con PostgreSQL JSONB (o alternativa). L'archiviazione delle partite inviate è già stata trasferita da SQLite a MongoDB (maggio 2026).

## Ringraziamenti

Grazie a **vesper-arch**, **terracubist**, **U77654**, **Purple Aspired Dreaming**, **Kobaru** e **Severi** per i test di controllo qualità, le segnalazioni di errori e i contributi. L'elenco completo dei sostenitori - inclusi i donatori Ko-fi che mantengono operativo il progetto - è disponibile su [spire-codex.com/thank-you](https://spire-codex.com/thank-you).

## Stack tecnologico

- **Backend**: Python, FastAPI, Pydantic, slowapi, compressione GZip
- **Database delle partite**: MongoDB (statistiche della community, classifiche, account utente), con una raccolta materializzata `stats_summary` e un processo di aggiornamento in background con elezione del leader. Il precedente percorso SQLite viene mantenuto come ripiego offline.
- **Account**: Steam OpenID + Discord OAuth, cookie di sessione JWT
- **Frontend**: Next.js 16 (App Router), TypeScript, Tailwind CSS, supporto per 15 lingue
- **Immagini/CDN**: Cloudflare R2 fornito tramite `cdn.spire-codex.com` (webp)
- **Analisi e osservabilità**: Umami self-hosted, Prometheus + node-exporter
- **Renderer Spine**: Node.js, Playwright, @esotericsoftware/spine-webgl (WebGL tramite Chrome headless)
- **Infrastruttura**: Docker, CI GitHub Actions (esecutore self-hosted) con cache BuildKit supportata dal registro, distribuzione Ansible/SSH
- **Strumenti**: Python (pipeline di aggiornamento, confronto dei changelog, copia delle immagini)

## Licenza

- **Codice sorgente**: [PolyForm Noncommercial 1.0.0](LICENSE.md) - utilizzabile, modificabile e ridistribuibile gratuitamente per scopi non commerciali. La vendita del software non è consentita.
- **API ospitata**: [API_TERMS.md](API_TERMS.md) - gratuita per qualsiasi utilizzo entro i limiti di richieste pubblicati; contattaci su Discord o tramite una segnalazione se hai esigenze maggiori.
- **Dati di gioco** (carte, reliquie, mostri, ecc.): © Mega Crit Games. Forniti qui come riferimento per la community secondo i principi del fair use / per scopi didattici. Non utilizzare questi dati per ricompilare, riconfezionare o ridistribuire il gioco.

I contributi vengono accettati secondo gli stessi termini PolyForm Noncommercial 1.0.0 - consulta [CONTRIBUTING.md](CONTRIBUTING.md#license).
