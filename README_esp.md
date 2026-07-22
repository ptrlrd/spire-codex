<p align="center">
  <img src="frontend/public/spire-codex-white-silent-black-background.png" alt="Logotipo de Spire Codex" width="200" />
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

Una completa base de datos y API para los datos de **Slay the Spire 2**, creada mediante ingeniería inversa de los archivos del juego. Es compatible con los **15 idiomas** incluidos con el juego.

**Sitio web**: [spire-codex.com](https://spire-codex.com)

**ID de la aplicación de Steam**: 2868840

## Cómo se creó

Slay the Spire 2 está desarrollado con Godot 4, pero toda la lógica del juego reside en una DLL de C#/.NET 8 (`sts2.dll`), no en GDScript. La canalización de datos:

1. **Extracción del PCK** - [GDRE Tools](https://github.com/bruvzg/gdsdecomp) extrae el archivo `.pck` de Godot para recuperar imágenes, animaciones de Spine y datos de localización (unos 9947 archivos).

2. **Descompilación de la DLL** - [ILSpy](https://github.com/icsharpcode/ILSpy) descompila `sts2.dll` en unos 3300 archivos de código fuente C# legibles que contienen todos los modelos del juego.

3. **Análisis de datos** - 22 analizadores de Python basados en expresiones regulares extraen datos estructurados del código fuente C# descompilado y generan JSON por idioma en `data/{lang}/`:
   - **Cartas**: constructores `base(cost, CardType, CardRarity, TargetType)` + `DamageVar`, `BlockVar`, `PowerVar<T>` para las estadísticas
   - **Personajes**: `StartingHp`, `StartingGold`, `MaxEnergy`, `StartingDeck`, `StartingRelics`
   - **Reliquias/Pociones**: rareza, reserva y descripciones resueltas a partir de plantillas SmartFormat
   - **Monstruos**: intervalos de PV, escalado de ascensión mediante `AscensionHelper`, máquinas de estados de movimientos con intenciones por movimiento (Attack/Defend/Buff/Debuff/Status/Summon/Heal), valores de daño, número de golpes (incluidos patrones de AscensionHelper), poderes innatos de `AfterAddedToRoom` (42 monstruos con variantes de ascensión), poderes aplicados por movimiento (objetivo + cantidad de `PowerCmd.Apply<T>`), bloqueo, curación, contexto del encuentro (acto, tipo de sala), **patrones de ataque** analizados a partir de `GenerateMoveStateMachine()` (112 monstruos: cíclicos, aleatorios, condicionales y mixtos)
   - **Encantamientos**: restricciones por tipo de carta, acumulabilidad y escalado basado en Amount
   - **Encuentros**: composiciones de monstruos, tipo de sala (Boss/Elite/Monster), ubicación en el acto y etiquetas
   - **Eventos**: árboles de decisiones de varias páginas (56 de 66 eventos), elecciones con resultados, ubicación en el acto, referencias de modelo `StringVar` resueltas a nombres visibles, valores calculados en tiempo de ejecución (costes crecientes mediante `GetDecipherCost()`, intervalos de oro mediante `CalculateVars` con `NextInt`/`NextFloat`, patrones de curación total), **condiciones previas** de `IsAllowed()` (25 eventos: condiciones de oro, PV, acto, mazo, reliquia y poción)
   - **Ancianos**: 8 PNJ Ancianos con epítetos, diálogos específicos de cada personaje, ofertas de reliquias e iconos de retrato
   - **Poderes**: PowerType (Buff/Debuff), PowerStackType (Counter/Single), DynamicVars y descripciones
   - **Épocas/Historias**: datos de progreso de la cronología con requisitos de desbloqueo
   - **Orbes**: valores pasivos/de evocación y descripciones
   - **Aflicciones**: acumulabilidad, texto adicional de la carta y descripciones
   - **Modificadores**: descripciones de los modificadores de partida
   - **Palabras clave**: definiciones de palabras clave de las cartas (Exhaust, Ethereal, Innate, etc.)
   - **Intenciones**: descripciones de las intenciones de los monstruos con iconos
   - **Logros**: condiciones de desbloqueo, descripciones, categorías, personaje asociado y umbrales obtenidos del código fuente C# (33 logros)
   - **Actos**: orden de descubrimiento de jefes, encuentros, eventos, ancianos y número de salas
   - **Niveles de ascensión**: 11 niveles (0–10) con descripciones de la localización
   - **Reservas de pociones**: reservas específicas de cada personaje analizadas a partir de clases de reserva y referencias de época
   - **Traducciones**: mapas de filtros por idioma (tipos de carta, rarezas, palabras clave → nombres localizados) y cadenas de interfaz (títulos de sección, descripciones y nombres de personajes) para que las use el frontend

4. **Resolución de descripciones** - Un módulo compartido `description_resolver.py` resuelve las plantillas de localización SmartFormat (`{Damage:diff()}`, `{Energy:energyIcons()}`, `{Cards:plural:card|cards}`) como texto legible con marcadores de texto enriquecido para su representación en el frontend. Las variables dinámicas en tiempo de ejecución (p. ej., `{Card}`, `{Relic}`) se conservan como marcadores de posición legibles. Las referencias `StringVar` de los eventos (p. ej., `{Enchantment1}` → `ModelDb.Enchantment<Sharp>().Title`) se resuelven como nombres visibles mediante una consulta de localización.

5. **Renderizado de Spine** - Los personajes y monstruos son animaciones esqueléticas de Spine, no imágenes estáticas. Un renderizador Node.js sin interfaz gráfica compone poses de reposo en PNG de retrato de 512×512. Los 111 monstruos tienen imágenes: 100 renderizadas a partir de esqueletos de Spine, 6 como alias de esqueletos compartidos (Flyconid→flying_mushrooms, Ovicopter→egg_layer, Crusher/Rocket→kaiser_crab) y 5 procedentes de recursos estáticos del juego (Doormaker). También renderiza los 5 personajes (poses de combate, zona de descanso y selección de personaje), PNJ y fondos. Las variantes basadas en aspectos (Cultists, Bowlbugs, Cubex) se renderizan por separado. Consulta [Renderizador de Spine](#renderizador-de-spine) más abajo.

6. **Imágenes** - Retratos de cartas, iconos de reliquias/pociones, ilustraciones de personajes, sprites de monstruos, iconos de retrato de Ancianos e iconos de encuentros con jefes extraídos de los recursos del juego y servidos como archivos estáticos.

7. **Comparación de registros de cambios** - Una herramienta de diferencias compara los datos JSON entre versiones del juego (mediante referencias de git o directorios) y registra las entidades añadidas/eliminadas/modificadas por categoría, con diferencias por campo. Los registros de cambios se identifican mediante la versión del juego en Steam y un número de revisión opcional de Codex.

## Estructura del proyecto

```
spire-codex/
├── backend/                    # Backend FastAPI
│   ├── app/
│   │   ├── main.py             # Entrada de la aplicación, CORS, GZip, limitación de solicitudes y archivos estáticos
│   │   ├── dependencies.py     # Dependencias compartidas (validación de idioma y nombres de idiomas)
│   │   ├── routers/            # Endpoints de la API (más de 25 routers)
│   │   ├── models/schemas.py   # Modelos Pydantic
│   │   ├── services/           # Carga de datos JSON (caché LRU, compatibilidad con 14 idiomas)
│   │   └── parsers/            # Analizadores de código fuente C# → JSON
│   │       ├── card_parser.py
│   │       ├── character_parser.py
│   │       ├── monster_parser.py
│   │       ├── relic_parser.py
│   │       ├── potion_parser.py
│   │       ├── enchantment_parser.py
│   │       ├── encounter_parser.py
│   │       ├── event_parser.py
│   │       ├── power_parser.py
│   │       ├── keyword_parser.py        # Palabras clave, intenciones, orbes, aflicciones, modificadores y logros (con condiciones de desbloqueo)
│   │       ├── guide_parser.py          # Guías Markdown con metadatos YAML
│   │       ├── epoch_parser.py
│   │       ├── act_parser.py
│   │       ├── ascension_parser.py
│   │       ├── pool_parser.py            # Añade la reserva del personaje a las pociones
│   │       ├── translation_parser.py    # Genera translations.json por idioma
│   │       ├── description_resolver.py   # Resolutor SmartFormat compartido
│   │       ├── parser_paths.py           # Configuración compartida de rutas (anulaciones mediante variables de entorno para la beta)
│   │       └── parse_all.py              # Orquesta todos los analizadores (15 idiomas)
│   ├── static/images/          # Imágenes del juego (no incluidas en el repositorio)
│   ├── scripts/copy_images.py  # Copia imágenes de la extracción → static
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/                   # Next.js 16 + TypeScript + Tailwind CSS
│   ├── app/
│   │   ├── contexts/           # LanguageContext, BetaVersionContext
│   │   ├── components/         # CardGrid, RichDescription, SearchFilter,
│   │   │                       #   GlobalSearch, Navbar, Footer, LanguageSelector, VersionSelector
│   │   └── ...                 # Páginas: cards, characters, relics, monsters, potions,
│   │                           #   enchantments, encounters, events, powers, timeline,
│   │                           #   reference, images, changelog, about, merchant, compare,
│   │                           #   mechanics/[slug], guides/[slug], guides/submit,
│   │                           #   leaderboards, leaderboards/submit, leaderboards/stats,
│   │                           #   runs/[hash] (vista de partida compartida)
│   │                           #   Páginas de detalles: cards/[id], characters/[id], relics/[id],
│   │                           #   monsters/[id], potions/[id], enchantments/[id],
│   │                           #   encounters/[id], events/[id], powers/[id], keywords/[id],
│   │                           #   acts/[id], ascensions/[id], intents/[id], orbs/[id],
│   │                           #   afflictions/[id], modifiers/[id], achievements/[id]
│   │                           #   i18n: [lang]/... replica todas las rutas para 14 idiomas distintos del inglés
│   ├── lib/
│   │   ├── api.ts              # Cliente de API + interfaces de TypeScript
│   │   ├── fetch-cache.ts      # Caché de obtención en memoria del cliente (TTL de 5 min)
│   │   ├── seo.ts              # Utilidades SEO compartidas (stripTags, SITE_URL, SITE_NAME)
│   │   ├── jsonld.ts           # Generadores de esquemas JSON-LD (BreadcrumbList, CollectionPage, Article, WebSite, FAQPage)
│   │   ├── ui-translations.ts # Traducciones de cadenas de interfaz para 14 idiomas distintos del inglés
│   │   ├── languages.ts       # Configuración i18n: 14 códigos de idioma y asignaciones hreflang
│   │   └── use-lang-prefix.ts # Hook para construir URL según el idioma
│   └── Dockerfile
├── tools/
│   ├── spine-renderer/         # Renderizador de esqueletos de Spine sin interfaz gráfica
│   │   ├── render_webgl.mjs     # Renderizador WebGL (un esqueleto): sin artefactos de unión
│   │   ├── render_all_webgl.mjs # Renderizador WebGL por lotes (todos los archivos .skel)
│   │   ├── render_gif.mjs      # Renderizador de animaciones (WebP/GIF/APNG compatible con aspectos y animaciones)
│   │   ├── render.mjs           # Renderizador de canvas heredado (presenta uniones entre triángulos)
│   │   ├── render_all.mjs       # Renderizador de canvas por lotes heredado
│   │   ├── render_skins2.mjs    # Renderizador de variantes de aspecto
│   │   ├── render_utils.mjs     # Utilidades compartidas de renderizado en canvas
│   │   └── package.json
│   ├── diff_data.py            # Generador de diferencias del registro de cambios
│   ├── update.py               # Canalización de actualización multiplataforma
│   └── deploy.py               # Compilación local de Docker + envío a Docker Hub
├── data/                       # Archivos de datos JSON analizados
│   ├── {lang}/                 # Directorios por idioma (eng, kor, jpn, fra, etc.)
│   ├── changelogs/             # Archivos JSON de registros de cambios (identificados por versión del juego)
│   ├── guides/                 # Archivos de guías Markdown con metadatos YAML
│   ├── guides.json             # Datos analizados de las guías
│   ├── runs/                   # Archivos JSON de partidas enviadas (por hash de jugador)
│   └── runs.db                 # SQLite heredado (sustituido por MongoDB; conservado como alternativa sin conexión)
├── extraction/                 # Archivos del juego sin procesar (no incluidos en el repositorio)
│   ├── raw/                    # Proyecto Godot extraído por GDRE (estable)
│   ├── decompiled/             # Salida de ILSpy (estable)
│   └── beta/                   # Rama beta de Steam (raw/ + decompiled/)
├── data-beta/                  # Datos beta analizados (versionados: v0.102.0/, v0.103.0/, latest → enlace simbólico)
├── docker-compose.yml          # Desarrollo local
├── docker-compose.prod.yml     # Producción
├── .github/workflows/
│   └── ci.yml                  # CI de GitHub Actions: lint, comprobación de tipos, búsqueda de secretos, compilación y envío de Docker, despliegue SSH
└── .forgejo/workflows/
    └── build.yml               # Alternativa de CI de Forgejo conservada (basada en buildah, no activa)
```

## Servicios públicos

| Host | Finalidad |
|---|---|
| [`spire-codex.com`](https://spire-codex.com) | Sitio web público y API del mismo origen. El canal beta activo se encuentra bajo `/beta`. |
| `cdn.spire-codex.com` | Host de objetos de Cloudflare R2 para ilustraciones del juego, renderizados completos de cartas, renderizados localizados y recursos beta archivados. |
| [`bot.spire-codex.com`](https://bot.spire-codex.com) | Página de inicio de Knowledge Demon y panel del personal autenticado mediante Discord. El bot consume la API principal de Codex. |
| `analytics.spire-codex.com` | Script y panel de Umami autoalojados. Su base de datos PostgreSQL permanece en una red privada de Docker. |
| `tierlists.spire-codex.com` | Host de objetos R2 dedicado a las imágenes de vista previa generadas para listas de niveles. |
| `beta.spire-codex.com` | Host público retirado. Cloudflare redirige las solicitudes a la misma ruta del dominio raíz. |

Los hosts de CDN y listas de niveles son almacenes de objetos, no sitios web navegables, por lo que es normal recibir un `404` en la raíz de cualquiera de ellos.

## Páginas del sitio web

| Página | Ruta | Descripción |
|---|---|---|
| Inicio | `/` | Panel con recuentos de entidades, tarjetas de categorías y enlaces a personajes |
| Cartas | `/cards` | Cuadrícula de cartas filtrable con vista detallada modal |
| Detalles de carta | `/cards/[id]` | Estadísticas completas, información de mejora e imagen de la carta |
| Personajes | `/characters` | Cuadrícula general de personajes |
| Detalles de personaje | `/characters/[id]` | Estadísticas, mazo/reliquias iniciales, citas y árboles de diálogo de PNJ |
| Reliquias | `/relics` | Cuadrícula de reliquias filtrable |
| Detalles de reliquia | `/relics/[id]` | Información completa de la reliquia con ambientación en texto enriquecido |
| Monstruos | `/monsters` | Cuadrícula de monstruos con PV, movimientos y renderizados de Spine |
| Detalles de monstruo | `/monsters/[id]` | PV, movimientos con intenciones/daño/poderes/bloqueo, enlaces a encuentros e información emergente de poderes |
| Pociones | `/potions` | Cuadrícula de pociones filtrable (rareza y reserva de personaje) |
| Detalles de poción | `/potions/[id]` | Información completa de la poción |
| Encantamientos | `/enchantments` | Lista de encantamientos con filtros por tipo de carta |
| Detalles de encantamiento | `/enchantments/[id]` | Información completa del encantamiento |
| Encuentros | `/encounters` | Composiciones de encuentros por acto/tipo de sala |
| Detalles de encuentro | `/encounters/[id]` | Alineación de monstruos, tipo de sala y etiquetas |
| Eventos | `/events` | Árboles de eventos de varias páginas con elecciones ampliables |
| Detalles de evento | `/events/[id]` | Páginas completas del evento, opciones y diálogo de Ancianos |
| Poderes | `/powers` | Mejoras, perjuicios y poderes neutrales |
| Detalles de poder | `/powers/[id]` | Información del poder con las cartas que lo aplican |
| Palabras clave | `/keywords` | Lista de palabras clave de cartas |
| Detalles de palabra clave | `/keywords/[id]` | Descripción de la palabra clave con cuadrícula de cartas filtrable |
| Mercader | `/merchant` | Precios de cartas/reliquias/pociones, costes de eliminación de cartas y mercader falso |
| Comparar | `/compare` | Centro de comparación de personajes (10 parejas) |
| Detalles de comparación | `/compare/[pair]` | Comparación de personajes en paralelo |
| Desarrolladores | `/developers` | Documentación de la API, documentación de widgets y exportaciones de datos |
| Galería | `/showcase` | Galería de proyectos de la comunidad |
| Cronología | `/timeline` | Progreso por épocas con agrupación por eras y requisitos de desbloqueo |
| Detalles de acto | `/acts/[id]` | Jefes, encuentros, eventos y ancianos de un acto |
| Detalles de ascensión | `/ascensions/[id]` | Descripción del nivel de ascensión con navegación anterior/siguiente |
| Detalles de intención | `/intents/[id]` | Icono y descripción de la intención |
| Detalles de orbe | `/orbs/[id]` | Icono del orbe y descripción pasiva/de evocación |
| Detalles de aflicción | `/afflictions/[id]` | Descripción y acumulabilidad de la aflicción |
| Detalles de modificador | `/modifiers/[id]` | Descripción del modificador de partida |
| Detalles de logro | `/achievements/[id]` | Descripción del logro |
| Insignias | `/badges` | Las 25 insignias de fin de partida agrupadas por niveles, nivel único o exclusivas del multijugador |
| Detalles de insignia | `/badges/[id]` | Desglose por nivel (Bronce / Plata / Oro), indicadores de victoria obligatoria y multijugador e icono |
| Mecánicas | `/mechanics` | Centro de mecánicas del juego: 27 secciones seleccionables con páginas SEO individuales |
| Detalles de mecánica | `/mechanics/[slug]` | Probabilidades de cartas, distribución de reliquias, aparición de pociones, generación del mapa, reservas de jefes, combate, secretos y curiosidades |
| Guías | `/guides` | Guías de estrategia de la comunidad con búsqueda/filtros |
| Detalles de guía | `/guides/[slug]` | Guía completa con renderizado Markdown + widget de información emergente |
| Enviar guía | `/guides/submit` | Formulario para enviar guías (webhook de Discord) |
| Clasificaciones | `/leaderboards` | Clasificaciones de victorias más rápidas y mayor ascensión con filtros para individual/cooperativo y modo de juego (estándar / diaria / Today / personalizado). Todo el estado de los filtros se incluye en la URL para poder compartir cualquier vista |
| Explorar partidas | `/runs` | Explorador completo de partidas con una barra de búsqueda por expresiones (intervalos `user:`, `char:`, `asc:`, AND de varios valores para `card:`/`relic:`, intervalos `version:`, `mode:`, `result:`, `players:`), además de filtros desplegables, ordenación y URL compartibles |
| Enviar una partida | `/leaderboards/submit` | Carga mediante arrastrar y soltar de archivos `.run`, con enlace al complemento de Overwolf, inicio de sesión con Steam/Discord para asociar partidas automáticamente y tus partidas recientes |
| Estadísticas | `/leaderboards/stats` | Tablas clasificadas (frecuencia de elección, porcentaje de victorias y recuento) de cartas, reliquias, pociones y encuentros. Filtros por personaje / ascensión / resultado |
| Perfil | `/profile` | Estadísticas del usuario que ha iniciado sesión (cartas/reliquias/pociones principales y desglose por personaje), mejores marcas personales, comparación competitiva (clasificación diaria de hoy, posiciones globales y porcentaje de victorias frente a la comunidad) y gestión de partidas |
| Ajustes | `/settings` | Ajustes de la cuenta: nombre de usuario, correo electrónico y cuentas vinculadas de Steam/Discord |
| Partida compartida | `/runs/[hash]` | Resumen de victoria/derrota con el estilo del juego, iconos seleccionables de nodos del mapa, franja de reliquias y cuadrícula de cartas pequeñas |
| Referencia | `/reference` | Todos los elementos son seleccionables: actos, ascensiones, palabras clave, orbes, aflicciones, intenciones, modificadores y logros |
| Imágenes | `/images` | Recursos del juego navegables con descarga ZIP por categoría |
| Registro de cambios | `/changelog` | Diferencias de datos entre actualizaciones del juego |
| Acerca de | `/about` | Información del proyecto, estadísticas y visualización de la canalización |
| Agradecimientos | `/thank-you` | Colaboradores de Ko-fi y de la comunidad (separado de Acerca de para poder enlazar directamente la página) |
| Knowledge Demon | `/knowledge-demon` | Página informativa del bot de Discord: comandos de barra, funciones de moderación y llamada a la instalación |
| Noticias | `/news` | Fuente replicada de anuncios de Steam; los enlaces canónicos apuntan de nuevo a Steam para que sea contenido complementario, no duplicado |
| Artículo de noticias | `/news/[gid]` | Anuncio individual de Steam con cuerpo BBCode saneado y JSON-LD `NewsArticle` |
| Lista de niveles | `/tier-list` | Centro de listas de niveles de Codex Score (niveles S → F) para cartas / reliquias / pociones |
| Detalles de lista de niveles | `/tier-list/[type]` | Filas visuales S/A/B/C/D/F para un tipo de entidad, obtenidas de `/api/runs/scores/{type}` |
| Puntuación | `/leaderboards/scoring` | Página de metodología de Codex Score: contracción bayesiana, peso previo, intervalo de la escala y umbrales de niveles |

## Endpoints de la API

Todos los endpoints de datos aceptan un parámetro de consulta opcional `?lang=` (valor predeterminado: `eng`). Las respuestas se **comprimen con GZip** y se almacenan en caché con `Cache-Control: public, max-age=300`.

| Endpoint | Descripción | Filtros |
|---|---|---|
| `GET /api/cards` | Todas las cartas | `color`, `type`, `rarity`, `keyword`, `search`, `lang` |
| `GET /api/cards/{id}` | Una carta | `lang` |
| `GET /api/characters` | Todos los personajes | `search`, `lang` |
| `GET /api/characters/{id}` | Un personaje (con citas y diálogos) | `lang` |
| `GET /api/relics` | Todas las reliquias | `rarity`, `pool`, `search`, `lang` |
| `GET /api/relics/{id}` | Una reliquia | `lang` |
| `GET /api/monsters` | Todos los monstruos | `type`, `search`, `lang` |
| `GET /api/monsters/{id}` | Un monstruo | `lang` |
| `GET /api/potions` | Todas las pociones | `rarity`, `pool`, `search`, `lang` |
| `GET /api/potions/{id}` | Una poción | `lang` |
| `GET /api/enchantments` | Todos los encantamientos | `card_type`, `search`, `lang` |
| `GET /api/enchantments/{id}` | Un encantamiento | `lang` |
| `GET /api/encounters` | Todos los encuentros | `room_type`, `act`, `search`, `lang` |
| `GET /api/encounters/{id}` | Un encuentro | `lang` |
| `GET /api/events` | Todos los eventos | `type`, `act`, `search`, `lang` |
| `GET /api/events/{id}` | Un evento | `lang` |
| `GET /api/powers` | Todos los poderes | `type`, `stack_type`, `search`, `lang` |
| `GET /api/powers/{id}` | Un poder | `lang` |
| `GET /api/keywords` | Definiciones de palabras clave de cartas | `lang` |
| `GET /api/keywords/{id}` | Una palabra clave | `lang` |
| `GET /api/intents` | Tipos de intenciones de monstruos | `lang` |
| `GET /api/intents/{id}` | Una intención | `lang` |
| `GET /api/orbs` | Todos los orbes | `lang` |
| `GET /api/orbs/{id}` | Un orbe | `lang` |
| `GET /api/afflictions` | Aflicciones de cartas | `lang` |
| `GET /api/afflictions/{id}` | Una aflicción | `lang` |
| `GET /api/modifiers` | Modificadores de partida | `lang` |
| `GET /api/modifiers/{id}` | Un modificador | `lang` |
| `GET /api/achievements` | Todos los logros | `lang` |
| `GET /api/achievements/{id}` | Un logro | `lang` |
| `GET /api/badges` | Todas las insignias de fin de partida | `tiered`, `multiplayer_only`, `requires_win`, `search`, `lang` |
| `GET /api/badges/{id}` | Una insignia con desglose por niveles | `lang` |
| `GET /api/history/{entity_type}/{entity_id}` | Historial de versiones por entidad (sin distinguir mayúsculas, más recientes primero) | - |
| `GET /api/epochs` | Épocas de la cronología | `era`, `search`, `lang` |
| `GET /api/epochs/{id}` | Una época | `lang` |
| `GET /api/stories` | Entradas de historia | `lang` |
| `GET /api/stories/{id}` | Una historia | `lang` |
| `GET /api/acts` | Todos los actos | `lang` |
| `GET /api/acts/{id}` | Un acto | `lang` |
| `GET /api/ascensions` | Niveles de ascensión (0–10) | `lang` |
| `GET /api/ascensions/{id}` | Un nivel de ascensión | `lang` |
| `GET /api/stats` | Recuentos de entidades de todas las categorías | `lang` |
| `GET /api/languages` | Idiomas disponibles con sus nombres visibles | - |
| `GET /api/translations` | Mapas de traducción para valores de filtros y cadenas de interfaz | `lang` |
| `GET /api/images` | Categorías de imágenes con listas de archivos. Las categorías con prefijo beta aceptan `?version=`. | - |
| `GET /api/images/beta/versions` | Versiones disponibles del archivo de imágenes beta + destino del enlace simbólico `latest` | - |
| `GET /api/images/{category}/download` | Descarga ZIP de una categoría de imágenes. Las categorías beta aceptan `?version=`. | - |
| `GET /api/changelogs` | Resúmenes de registros de cambios (todas las versiones) | - |
| `GET /api/changelogs/{tag}` | Registro de cambios completo de una etiqueta de versión | - |
| `GET /api/guides` | Guías de la comunidad | `category`, `difficulty`, `tag`, `search` |
| `GET /api/guides/{slug}` | Una guía (con contenido Markdown) | - |
| `POST /api/guides` | Enviar una guía (redirigida a Discord) | - |
| `POST /api/runs` | Enviar una partida (JSON de archivo .run) | `username` |
| `GET /api/runs/list` | Enumerar/explorar las partidas enviadas | `character`, `win`, `username`, `seed`, `build_id`, `build_ids`, `players`, `game_mode`, `ascension`, `ascension_min`, `ascension_max`, `card`, `relic`, `today`, `sort`, `page`, `limit` |
| `GET /api/runs/shared/{hash}` | Datos completos de una partida por hash (combina el `username` de la BD) | - |
| `GET /api/runs/stats` | Estadísticas agregadas de la comunidad | `character`, `win`, `ascension`, `game_mode`, `players` |
| `GET /api/runs/leaderboard` | Clasificación ordenada solo de victorias | `category` (`fastest`, `highest_ascension`), `character`, `players`, `game_mode`, `today`, `page`, `limit` |
| `GET /api/runs/leaderboard/rank/{hash}` | Posición de una única partida ganada en su clasificación | `category` |
| `GET /api/runs/scores/{type}` | Codex Score (puntuación de victorias con contracción bayesiana + nivel S/A/B/C/D/F) por entidad | `type` = `cards`/`relics`/`potions` |
| `GET /api/runs/encounter-stats` | Agregados por encuentro (apariciones, tasa de letalidad y daño/turnos medios) | `act`, `room_type`, `multiplayer`, `page`, `limit` |
| `POST /api/runs/claim` | Asociar un nombre de usuario a partidas enviadas anteriormente mediante su hash | - |
| `GET /api/runs/versions` | Versiones distintas del juego entre las partidas enviadas | - |
| `GET /api/exports/{lang}` | ZIP con todos los JSON de entidades de un idioma | `lang` |
| `GET /api/news` | Anuncios de Steam + noticias de la comunidad (archivados localmente) | `feed_type`, `feedname`, `tag`, `since`, `search`, `limit`, `offset` |
| `GET /api/news/{gid}` | Un artículo de noticias (cuerpo HTML/BBCode sin procesar) | - |
| `GET /api/merchant/config` | Configuración de precios del mercader extraída automáticamente | - |
| `POST /api/feedback` | Enviar comentarios (redirigidos a Discord) | - |
| `GET /api/versions` | Metadatos de versión expuestos por la raíz de datos activa | - |

**Cuentas de usuario** (sesión mediante cookie/JWT; inicio de sesión con Steam o Discord):

| Endpoint | Descripción |
|---|---|
| `GET /api/auth/me` | Usuario que ha iniciado sesión actualmente |
| `GET /api/auth/steam/redirect` | Iniciar el acceso mediante Steam OpenID |
| `GET /api/auth/discord/start` | Iniciar el acceso mediante Discord OAuth |
| `POST /api/auth/logout` | Borrar la cookie de sesión |
| `PATCH /api/auth/username` / `PATCH /api/auth/email` | Actualizar campos del perfil |
| `GET /api/auth/runs` / `POST /api/auth/runs/upload` / `DELETE /api/auth/runs/{hash}` | Enumerar, cargar y eliminar las partidas del usuario |
| `GET /api/auth/stats` | Estadísticas agregadas por usuario (página de perfil) |
| `GET /api/auth/personal-bests` | Partida individual/cooperativa más rápida, mayor ascensión y mejores diarias de hoy y de todos los tiempos |
| `GET /api/auth/competitive` | Clasificación diaria de hoy, posiciones globales y porcentaje de victorias frente a la comunidad |

Límite de **60 solicitudes por minuto** y por IP. Los comentarios y envíos de guías están limitados a **3-5 por minuto** y por IP. Documentación interactiva en `/docs` (Swagger UI).

### Localización

Todos los datos del juego se ofrecen en 15 idiomas mediante los propios archivos de localización de Slay the Spire 2. Pasa `?lang=` a cualquier endpoint de datos. Usa `?channel=beta` para los datos de la beta pública activa; los conjuntos archivados de imágenes beta usan `?version=`.

| Código | Idioma | Código | Idioma |
|------|----------|------|----------|
| `eng` | English | `kor` | 한국어 |
| `deu` | Deutsch | `pol` | Polski |
| `esp` | Español (ES) | `ptb` | Português (BR) |
| `fra` | Français | `rus` | Русский |
| `ita` | Italiano | `spa` | Español (LA) |
| `jpn` | 日本語 | `tha` | ไทย |
| `tur` | Türkçe | `zhs` | 简体中文 |
| `zht` | 繁體中文 | | |

**Qué está localizado**: nombres y descripciones de entidades procedentes del juego, tipos de carta, rarezas, palabras clave, poderes, encuentros, nombres de personajes, títulos de secciones, rutas localizadas y la mayoría de las etiquetas compartidas de la interfaz.

**Qué permanece en inglés**: identificadores de la API y valores estructurales de filtros como `room_type`, `type`/`stack_type` de los poderes y `pool`, además de las marcas de productos y cierto contenido editorial o creado por la comunidad.

Los parámetros de filtro (`type=Attack`, `rarity=Rare`, `keyword=Exhaust`) siempre usan valores en inglés, independientemente del idioma: el backend los traduce a los equivalentes localizados antes de realizar la comparación.

Ejemplo: `GET /api/cards?lang=kor&type=Attack` devuelve datos de cartas en coreano cuyo tipo es "공격", filtrados correctamente aunque el parámetro esté en inglés.

### Formato de texto enriquecido

Los campos de texto (`description`, `loss_text`, `flavor`, `text` de diálogo y `title`/`description` de opciones) pueden contener etiquetas similares al BBCode de Godot conservadas a partir de los datos de localización del juego:

| Etiqueta | Tipo | Ejemplo | Se representa como |
|---|---|---|---|
| `[gold]...[/gold]` | Color | `[gold]Enchant[/gold]` | Texto de color dorado |
| `[red]...[/red]` | Color | `[red]blood[/red]` | Texto de color rojo |
| `[blue]...[/blue]` | Color | `[blue]2[/blue]` | Texto de color azul |
| `[green]...[/green]` | Color | `[green]healed[/green]` | Texto de color verde |
| `[purple]...[/purple]` | Color | `[purple]Sharp[/purple]` | Texto de color morado |
| `[orange]...[/orange]` | Color | `[orange]hulking figure[/orange]` | Texto de color naranja |
| `[pink]...[/pink]` | Color | - | Texto de color rosa |
| `[aqua]...[/aqua]` | Color | `[aqua]Ascending Spirit[/aqua]` | Texto de color cian |
| `[sine]...[/sine]` | Efecto | `[sine]swirling vortex[/sine]` | Texto animado ondulante |
| `[jitter]...[/jitter]` | Efecto | `[jitter]CLANG![/jitter]` | Texto animado tembloroso |
| `[b]...[/b]` | Efecto | `[b]bold text[/b]` | Texto en negrita |
| `[i]...[/i]` | Efecto | `[i]whispers[/i]` | Texto en cursiva |
| `[energy:N]` | Icono | `[energy:2]` | Icono(s) de energía |
| `[star:N]` | Icono | `[star:1]` | Icono(s) de estrella |
| `[Card]`, `[Relic]` | Marcador de posición | `[Card]` | Dinámico en tiempo de ejecución (cursiva) |

Las etiquetas pueden anidarse: `[b][jitter]CLANG![/jitter][/b]`, `[gold][sine]swirling vortex[/sine][/gold]`.

Si consumes la API directamente, puedes eliminar estas etiquetas con una expresión regular como `\[/?[a-z]+(?::\d+)?\]` o representarlas en tu propio frontend. El campo `description_raw` (cuando está disponible) contiene la plantilla SmartFormat sin resolver.

## Ejecución local

### Requisitos previos

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

El backend se ejecuta en **http://localhost:8000**.

### Frontend

```bash
cd frontend
npm install
NEXT_PUBLIC_API_URL=http://localhost:8000 npm run dev
```

El frontend se ejecuta en **http://localhost:3000**.

### Docker

```bash
docker compose up --build
```

Inicia ambos servicios (backend en el puerto 8000 y frontend en el 3000).

### Variables de entorno

La API principal de solo lectura no necesita configuración. Las funciones opcionales que se indican a continuación se
habilitan mediante variables de entorno (definidas en el entorno del backend o en el archivo de Compose):

| Variable | Utilizada por | Notas |
|---|---|---|
| `MONGO_URL` | Backend | Base de datos de partidas (estadísticas de la comunidad, clasificaciones y cuentas). Si no se define, el backend recurre a la ruta heredada de SQLite (`data/runs.db`). |
| `JWT_SECRET` | Backend | Firma los tokens de sesión de las cuentas de usuario. |
| `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` | Backend | Inicio de sesión mediante Discord OAuth. |
| `FRONTEND_URL`, `SPIRE_CODEX_PUBLIC_BASE` | Backend | URL de redirección / retorno de OAuth. |
| `ENVIRONMENT` | Backend | `production` activa el comportamiento de cookies seguras. |
| `NEXT_PUBLIC_API_URL` | Frontend (compilación) | Base de la API; vacía en producción para que las imágenes/datos se resuelvan en el mismo origen. |
| `NEXT_PUBLIC_CDN_URL` | Frontend (compilación) | Cuando se define (p. ej., `https://cdn.spire-codex.com`), las imágenes se cargan desde la CDN en lugar de `/static`. |
| `NEXT_PUBLIC_SITE_URL` | Frontend (compilación) | URL canónica del sitio para los metadatos. |

Las cuentas de usuario y la CDN están desactivadas de forma predeterminada, por lo que el proyecto funciona de extremo a extremo
sin ninguna de estas variables.

## Canalización de actualización

Un script multiplataforma de Python gestiona todo el flujo de actualización cuando se publica una nueva versión del juego:

```bash
# Canalización completa: extraer archivos del juego, analizar datos, renderizar sprites y copiar imágenes:
python3 tools/update.py

# Especificar manualmente la ruta de instalación del juego:
python3 tools/update.py --game-dir "/path/to/Slay the Spire 2"

# Omitir la extracción (ya se dispone de un directorio extraction/ actualizado):
python3 tools/update.py --skip-extract

# Volver a analizar solo los datos (sin extracción ni renderizado):
python3 tools/update.py --parse-only

# Volver a renderizar solo los sprites de Spine:
python3 tools/update.py --render-only

# Generar un registro de cambios después de actualizar:
python3 tools/update.py --changelog --game-version "0.98.2" --build-id "22238966"
```

El script detecta automáticamente el sistema operativo y encuentra el directorio de instalación de Steam. Requisitos por paso:

| Paso | Herramienta | Instalación |
|---|---|---|
| Extracción de PCK | `gdre_tools` | [Versiones de GDRE Tools](https://github.com/bruvzg/gdsdecomp/releases) |
| Descompilación de DLL | `ilspycmd` | `dotnet tool install ilspycmd -g` |
| Análisis de datos | Python 3.10+ | Integrado |
| Copia de imágenes | Python 3.10+ | Integrado |
| Renderizado de Spine | Node.js 20+ | [nodejs.org](https://nodejs.org) |

### Pasos manuales

Si prefieres ejecutar los pasos por separado:

```bash
# Analizar todos los datos (los 15 idiomas)
cd backend/app/parsers && python3 parse_all.py

# Analizar un único idioma
cd backend/app/parsers && python3 parse_all.py --lang eng

# Copiar imágenes de extraction a static (PNG + WebP desde la misma fuente, sin
# cadena con pérdida a través de un WebP existente del backend). WebP con quality=95, method=6.
python3 backend/scripts/copy_images.py

# Renderizar sprites de Spine (WebGL, sin artefactos de unión entre triángulos)
cd tools/spine-renderer && npm install
npx playwright install chromium           # Solo la primera vez
node render_all_webgl.mjs                 # Los 138 esqueletos mediante Chrome sin interfaz gráfica
node render_webgl.mjs <skel_dir> <out> [size] [--skin=a,b] [--anim=name] [--anim-time=N]

# Modificaciones habituales por monstruo:
#   --skin=moss1,diamondeye   combina aspectos alternativos con el predeterminado (cubex_construct)
#   --skin=skin1              sustituye el predeterminado por una variante (scroll_of_biting)
#   --anim-time=0.5           avanza la animación N segundos antes de la captura
#   --anim=attack             sustituye la animación de reposo elegida automáticamente
#
# Sustitución de marcadores de humo: gas_bomb_2.png, the_forgotten_2.png y
# living_smog_2.png se distribuyen como paneles magenta "Smoke Placeholder" en la fuente.
# render_webgl.mjs los sustituye por una nube ciruela oscura generada mediante procedimientos
# con las mismas dimensiones antes de cargarlos en GL y después fuerza slot.color.a = 1.0
# en las ranuras sustituidas (los artistas definieron una opacidad baja esperando un shader).

# Reencuadrar sprites de monstruos demasiado pequeños (posprocesamiento: recorta al
# bbox alfa real y escala para ocupar aproximadamente el 92 % del marco de 512x512):
python3 tools/rescale_bestiary.py fuzzy_wurm_crawler thieving_hopper terror_eel

# Renderizador de canvas heredado (presenta artefactos de unión entre triángulos; evitar)
# node render_all.mjs / node render.mjs
```

## Sistema de registro de cambios

Registra qué cambia entre las actualizaciones del juego mediante diferencias por campo en todas las categorías de entidades.

### Generación de un registro de cambios

```bash
# Comparar los datos actuales con una referencia de git:
python3 tools/diff_data.py HEAD~1 --format json \
    --game-version "0.98.2" --build-id "22238966" \
    --title "March Update"

# Previsualizar como texto o Markdown:
python3 tools/diff_data.py HEAD~1 --format text
python3 tools/diff_data.py HEAD~1 --format md
```

### Esquema del registro de cambios

Cada archivo JSON de registro de cambios contiene:

| Campo | Descripción |
|---|---|
| `app_id` | ID de aplicación de Steam (2868840) |
| `game_version` | Versión del juego en Steam (p. ej., `"0.98.2"`) |
| `build_id` | ID de compilación de Steam |
| `tag` | Clave de versión única (p. ej., `"1.0.3"`) |
| `date` | Fecha de la actualización |
| `title` | Título legible |
| `summary` | Recuentos: `{ added, removed, changed }` |
| `features` / `fixes` / `api_changes` | Notas de versión seleccionadas manualmente. Se conservan al regenerar una etiqueta existente mediante `diff_data.py`: la diferencia de datos se sobrescribe, pero estas matrices se combinan. |
| `categories` | Diferencias por categoría con entidades añadidas/eliminadas/modificadas. Los cambios de campos se recorren recursivamente dentro de diccionarios/listas anidados para que cada hoja tenga su propia fila (p. ej., `vars.DamageVar: 8 → 10`) en lugar de un `vars: 2 fields → 2 fields` opaco. |

### Conservación de escritura única

Los archivos de `data/changelogs/` son registros históricos de escritura única. `.github/workflows/changelog-guard.yml` bloquea cualquier PR que **modifique o elimine** un registro de cambios existente. Los archivos nuevos (`A`) siempre están permitidos; las modificaciones requieren la etiqueta `changelog-edit-approved` en el PR. Consulta `CONTRIBUTING.md → Changelog Retention` para ver la política y el flujo de anulación.

### Historial por entidad

`GET /api/history/{entity_type}/{entity_id}` recorre todos los registros de cambios y devuelve las entradas que afectaron a la entidad solicitada, primero las más recientes. El panel Historial de versiones de cada página de detalles (`/cards/{id}`, `/monsters/{id}`, etc.) utiliza este endpoint.

## Despliegue

### CI/CD (GitHub Actions)

Los envíos a `main` activan `.github/workflows/ci.yml` en el ejecutor autoalojado de Kubernetes. El flujo de trabajo realiza una búsqueda de secretos, comprobaciones de ESLint y TypeScript y comprobaciones de lint y formato con ruff; después compila y envía las imágenes estables con la etiqueta `:latest`. También sigue compilando las imágenes beta independientes con la etiqueta `:beta` para `docker-compose.beta.yml`; estas imágenes se conservan operativamente, pero las páginas beta públicas se sirven desde el despliegue principal en `/beta`.

El frontend estable recibe `UMAMI_WEBSITE_ID`. La imagen beta independiente recibe `UMAMI_BETA_WEBSITE_ID`, aunque el tráfico público de `/beta` utiliza el frontend estable y su propiedad de analítica.

La CI **no** despliega. El trabajo de despliegue automático por horas del host de DigitalOcean se encarga del despliegue.

> **Nota:** `.forgejo/workflows/build.yml` se conserva como alternativa inactiva basada en buildah.

### Compilación local + envío

Omite la CI y envía directamente desde tu máquina:

```bash
# Compilar y enviar ambas imágenes:
python3 tools/deploy.py

# Solo frontend:
python3 tools/deploy.py --frontend

# Solo backend:
python3 tools/deploy.py --backend

# Probar la compilación sin enviarla:
python3 tools/deploy.py --no-push

# Etiquetar una versión:
python3 tools/deploy.py --tag v0.98.2

# Compilar y enviar imágenes beta (etiqueta :beta, omite IndexNow):
python3 tools/deploy.py --beta
```

Detecta automáticamente Apple Silicon y realiza una compilación cruzada para `linux/amd64` mediante `docker buildx`. Requiere ejecutar antes `docker login`.

### Producción

La aplicación pública y la pila beta independiente conservada se ejecutan en el mismo host de DigitalOcean. El tráfico público utiliza `spire-codex.com`; el host secundario de Lightsail ejecuta MongoDB.

**Despliegue automático** - Una tarea cron que se ejecuta cada hora en el host de DigitalOcean inicia `/usr/local/bin/spire-codex-autodeploy` a los :03. Cuando avanza el commit del repositorio, obtiene los cambios y vuelve a crear tanto `docker-compose.prod.yml` como `docker-compose.beta.yml`, salvo en las actualizaciones limitadas a `data/news/*`. Después purga la caché de Cloudflare. Los registros se escriben en `/var/log/spire-codex-autodeploy.log`. Consulta [`infrastructure/ansible/README.md`](infrastructure/ansible/README.md) para obtener información sobre la instalación y el funcionamiento.

**Despliegue manual**:

```bash
cd infrastructure/ansible
./bin/do-ansible playbooks/deploy.yml

# Pila beta independiente conservada
./bin/do-ansible playbooks/deploy.yml -e compose_file=docker-compose.beta.yml
```

Los datos de producción se montan mediante bind mount (`./data:/data:ro` para el frontend y con lectura y escritura para el backend). El estado de noticias y partidas se lee de los datos montados en el momento de cada solicitud, por lo que las actualizaciones de `data/news/*.json` no requieren reiniciar los contenedores.

### Canal beta (spire-codex.com/beta)

La aplicación pública ofrece los datos estables y los de Steam `public-beta` como dos canales de contenido. Las páginas beta se encuentran en [`spire-codex.com/beta`](https://spire-codex.com/beta), con rutas localizadas en `/{lang}/beta/...`. La página principal `/images` también expone las versiones archivadas de los recursos beta.

`beta.spire-codex.com` se ha retirado del uso público. Actualmente Cloudflare envía un `302` que conserva la ruta al dominio raíz, pero no añade `/beta` ni `channel=beta`. Por tanto, los enlaces antiguos a páginas llegan a la página estable equivalente y las solicitudes antiguas a la API reciben datos estables después de seguir la redirección. Los clientes nuevos de la API deben usar la API principal con un canal explícito, por ejemplo, `https://spire-codex.com/api/cards?channel=beta`.

**Arquitectura**: `get_channel` resuelve `?channel=beta|stable` en un `ContextVar` de Python; también reconoce una cabecera de host `beta.*` para el tráfico directo al origen. `data_service.py` carga las solicitudes beta desde `data-beta/<latest>/` y recurre a la versión estable por archivo. `GET /api/beta/diff` y `GET /api/beta/version` describen la beta activa, y el frontend representa el canal seleccionado bajo `/beta`.

La pila separada `docker-compose.beta.yml` y las imágenes `:beta` siguen compilándose y recreándose mediante la automatización del despliegue. No constituyen el sitio beta público mientras esté activa la redirección de Cloudflare.

**Disposición de los datos**: cada compilación archivada se encuentra en `data-beta/<version>/` y el puntero `latest` selecciona la compilación activa. Cada versión tiene su propio directorio `changelogs/`. Los archivos de imágenes beta replican esta estructura en `backend/static/images/beta/<version>/{cards,monsters,misc,ui,vfx}/`.

**Ingesta automatizada** - `tools/beta-watch/` se ejecuta como una tarea de launchd en el Mac de desarrollo los jueves de 15:00 a 22:45, cada 15 minutos. Cuando SteamCMD informa de un nuevo ID de compilación `public-beta`, extrae y descompila el juego, analiza todos los idiomas, genera la diferencia, sincroniza las imágenes versionadas y abre un PR `auto/beta-<version>`. Consulta [`tools/beta-watch/README.md`](tools/beta-watch/README.md) para obtener información sobre la instalación y el funcionamiento.

**Ingesta manual**:

```bash
VERSION=vX.Y.Z
PREVIOUS=vA.B.C

# Primero extrae y descompila los archivos del juego beta; después, analízalos desde la raíz del repositorio.
(cd backend/app/parsers && \
  EXTRACTION_DIR=../../../extraction/beta \
  DATA_DIR="../../../data-beta/$VERSION" \
  python3 parse_all.py)

VERSION="$VERSION" tools/beta-watch/sync-images.sh

python3 tools/diff_data.py "data-beta/$PREVIOUS/eng" "data-beta/$VERSION/eng" \
  --format json --output-dir "data-beta/$VERSION/changelogs" \
  --game-version "${VERSION#v}" --title "Beta ${VERSION#v}"
```

`sync-images.sh` actualiza el enlace simbólico de imágenes `latest`. El PR de ingesta contiene los cambios versionados de datos e imágenes; después de combinarlo, el despliegue automático actualiza ambas pilas conservadas.

## Renderizador de Spine

Los sprites de los monstruos de StS2 son animaciones esqueléticas de [Spine](http://esotericsoftware.com/): cada monstruo consta de un `.skel` (esqueleto binario) + `.atlas` + hoja de sprites `.png`, no de una sola imagen. El renderizador los compone en PNG de retrato estáticos.

### Renderizador WebGL (actual)

El renderizador WebGL (`render_webgl.mjs`, `render_all_webgl.mjs`) usa **Playwright + spine-webgl** para renderizar esqueletos mediante la GPU de Chrome sin interfaz gráfica. Esto produce renderizados limpios **sin artefactos de unión entre triángulos**.

**Cómo funciona:**
1. Inicia Chrome sin interfaz gráfica mediante Playwright con WebGL habilitado
2. Carga en la página del navegador los datos del esqueleto + atlas + texturas como base64
3. Crea un canvas WebGL y configura el shader de spine-webgl + el procesador de lotes de polígonos
4. Aplica la animación de reposo y calcula los límites (excluyendo las ranuras de sombra/suelo)
5. Renderiza mediante rasterización de triángulos por GPU, sin rutas de recorte de canvas ni uniones
6. Lee los píxeles sin procesar mediante `gl.readPixels` y los voltea verticalmente (WebGL funciona de abajo arriba)
7. Escribe el PNG mediante node-canvas para conservar la transparencia

**Un solo esqueleto:**
```bash
node render_webgl.mjs <skel_dir> <output_path> [size]
node render_webgl.mjs ../../extraction/raw/animations/backgrounds/neow_room ../../backend/static/images/misc/neow.png 2048
```

**Todos los esqueletos por lotes:**
```bash
node render_all_webgl.mjs  # Renderiza 138 esqueletos en backend/static/images/renders/
```

### Cobertura de renderizado

| Categoría | Renderizados | Total | Notas |
|---|---|---|---|
| Monstruos | 99 | 103 directorios | Los 111 monstruos del juego tienen imágenes (99 renderizados + alias/recursos estáticos) |
| Personajes | 16 | 16 | Poses de combate, zona de descanso y selección |
| Fondos/PNJ | 14 | 17 | Neow, Tezcatara, salas del mercader y menú principal |
| VFX/UI | 9 | 22 | La mayoría de los VFX necesitan fotogramas específicos de la animación |
| **Total** | **138** | **158** | 20 omitidos (sin atlas, solo VFX o vacíos) |

### Renderizador de animaciones

El renderizador de animaciones (`render_gif.mjs`) representa animaciones de reposo/ataque de Spine como WebP, GIF o APNG animados. Admite variantes de aspecto, selección de animaciones y transmisión de fotogramas al disco para animaciones grandes.

**Formatos de salida compatibles:**
- **`.webp`** (recomendado) - WebP animado sin pérdida con canal alfa completo, aproximadamente un 33 % más pequeño que APNG. Los fotogramas se transmiten al disco para evitar errores por falta de memoria.
- **`.gif`** - 256 colores y transparencia binaria. Los archivos más pequeños, pero con la menor calidad.
- **`.apng`** - canal alfa completo como WebP, pero con archivos más grandes.

```bash
# Renderizar WebP animado sin pérdida (recomendado)
NODE_OPTIONS="--max-old-space-size=8192" node render_gif.mjs <skel_dir> <output.webp> [size] [--fps=N]

# Con variante de aspecto (para bowlbug, cultists, cubex, etc.)
node render_gif.mjs <skel_dir> output.webp 256 --fps=10 --skin=rock

# Animación específica (valor predeterminado: bucle de reposo)
node render_gif.mjs <skel_dir> output.webp 256 --fps=12 --anim=attack

# Modo de silueta blanca (para los iconos de nodos de jefes del mapa)
node render_gif.mjs <skel_dir> output.webp 256 --white
```

**Biblioteca de animaciones:** 209 WebP animados sin pérdida:
- 15 animaciones de personajes (combate/selección/descanso × 5 personajes) a 512×512
- 103 animaciones de reposo de monstruos a 256×256
- 91 animaciones de ataque de monstruos a 256×256

**Variantes de aspecto:** 13 monstruos tienen variantes de aspecto (bowlbug, cubex_construct, cultists, etc.). Usa `--skin=` para seleccionarlas. A menudo, el aspecto predeterminado solo muestra el esqueleto base sin cuerpo.

**Shader de nodos de jefes del mapa:** el juego utiliza `boss_map_point.gdshader`, que trata los canales RGB como máscaras:
- **Canal rojo** × `map_color` (valor predeterminado: beis `0.671, 0.58, 0.478`) → color de relleno
- **Canal azul** × `black_layer_color` (valor predeterminado: negro `0, 0, 0`) → color del contorno
- **Canal verde** × blanco `1, 1, 1` → reflejos

### Renderizador de canvas heredado

El renderizador de canvas (`render.mjs`, `render_all.mjs`) utiliza `spine-canvas` con `triangleRendering = true`. Esto produce **artefactos visibles de malla de alambre** debido al suavizado de las rutas `clip()` del canvas entre triángulos adyacentes. Usa en su lugar el renderizador WebGL.

### Dependencias

- `@esotericsoftware/spine-webgl` ^4.2.107 - Entorno de ejecución de Spine para WebGL (actual)
- `playwright` - Chrome sin interfaz gráfica para el renderizado WebGL
- `gif-encoder-2` - Codificación GIF para el renderizador de animaciones
- `canvas` ^3.1.0 - Implementación de Canvas para Node.js (búfer de fotogramas para el renderizador de animaciones)
- `Pillow` (Python) - compone WebP/APNG a partir de fotogramas PNG renderizados
- `@esotericsoftware/spine-canvas` ^4.2.106 - Entorno de ejecución de Spine para Canvas (heredado)

## Extracción de los archivos del juego

Si necesitas extraerlos desde cero:

```bash
# Extraer PCK (GDRE Tools)
/path/to/gdre_tools --headless --recover="/path/to/sts2.pck" --output-dir=extraction/raw

# Descompilar DLL (CLI de ILSpy)
ilspycmd -p -o extraction/decompiled "/path/to/sts2.dll"
```

Ubicaciones de instalación de Steam:
- **Windows**: `C:\Program Files (x86)\Steam\steamapps\common\Slay the Spire 2\`
- **macOS**: `~/Library/Application Support/Steam/steamapps/common/Slay the Spire 2/`
- **Linux**: `~/.local/share/Steam/steamapps/common/Slay the Spire 2/`

## Versionado

Spire Codex utiliza el versionado semántico **`1.X.Y`**:

| Segmento | Significado |
|---------|---------|
| **1** | Versión principal de Spire Codex (se mantiene salvo que se reescriba por completo) |
| **X** | Aumenta cuando Mega Crit publica un parche del juego |
| **Y** | Aumenta con nuestras propias correcciones y mejoras del analizador/frontend |

Ejemplos: `v1.0.0` = versión inicial, `v1.0.1` = nuestras correcciones de errores, `v1.1.0` = primer parche de Mega Crit incorporado.

## SEO

- **Datos estructurados (JSON-LD)**: WebSite + VideoGame (inicio), CollectionPage + ItemList (páginas de listas), Article + BreadcrumbList + FAQPage (páginas de detalles), SoftwareApplication (desarrolladores), NewsArticle (news/[gid])
- **Formato del título**: `"Slay the Spire 2 (sts2) {Page Title} | Spire Codex"` - normalizado en todas las páginas. Las partidas usan `"{username} - {char} - Ascension {N} {win/loss} - Slay the Spire 2 (sts2) | Spire Codex"`. «(sts2)» aparece integrado para que coincida con consultas entre idiomas como `sts2 tier list` / `sts2 card list`.
- **Mapa del sitio**: XML plano en `/sitemap.xml` con `force-dynamic` (se renderiza en el servidor, no durante la compilación). Más de 20 000 URL, incluidas páginas de detalles de entidades, páginas de matrices de exploración, páginas de listas de niveles, metodología de puntuación, detalles de runs/[hash] y réplicas i18n para todos los tipos de entidad
- **SEO internacional**: rutas `/{lang}/` para 14 idiomas distintos del inglés con alternativas hreflang **bidireccionales**; las páginas raíz en inglés también emiten alternativas para cada configuración regional + `x-default` mediante `buildLanguageAlternates(path)` en `lib/seo.ts` (corrige el grupo de contenido duplicado «Crawled - not indexed» de GSC, en el que Google trataba las páginas localizadas como duplicadas sin referencias inversas)
- **SEO programático**: 41 páginas de exploración de cartas en `/cards/browse/` (rare-attacks, ironclad-skills, etc.) + 3 páginas de listas de niveles (`/tier-list/{cards,relics,potions}`)
- **EntityProse adaptado a la configuración regional**: las páginas de detalles muestran un breve párrafo específico de cada configuración regional en lugar de cuerpos idénticos en inglés para todas ellas
- **Enlaces internos**: poderes ↔ cartas, encuentros → monstruos, palabras clave de cartas → páginas centrales de palabras clave, movimientos de monstruos → páginas de poderes (con información emergente), páginas de actos → encuentros/eventos y filas de listas de niveles → pestaña Estadísticas de los detalles de entidades
- **Open Graph y Twitter Cards**: imágenes OG por entidad y tarjetas de Twitter `summary_large_image`
- **URL canónicas**: todas las páginas declaran una URL canónica

## Widgets integrables

### Widget de información emergente
Añade información emergente al pasar el cursor para los 13 tipos de entidad en cualquier sitio web:
```html
<script src="https://spire-codex.com/widget/spire-codex-tooltip.js"></script>
<p>Start with [[Bash]] and [[relic:Burning Blood]].</p>
```

### Widget de registro de cambios
Integra un visor interactivo del registro de cambios:
```html
<div id="scx-changelog"></div>
<script src="https://spire-codex.com/widget/spire-codex-changelog.js"></script>
```

Documentación completa: [spire-codex.com/developers](https://spire-codex.com/developers)

## Hoja de ruta

- ~~Páginas de detalles individuales~~ ✅
- ~~Búsqueda global~~ ✅
- ~~Compatibilidad multilingüe (15 idiomas)~~ ✅
- ~~SEO (JSON-LD, OG/Twitter, mapa del sitio, hreflang)~~ ✅
- ~~Widget de información emergente (los 13 tipos de entidad)~~ ✅
- ~~Páginas de comparación de personajes (10 parejas)~~ ✅
- ~~Páginas centrales de palabras clave~~ ✅
- ~~Guía del mercader (precios del C# descompilado)~~ ✅
- ~~Documentación para desarrolladores + exportaciones de datos~~ ✅
- ~~SEO internacional (13 páginas de inicio por idioma)~~ ✅
- ~~Matriz de exploración de cartas (41 páginas SEO programáticas)~~ ✅
- ~~Guías de la comunidad~~ ✅ - Markdown con metadatos YAML, formulario de envío, widget de información emergente y redes sociales del autor
- ~~Página de mecánicas del juego~~ ✅ - 27 páginas SEO individuales: tasas de aparición, combate, mapa, jefes, secretos y curiosidades
- ~~Partidas de la comunidad~~ ✅ - Envío y exploración de partidas, partidas compartidas y estadísticas en directo
- ~~Descripciones de mejoras de cartas~~ ✅ - upgrade_description para las 403 cartas mejorables
- ~~Poderes innatos de monstruos~~ ✅ - 42 monstruos con poderes de AfterAddedToRoom
- ~~Condiciones de desbloqueo de logros~~ ✅ - Categoría, personaje y umbral del código fuente C#
- ~~Patrones de ataque de monstruos~~ ✅ - 112 monstruos con IA cíclica/aleatoria/condicional/mixta obtenida de máquinas de estados de C#
- ~~Condiciones previas de eventos~~ ✅ - 25 eventos con condiciones de IsAllowed() analizadas a partir del código fuente C#
- ~~Conservación de archivos beta~~ ✅ - Los datos e imágenes beta versionados permanecen conservados; `/beta` sirve la compilación activa y `/images` permite explorar los recursos archivados
- ~~Bot de Discord~~ ✅ - [Knowledge Demon](https://bot.spire-codex.com): comandos de barra para cada entidad (`/card`, `/relic`, `/monster`, `/potion`, `/character`, `/event`, `/power`, `/enchantment`, `/lookup`, `/meta`), RSS de noticias de Steam y un conjunto completo de herramientas de moderación derivado de [Kernel](https://github.com/ptrlrd/kernel)
- ~~Codex Score y lista de niveles~~ ✅ - Nota por entidad calculada a partir de partidas de la comunidad mediante **contracción bayesiana**: `shrunk = (wins + PRIOR_WEIGHT × baseline) / (n + PRIOR_WEIGHT)`, después escalada de 0 a 100 y asignada a S/A/B/C/D/F. Evita el ruido de muestras pequeñas (una carta con una sola partida y un resultado de 1/1 no obtiene una S: vuelve hacia la distribución previa). Se precalienta al iniciar el backend. Se muestra como `ScoreBadge` en la pestaña Estadísticas de las páginas de detalles, en páginas dedicadas de listas de niveles y en la página de metodología `/leaderboards/scoring`.
- ~~Pestaña Estadísticas en páginas de detalles~~ ✅ - Insignia destacada de puntuación + resumen en prosa + enlaces a partidas recientes mediante `EntityRunStats`.
- **Constructor de mazos** - Diseño teórico interactivo de mazos
- **Backend de base de datos** - Sustituir la carga de JSON por idioma por PostgreSQL JSONB (o una alternativa). El almacenamiento de partidas enviadas ya se trasladó de SQLite a MongoDB (mayo de 2026).

## Agradecimientos

Gracias a **vesper-arch**, **terracubist**, **U77654**, **Purple Aspired Dreaming**, **Kobaru** y **Severi** por las pruebas de control de calidad, los informes de errores y sus contribuciones. La lista completa de colaboradores -incluidos los donantes de Ko-fi que mantienen el proyecto en marcha- se encuentra en [spire-codex.com/thank-you](https://spire-codex.com/thank-you).

## Tecnologías utilizadas

- **Backend**: Python, FastAPI, Pydantic, slowapi y compresión GZip
- **Base de datos de partidas**: MongoDB (estadísticas de la comunidad, clasificaciones y cuentas de usuario), con una colección materializada `stats_summary` y un proceso de actualización en segundo plano con elección de líder. La ruta heredada de SQLite se conserva como alternativa sin conexión.
- **Cuentas**: Steam OpenID + Discord OAuth y cookies de sesión JWT
- **Frontend**: Next.js 16 (App Router), TypeScript, Tailwind CSS y compatibilidad con 15 idiomas
- **Imágenes/CDN**: Cloudflare R2 servido mediante `cdn.spire-codex.com` (webp)
- **Analítica y observabilidad**: Umami autoalojado, Prometheus + node-exporter
- **Renderizador de Spine**: Node.js, Playwright y @esotericsoftware/spine-webgl (WebGL mediante Chrome sin interfaz gráfica)
- **Infraestructura**: Docker, CI de GitHub Actions (ejecutor autoalojado) con caché de BuildKit respaldada por el registro y despliegue mediante Ansible/SSH
- **Herramientas**: Python (canalización de actualización, comparación de registros de cambios y copia de imágenes)

## Licencia

- **Código fuente**: [PolyForm Noncommercial 1.0.0](LICENSE.md) - se puede usar, modificar y redistribuir libremente con fines no comerciales. No se permite vender el software.
- **API alojada**: [API_TERMS.md](API_TERMS.md) - uso gratuito para cualquier fin dentro de los límites de solicitudes publicados; ponte en contacto mediante Discord o una incidencia si necesitas más.
- **Datos del juego** (cartas, reliquias, monstruos, etc.): © Mega Crit Games. Se ofrecen aquí como referencia para la comunidad bajo términos de uso legítimo / educativo. No utilices estos datos para recompilar, volver a empaquetar ni redistribuir el juego.

Las contribuciones se aceptan bajo los mismos términos de PolyForm Noncommercial 1.0.0; consulta [CONTRIBUTING.md](CONTRIBUTING.md#license).
