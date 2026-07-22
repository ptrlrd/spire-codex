<p align="center">
  <img src="frontend/public/spire-codex-white-silent-black-background.png" alt="Logo de Spire Codex" width="200" />
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

Une base de données et une API complètes pour les données du jeu **Slay the Spire 2**, construites par rétro-ingénierie des fichiers du jeu. Prend en charge les **15 langues** fournies avec le jeu.

**Site en ligne** : [spire-codex.com](https://spire-codex.com)

**ID d’application Steam** : 2868840

## Méthode de construction

Slay the Spire 2 est développé avec Godot 4, mais toute la logique du jeu réside dans une DLL C#/.NET 8 (`sts2.dll`), et non dans GDScript. Le pipeline de données :

1. **Extraction du PCK** - [GDRE Tools](https://github.com/bruvzg/gdsdecomp) extrait le fichier `.pck` de Godot afin de récupérer les images, les animations Spine et les données de localisation (environ 9 947 fichiers).

2. **Décompilation de la DLL** - [ILSpy](https://github.com/icsharpcode/ILSpy) décompile `sts2.dll` en environ 3 300 fichiers sources C# lisibles contenant tous les modèles du jeu.

3. **Analyse des données** - 22 analyseurs Python fondés sur des expressions régulières extraient des données structurées depuis le code source C# décompilé et génèrent du JSON par langue dans `data/{lang}/` :
   - **Cartes** : constructeurs `base(cost, CardType, CardRarity, TargetType)` + `DamageVar`, `BlockVar`, `PowerVar<T>` pour les statistiques
   - **Personnages** : `StartingHp`, `StartingGold`, `MaxEnergy`, `StartingDeck`, `StartingRelics`
   - **Reliques/Potions** : rareté, groupe et descriptions résolues à partir de modèles SmartFormat
   - **Monstres** : plages de PV, mise à l’échelle de l’Ascension via `AscensionHelper`, machines à états des actions avec intentions par action (Attack/Defend/Buff/Debuff/Status/Summon/Heal), valeurs de dégâts, nombres de frappes multiples (y compris les motifs `AscensionHelper`), pouvoirs innés issus de `AfterAddedToRoom` (42 monstres avec variantes d’Ascension), pouvoirs appliqués par action (cible + quantité provenant de `PowerCmd.Apply<T>`), blocage, soins, contexte de la rencontre (acte, type de salle), **schémas d’attaque** analysés depuis `GenerateMoveStateMachine()` (112 monstres - cycliques, aléatoires, conditionnels, mixtes)
   - **Enchantements** : restrictions de type de carte, cumulabilité, mise à l’échelle fondée sur `Amount`
   - **Rencontres** : compositions de monstres, type de salle (Boss/Elite/Monster), positionnement dans les actes, balises
   - **Événements** : arbres de décision multipages (56 événements sur 66), choix et conséquences, positionnement dans les actes, références de modèle `StringVar` résolues en noms affichés, valeurs calculées à l’exécution (coûts croissants via `GetDecipherCost()`, plages d’or via `CalculateVars` avec `NextInt`/`NextFloat`, schémas de soin complet), **conditions préalables** provenant de `IsAllowed()` (25 événements - conditions liées à l’or, aux PV, à l’acte, au deck, aux reliques et aux potions)
   - **Anciens** : 8 PNJ Anciens avec épithètes, dialogues propres aux personnages, offres de reliques et icônes de portrait
   - **Pouvoirs** : `PowerType` (Buff/Debuff), `PowerStackType` (Counter/Single), `DynamicVars`, descriptions
   - **Époques/Histoires** : données de progression chronologique avec conditions de déverrouillage
   - **Orbes** : valeurs passives/d’évocation, descriptions
   - **Afflictions** : cumulabilité, texte de carte supplémentaire, descriptions
   - **Modificateurs** : descriptions des modificateurs de partie
   - **Mots-clés** : définitions des mots-clés de cartes (Exhaust, Ethereal, Innate, etc.)
   - **Intentions** : descriptions des intentions des monstres avec icônes
   - **Succès** : conditions de déverrouillage, descriptions, catégories, association aux personnages et seuils provenant du code source C# (33 succès)
   - **Actes** : ordre de découverte des boss, rencontres, événements, Anciens, nombres de salles
   - **Niveaux d’Ascension** : 11 niveaux (0 à 10) avec descriptions issues de la localisation
   - **Groupes de potions** : groupes propres aux personnages analysés à partir des classes de groupe et des références d’époque
   - **Traductions** : tables de filtres par langue (types de cartes, raretés, mots-clés → noms localisés) et chaînes d’interface (titres de section, descriptions, noms des personnages) destinées au frontend

4. **Résolution des descriptions** - Un module partagé `description_resolver.py` résout les modèles de localisation SmartFormat (`{Damage:diff()}`, `{Energy:energyIcons()}`, `{Cards:plural:card|cards}`) en texte lisible avec des marqueurs de texte enrichi pour le rendu du frontend. Les variables dynamiques d’exécution (par exemple `{Card}`, `{Relic}`) sont conservées sous forme d’espaces réservés lisibles. Les références `StringVar` des événements (par exemple `{Enchantment1}` → `ModelDb.Enchantment<Sharp>().Title`) sont résolues en noms affichés au moyen de la recherche dans les données de localisation.

5. **Rendu Spine** - Les personnages et les monstres sont des animations squelettiques Spine, et non des images statiques. Un moteur de rendu Node.js sans interface graphique assemble les poses d’inactivité en portraits PNG de 512 × 512. Les 111 monstres disposent tous d’images : 100 sont rendus à partir de squelettes Spine, 6 utilisent des alias de squelettes partagés (Flyconid→flying_mushrooms, Ovicopter→egg_layer, Crusher/Rocket→kaiser_crab) et 5 proviennent de ressources statiques du jeu (Doormaker). Le moteur produit également le rendu des 5 personnages (poses de combat, de site de repos et de sélection du personnage), des PNJ et des arrière-plans. Les variantes fondées sur des skins (Cultists, Bowlbugs, Cubex) sont rendues individuellement. Voir [Moteur de rendu Spine](#moteur-de-rendu-spine) ci-dessous.

6. **Images** - Les illustrations des cartes, les icônes de reliques/potions, les illustrations des personnages, les sprites des monstres, les icônes de portrait des Anciens et les icônes de rencontre de boss sont extraits des ressources du jeu et servis comme fichiers statiques.

7. **Comparaison des journaux des modifications** - Un outil de comparaison confronte les données JSON de différentes versions du jeu (au moyen de références Git ou de répertoires), en suivant les entités ajoutées, supprimées ou modifiées dans chaque catégorie, avec des différences au niveau des champs. Les journaux des modifications sont indexés par version Steam du jeu, avec un numéro de révision Codex facultatif.

## Structure du projet

```
spire-codex/
├── backend/                    # Backend FastAPI
│   ├── app/
│   │   ├── main.py             # Entrée de l’application, CORS, GZip, limitation du débit, fichiers statiques
│   │   ├── dependencies.py     # Dépendances partagées (validation de lang, noms des langues)
│   │   ├── routers/            # Points de terminaison de l’API (plus de 25 routeurs)
│   │   ├── models/schemas.py   # Modèles Pydantic
│   │   ├── services/           # Chargement des données JSON (cache LRU, prise en charge de 14 langues)
│   │   └── parsers/            # Analyseurs du code source C# → JSON
│   │       ├── card_parser.py
│   │       ├── character_parser.py
│   │       ├── monster_parser.py
│   │       ├── relic_parser.py
│   │       ├── potion_parser.py
│   │       ├── enchantment_parser.py
│   │       ├── encounter_parser.py
│   │       ├── event_parser.py
│   │       ├── power_parser.py
│   │       ├── keyword_parser.py        # Mots-clés, intentions, orbes, afflictions, modificateurs, succès (avec conditions de déverrouillage)
│   │       ├── guide_parser.py          # Guides Markdown avec métadonnées YAML
│   │       ├── epoch_parser.py
│   │       ├── act_parser.py
│   │       ├── ascension_parser.py
│   │       ├── pool_parser.py            # Ajoute aux potions le groupe du personnage
│   │       ├── translation_parser.py    # Génère translations.json pour chaque langue
│   │       ├── description_resolver.py   # Résolveur SmartFormat partagé
│   │       ├── parser_paths.py           # Configuration partagée des chemins (remplacements par variables d’environnement pour la bêta)
│   │       └── parse_all.py              # Orchestre tous les analyseurs (15 langues)
│   ├── static/images/          # Images du jeu (non versionnées)
│   ├── scripts/copy_images.py  # Copie les images de l’extraction vers les fichiers statiques
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/                   # Next.js 16 + TypeScript + Tailwind CSS
│   ├── app/
│   │   ├── contexts/           # LanguageContext, BetaVersionContext
│   │   ├── components/         # CardGrid, RichDescription, SearchFilter,
│   │   │                       #   GlobalSearch, Navbar, Footer, LanguageSelector, VersionSelector
│   │   └── ...                 # Pages : cartes, personnages, reliques, monstres, potions,
│   │                           #   enchantements, rencontres, événements, pouvoirs, chronologie,
│   │                           #   référence, images, journal des modifications, à propos, marchand, comparaison,
│   │                           #   mechanics/[slug], guides/[slug], guides/submit,
│   │                           #   classements, leaderboards/submit, leaderboards/stats,
│   │                           #   runs/[hash] (vue partagée d’une partie)
│   │                           #   Pages détaillées : cards/[id], characters/[id], relics/[id],
│   │                           #   monsters/[id], potions/[id], enchantments/[id],
│   │                           #   encounters/[id], events/[id], powers/[id], keywords/[id],
│   │                           #   acts/[id], ascensions/[id], intents/[id], orbs/[id],
│   │                           #   afflictions/[id], modifiers/[id], achievements/[id]
│   │                           #   i18n : [lang]/... reproduit toutes les routes pour les 14 langues autres que l’anglais
│   ├── lib/
│   │   ├── api.ts              # Client API + interfaces TypeScript
│   │   ├── fetch-cache.ts      # Cache de requêtes en mémoire côté client (durée de vie de 5 min)
│   │   ├── seo.ts              # Utilitaires SEO partagés (stripTags, SITE_URL, SITE_NAME)
│   │   ├── jsonld.ts           # Générateurs de schémas JSON-LD (BreadcrumbList, CollectionPage, Article, WebSite, FAQPage)
│   │   ├── ui-translations.ts # Traductions des chaînes d’interface pour les 14 langues autres que l’anglais
│   │   ├── languages.ts       # Configuration i18n - 14 codes de langue, correspondances hreflang
│   │   └── use-lang-prefix.ts # Hook pour construire des URL tenant compte de la langue
│   └── Dockerfile
├── tools/
│   ├── spine-renderer/         # Moteur de rendu de squelettes Spine sans interface graphique
│   │   ├── render_webgl.mjs     # Moteur de rendu WebGL (un seul squelette) - aucun artefact de raccord
│   │   ├── render_all_webgl.mjs # Rendu WebGL par lots (tous les fichiers .skel)
│   │   ├── render_gif.mjs      # Moteur de rendu d’animations (WebP/GIF/APNG avec prise en charge des skins et animations)
│   │   ├── render.mjs           # Ancien moteur de rendu Canvas (présente des raccords triangulaires)
│   │   ├── render_all.mjs       # Ancien moteur de rendu Canvas par lots
│   │   ├── render_skins2.mjs    # Moteur de rendu des variantes de skin
│   │   ├── render_utils.mjs     # Utilitaires partagés de rendu Canvas
│   │   └── package.json
│   ├── diff_data.py            # Générateur de différences pour le journal des modifications
│   ├── update.py               # Pipeline de mise à jour multiplateforme
│   └── deploy.py               # Construction Docker locale + envoi vers Docker Hub
├── data/                       # Fichiers de données JSON analysées
│   ├── {lang}/                 # Répertoires par langue (eng, kor, jpn, fra, etc.)
│   ├── changelogs/             # Fichiers JSON des journaux des modifications (indexés par version du jeu)
│   ├── guides/                 # Fichiers de guides Markdown avec métadonnées YAML
│   ├── guides.json             # Données analysées des guides
│   ├── runs/                   # Fichiers JSON des parties soumises (par hachage de joueur)
│   └── runs.db                 # Ancienne base SQLite (remplacée par MongoDB ; conservée comme solution de secours hors ligne)
├── extraction/                 # Fichiers bruts du jeu (non versionnés)
│   ├── raw/                    # Projet Godot extrait par GDRE (stable)
│   ├── decompiled/             # Sortie ILSpy (stable)
│   └── beta/                   # Branche bêta Steam (raw/ + decompiled/)
├── data-beta/                  # Données bêta analysées (versionnées : v0.102.0/, v0.103.0/, latest → lien symbolique)
├── docker-compose.yml          # Développement local
├── docker-compose.prod.yml     # Production
├── .github/workflows/
│   └── ci.yml                  # CI GitHub Actions : lint, vérification des types, analyse des secrets, construction et envoi Docker, déploiement SSH
└── .forgejo/workflows/
    └── build.yml               # Solution de secours CI Forgejo conservée (fondée sur buildah, inactive)
```

## Services publics

| Hôte | Rôle |
|---|---|
| [`spire-codex.com`](https://spire-codex.com) | Site web public et API de même origine. Le canal bêta actif se trouve sous `/beta`. |
| `cdn.spire-codex.com` | Hôte d’objets Cloudflare R2 pour les illustrations du jeu, les rendus complets des cartes, les rendus localisés et les ressources bêta archivées. |
| [`bot.spire-codex.com`](https://bot.spire-codex.com) | Page d’accueil de Knowledge Demon et tableau de bord du personnel authentifié par Discord. Le bot utilise l’API Codex principale. |
| `analytics.spire-codex.com` | Script et tableau de bord Umami auto-hébergés. Sa base de données PostgreSQL reste sur un réseau Docker privé. |
| `tierlists.spire-codex.com` | Hôte d’objets R2 dédié aux images d’aperçu générées pour les listes de niveaux. |
| `beta.spire-codex.com` | Ancien hôte public. Cloudflare redirige les requêtes vers le même chemin sur le domaine racine. |

Les hôtes du CDN et des listes de niveaux sont des magasins d’objets plutôt que des sites web navigables ; une réponse `404` à leur racine est donc normale.

## Pages du site web

| Page | Route | Description |
|---|---|---|
| Accueil | `/` | Tableau de bord avec nombres d’entités, cartes de catégories et liens vers les personnages |
| Cartes | `/cards` | Grille de cartes filtrable avec vue détaillée modale |
| Détails d’une carte | `/cards/[id]` | Statistiques complètes, informations d’amélioration et image de la carte |
| Personnages | `/characters` | Grille de présentation des personnages |
| Détails d’un personnage | `/characters/[id]` | Statistiques, deck/reliques de départ, citations et arbres de dialogue des PNJ |
| Reliques | `/relics` | Grille de reliques filtrable |
| Détails d’une relique | `/relics/[id]` | Informations complètes sur la relique avec texte d’ambiance enrichi |
| Monstres | `/monsters` | Grille de monstres avec PV, actions et rendus Spine |
| Détails d’un monstre | `/monsters/[id]` | PV, actions avec intentions/dégâts/pouvoirs/blocage, liens vers les rencontres et infobulles des pouvoirs |
| Potions | `/potions` | Grille de potions filtrable (rareté, groupe du personnage) |
| Détails d’une potion | `/potions/[id]` | Informations complètes sur la potion |
| Enchantements | `/enchantments` | Liste des enchantements avec filtres par type de carte |
| Détails d’un enchantement | `/enchantments/[id]` | Informations complètes sur l’enchantement |
| Rencontres | `/encounters` | Compositions des rencontres par acte/type de salle |
| Détails d’une rencontre | `/encounters/[id]` | Composition des monstres, type de salle et balises |
| Événements | `/events` | Arbres d’événements multipages avec choix extensibles |
| Détails d’un événement | `/events/[id]` | Pages, options et dialogues des Anciens complets |
| Pouvoirs | `/powers` | Améliorations, affaiblissements et pouvoirs neutres |
| Détails d’un pouvoir | `/powers/[id]` | Informations sur le pouvoir et cartes qui l’appliquent |
| Mots-clés | `/keywords` | Liste des mots-clés des cartes |
| Détails d’un mot-clé | `/keywords/[id]` | Description du mot-clé avec grille de cartes filtrable |
| Marchand | `/merchant` | Prix des cartes/reliques/potions, coûts de suppression des cartes et faux marchand |
| Comparaison | `/compare` | Portail de comparaison des personnages (10 paires) |
| Détails d’une comparaison | `/compare/[pair]` | Comparaison côte à côte des personnages |
| Développeurs | `/developers` | Documentation de l’API, documentation des widgets et exports de données |
| Vitrine | `/showcase` | Galerie de projets communautaires |
| Chronologie | `/timeline` | Progression des époques regroupées par ère, avec conditions de déverrouillage |
| Détails d’un acte | `/acts/[id]` | Boss, rencontres, événements et Anciens d’un acte |
| Détails d’une Ascension | `/ascensions/[id]` | Description du niveau d’Ascension avec navigation précédent/suivant |
| Détails d’une intention | `/intents/[id]` | Icône et description de l’intention |
| Détails d’un orbe | `/orbs/[id]` | Icône de l’orbe, description passive/d’évocation |
| Détails d’une affliction | `/afflictions/[id]` | Description de l’affliction et cumulabilité |
| Détails d’un modificateur | `/modifiers/[id]` | Description du modificateur de partie |
| Détails d’un succès | `/achievements/[id]` | Description du succès |
| Badges | `/badges` | Les 25 badges de fin de partie, regroupés par badges à niveaux / à niveau unique / multijoueur uniquement |
| Détails d’un badge | `/badges/[id]` | Détail par niveau (Bronze / Silver / Gold), indicateurs de victoire requise et de multijoueur, icône |
| Mécaniques | `/mechanics` | Portail des mécaniques du jeu - 27 sections cliquables avec des pages SEO individuelles |
| Détails d’une mécanique | `/mechanics/[slug]` | Probabilités des cartes, distribution des reliques, obtention des potions, génération de la carte, groupes de boss, combat, secrets et anecdotes |
| Guides | `/guides` | Guides stratégiques communautaires avec recherche/filtrage |
| Détails d’un guide | `/guides/[slug]` | Guide complet avec rendu Markdown + widget d’infobulle |
| Soumettre un guide | `/guides/submit` | Formulaire de soumission de guide (webhook Discord) |
| Classements | `/leaderboards` | Classements des victoires les plus rapides et des Ascensions les plus élevées, avec filtres solo/coopération et mode de jeu (standard / quotidien / Today / personnalisé). Tout l’état des filtres figure dans l’URL afin que chaque vue puisse être partagée |
| Parcourir les parties | `/runs` | Navigateur complet de parties avec barre de recherche par expressions (plages `user:`, `char:`, `asc:`, ET multivaleur `card:`/`relic:`, plages `version:`, `mode:`, `result:`, `players:`), filtres déroulants, tri et URL partageables |
| Soumettre une partie | `/leaderboards/submit` | Envoi d’un fichier `.run` par glisser-déposer avec lien vers l’application complémentaire Overwolf, connexion Steam/Discord pour associer automatiquement les parties et affichage des parties récentes |
| Statistiques | `/leaderboards/stats` | Tableaux classés (taux de sélection, taux de victoire, nombre) pour les cartes, reliques, potions et rencontres. Filtrage par personnage / Ascension / résultat |
| Profil | `/profile` | Statistiques de l’utilisateur connecté (meilleures cartes/reliques/potions, répartition par personnage), records personnels, comparaison compétitive (classement quotidien du jour, rangs mondiaux, taux de victoire par rapport à la communauté) et gestion des parties |
| Paramètres | `/settings` | Paramètres du compte : nom d’utilisateur, adresse e-mail, comptes Steam/Discord liés |
| Partie partagée | `/runs/[hash]` | Résumé de victoire/défaite dans le style du jeu, avec icônes cliquables des nœuds de la carte, bandeau des reliques et grille de cartes miniatures |
| Référence | `/reference` | Tous les éléments sont cliquables - actes, Ascensions, mots-clés, orbes, afflictions, intentions, modificateurs et succès |
| Images | `/images` | Ressources du jeu consultables avec téléchargement ZIP par catégorie |
| Journal des modifications | `/changelog` | Différences de données entre les mises à jour du jeu |
| À propos | `/about` | Informations sur le projet, statistiques et visualisation du pipeline |
| Remerciements | `/thank-you` | Soutiens Ko-fi et contributeurs de la communauté (séparés de la page À propos afin de pouvoir lier directement cette page) |
| Knowledge Demon | `/knowledge-demon` | Page d’information du bot Discord - commandes slash, fonctions de modération et appel à l’installation |
| Actualités | `/news` | Flux miroir des annonces Steam ; les liens canoniques renvoient vers Steam afin de compléter le contenu sans le dupliquer |
| Article d’actualité | `/news/[gid]` | Annonce Steam individuelle avec corps BBCode assaini et JSON-LD `NewsArticle` |
| Liste de niveaux | `/tier-list` | Portail des listes de niveaux Codex Score (niveaux S → F) pour les cartes / reliques / potions |
| Détails d’une liste de niveaux | `/tier-list/[type]` | Lignes visuelles S/A/B/C/D/F pour un type d’entité, provenant de `/api/runs/scores/{type}` |
| Notation | `/leaderboards/scoring` | Page consacrée à la méthodologie de Codex Score - régularisation bayésienne, poids de l’a priori, plage de l’échelle et seuils des niveaux |

## Points de terminaison de l’API

Tous les points de terminaison de données acceptent un paramètre de requête facultatif `?lang=` (valeur par défaut : `eng`). Les réponses sont **compressées avec GZip** et mises en cache avec `Cache-Control: public, max-age=300`.

| Point de terminaison | Description | Filtres |
|---|---|---|
| `GET /api/cards` | Toutes les cartes | `color`, `type`, `rarity`, `keyword`, `search`, `lang` |
| `GET /api/cards/{id}` | Une carte | `lang` |
| `GET /api/characters` | Tous les personnages | `search`, `lang` |
| `GET /api/characters/{id}` | Un personnage (avec citations et dialogues) | `lang` |
| `GET /api/relics` | Toutes les reliques | `rarity`, `pool`, `search`, `lang` |
| `GET /api/relics/{id}` | Une relique | `lang` |
| `GET /api/monsters` | Tous les monstres | `type`, `search`, `lang` |
| `GET /api/monsters/{id}` | Un monstre | `lang` |
| `GET /api/potions` | Toutes les potions | `rarity`, `pool`, `search`, `lang` |
| `GET /api/potions/{id}` | Une potion | `lang` |
| `GET /api/enchantments` | Tous les enchantements | `card_type`, `search`, `lang` |
| `GET /api/enchantments/{id}` | Un enchantement | `lang` |
| `GET /api/encounters` | Toutes les rencontres | `room_type`, `act`, `search`, `lang` |
| `GET /api/encounters/{id}` | Une rencontre | `lang` |
| `GET /api/events` | Tous les événements | `type`, `act`, `search`, `lang` |
| `GET /api/events/{id}` | Un événement | `lang` |
| `GET /api/powers` | Tous les pouvoirs | `type`, `stack_type`, `search`, `lang` |
| `GET /api/powers/{id}` | Un pouvoir | `lang` |
| `GET /api/keywords` | Définitions des mots-clés des cartes | `lang` |
| `GET /api/keywords/{id}` | Un mot-clé | `lang` |
| `GET /api/intents` | Types d’intentions des monstres | `lang` |
| `GET /api/intents/{id}` | Une intention | `lang` |
| `GET /api/orbs` | Tous les orbes | `lang` |
| `GET /api/orbs/{id}` | Un orbe | `lang` |
| `GET /api/afflictions` | Afflictions des cartes | `lang` |
| `GET /api/afflictions/{id}` | Une affliction | `lang` |
| `GET /api/modifiers` | Modificateurs de partie | `lang` |
| `GET /api/modifiers/{id}` | Un modificateur | `lang` |
| `GET /api/achievements` | Tous les succès | `lang` |
| `GET /api/achievements/{id}` | Un succès | `lang` |
| `GET /api/badges` | Tous les badges de fin de partie | `tiered`, `multiplayer_only`, `requires_win`, `search`, `lang` |
| `GET /api/badges/{id}` | Un badge avec détail des niveaux | `lang` |
| `GET /api/history/{entity_type}/{entity_id}` | Historique des versions par entité (insensible à la casse, du plus récent au plus ancien) | - |
| `GET /api/epochs` | Époques de la chronologie | `era`, `search`, `lang` |
| `GET /api/epochs/{id}` | Une époque | `lang` |
| `GET /api/stories` | Entrées de l’histoire | `lang` |
| `GET /api/stories/{id}` | Une entrée de l’histoire | `lang` |
| `GET /api/acts` | Tous les actes | `lang` |
| `GET /api/acts/{id}` | Un acte | `lang` |
| `GET /api/ascensions` | Niveaux d’Ascension (0 à 10) | `lang` |
| `GET /api/ascensions/{id}` | Un niveau d’Ascension | `lang` |
| `GET /api/stats` | Nombre d’entités dans toutes les catégories | `lang` |
| `GET /api/languages` | Langues disponibles avec leurs noms affichés | - |
| `GET /api/translations` | Tables de traduction des valeurs de filtres et des chaînes d’interface | `lang` |
| `GET /api/images` | Catégories d’images avec listes de fichiers. Les catégories préfixées par bêta acceptent `?version=`. | - |
| `GET /api/images/beta/versions` | Versions disponibles des archives d’images bêta + cible du lien symbolique `latest` | - |
| `GET /api/images/{category}/download` | Téléchargement ZIP d’une catégorie d’images. Les catégories bêta acceptent `?version=`. | - |
| `GET /api/changelogs` | Résumés des journaux des modifications (toutes les versions) | - |
| `GET /api/changelogs/{tag}` | Journal complet des modifications pour une balise de version | - |
| `GET /api/guides` | Guides communautaires | `category`, `difficulty`, `tag`, `search` |
| `GET /api/guides/{slug}` | Un guide (avec contenu Markdown) | - |
| `POST /api/guides` | Soumettre un guide (transmis à Discord) | - |
| `POST /api/runs` | Soumettre une partie (JSON d’un fichier .run) | `username` |
| `GET /api/runs/list` | Lister/parcourir les parties soumises | `character`, `win`, `username`, `seed`, `build_id`, `build_ids`, `players`, `game_mode`, `ascension`, `ascension_min`, `ascension_max`, `card`, `relic`, `today`, `sort`, `page`, `limit` |
| `GET /api/runs/shared/{hash}` | Données complètes d’une partie par hachage (fusionne le `username` provenant de la BDD) | - |
| `GET /api/runs/stats` | Statistiques communautaires agrégées | `character`, `win`, `ascension`, `game_mode`, `players` |
| `GET /api/runs/leaderboard` | Classement ordonné réservé aux victoires | `category` (`fastest`, `highest_ascension`), `character`, `players`, `game_mode`, `today`, `page`, `limit` |
| `GET /api/runs/leaderboard/rank/{hash}` | Rang d’une partie gagnée dans son classement | `category` |
| `GET /api/runs/scores/{type}` | Codex Score (score du taux de victoire régularisé par méthode bayésienne + niveau S/A/B/C/D/F) par entité | `type` = `cards`/`relics`/`potions` |
| `GET /api/runs/encounter-stats` | Agrégats par rencontre (apparitions, taux de mortalité, dégâts/tours moyens) | `act`, `room_type`, `multiplayer`, `page`, `limit` |
| `POST /api/runs/claim` | Associer un nom d’utilisateur à des parties déjà soumises au moyen de leur hachage | - |
| `GET /api/runs/versions` | Versions distinctes du jeu parmi les parties soumises | - |
| `GET /api/exports/{lang}` | ZIP contenant le JSON de toutes les entités pour une langue | `lang` |
| `GET /api/news` | Annonces Steam + actualités communautaires (archivées localement) | `feed_type`, `feedname`, `tag`, `since`, `search`, `limit`, `offset` |
| `GET /api/news/{gid}` | Un article d’actualité (corps HTML/BBCode brut) | - |
| `GET /api/merchant/config` | Configuration des prix du marchand extraite automatiquement | - |
| `POST /api/feedback` | Envoyer un commentaire (transmis à Discord) | - |
| `GET /api/versions` | Métadonnées de version exposées par la racine de données active | - |

**Comptes utilisateur** (session par cookie/JWT ; connexion avec Steam ou Discord) :

| Point de terminaison | Description |
|---|---|
| `GET /api/auth/me` | Utilisateur actuellement connecté |
| `GET /api/auth/steam/redirect` | Démarrer la connexion Steam OpenID |
| `GET /api/auth/discord/start` | Démarrer la connexion Discord OAuth |
| `POST /api/auth/logout` | Effacer le cookie de session |
| `PATCH /api/auth/username` / `PATCH /api/auth/email` | Mettre à jour les champs du profil |
| `GET /api/auth/runs` / `POST /api/auth/runs/upload` / `DELETE /api/auth/runs/{hash}` | Lister, envoyer et supprimer les parties de l’utilisateur |
| `GET /api/auth/stats` | Statistiques agrégées par utilisateur (page de profil) |
| `GET /api/auth/personal-bests` | Meilleurs temps en solo/coopération, Ascension la plus élevée, résultats quotidiens du jour et de tous les temps |
| `GET /api/auth/competitive` | Classement quotidien du jour, rangs mondiaux, taux de victoire par rapport à la communauté |

Limitation à **60 requêtes par minute** et par adresse IP. Les commentaires et les soumissions de guides sont limités à **3 à 5 par minute** et par adresse IP. Documentation interactive disponible à l’adresse `/docs` (Swagger UI).

### Localisation

Toutes les données du jeu sont proposées dans 15 langues à l’aide des propres fichiers de localisation de Slay the Spire 2. Ajoutez `?lang=` à n’importe quel point de terminaison de données. Utilisez `?channel=beta` pour les données de la bêta publique active ; les ensembles archivés d’images bêta utilisent `?version=`.

| Code | Langue | Code | Langue |
|------|----------|------|----------|
| `eng` | Anglais | `kor` | 한국어 |
| `deu` | Allemand | `pol` | Polski |
| `esp` | Espagnol (ES) | `ptb` | Português (BR) |
| `fra` | Français | `rus` | Русский |
| `ita` | Italien | `spa` | Espagnol (AL) |
| `jpn` | 日本語 | `tha` | ไทย |
| `tur` | Türkçe | `zhs` | 简体中文 |
| `zht` | 繁體中文 | | |

**Éléments localisés** : noms et descriptions des entités provenant du jeu, types de cartes, raretés, mots-clés, pouvoirs, rencontres, noms des personnages, titres des sections, routes localisées et majorité des libellés d’interface partagés.

**Éléments qui restent en anglais** : identifiants de l’API et valeurs structurelles des filtres telles que `room_type`, `type`/`stack_type` des pouvoirs et `pool`, ainsi que les marques des produits et certains contenus éditoriaux ou rédigés par la communauté.

Les paramètres de filtrage (`type=Attack`, `rarity=Rare`, `keyword=Exhaust`) utilisent toujours des valeurs anglaises, quelle que soit la langue - le backend les traduit vers les équivalents localisés avant d’effectuer la comparaison.

Exemple : `GET /api/cards?lang=kor&type=Attack` renvoie les données coréennes des cartes dont le type est « 공격 », correctement filtrées même si le paramètre est en anglais.

### Mise en forme du texte enrichi

Les champs textuels (`description`, `loss_text`, `flavor`, `text` des dialogues, `title`/`description` des options) peuvent contenir des balises de style BBCode de Godot conservées à partir des données de localisation du jeu :

| Balise | Type | Exemple | Rendu |
|---|---|---|---|
| `[gold]...[/gold]` | Couleur | `[gold]Enchant[/gold]` | Texte de couleur or |
| `[red]...[/red]` | Couleur | `[red]blood[/red]` | Texte rouge |
| `[blue]...[/blue]` | Couleur | `[blue]2[/blue]` | Texte bleu |
| `[green]...[/green]` | Couleur | `[green]healed[/green]` | Texte vert |
| `[purple]...[/purple]` | Couleur | `[purple]Sharp[/purple]` | Texte violet |
| `[orange]...[/orange]` | Couleur | `[orange]hulking figure[/orange]` | Texte orange |
| `[pink]...[/pink]` | Couleur | - | Texte rose |
| `[aqua]...[/aqua]` | Couleur | `[aqua]Ascending Spirit[/aqua]` | Texte cyan |
| `[sine]...[/sine]` | Effet | `[sine]swirling vortex[/sine]` | Texte animé ondulant |
| `[jitter]...[/jitter]` | Effet | `[jitter]CLANG![/jitter]` | Texte animé tremblant |
| `[b]...[/b]` | Effet | `[b]bold text[/b]` | Texte en gras |
| `[i]...[/i]` | Effet | `[i]whispers[/i]` | Texte en italique |
| `[energy:N]` | Icône | `[energy:2]` | Icône(s) d’énergie |
| `[star:N]` | Icône | `[star:1]` | Icône(s) d’étoile |
| `[Card]`, `[Relic]` | Espace réservé | `[Card]` | Dynamique à l’exécution (italique) |

Les balises peuvent être imbriquées : `[b][jitter]CLANG![/jitter][/b]`, `[gold][sine]swirling vortex[/sine][/gold]`.

Si vous utilisez directement l’API, vous pouvez supprimer ces balises avec une expression régulière telle que `\[/?[a-z]+(?::\d+)?\]` ou les afficher dans votre propre frontend. Le champ `description_raw` (lorsqu’il est disponible) contient le modèle SmartFormat non résolu.

## Exécution locale

### Prérequis

- Python 3.10+
- Node.js 20+

### Backend

```bash
python -m venv venv
source venv/bin/activate      # Windows : venv\Scripts\activate
pip install -r backend/requirements.txt

cd backend
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Le backend s’exécute à l’adresse **http://localhost:8000**.

### Frontend

```bash
cd frontend
npm install
NEXT_PUBLIC_API_URL=http://localhost:8000 npm run dev
```

Le frontend s’exécute à l’adresse **http://localhost:3000**.

### Docker

```bash
docker compose up --build
```

Démarre les deux services (backend sur le port 8000, frontend sur le port 3000).

### Variables d’environnement

L’API principale en lecture seule ne nécessite aucune configuration. Les fonctionnalités facultatives ci-dessous sont activées par des variables d’environnement (définies dans l’environnement du backend ou dans le fichier Compose) :

| Variable | Utilisée par | Remarques |
|---|---|---|
| `MONGO_URL` | Backend | Base de données des parties (statistiques communautaires, classements, comptes). Lorsqu’elle n’est pas définie, le backend utilise l’ancien chemin SQLite (`data/runs.db`) comme solution de secours. |
| `JWT_SECRET` | Backend | Signe les jetons de session des comptes utilisateur. |
| `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` | Backend | Connexion Discord OAuth. |
| `FRONTEND_URL`, `SPIRE_CODEX_PUBLIC_BASE` | Backend | URL de redirection / retour OAuth. |
| `ENVIRONMENT` | Backend | `production` active le comportement sécurisé des cookies. |
| `NEXT_PUBLIC_API_URL` | Frontend (construction) | Base de l’API ; vide en production afin que les images/données soient résolues depuis la même origine. |
| `NEXT_PUBLIC_CDN_URL` | Frontend (construction) | Lorsqu’elle est définie (par exemple `https://cdn.spire-codex.com`), les images sont chargées depuis le CDN plutôt que depuis `/static`. |
| `NEXT_PUBLIC_SITE_URL` | Frontend (construction) | URL canonique du site pour les métadonnées. |

Les comptes utilisateur et le CDN sont désactivés par défaut ; le projet fonctionne donc de bout en bout sans aucune de ces variables.

## Pipeline de mise à jour

Un script Python multiplateforme gère l’intégralité du processus de mise à jour lors de la sortie d’une nouvelle version du jeu :

```bash
# Pipeline complet - extraire les fichiers du jeu, analyser les données, rendre les sprites et copier les images :
python3 tools/update.py

# Indiquer manuellement le chemin d’installation du jeu :
python3 tools/update.py --game-dir "/path/to/Slay the Spire 2"

# Ignorer l’extraction (le répertoire extraction/ contient déjà une extraction récente) :
python3 tools/update.py --skip-extract

# Réanalyser uniquement les données (sans extraction ni rendu) :
python3 tools/update.py --parse-only

# Effectuer uniquement un nouveau rendu des sprites Spine :
python3 tools/update.py --render-only

# Générer un journal des modifications après la mise à jour :
python3 tools/update.py --changelog --game-version "0.98.2" --build-id "22238966"
```

Le script détecte automatiquement votre système d’exploitation et trouve le répertoire d’installation Steam. Prérequis pour chaque étape :

| Étape | Outil | Installation |
|---|---|---|
| Extraction du PCK | `gdre_tools` | [Versions de GDRE Tools](https://github.com/bruvzg/gdsdecomp/releases) |
| Décompilation de la DLL | `ilspycmd` | `dotnet tool install ilspycmd -g` |
| Analyse des données | Python 3.10+ | Intégré |
| Copie des images | Python 3.10+ | Intégré |
| Rendu Spine | Node.js 20+ | [nodejs.org](https://nodejs.org) |

### Étapes manuelles

Si vous préférez exécuter les étapes individuellement :

```bash
# Analyser toutes les données (les 15 langues)
cd backend/app/parsers && python3 parse_all.py

# Analyser une seule langue
cd backend/app/parsers && python3 parse_all.py --lang eng

# Copier les images de l’extraction vers les fichiers statiques (PNG + WebP depuis la même source - aucune
# chaîne avec perte passant par un WebP existant du backend). WebP avec quality=95, method=6.
python3 backend/scripts/copy_images.py

# Rendre les sprites Spine (WebGL - aucun artefact de raccord triangulaire)
cd tools/spine-renderer && npm install
npx playwright install chromium           # Uniquement la première fois
node render_all_webgl.mjs                 # Les 138 squelettes via Chrome sans interface graphique
node render_webgl.mjs <skel_dir> <out> [size] [--skin=a,b] [--anim=name] [--anim-time=N]

# Remplacements courants propres à certains monstres :
#   --skin=moss1,diamondeye   combiner les skins des variantes avec celui par défaut (cubex_construct)
#   --skin=skin1              remplacer le skin par défaut par une variante (scroll_of_biting)
#   --anim-time=0.5           faire avancer l’animation de N secondes avant l’instantané
#   --anim=attack             remplacer l’animation d’inactivité sélectionnée automatiquement
#
# Substitution des espaces réservés de fumée : gas_bomb_2.png, the_forgotten_2.png et
# living_smog_2.png sont fournis dans la source sous forme de panneaux magenta « Smoke Placeholder ».
# render_webgl.mjs les remplace par un nuage prune sombre généré procéduralement
# aux mêmes dimensions avant l’envoi à GL, puis force slot.color.a = 1.0
# sur les emplacements substitués (les artistes ont défini une faible opacité en prévision d’un shader).

# Recadrer les sprites de monstres sous-dimensionnés (post-traitement - rognage selon la véritable
# boîte englobante alpha, puis mise à l’échelle pour remplir environ 92 % du cadre de 512x512) :
python3 tools/rescale_bestiary.py fuzzy_wurm_crawler thieving_hopper terror_eel

# Ancien moteur de rendu Canvas (présente des artefacts de raccord triangulaire - à éviter)
# node render_all.mjs / node render.mjs
```

## Système de journal des modifications

Suivez les changements entre les mises à jour du jeu grâce à des différences au niveau des champs dans toutes les catégories d’entités.

### Génération d’un journal des modifications

```bash
# Comparer les données actuelles à une référence Git :
python3 tools/diff_data.py HEAD~1 --format json \
    --game-version "0.98.2" --build-id "22238966" \
    --title "March Update"

# Prévisualiser au format texte ou Markdown :
python3 tools/diff_data.py HEAD~1 --format text
python3 tools/diff_data.py HEAD~1 --format md
```

### Schéma du journal des modifications

Chaque fichier JSON de journal des modifications contient :

| Champ | Description |
|---|---|
| `app_id` | ID d’application Steam (2868840) |
| `game_version` | Version Steam du jeu (par exemple `"0.98.2"`) |
| `build_id` | ID de build Steam |
| `tag` | Clé de version unique (par exemple `"1.0.3"`) |
| `date` | Date de la mise à jour |
| `title` | Titre lisible |
| `summary` | Nombres : `{ added, removed, changed }` |
| `features` / `fixes` / `api_changes` | Notes de version rédigées manuellement. Conservées lors des régénérations par `diff_data.py` d’une balise existante : la différence de données est remplacée, mais ces tableaux sont fusionnés. |
| `categories` | Différences par catégorie, avec entités ajoutées/supprimées/modifiées. Les changements de champs parcourent récursivement les dictionnaires/listes imbriqués afin que chaque feuille occupe sa propre ligne (par exemple `vars.DamageVar: 8 → 10`) au lieu d’un résumé opaque comme `vars: 2 fields → 2 fields`. |

### Conservation en écriture unique

Les fichiers sous `data/changelogs/` sont des archives historiques en écriture unique. `.github/workflows/changelog-guard.yml` bloque toute PR qui **modifie ou supprime** un journal des modifications existant. Les nouveaux fichiers (`A`) sont toujours autorisés ; les modifications nécessitent l’étiquette `changelog-edit-approved` sur la PR. Consultez `CONTRIBUTING.md → Changelog Retention` pour connaître la politique et la procédure de dérogation.

### Historique par entité

`GET /api/history/{entity_type}/{entity_id}` parcourt tous les journaux des modifications et renvoie, du plus récent au plus ancien, les entrées ayant affecté l’entité demandée. Le volet Historique des versions de chaque page détaillée (`/cards/{id}`, `/monsters/{id}`, etc.) repose sur ce point de terminaison.

## Déploiement

### CI/CD (GitHub Actions)

Les envois vers `main` déclenchent `.github/workflows/ci.yml` sur l’exécuteur Kubernetes auto-hébergé. Le workflow effectue l’analyse des secrets, les vérifications ESLint et TypeScript, les contrôles de lint et de formatage avec ruff, puis construit et envoie les images stables sous la balise `:latest`. Il continue également à construire les images bêta autonomes sous `:beta` pour `docker-compose.beta.yml` ; ces images sont conservées pour les opérations, mais les pages bêta publiques sont servies par le déploiement principal sous `/beta`.

Le frontend stable reçoit `UMAMI_WEBSITE_ID`. L’image bêta autonome reçoit `UMAMI_BETA_WEBSITE_ID`, même si le trafic public vers `/beta` utilise le frontend stable et sa propriété d’analyse.

La CI ne procède **pas** au déploiement. La tâche de déploiement automatique exécutée toutes les heures sur l’hôte DigitalOcean s’en charge.

> **Remarque :** `.forgejo/workflows/build.yml` est conservé comme solution de secours inactive fondée sur buildah.

### Construction locale + envoi

Ignorez la CI et envoyez directement depuis votre machine :

```bash
# Construire et envoyer les deux images :
python3 tools/deploy.py

# Frontend uniquement :
python3 tools/deploy.py --frontend

# Backend uniquement :
python3 tools/deploy.py --backend

# Tester la construction sans envoyer :
python3 tools/deploy.py --no-push

# Étiqueter une version :
python3 tools/deploy.py --tag v0.98.2

# Construire et envoyer les images bêta (balise :beta, ignore IndexNow) :
python3 tools/deploy.py --beta
```

Détecte automatiquement Apple Silicon et effectue une compilation croisée vers `linux/amd64` au moyen de `docker buildx`. Nécessite d’avoir exécuté `docker login` au préalable.

### Production

L’application publique et la pile bêta autonome conservée s’exécutent sur le même hôte DigitalOcean. Le trafic public utilise `spire-codex.com` ; l’hôte Lightsail secondaire exécute MongoDB.

**Déploiement automatique** - une tâche cron exécutée toutes les heures sur l’hôte DigitalOcean lance `/usr/local/bin/spire-codex-autodeploy` à la 3e minute. Lorsque le commit extrait avance, elle récupère les changements et recrée `docker-compose.prod.yml` et `docker-compose.beta.yml`, sauf pour les mises à jour limitées à `data/news/*`. Elle purge ensuite le cache Cloudflare. Les journaux sont écrits dans `/var/log/spire-codex-autodeploy.log`. Consultez [`infrastructure/ansible/README.md`](infrastructure/ansible/README.md) pour les instructions d’installation et d’exploitation.

**Déploiement manuel** :

```bash
cd infrastructure/ansible
./bin/do-ansible playbooks/deploy.yml

# Pile bêta autonome conservée
./bin/do-ansible playbooks/deploy.yml -e compose_file=docker-compose.beta.yml
```

Les données de production sont montées par liaison (`./data:/data:ro` pour le frontend et en lecture-écriture pour le backend). Les actualités et l’état des parties sont lus à la demande depuis les données montées ; les mises à jour de `data/news/*.json` ne nécessitent donc pas le redémarrage d’un conteneur.

### Canal bêta (spire-codex.com/beta)

L’application publique propose les données stables et celles de la branche Steam `public-beta` sous la forme de deux canaux de contenu. Les pages bêta se trouvent à l’adresse [`spire-codex.com/beta`](https://spire-codex.com/beta), avec des routes localisées sous `/{lang}/beta/...`. La page principale `/images` expose également les versions archivées des ressources bêta.

`beta.spire-codex.com` n’est plus utilisé publiquement. Cloudflare envoie actuellement une redirection `302` qui conserve le chemin vers le domaine racine, mais n’ajoute ni `/beta` ni `channel=beta`. Les anciens liens de pages aboutissent donc à la page stable correspondante, tandis que les anciennes requêtes d’API reçoivent des données stables après avoir suivi la redirection. Les nouveaux clients de l’API doivent utiliser l’API principale avec un canal explicite, par exemple `https://spire-codex.com/api/cards?channel=beta`.

**Architecture** : `get_channel` résout `?channel=beta|stable` dans une `ContextVar` Python ; il comprend également un en-tête d’hôte `beta.*` pour le trafic direct vers l’origine. `data_service.py` charge les requêtes bêta depuis `data-beta/<latest>/` et se rabat sur les données stables fichier par fichier. `GET /api/beta/diff` et `GET /api/beta/version` décrivent la bêta active, et le frontend affiche le canal sélectionné sous `/beta`.

La pile distincte `docker-compose.beta.yml` et les images `:beta` continuent d’être construites et recréées par l’automatisation du déploiement. Elles ne constituent pas le site bêta public tant que la redirection Cloudflare est active.

**Organisation des données** : chaque build archivé réside sous `data-beta/<version>/`, et le pointeur `latest` sélectionne le build actif. Chaque version possède son propre répertoire `changelogs/`. Les archives d’images bêta reproduisent cette organisation sous `backend/static/images/beta/<version>/{cards,monsters,misc,ui,vfx}/`.

**Ingestion automatisée** - `tools/beta-watch/` s’exécute comme tâche launchd sur le Mac de développement le jeudi, de 15 h à 22 h 45, toutes les 15 minutes. Lorsque SteamCMD signale un nouvel ID de build `public-beta`, il extrait et décompile le jeu, analyse toutes les langues, génère la différence, synchronise les images versionnées et ouvre une PR `auto/beta-<version>`. Consultez [`tools/beta-watch/README.md`](tools/beta-watch/README.md) pour les instructions d’installation et d’exploitation.

**Ingestion manuelle** :

```bash
VERSION=vX.Y.Z
PREVIOUS=vA.B.C

# Commencer par extraire et décompiler les fichiers bêta du jeu, puis effectuer l’analyse depuis la racine du dépôt.
(cd backend/app/parsers && \
  EXTRACTION_DIR=../../../extraction/beta \
  DATA_DIR="../../../data-beta/$VERSION" \
  python3 parse_all.py)

VERSION="$VERSION" tools/beta-watch/sync-images.sh

python3 tools/diff_data.py "data-beta/$PREVIOUS/eng" "data-beta/$VERSION/eng" \
  --format json --output-dir "data-beta/$VERSION/changelogs" \
  --game-version "${VERSION#v}" --title "Beta ${VERSION#v}"
```

`sync-images.sh` met à jour le lien symbolique d’image `latest`. La PR d’ingestion contient les modifications versionnées des données et des images ; après la fusion, le déploiement automatique actualise les deux piles conservées.

## Moteur de rendu Spine

Les sprites des monstres de StS2 sont des animations squelettiques [Spine](http://esotericsoftware.com/) : chaque monstre correspond à un squelette binaire `.skel`, un atlas `.atlas` et une feuille de sprites `.png`, et non à une image unique. Le moteur de rendu les assemble en portraits PNG statiques.

### Moteur de rendu WebGL (actuel)

Le moteur de rendu WebGL (`render_webgl.mjs`, `render_all_webgl.mjs`) utilise **Playwright + spine-webgl** pour rendre les squelettes au moyen du processeur graphique de Chrome sans interface graphique. Il produit des rendus propres, **sans artefacts de raccord triangulaire**.

**Fonctionnement :**
1. Lance Chrome sans interface graphique via Playwright avec WebGL activé
2. Charge dans la page du navigateur les données du squelette, l’atlas et les textures encodés en base64
3. Crée un canevas WebGL et configure le shader spine-webgl ainsi que le traitement des lots de polygones
4. Applique l’animation d’inactivité et calcule les limites (en excluant les emplacements d’ombre/de sol)
5. Effectue le rendu au moyen de la rastérisation des triangles par le processeur graphique - aucun chemin de découpage Canvas, aucun raccord
6. Lit les pixels bruts au moyen de `gl.readPixels` et les retourne verticalement (WebGL travaille de bas en haut)
7. Écrit le PNG avec node-canvas afin de préserver la transparence

**Un seul squelette :**
```bash
node render_webgl.mjs <skel_dir> <output_path> [size]
node render_webgl.mjs ../../extraction/raw/animations/backgrounds/neow_room ../../backend/static/images/misc/neow.png 2048
```

**Tous les squelettes par lots :**
```bash
node render_all_webgl.mjs  # Rend 138 squelettes dans backend/static/images/renders/
```

### Couverture du rendu

| Catégorie | Rendus | Total | Remarques |
|---|---|---|---|
| Monstres | 99 | 103 répertoires | Les 111 monstres du jeu disposent tous d’images (99 rendus + alias/ressources statiques) |
| Personnages | 16 | 16 | Poses de combat, de site de repos et de sélection |
| Arrière-plans/PNJ | 14 | 17 | Neow, Tezcatara, salles des marchands, menu principal |
| VFX/Interface | 9 | 22 | La plupart des VFX nécessitent des images d’animation précises |
| **Total** | **138** | **158** | 20 ignorés (aucun atlas, VFX uniquement, vides) |

### Moteur de rendu d’animations

Le moteur de rendu d’animations (`render_gif.mjs`) rend les animations d’inactivité/d’attaque Spine au format WebP animé, GIF ou APNG. Il prend en charge les variantes de skin, la sélection des animations et l’écriture en flux des images sur le disque pour les animations volumineuses.

**Formats de sortie pris en charge :**
- **`.webp`** (recommandé) - WebP animé sans perte avec transparence alpha complète, environ 33 % plus petit que l’APNG. Les images sont écrites progressivement sur le disque afin d’éviter un dépassement de mémoire.
- **`.gif`** - 256 couleurs, transparence binaire. Fichiers les plus petits, mais qualité la plus faible.
- **`.apng`** - Transparence alpha complète comme WebP, mais fichiers plus volumineux.

```bash
# Rendre un WebP animé sans perte (recommandé)
NODE_OPTIONS="--max-old-space-size=8192" node render_gif.mjs <skel_dir> <output.webp> [size] [--fps=N]

# Avec une variante de skin (pour bowlbug, les cultistes, cubex, etc.)
node render_gif.mjs <skel_dir> output.webp 256 --fps=10 --skin=rock

# Animation précise (par défaut : boucle d’inactivité)
node render_gif.mjs <skel_dir> output.webp 256 --fps=12 --anim=attack

# Mode silhouette blanche (pour les icônes de nœuds de boss sur la carte)
node render_gif.mjs <skel_dir> output.webp 256 --white
```

**Bibliothèque d’animations :** 209 WebP animés sans perte :
- 15 animations de personnages (combat/sélection/repos × 5 personnages) en 512 × 512
- 103 animations d’inactivité de monstres en 256 × 256
- 91 animations d’attaque de monstres en 256 × 256

**Variantes de skin :** 13 monstres possèdent des variantes de skin (bowlbug, cubex_construct, cultistes, etc.). Utilisez `--skin=` pour en sélectionner une. Le skin par défaut n’affiche souvent que le squelette de base sans le corps.

**Shader des nœuds de boss sur la carte :** le jeu utilise `boss_map_point.gdshader`, qui traite les canaux RVB comme des masques :
- **Canal rouge** × `map_color` (par défaut : beige `0.671, 0.58, 0.478`) → couleur de remplissage
- **Canal bleu** × `black_layer_color` (par défaut : noir `0, 0, 0`) → couleur du contour
- **Canal vert** × blanc `1, 1, 1` → reflets

### Ancien moteur de rendu Canvas

Le moteur de rendu Canvas (`render.mjs`, `render_all.mjs`) utilise `spine-canvas` avec `triangleRendering = true`. Il produit des **artefacts visibles de maillage filaire** en raison de l’anticrénelage des chemins `clip()` de Canvas entre les triangles adjacents. Utilisez plutôt le moteur de rendu WebGL.

### Dépendances

- `@esotericsoftware/spine-webgl` ^4.2.107 - Environnement d’exécution Spine pour WebGL (actuel)
- `playwright` - Chrome sans interface graphique pour le rendu WebGL
- `gif-encoder-2` - Encodage GIF pour le moteur de rendu d’animations
- `canvas` ^3.1.0 - Implémentation Canvas pour Node.js (tampon d’images pour le moteur de rendu d’animations)
- `Pillow` (Python) - Assemble les WebP/APNG à partir des images PNG rendues
- `@esotericsoftware/spine-canvas` ^4.2.106 - Environnement d’exécution Spine pour Canvas (ancien)

## Extraction des fichiers du jeu

Si vous devez effectuer une extraction à partir de zéro :

```bash
# Extraire le PCK (GDRE Tools)
/path/to/gdre_tools --headless --recover="/path/to/sts2.pck" --output-dir=extraction/raw

# Décompiler la DLL (CLI ILSpy)
ilspycmd -p -o extraction/decompiled "/path/to/sts2.dll"
```

Emplacements d’installation Steam :
- **Windows** : `C:\Program Files (x86)\Steam\steamapps\common\Slay the Spire 2\`
- **macOS** : `~/Library/Application Support/Steam/steamapps/common/Slay the Spire 2/`
- **Linux** : `~/.local/share/Steam/steamapps/common/Slay the Spire 2/`

## Gestion des versions

Spire Codex utilise une gestion sémantique des versions au format **`1.X.Y`** :

| Segment | Signification |
|---------|---------|
| **1** | Version majeure de Spire Codex (reste inchangée sauf réécriture complète) |
| **X** | Incrémenté lorsque Mega Crit publie un correctif du jeu |
| **Y** | Incrémenté pour nos propres corrections et améliorations des analyseurs/du frontend |

Exemples : `v1.0.0` = version initiale, `v1.0.1` = nos corrections de bogues, `v1.1.0` = intégration du premier correctif de Mega Crit.

## SEO

- **Données structurées (JSON-LD)** : WebSite + VideoGame (accueil), CollectionPage + ItemList (pages de listes), Article + BreadcrumbList + FAQPage (pages détaillées), SoftwareApplication (développeurs), NewsArticle (news/[gid])
- **Format des titres** : `"Slay the Spire 2 (sts2) {Page Title} | Spire Codex"` - normalisé sur toutes les pages. Les parties utilisent `"{username} - {char} - Ascension {N} {win/loss} - Slay the Spire 2 (sts2) | Spire Codex"`. « (sts2) » est inclus afin que les recherches multilingues `sts2 tier list` / `sts2 card list` correspondent.
- **Plan du site** : XML plat à l’adresse `/sitemap.xml` avec `force-dynamic` (rendu côté serveur, et non au moment de la construction). Plus de 20 000 URL, comprenant les pages détaillées des entités, les pages matricielles de navigation, les pages de listes de niveaux, la méthodologie de notation, les détails `runs/[hash]` et les versions i18n de tous les types d’entités
- **SEO international** : routes `/{lang}/` pour les 14 langues autres que l’anglais, avec alternatives hreflang **bidirectionnelles** - les pages racines anglaises émettent également des alternatives pour chaque langue + `x-default` au moyen de `buildLanguageAlternates(path)` dans `lib/seo.ts` (corrige le groupe « Crawled - not indexed » de contenu dupliqué dans GSC, où Google considérait les pages localisées comme des doublons en l’absence de références inverses)
- **SEO programmatique** : 41 pages de navigation parmi les cartes sous `/cards/browse/` (rare-attacks, ironclad-skills, etc.) + 3 pages de listes de niveaux (`/tier-list/{cards,relics,potions}`)
- **EntityProse tenant compte de la langue** : les pages détaillées affichent un court paragraphe propre à la langue plutôt qu’un corps anglais identique dans toutes les langues
- **Liens internes** : pouvoirs ↔ cartes, rencontres → monstres, mots-clés des cartes → pages du portail des mots-clés, actions des monstres → pages des pouvoirs (avec infobulles), pages des actes → rencontres/événements, lignes des listes de niveaux → onglet Statistiques des détails d’entités
- **Open Graph et Twitter Cards** : images OG par entité, Twitter Cards `summary_large_image`
- **URL canoniques** : chaque page déclare une URL canonique

## Widgets intégrables

### Widget d’infobulle
Ajoutez à n’importe quel site web des infobulles au survol pour les 13 types d’entités :
```html
<script src="https://spire-codex.com/widget/spire-codex-tooltip.js"></script>
<p>Start with [[Bash]] and [[relic:Burning Blood]].</p>
```

### Widget de journal des modifications
Intégrez une visionneuse interactive du journal des modifications :
```html
<div id="scx-changelog"></div>
<script src="https://spire-codex.com/widget/spire-codex-changelog.js"></script>
```

Documentation complète : [spire-codex.com/developers](https://spire-codex.com/developers)

## Feuille de route

- ~~Pages détaillées individuelles~~ ✅
- ~~Recherche globale~~ ✅
- ~~Prise en charge multilingue (15 langues)~~ ✅
- ~~SEO (JSON-LD, OG/Twitter, plan du site, hreflang)~~ ✅
- ~~Widget d’infobulle (les 13 types d’entités)~~ ✅
- ~~Pages de comparaison des personnages (10 paires)~~ ✅
- ~~Pages du portail des mots-clés~~ ✅
- ~~Guide du marchand (prix issus du C# décompilé)~~ ✅
- ~~Documentation pour les développeurs + exports de données~~ ✅
- ~~SEO international (13 pages d’accueil linguistiques)~~ ✅
- ~~Matrice de navigation des cartes (41 pages SEO programmatiques)~~ ✅
- ~~Guides communautaires~~ ✅ - Markdown avec métadonnées YAML, formulaire de soumission, widget d’infobulle et réseaux sociaux de l’auteur
- ~~Page des mécaniques du jeu~~ ✅ - 27 pages SEO individuelles : taux d’obtention, combat, carte, boss, secrets et anecdotes
- ~~Parties communautaires~~ ✅ - Soumission de parties, navigateur, parties partagées, statistiques en direct
- ~~Descriptions des améliorations de cartes~~ ✅ - `upgrade_description` pour les 403 cartes améliorables
- ~~Pouvoirs innés des monstres~~ ✅ - 42 monstres avec des pouvoirs provenant de `AfterAddedToRoom`
- ~~Conditions de déverrouillage des succès~~ ✅ - Catégorie, personnage et seuil provenant du code source C#
- ~~Schémas d’attaque des monstres~~ ✅ - 112 monstres avec IA cyclique/aléatoire/conditionnelle/mixte provenant des machines à états C#
- ~~Conditions préalables des événements~~ ✅ - 25 événements avec conditions `IsAllowed()` analysées depuis le code source C#
- ~~Conservation des archives bêta~~ ✅ - Les données et images bêta versionnées restent préservées ; `/beta` sert le build actif et `/images` permet de parcourir les ressources archivées
- ~~Bot Discord~~ ✅ - [Knowledge Demon](https://bot.spire-codex.com) : commandes slash pour chaque entité (`/card`, `/relic`, `/monster`, `/potion`, `/character`, `/event`, `/power`, `/enchantment`, `/lookup`, `/meta`), RSS des actualités Steam, ainsi qu’une boîte à outils complète de modération dérivée de [Kernel](https://github.com/ptrlrd/kernel)
- ~~Codex Score et liste de niveaux~~ ✅ - Note par entité calculée à partir des parties de la communauté au moyen d’une **régularisation bayésienne** : `shrunk = (wins + PRIOR_WEIGHT × baseline) / (n + PRIOR_WEIGHT)`, puis ramenée sur une échelle de 0 à 100 et associée à S/A/B/C/D/F. Évite le bruit dû aux échantillons trop petits (une carte jouée une seule fois avec un résultat de 1/1 n’obtient pas S - elle régresse vers l’a priori). Préchauffé au démarrage du backend. Présenté sous forme de `ScoreBadge` dans l’onglet Statistiques des pages détaillées, sur les pages dédiées aux listes de niveaux et sur la page de méthodologie à l’adresse `/leaderboards/scoring`.
- ~~Onglet Statistiques des pages détaillées~~ ✅ - Badge principal de score + résumé rédigé + liens vers les parties récentes via `EntityRunStats`.
- **Constructeur de deck** - Conception théorique interactive de decks
- **Backend de base de données** - Remplacer le chargement des fichiers JSON par langue par PostgreSQL JSONB (ou une autre solution). Le stockage des parties soumises a déjà migré de SQLite vers MongoDB (mai 2026).

## Remerciements

Merci à **vesper-arch**, **terracubist**, **U77654**, **Purple Aspired Dreaming**, **Kobaru** et **Severi** pour les tests d’assurance qualité, les rapports de bogues et les contributions. La liste complète des soutiens - y compris les donateurs Ko-fi qui permettent au projet de continuer à fonctionner - se trouve à l’adresse [spire-codex.com/thank-you](https://spire-codex.com/thank-you).

## Pile technologique

- **Backend** : Python, FastAPI, Pydantic, slowapi, compression GZip
- **Base de données des parties** : MongoDB (statistiques communautaires, classements, comptes utilisateur), avec une collection `stats_summary` matérialisée et un processus d’actualisation en arrière-plan avec élection d’un leader. L’ancien chemin SQLite est conservé comme solution de secours hors ligne.
- **Comptes** : Steam OpenID + Discord OAuth, cookies de session JWT
- **Frontend** : Next.js 16 (App Router), TypeScript, Tailwind CSS, prise en charge de 15 langues
- **Images/CDN** : Cloudflare R2 servi via `cdn.spire-codex.com` (webp)
- **Analyse et observabilité** : Umami auto-hébergé, Prometheus + node-exporter
- **Moteur de rendu Spine** : Node.js, Playwright, @esotericsoftware/spine-webgl (WebGL via Chrome sans interface graphique)
- **Infrastructure** : Docker, CI GitHub Actions (exécuteur auto-hébergé) avec cache BuildKit adossé à un registre, déploiement Ansible/SSH
- **Outils** : Python (pipeline de mise à jour, comparaison des journaux des modifications, copie des images)

## Licence

- **Code source** : [PolyForm Noncommercial 1.0.0](LICENSE.md) - utilisation, modification et redistribution gratuites à des fins non commerciales. La vente du logiciel n’est pas autorisée.
- **API hébergée** : [API_TERMS.md](API_TERMS.md) - gratuite pour tout usage dans les limites de débit publiées ; contactez-nous sur Discord ou dans un ticket si vous avez besoin de davantage.
- **Données du jeu** (cartes, reliques, monstres, etc.) : © Mega Crit Games. Proposées ici comme référence communautaire dans le cadre de l’usage loyal / à des fins éducatives. N’utilisez pas ces données pour recompiler, reconditionner ou redistribuer le jeu.

Les contributions sont acceptées selon les mêmes conditions PolyForm Noncommercial 1.0.0 - consultez [CONTRIBUTING.md](CONTRIBUTING.md#license).
