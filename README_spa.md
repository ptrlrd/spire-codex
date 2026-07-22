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

Una base de datos y API completas para los datos de **Slay the Spire 2**, creadas mediante ingeniería inversa de los archivos del juego. Admite los **15 idiomas** incluidos con el juego.

**Sitio en producción**: [spire-codex.com](https://spire-codex.com)

**ID de aplicación de Steam**: 2868840

## Cómo se creó

Slay the Spire 2 está desarrollado con Godot 4, pero toda la lógica del juego reside en una DLL de C#/.NET 8 (`sts2.dll`), no en GDScript. El flujo de procesamiento de datos:

1. **Extracción del PCK** - [GDRE Tools](https://github.com/bruvzg/gdsdecomp) extrae el archivo `.pck` de Godot para recuperar imágenes, animaciones de Spine y datos de localización (~9,947 archivos).

2. **Descompilación de la DLL** - [ILSpy](https://github.com/icsharpcode/ILSpy) descompila `sts2.dll` en aproximadamente 3,300 archivos de código fuente C# legibles que contienen todos los modelos del juego.

3. **Análisis de datos** - 22 analizadores de Python basados en expresiones regulares extraen datos estructurados del código fuente C# descompilado y generan archivos JSON por idioma en `data/{lang}/`:
   - **Cartas**: constructores `base(cost, CardType, CardRarity, TargetType)` + `DamageVar`, `BlockVar`, `PowerVar<T>` para estadísticas
   - **Personajes**: `StartingHp`, `StartingGold`, `MaxEnergy`, `StartingDeck`, `StartingRelics`
   - **Reliquias/Pociones**: rareza, conjunto y descripciones resueltas a partir de plantillas SmartFormat
   - **Monstruos**: rangos de PV, escalado de Ascensión mediante `AscensionHelper`, máquinas de estados de movimientos con intenciones por movimiento (Attack/Defend/Buff/Debuff/Status/Summon/Heal), valores de daño, cantidades de impactos múltiples (incluidos patrones de AscensionHelper), poderes innatos de `AfterAddedToRoom` (42 monstruos con variantes de Ascensión), poderes aplicados por movimiento (objetivo + cantidad de `PowerCmd.Apply<T>`), bloqueo, curación, contexto del encuentro (acto, tipo de sala), **patrones de ataque** analizados desde `GenerateMoveStateMachine()` (112 monstruos: cíclicos, aleatorios, condicionales y mixtos)
   - **Encantamientos**: restricciones de tipo de carta, acumulabilidad y escalado basado en Amount
   - **Encuentros**: composiciones de monstruos, tipo de sala (Boss/Elite/Monster), ubicación en el acto y etiquetas
   - **Eventos**: árboles de decisiones de varias páginas (56 de 66 eventos), opciones con resultados, ubicación en el acto, referencias de modelos `StringVar` resueltas a nombres visibles, valores calculados en tiempo de ejecución (costos crecientes mediante `GetDecipherCost()`, rangos de oro mediante `CalculateVars` con `NextInt`/`NextFloat`, patrones de curación completa), **condiciones previas** de `IsAllowed()` (25 eventos: condiciones de oro, PV, acto, mazo, reliquia y poción)
   - **Ancianos**: 8 PNJ Ancianos con epítetos, diálogos específicos por personaje, ofertas de reliquias e iconos de retrato
   - **Poderes**: PowerType (Buff/Debuff), PowerStackType (Counter/Single), DynamicVars y descripciones
   - **Épocas/Historias**: datos de progresión de la línea temporal con requisitos de desbloqueo
   - **Orbes**: valores pasivos/de evocación y descripciones
   - **Aflicciones**: acumulabilidad, texto adicional de carta y descripciones
   - **Modificadores**: descripciones de modificadores de partida
   - **Palabras clave**: definiciones de palabras clave de cartas (Exhaust, Ethereal, Innate, etc.)
   - **Intenciones**: descripciones de intenciones de monstruos con iconos
   - **Logros**: condiciones de desbloqueo, descripciones, categorías, asociación con personajes y umbrales obtenidos del código fuente C# (33 logros)
   - **Actos**: orden de descubrimiento de jefes, encuentros, eventos, Ancianos y cantidades de salas
   - **Niveles de Ascensión**: 11 niveles (0–10) con descripciones de la localización
   - **Conjuntos de pociones**: conjuntos específicos por personaje analizados a partir de clases de conjuntos y referencias de épocas
   - **Traducciones**: mapas de filtros por idioma (tipos de carta, rarezas, palabras clave → nombres localizados) y cadenas de interfaz (títulos de secciones, descripciones, nombres de personajes) para su uso en el frontend

4. **Resolución de descripciones** - Un módulo compartido `description_resolver.py` resuelve las plantillas de localización SmartFormat (`{Damage:diff()}`, `{Energy:energyIcons()}`, `{Cards:plural:card|cards}`) en texto legible con marcadores de texto enriquecido para su renderizado en el frontend. Las variables dinámicas en tiempo de ejecución (por ejemplo, `{Card}`, `{Relic}`) se conservan como marcadores de posición legibles. Las referencias `StringVar` de los eventos (por ejemplo, `{Enchantment1}` → `ModelDb.Enchantment<Sharp>().Title`) se resuelven a nombres visibles mediante búsquedas de localización.

5. **Renderizado de Spine** - Los personajes y monstruos son animaciones esqueléticas de Spine, no imágenes estáticas. Un renderizador Node.js sin interfaz gráfica compone poses de reposo en retratos PNG de 512×512. Los 111 monstruos tienen imágenes: 100 renderizados a partir de esqueletos de Spine, 6 con alias de esqueletos compartidos (Flyconid→flying_mushrooms, Ovicopter→egg_layer, Crusher/Rocket→kaiser_crab) y 5 obtenidos de recursos estáticos del juego (Doormaker). También renderiza los 5 personajes (poses de combate, zona de descanso y selección de personaje), PNJ y fondos. Las variantes basadas en apariencias (Cultists, Bowlbugs, Cubex) se renderizan individualmente. Consulta [Renderizador de Spine](#renderizador-de-spine) más adelante.

6. **Imágenes** - Retratos de cartas, iconos de reliquias/pociones, arte de personajes, sprites de monstruos, iconos de retratos de Ancianos e iconos de encuentros con jefes extraídos de los recursos del juego y servidos como archivos estáticos.

7. **Comparación de registros de cambios** - Una herramienta de diferencias compara los datos JSON entre versiones del juego (mediante referencias de git o directorios), y registra las entidades agregadas/eliminadas/modificadas por categoría con diferencias a nivel de campo. Los registros de cambios se identifican por la versión del juego en Steam + un número opcional de revisión de Codex.

## Estructura del proyecto

```
spire-codex/
├── backend/                    # Backend de FastAPI
│   ├── app/
│   │   ├── main.py             # Entrada de la aplicación, CORS, GZip, limitación de solicitudes, archivos estáticos
│   │   ├── dependencies.py     # Dependencias compartidas (validación de lang, nombres de idiomas)
│   │   ├── routers/            # Endpoints de la API (más de 25 routers)
│   │   ├── models/schemas.py   # Modelos de Pydantic
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
│   │       ├── keyword_parser.py        # Palabras clave, intenciones, orbes, aflicciones, modificadores, logros (con condiciones de desbloqueo)
│   │       ├── guide_parser.py          # Guías Markdown con metadatos YAML
│   │       ├── epoch_parser.py
│   │       ├── act_parser.py
│   │       ├── ascension_parser.py
│   │       ├── pool_parser.py            # Agrega el conjunto del personaje a las pociones
│   │       ├── translation_parser.py    # Genera translations.json por idioma
│   │       ├── description_resolver.py   # Resolutor compartido de SmartFormat
│   │       ├── parser_paths.py           # Configuración compartida de rutas (sobrescrituras mediante variables de entorno para beta)
│   │       └── parse_all.py              # Coordina todos los analizadores (15 idiomas)
│   ├── static/images/          # Imágenes del juego (no incluidas en el repositorio)
│   ├── scripts/copy_images.py  # Copia imágenes desde la extracción → archivos estáticos
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/                   # Next.js 16 + TypeScript + Tailwind CSS
│   ├── app/
│   │   ├── contexts/           # LanguageContext, BetaVersionContext
│   │   ├── components/         # CardGrid, RichDescription, SearchFilter,
│   │   │                       #   GlobalSearch, Navbar, Footer, LanguageSelector, VersionSelector
│   │   └── ...                 # Páginas: cartas, personajes, reliquias, monstruos, pociones,
│   │                           #   encantamientos, encuentros, eventos, poderes, línea temporal,
│   │                           #   referencia, imágenes, registro de cambios, acerca de, mercader, comparar,
│   │                           #   mechanics/[slug], guides/[slug], guides/submit,
│   │                           #   tablas de clasificación, leaderboards/submit, leaderboards/stats,
│   │                           #   runs/[hash] (vista de partida compartida)
│   │                           #   Páginas de detalle: cards/[id], characters/[id], relics/[id],
│   │                           #   monsters/[id], potions/[id], enchantments/[id],
│   │                           #   encounters/[id], events/[id], powers/[id], keywords/[id],
│   │                           #   acts/[id], ascensions/[id], intents/[id], orbs/[id],
│   │                           #   afflictions/[id], modifiers/[id], achievements/[id]
│   │                           #   i18n: [lang]/... replica todas las rutas para 14 idiomas distintos del inglés
│   ├── lib/
│   │   ├── api.ts              # Cliente de API + interfaces de TypeScript
│   │   ├── fetch-cache.ts      # Caché de solicitudes en memoria del lado del cliente (TTL de 5 min)
│   │   ├── seo.ts              # Utilidades SEO compartidas (stripTags, SITE_URL, SITE_NAME)
│   │   ├── jsonld.ts           # Generadores de esquemas JSON-LD (BreadcrumbList, CollectionPage, Article, WebSite, FAQPage)
│   │   ├── ui-translations.ts # Traducciones de cadenas de interfaz para 14 idiomas distintos del inglés
│   │   ├── languages.ts       # Configuración de i18n: 14 códigos de idioma, asignaciones hreflang
│   │   └── use-lang-prefix.ts # Hook para construir URLs según el idioma
│   └── Dockerfile
├── tools/
│   ├── spine-renderer/         # Renderizador de esqueletos de Spine sin interfaz gráfica
│   │   ├── render_webgl.mjs     # Renderizador WebGL (un solo esqueleto): sin artefactos de uniones
│   │   ├── render_all_webgl.mjs # Renderizador WebGL por lotes (todos los archivos .skel)
│   │   ├── render_gif.mjs      # Renderizador de animaciones (WebP/GIF/APNG compatible con apariencias + animaciones)
│   │   ├── render.mjs           # Renderizador de canvas heredado (presenta uniones de triángulos)
│   │   ├── render_all.mjs       # Renderizador de canvas por lotes heredado
│   │   ├── render_skins2.mjs    # Renderizador de variantes de apariencia
│   │   ├── render_utils.mjs     # Utilidades compartidas de renderizado en canvas
│   │   └── package.json
│   ├── diff_data.py            # Generador de diferencias para registros de cambios
│   ├── update.py               # Flujo de actualización multiplataforma
│   └── deploy.py               # Compilación local de Docker + envío a Docker Hub
├── data/                       # Archivos de datos JSON analizados
│   ├── {lang}/                 # Directorios por idioma (eng, kor, jpn, fra, etc.)
│   ├── changelogs/             # Archivos JSON de registros de cambios (identificados por versión del juego)
│   ├── guides/                 # Archivos de guías Markdown con metadatos YAML
│   ├── guides.json             # Datos de guías analizados
│   ├── runs/                   # Archivos JSON de partidas enviadas (por hash de jugador)
│   └── runs.db                 # SQLite heredado (reemplazado por MongoDB; conservado como alternativa sin conexión)
├── extraction/                 # Archivos sin procesar del juego (no incluidos en el repositorio)
│   ├── raw/                    # Proyecto Godot extraído con GDRE (estable)
│   ├── decompiled/             # Salida de ILSpy (estable)
│   └── beta/                   # Rama beta de Steam (raw/ + decompiled/)
├── data-beta/                  # Datos beta analizados (versionados: v0.102.0/, v0.103.0/, latest → enlace simbólico)
├── docker-compose.yml          # Desarrollo local
├── docker-compose.prod.yml     # Producción
├── .github/workflows/
│   └── ci.yml                  # CI de GitHub Actions: lint, comprobación de tipos, detección de secretos, compilación+envío de Docker, despliegue por SSH
└── .forgejo/workflows/
    └── build.yml               # Alternativa de CI de Forgejo conservada (basada en buildah, no activa)
```

## Servicios públicos

| Host | Propósito |
|---|---|
| [`spire-codex.com`](https://spire-codex.com) | Sitio web público y API del mismo origen. El canal beta activo se encuentra bajo `/beta`. |
| `cdn.spire-codex.com` | Host de objetos de Cloudflare R2 para arte del juego, renderizados completos de cartas, renderizados localizados y recursos beta archivados. |
| [`bot.spire-codex.com`](https://bot.spire-codex.com) | Página de inicio de Knowledge Demon y panel de personal autenticado mediante Discord. El bot consume la API principal de Codex. |
| `analytics.spire-codex.com` | Script y panel de Umami autoalojados. Su base de datos PostgreSQL permanece en una red privada de Docker. |
| `tierlists.spire-codex.com` | Host de objetos R2 dedicado a imágenes generadas de vista previa de listas de niveles. |
| `beta.spire-codex.com` | Host público retirado. Cloudflare redirige las solicitudes a la misma ruta del dominio raíz. |

Los hosts de la CDN y de listas de niveles son almacenes de objetos y no sitios web navegables, por lo que es normal recibir un `404` en la raíz de cualquiera de ellos.

## Páginas del sitio web

| Página | Ruta | Descripción |
|---|---|---|
| Inicio | `/` | Panel con cantidades de entidades, tarjetas de categorías y enlaces a personajes |
| Cartas | `/cards` | Cuadrícula de cartas filtrable con vista detallada modal |
| Detalle de carta | `/cards/[id]` | Estadísticas completas de la carta, información de mejora e imagen |
| Personajes | `/characters` | Cuadrícula general de personajes |
| Detalle de personaje | `/characters/[id]` | Estadísticas, mazo/reliquias iniciales, citas y árboles de diálogo de PNJ |
| Reliquias | `/relics` | Cuadrícula de reliquias filtrable |
| Detalle de reliquia | `/relics/[id]` | Información completa de la reliquia con texto descriptivo enriquecido |
| Monstruos | `/monsters` | Cuadrícula de monstruos con PV, movimientos y renderizados de Spine |
| Detalle de monstruo | `/monsters/[id]` | PV, movimientos con intenciones/daño/poderes/bloqueo, enlaces a encuentros e información emergente de poderes |
| Pociones | `/potions` | Cuadrícula de pociones filtrable (rareza, conjunto del personaje) |
| Detalle de poción | `/potions/[id]` | Información completa de la poción |
| Encantamientos | `/enchantments` | Lista de encantamientos con filtros por tipo de carta |
| Detalle de encantamiento | `/enchantments/[id]` | Información completa del encantamiento |
| Encuentros | `/encounters` | Composiciones de encuentros por acto/tipo de sala |
| Detalle de encuentro | `/encounters/[id]` | Formación de monstruos, tipo de sala y etiquetas |
| Eventos | `/events` | Árboles de eventos de varias páginas con opciones expandibles |
| Detalle de evento | `/events/[id]` | Páginas completas del evento, opciones y diálogo de Ancianos |
| Poderes | `/powers` | Mejoras, penalizaciones y poderes neutrales |
| Detalle de poder | `/powers/[id]` | Información del poder con las cartas que lo aplican |
| Palabras clave | `/keywords` | Lista de palabras clave de cartas |
| Detalle de palabra clave | `/keywords/[id]` | Descripción de la palabra clave con una cuadrícula de cartas filtrable |
| Mercader | `/merchant` | Precios de cartas/reliquias/pociones, costos de eliminación de cartas y mercader falso |
| Comparar | `/compare` | Centro de comparación de personajes (10 pares) |
| Detalle de comparación | `/compare/[pair]` | Comparación de personajes lado a lado |
| Desarrolladores | `/developers` | Documentación de la API, documentación de widgets y exportaciones de datos |
| Galería | `/showcase` | Galería de proyectos de la comunidad |
| Línea temporal | `/timeline` | Progresión de épocas agrupada por era y requisitos de desbloqueo |
| Detalle de acto | `/acts/[id]` | Jefes, encuentros, eventos y Ancianos de un acto |
| Detalle de Ascensión | `/ascensions/[id]` | Descripción del nivel de Ascensión con navegación anterior/siguiente |
| Detalle de intención | `/intents/[id]` | Icono y descripción de la intención |
| Detalle de orbe | `/orbs/[id]` | Icono del orbe y descripción pasiva/de evocación |
| Detalle de aflicción | `/afflictions/[id]` | Descripción y acumulabilidad de la aflicción |
| Detalle de modificador | `/modifiers/[id]` | Descripción del modificador de partida |
| Detalle de logro | `/achievements/[id]` | Descripción del logro |
| Insignias | `/badges` | Las 25 insignias de final de partida agrupadas por niveles / nivel único / solo multijugador |
| Detalle de insignia | `/badges/[id]` | Desglose por nivel (Bronce / Plata / Oro), indicadores de victoria requerida + multijugador e icono |
| Mecánicas | `/mechanics` | Centro de mecánicas del juego: 27 secciones seleccionables con páginas SEO individuales |
| Detalle de mecánica | `/mechanics/[slug]` | Probabilidades de cartas, distribución de reliquias, obtención de pociones, generación del mapa, conjuntos de jefes, combate, secretos y curiosidades |
| Guías | `/guides` | Guías estratégicas de la comunidad con búsqueda/filtros |
| Detalle de guía | `/guides/[slug]` | Guía completa con renderizado Markdown + widget de información emergente |
| Enviar guía | `/guides/submit` | Formulario de envío de guías (webhook de Discord) |
| Tablas de clasificación | `/leaderboards` | Clasificaciones de victorias más rápidas y mayor Ascensión con filtros individual/cooperativo y de modo de juego (estándar / diario / Today / personalizado). Todo el estado de los filtros está en la URL, por lo que cualquier vista se puede compartir |
| Explorar partidas | `/runs` | Explorador completo de partidas con barra de búsqueda por expresiones (rangos `user:`, `char:`, `asc:`, AND de múltiples valores `card:`/`relic:`, rangos `version:`, `mode:`, `result:`, `players:`), además de filtros desplegables, ordenamiento y URLs compartibles |
| Enviar una partida | `/leaderboards/submit` | Carga de archivos `.run` mediante arrastrar y soltar, con enlace a la aplicación complementaria de Overwolf, inicio de sesión con Steam/Discord para asociar partidas automáticamente y tus partidas recientes |
| Estadísticas | `/leaderboards/stats` | Tablas clasificadas (tasa de selección, tasa de victorias, cantidad) para cartas, reliquias, pociones y encuentros. Filtra por personaje / Ascensión / resultado |
| Perfil | `/profile` | Estadísticas del usuario que inició sesión (principales cartas/reliquias/pociones, desglose por personaje), récords personales, comparación competitiva (clasificación diaria de hoy, posiciones globales, tasa de victorias frente a la comunidad) y administración de partidas |
| Configuración | `/settings` | Configuración de la cuenta: nombre de usuario, correo electrónico y cuentas vinculadas de Steam/Discord |
| Partida compartida | `/runs/[hash]` | Resumen de victoria/derrota con el estilo del juego, iconos seleccionables de nodos del mapa, franja de reliquias y cuadrícula de cartas pequeñas |
| Referencia | `/reference` | Todos los elementos son seleccionables: actos, Ascensiones, palabras clave, orbes, aflicciones, intenciones, modificadores y logros |
| Imágenes | `/images` | Recursos navegables del juego con descarga ZIP por categoría |
| Registro de cambios | `/changelog` | Diferencias de datos entre actualizaciones del juego |
| Acerca de | `/about` | Información del proyecto, estadísticas y visualización del flujo de procesamiento |
| Agradecimientos | `/thank-you` | Colaboradores de Ko-fi y miembros de la comunidad (separado de Acerca de para poder enlazar directamente la página) |
| Knowledge Demon | `/knowledge-demon` | Página informativa del bot de Discord: comandos slash, funciones de moderación y llamada a la acción para instalarlo |
| Noticias | `/news` | Feed replicado de anuncios de Steam; los enlaces canónicos regresan a Steam para que sea complementario, no duplicado |
| Artículo de noticias | `/news/[gid]` | Anuncio individual de Steam con cuerpo BBCode sanitizado y JSON-LD `NewsArticle` |
| Lista de niveles | `/tier-list` | Centro de listas de niveles de Codex Score (niveles S → F) para cartas / reliquias / pociones |
| Detalle de lista de niveles | `/tier-list/[type]` | Filas visuales S/A/B/C/D/F para un tipo de entidad, obtenidas de `/api/runs/scores/{type}` |
| Puntuación | `/leaderboards/scoring` | Página de metodología de Codex Score: contracción bayesiana, peso previo, rango de escala y umbrales de niveles |

## Endpoints de la API

Todos los endpoints de datos aceptan un parámetro de consulta opcional `?lang=` (predeterminado: `eng`). Las respuestas se **comprimen con GZip** y se almacenan en caché con `Cache-Control: public, max-age=300`.

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
| `GET /api/badges` | Todas las insignias de final de partida | `tiered`, `multiplayer_only`, `requires_win`, `search`, `lang` |
| `GET /api/badges/{id}` | Una insignia con desglose por nivel | `lang` |
| `GET /api/history/{entity_type}/{entity_id}` | Historial de versiones por entidad (sin distinción entre mayúsculas y minúsculas, más reciente primero) | - |
| `GET /api/epochs` | Épocas de la línea temporal | `era`, `search`, `lang` |
| `GET /api/epochs/{id}` | Una época | `lang` |
| `GET /api/stories` | Entradas de historias | `lang` |
| `GET /api/stories/{id}` | Una historia | `lang` |
| `GET /api/acts` | Todos los actos | `lang` |
| `GET /api/acts/{id}` | Un acto | `lang` |
| `GET /api/ascensions` | Niveles de Ascensión (0–10) | `lang` |
| `GET /api/ascensions/{id}` | Un nivel de Ascensión | `lang` |
| `GET /api/stats` | Cantidades de entidades en todas las categorías | `lang` |
| `GET /api/languages` | Idiomas disponibles con nombres visibles | - |
| `GET /api/translations` | Mapas de traducción para valores de filtros y cadenas de interfaz | `lang` |
| `GET /api/images` | Categorías de imágenes con listas de archivos. Las categorías con prefijo beta aceptan `?version=`. | - |
| `GET /api/images/beta/versions` | Versiones disponibles de archivos de imágenes beta + destino del enlace simbólico `latest` | - |
| `GET /api/images/{category}/download` | Descarga ZIP de una categoría de imágenes. Las categorías beta aceptan `?version=`. | - |
| `GET /api/changelogs` | Resúmenes de registros de cambios (todas las versiones) | - |
| `GET /api/changelogs/{tag}` | Registro de cambios completo de una etiqueta de versión | - |
| `GET /api/guides` | Guías de la comunidad | `category`, `difficulty`, `tag`, `search` |
| `GET /api/guides/{slug}` | Una guía (con contenido Markdown) | - |
| `POST /api/guides` | Enviar guía (redirigida a Discord) | - |
| `POST /api/runs` | Enviar una partida (JSON de archivo .run) | `username` |
| `GET /api/runs/list` | Listar/explorar partidas enviadas | `character`, `win`, `username`, `seed`, `build_id`, `build_ids`, `players`, `game_mode`, `ascension`, `ascension_min`, `ascension_max`, `card`, `relic`, `today`, `sort`, `page`, `limit` |
| `GET /api/runs/shared/{hash}` | Datos completos de una partida por hash (combina `username` desde la base de datos) | - |
| `GET /api/runs/stats` | Estadísticas agregadas de la comunidad | `character`, `win`, `ascension`, `game_mode`, `players` |
| `GET /api/runs/leaderboard` | Clasificación ordenada solo de victorias | `category` (`fastest`, `highest_ascension`), `character`, `players`, `game_mode`, `today`, `page`, `limit` |
| `GET /api/runs/leaderboard/rank/{hash}` | Posición de una sola partida ganada dentro de su clasificación | `category` |
| `GET /api/runs/scores/{type}` | Codex Score (puntuación de tasa de victorias con contracción bayesiana + nivel S/A/B/C/D/F) por entidad | `type` = `cards`/`relics`/`potions` |
| `GET /api/runs/encounter-stats` | Agregados por encuentro (aparición, tasa de mortalidad, daño/turnos promedio) | `act`, `room_type`, `multiplayer`, `page`, `limit` |
| `POST /api/runs/claim` | Asociar un nombre de usuario a partidas enviadas anteriormente mediante hash | - |
| `GET /api/runs/versions` | Versiones diferentes del juego entre las partidas enviadas | - |
| `GET /api/exports/{lang}` | ZIP de todos los archivos JSON de entidades para un idioma | `lang` |
| `GET /api/news` | Anuncios de Steam + noticias de la comunidad (archivados localmente) | `feed_type`, `feedname`, `tag`, `since`, `search`, `limit`, `offset` |
| `GET /api/news/{gid}` | Un artículo de noticias (cuerpo HTML/BBCode sin procesar) | - |
| `GET /api/merchant/config` | Configuración de precios del mercader extraída automáticamente | - |
| `POST /api/feedback` | Enviar comentarios (redirigidos a Discord) | - |
| `GET /api/versions` | Metadatos de versiones expuestos por la raíz de datos activa | - |

**Cuentas de usuario** (sesión mediante cookie/JWT; inicio de sesión con Steam o Discord):

| Endpoint | Descripción |
|---|---|
| `GET /api/auth/me` | Usuario que inició sesión actualmente |
| `GET /api/auth/steam/redirect` | Iniciar sesión mediante Steam OpenID |
| `GET /api/auth/discord/start` | Iniciar sesión mediante Discord OAuth |
| `POST /api/auth/logout` | Borrar la cookie de sesión |
| `PATCH /api/auth/username` / `PATCH /api/auth/email` | Actualizar campos del perfil |
| `GET /api/auth/runs` / `POST /api/auth/runs/upload` / `DELETE /api/auth/runs/{hash}` | Listar, cargar y eliminar las partidas del usuario |
| `GET /api/auth/stats` | Estadísticas agregadas por usuario (página de perfil) |
| `GET /api/auth/personal-bests` | Partida individual/cooperativa más rápida, mayor Ascensión y clasificación diaria de hoy y de todos los tiempos |
| `GET /api/auth/competitive` | Clasificación diaria de hoy, posiciones globales y tasa de victorias frente a la comunidad |

Límite de **60 solicitudes por minuto** por IP. El envío de comentarios y guías está limitado a **3-5 por minuto** por IP. Documentación interactiva en `/docs` (Swagger UI).

### Localización

Todos los datos del juego se ofrecen en 15 idiomas mediante los propios archivos de localización de Slay the Spire 2. Pasa `?lang=` a cualquier endpoint de datos. Usa `?channel=beta` para los datos beta públicos activos; los conjuntos archivados de imágenes beta usan `?version=`.

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

**Qué permanece en inglés**: identificadores de la API y valores estructurales de filtros como `room_type`, `type`/`stack_type` de poderes y `pool`, además de las marcas de productos y parte del contenido editorial o creado por la comunidad.

Los parámetros de filtro (`type=Attack`, `rarity=Rare`, `keyword=Exhaust`) siempre usan valores en inglés, independientemente del idioma; el backend los traduce a sus equivalentes localizados antes de buscar coincidencias.

Ejemplo: `GET /api/cards?lang=kor&type=Attack` devuelve datos de cartas en coreano cuyo tipo es "공격", filtrados correctamente aunque el parámetro esté en inglés.

### Formato de texto enriquecido

Los campos de texto (`description`, `loss_text`, `flavor`, `text` de diálogos, `title`/`description` de opciones) pueden contener etiquetas con estilo BBCode de Godot conservadas a partir de los datos de localización del juego:

| Etiqueta | Tipo | Ejemplo | Se renderiza como |
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

Si consumes la API directamente, puedes eliminar estas etiquetas con una expresión regular como `\[/?[a-z]+(?::\d+)?\]` o renderizarlas en tu propio frontend. El campo `description_raw` (cuando está disponible) contiene la plantilla SmartFormat sin resolver.

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

Inicia ambos servicios (backend en 8000, frontend en 3000).

### Variables de entorno

La API principal de solo lectura no necesita configuración. Las funciones opcionales siguientes se habilitan mediante variables de entorno (configuradas en el entorno del backend o en el archivo de Compose):

| Variable | La usa | Notas |
|---|---|---|
| `MONGO_URL` | Backend | Base de datos de partidas (estadísticas de la comunidad, tablas de clasificación, cuentas). Cuando no está definida, el backend recurre a la ruta heredada de SQLite (`data/runs.db`). |
| `JWT_SECRET` | Backend | Firma los tokens de sesión de las cuentas de usuario. |
| `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` | Backend | Inicio de sesión mediante Discord OAuth. |
| `FRONTEND_URL`, `SPIRE_CODEX_PUBLIC_BASE` | Backend | URLs de redirección / retorno de OAuth. |
| `ENVIRONMENT` | Backend | `production` activa el comportamiento de cookies seguras. |
| `NEXT_PUBLIC_API_URL` | Frontend (compilación) | Base de la API; queda vacía en producción para que las imágenes y datos se resuelvan desde el mismo origen. |
| `NEXT_PUBLIC_CDN_URL` | Frontend (compilación) | Cuando se define (por ejemplo, `https://cdn.spire-codex.com`), las imágenes se cargan desde la CDN en lugar de `/static`. |
| `NEXT_PUBLIC_SITE_URL` | Frontend (compilación) | URL canónica del sitio para los metadatos. |

Las cuentas de usuario y la CDN están desactivadas de forma predeterminada, por lo que el proyecto funciona de extremo a extremo sin ninguna de estas variables.

## Flujo de actualización

Un script multiplataforma de Python gestiona el flujo completo de actualización cuando se publica una nueva versión del juego:

```bash
# Flujo completo: extraer archivos del juego, analizar datos, renderizar sprites y copiar imágenes:
python3 tools/update.py

# Especificar manualmente la ruta de instalación del juego:
python3 tools/update.py --game-dir "/path/to/Slay the Spire 2"

# Omitir la extracción (ya existe un directorio extraction/ actualizado):
python3 tools/update.py --skip-extract

# Solo volver a analizar los datos (sin extracción ni renderizado):
python3 tools/update.py --parse-only

# Solo volver a renderizar sprites de Spine:
python3 tools/update.py --render-only

# Generar un registro de cambios después de actualizar:
python3 tools/update.py --changelog --game-version "0.98.2" --build-id "22238966"
```

El script detecta automáticamente tu sistema operativo y encuentra el directorio de instalación de Steam. Requisitos por paso:

| Paso | Herramienta | Instalación |
|---|---|---|
| Extracción del PCK | `gdre_tools` | [Versiones de GDRE Tools](https://github.com/bruvzg/gdsdecomp/releases) |
| Descompilación de la DLL | `ilspycmd` | `dotnet tool install ilspycmd -g` |
| Análisis de datos | Python 3.10+ | Integrado |
| Copia de imágenes | Python 3.10+ | Integrado |
| Renderizado de Spine | Node.js 20+ | [nodejs.org](https://nodejs.org) |

### Pasos manuales

Si prefieres ejecutar los pasos individualmente:

```bash
# Analizar todos los datos (los 15 idiomas)
cd backend/app/parsers && python3 parse_all.py

# Analizar un solo idioma
cd backend/app/parsers && python3 parse_all.py --lang eng

# Copiar imágenes desde la extracción a archivos estáticos (PNG + WebP desde la misma fuente, sin
# una cadena con pérdida a través de un WebP existente del backend). WebP con quality=95, method=6.
python3 backend/scripts/copy_images.py

# Renderizar sprites de Spine (WebGL: sin artefactos de uniones de triángulos)
cd tools/spine-renderer && npm install
npx playwright install chromium           # Solo la primera vez
node render_all_webgl.mjs                 # Los 138 esqueletos mediante Chrome sin interfaz gráfica
node render_webgl.mjs <skel_dir> <out> [size] [--skin=a,b] [--anim=name] [--anim-time=N]

# Sobrescrituras comunes por monstruo:
#   --skin=moss1,diamondeye   combina apariencias variantes con la predeterminada (cubex_construct)
#   --skin=skin1              sustituye la predeterminada por una variante (scroll_of_biting)
#   --anim-time=0.5           avanza la animación N segundos antes de la captura
#   --anim=attack             sobrescribe la animación de reposo elegida automáticamente
#
# Sustitución de marcadores de posición de humo: gas_bomb_2.png, the_forgotten_2.png y
# living_smog_2.png se distribuyen como paneles magenta "Smoke Placeholder" en la fuente.
# render_webgl.mjs los sustituye por una nube ciruela oscura generada mediante procedimientos
# con las mismas dimensiones antes de cargarlos en GL y luego fuerza slot.color.a = 1.0
# en los slots sustituidos (los artistas definieron una opacidad baja porque esperaban un shader).

# Reencuadrar sprites de monstruos demasiado pequeños (posprocesamiento: recorta al cuadro
# delimitador alfa real y escala para llenar aproximadamente el 92 % del marco de 512x512):
python3 tools/rescale_bestiary.py fuzzy_wurm_crawler thieving_hopper terror_eel

# Renderizador de canvas heredado (presenta artefactos de uniones de triángulos: evitar)
# node render_all.mjs / node render.mjs
```

## Sistema de registros de cambios

Registra los cambios entre actualizaciones del juego mediante diferencias a nivel de campo en todas las categorías de entidades.

### Generar un registro de cambios

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
| `game_version` | Versión del juego en Steam (por ejemplo, `"0.98.2"`) |
| `build_id` | ID de compilación de Steam |
| `tag` | Clave de versión única (por ejemplo, `"1.0.3"`) |
| `date` | Fecha de la actualización |
| `title` | Título legible |
| `summary` | Cantidades: `{ added, removed, changed }` |
| `features` / `fixes` / `api_changes` | Notas de versión seleccionadas manualmente. Se conservan al regenerar una etiqueta existente mediante `diff_data.py`: la diferencia de datos se sobrescribe, pero estos arreglos se combinan. |
| `categories` | Diferencias por categoría con entidades agregadas/eliminadas/modificadas. Los cambios de campos recorren de forma recursiva diccionarios/listas anidados para que cada hoja tenga su propia fila (por ejemplo, `vars.DamageVar: 8 → 10`) en lugar de un `vars: 2 fields → 2 fields` opaco. |

### Retención de escritura única

Los archivos bajo `data/changelogs/` son registros históricos de escritura única. `.github/workflows/changelog-guard.yml` bloquea cualquier PR que **modifique o elimine** un registro de cambios existente. Los archivos nuevos (`A`) siempre están permitidos; las modificaciones requieren la etiqueta `changelog-edit-approved` en el PR. Consulta `CONTRIBUTING.md → Changelog Retention` para conocer la política y el procedimiento de anulación.

### Historial por entidad

`GET /api/history/{entity_type}/{entity_id}` recorre todos los registros de cambios y devuelve las entradas que afectaron a la entidad solicitada, primero las más recientes. El panel de historial de versiones de cada página de detalle (`/cards/{id}`, `/monsters/{id}`, etc.) usa este endpoint.

## Despliegue

### CI/CD (GitHub Actions)

Los envíos a `main` activan `.github/workflows/ci.yml` en el ejecutor autoalojado de Kubernetes. El flujo ejecuta detección de secretos, comprobaciones de ESLint y TypeScript, además de comprobaciones de lint y formato con ruff; luego compila y publica las imágenes estables bajo `:latest`. También sigue compilando las imágenes beta independientes bajo `:beta` para `docker-compose.beta.yml`; esas imágenes se conservan operativamente, pero las páginas beta públicas se sirven desde el despliegue principal en `/beta`.

El frontend estable recibe `UMAMI_WEBSITE_ID`. La imagen beta independiente recibe `UMAMI_BETA_WEBSITE_ID`, aunque el tráfico público de `/beta` usa el frontend estable y su propiedad de analítica.

La CI **no** realiza el despliegue. El trabajo de despliegue automático por hora del host de DigitalOcean se encarga del despliegue.

> **Nota:** `.forgejo/workflows/build.yml` se conserva como alternativa inactiva basada en buildah.

### Compilación local + envío

Omite la CI y publica directamente desde tu equipo:

```bash
# Compilar y publicar ambas imágenes:
python3 tools/deploy.py

# Solo el frontend:
python3 tools/deploy.py --frontend

# Solo el backend:
python3 tools/deploy.py --backend

# Probar la compilación sin publicar:
python3 tools/deploy.py --no-push

# Etiquetar una versión:
python3 tools/deploy.py --tag v0.98.2

# Compilar y publicar imágenes beta (etiqueta :beta, omite IndexNow):
python3 tools/deploy.py --beta
```

Detecta automáticamente Apple Silicon y realiza compilación cruzada para `linux/amd64` mediante `docker buildx`. Primero requiere `docker login`.

### Producción

La aplicación pública y la pila beta independiente conservada se ejecutan en el mismo host de DigitalOcean. El tráfico público usa `spire-codex.com`; el host secundario de Lightsail ejecuta MongoDB.

**Despliegue automático** - Un cron por hora en el host de DigitalOcean ejecuta `/usr/local/bin/spire-codex-autodeploy` a los :03. Cuando avanza el commit descargado, obtiene los cambios y recrea tanto `docker-compose.prod.yml` como `docker-compose.beta.yml`, excepto en las actualizaciones limitadas a `data/news/*`. Después purga la caché de Cloudflare. Los registros se escriben en `/var/log/spire-codex-autodeploy.log`. Consulta [`infrastructure/ansible/README.md`](infrastructure/ansible/README.md) para obtener información sobre la instalación y las operaciones.

**Despliegue manual**:

```bash
cd infrastructure/ansible
./bin/do-ansible playbooks/deploy.yml

# Pila beta independiente conservada
./bin/do-ansible playbooks/deploy.yml -e compose_file=docker-compose.beta.yml
```

Los datos de producción se montan mediante bind mount (`./data:/data:ro` para el frontend y con lectura y escritura para el backend). El estado de noticias y partidas se lee de los datos montados al procesar cada solicitud, por lo que las actualizaciones de `data/news/*.json` no requieren reiniciar los contenedores.

### Canal beta (spire-codex.com/beta)

La aplicación pública sirve los datos estables y de Steam `public-beta` como dos canales de contenido. Las páginas beta se encuentran en [`spire-codex.com/beta`](https://spire-codex.com/beta), con rutas localizadas en `/{lang}/beta/...`. La página principal `/images` también muestra las versiones archivadas de recursos beta.

`beta.spire-codex.com` ya no se usa públicamente. Actualmente, Cloudflare envía una redirección `302` que conserva la ruta hacia el dominio raíz, pero no agrega `/beta` ni `channel=beta`. Por lo tanto, los enlaces antiguos a páginas llegan a la página estable correspondiente y las solicitudes antiguas a la API reciben datos estables después de seguir la redirección. Los clientes nuevos de la API deben usar la API principal con un canal explícito, por ejemplo, `https://spire-codex.com/api/cards?channel=beta`.

**Arquitectura**: `get_channel` resuelve `?channel=beta|stable` en una `ContextVar` de Python; también reconoce un encabezado de host `beta.*` para tráfico directo al origen. `data_service.py` carga las solicitudes beta desde `data-beta/<latest>/` y recurre a los archivos estables individualmente cuando es necesario. `GET /api/beta/diff` y `GET /api/beta/version` describen la beta activa, y el frontend renderiza el canal seleccionado bajo `/beta`.

La pila independiente `docker-compose.beta.yml` y las imágenes `:beta` siguen compilándose y recreándose mediante la automatización del despliegue. Mientras la redirección de Cloudflare esté activa, no constituyen el sitio beta público.

**Distribución de datos**: cada compilación archivada reside bajo `data-beta/<version>/`, y el puntero `latest` selecciona la compilación activa. Cada versión tiene su propio directorio `changelogs/`. Los archivos de imágenes beta replican esta distribución en `backend/static/images/beta/<version>/{cards,monsters,misc,ui,vfx}/`.

**Ingesta automatizada** - `tools/beta-watch/` se ejecuta como trabajo de launchd en la Mac de desarrollo los jueves de 15:00 a 22:45, cada 15 minutos. Cuando SteamCMD informa un nuevo ID de compilación de `public-beta`, extrae y descompila el juego, analiza todos los idiomas, genera las diferencias, sincroniza las imágenes versionadas y abre un PR `auto/beta-<version>`. Consulta [`tools/beta-watch/README.md`](tools/beta-watch/README.md) para obtener información sobre la instalación y las operaciones.

**Ingesta manual**:

```bash
VERSION=vX.Y.Z
PREVIOUS=vA.B.C

# Primero extraer y descompilar los archivos beta del juego y luego analizarlos desde la raíz del repositorio.
(cd backend/app/parsers && \
  EXTRACTION_DIR=../../../extraction/beta \
  DATA_DIR="../../../data-beta/$VERSION" \
  python3 parse_all.py)

VERSION="$VERSION" tools/beta-watch/sync-images.sh

python3 tools/diff_data.py "data-beta/$PREVIOUS/eng" "data-beta/$VERSION/eng" \
  --format json --output-dir "data-beta/$VERSION/changelogs" \
  --game-version "${VERSION#v}" --title "Beta ${VERSION#v}"
```

`sync-images.sh` actualiza el enlace simbólico de imágenes `latest`. El PR de ingesta incluye los cambios versionados de datos e imágenes; después de combinarlo, el despliegue automático actualiza ambas pilas conservadas.

## Renderizador de Spine

Los sprites de monstruos de StS2 son animaciones esqueléticas de [Spine](http://esotericsoftware.com/): cada monstruo consta de un `.skel` (esqueleto binario) + `.atlas` + hoja de sprites `.png`, no de una sola imagen. El renderizador los compone en retratos PNG estáticos.

### Renderizador WebGL (actual)

El renderizador WebGL (`render_webgl.mjs`, `render_all_webgl.mjs`) usa **Playwright + spine-webgl** para renderizar esqueletos mediante la GPU de Chrome sin interfaz gráfica. Esto produce renderizados limpios **sin artefactos de uniones de triángulos**.

**Cómo funciona:**
1. Inicia Chrome sin interfaz gráfica mediante Playwright con WebGL habilitado
2. Carga los datos del esqueleto + atlas + texturas como base64 en la página del navegador
3. Crea un canvas WebGL y configura el shader + procesador de lotes de polígonos de spine-webgl
4. Aplica la animación de reposo y calcula los límites (excluidos los slots de sombras/suelo)
5. Renderiza mediante rasterización de triángulos en la GPU, sin rutas de recorte del canvas ni uniones
6. Lee los píxeles sin procesar mediante `gl.readPixels` y los voltea verticalmente (WebGL trabaja de abajo hacia arriba)
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
| Monstruos | 99 | 103 dirs | Los 111 monstruos del juego tienen imágenes (99 renderizados + alias/estáticos) |
| Personajes | 16 | 16 | Poses de combate, zona de descanso y selección |
| Fondos/PNJ | 14 | 17 | Neow, Tezcatara, salas de mercader y menú principal |
| VFX/Interfaz | 9 | 22 | La mayoría de los VFX necesitan fotogramas de animación específicos |
| **Total** | **138** | **158** | 20 omitidos (sin atlas, solo VFX o en blanco) |

### Renderizador de animaciones

El renderizador de animaciones (`render_gif.mjs`) renderiza animaciones de reposo/ataque de Spine como WebP animado, GIF o APNG. Admite variantes de apariencia, selección de animación y escritura progresiva de fotogramas en disco para animaciones grandes.

**Formatos de salida compatibles:**
- **`.webp`** (recomendado): WebP animado sin pérdida con alfa completo, aproximadamente un 33 % más pequeño que APNG. Los fotogramas se escriben progresivamente en disco para evitar agotar la memoria.
- **`.gif`**: 256 colores y transparencia binaria. Los archivos más pequeños, pero con la menor calidad.
- **`.apng`**: alfa completo como WebP, pero archivos más grandes.

```bash
# Renderizar WebP animado sin pérdida (recomendado)
NODE_OPTIONS="--max-old-space-size=8192" node render_gif.mjs <skel_dir> <output.webp> [size] [--fps=N]

# Con variante de apariencia (para bowlbug, cultists, cubex, etc.)
node render_gif.mjs <skel_dir> output.webp 256 --fps=10 --skin=rock

# Animación específica (predeterminada: bucle de reposo)
node render_gif.mjs <skel_dir> output.webp 256 --fps=12 --anim=attack

# Modo de silueta blanca (para iconos de nodos de jefes en el mapa)
node render_gif.mjs <skel_dir> output.webp 256 --white
```

**Biblioteca de animaciones:** 209 archivos WebP animados sin pérdida:
- 15 animaciones de personajes (combate/selección/descanso × 5 personajes) a 512×512
- 103 animaciones de reposo de monstruos a 256×256
- 91 animaciones de ataque de monstruos a 256×256

**Variantes de apariencia:** 13 monstruos tienen variantes de apariencia (bowlbug, cubex_construct, cultists, etc.). Usa `--skin=` para seleccionarlas. A menudo, la apariencia predeterminada solo muestra el esqueleto base sin cuerpo.

**Shader de nodo de jefe en el mapa:** el juego usa `boss_map_point.gdshader`, que trata los canales RGB como máscaras:
- **Canal rojo** × `map_color` (predeterminado: beige `0.671, 0.58, 0.478`) → color de relleno
- **Canal azul** × `black_layer_color` (predeterminado: negro `0, 0, 0`) → color del contorno
- **Canal verde** × blanco `1, 1, 1` → luces

### Renderizador de canvas heredado

El renderizador de canvas (`render.mjs`, `render_all.mjs`) usa `spine-canvas` con `triangleRendering = true`. Esto produce **artefactos visibles de malla alámbrica** debido al suavizado de las rutas `clip()` del canvas entre triángulos adyacentes. Usa el renderizador WebGL en su lugar.

### Dependencias

- `@esotericsoftware/spine-webgl` ^4.2.107 - Entorno de ejecución de Spine para WebGL (actual)
- `playwright` - Chrome sin interfaz gráfica para el renderizado WebGL
- `gif-encoder-2` - Codificación GIF para el renderizador de animaciones
- `canvas` ^3.1.0 - Implementación de Canvas para Node.js (búfer de fotogramas del renderizador de animaciones)
- `Pillow` (Python) - compone WebP/APNG a partir de fotogramas PNG renderizados
- `@esotericsoftware/spine-canvas` ^4.2.106 - Entorno de ejecución de Spine para Canvas (heredado)

## Extracción de archivos del juego

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

## Control de versiones

Spire Codex usa control de versiones semántico **`1.X.Y`**:

| Segmento | Significado |
|---------|---------|
| **1** | Versión principal de Spire Codex (no cambia salvo que haya una reescritura completa) |
| **X** | Aumenta cuando Mega Crit publica un parche del juego |
| **Y** | Aumenta con nuestras propias correcciones y mejoras del analizador/frontend |

Ejemplos: `v1.0.0` = versión inicial, `v1.0.1` = nuestras correcciones de errores, `v1.1.0` = primer parche de Mega Crit incorporado.

## SEO

- **Datos estructurados (JSON-LD)**: WebSite + VideoGame (inicio), CollectionPage + ItemList (páginas de listas), Article + BreadcrumbList + FAQPage (páginas de detalle), SoftwareApplication (desarrolladores), NewsArticle (news/[gid])
- **Formato del título**: `"Slay the Spire 2 (sts2) {Page Title} | Spire Codex"` - estandarizado en todas las páginas. Las partidas usan `"{username} - {char} - Ascension {N} {win/loss} - Slay the Spire 2 (sts2) | Spire Codex"`. Se incluye "(sts2)" en línea para que coincidan las consultas entre idiomas `sts2 tier list` / `sts2 card list`.
- **Mapa del sitio**: XML plano en `/sitemap.xml` con `force-dynamic` (se renderiza en el servidor, no durante la compilación). Más de 20,000 URLs, incluidas páginas de detalle de entidades, páginas de matrices de exploración, páginas de listas de niveles, metodología de puntuación, detalles de runs/[hash] y réplicas i18n para todos los tipos de entidad
- **SEO internacional**: rutas `/{lang}/` para 14 idiomas distintos del inglés con alternativas hreflang **bidireccionales**; las páginas raíz en inglés también emiten alternativas para cada configuración regional + `x-default` mediante `buildLanguageAlternates(path)` en `lib/seo.ts` (corrige el grupo de contenido duplicado "Crawled - not indexed" de GSC, donde Google trataba las páginas localizadas como duplicados sin referencias de retorno)
- **SEO programático**: 41 páginas de exploración de cartas en `/cards/browse/` (rare-attacks, ironclad-skills, etc.) + 3 páginas de listas de niveles (`/tier-list/{cards,relics,potions}`)
- **EntityProse adaptado a la configuración regional**: las páginas de detalle renderizan un breve párrafo específico de cada idioma en lugar de cuerpos idénticos en inglés para todas las configuraciones regionales
- **Enlaces internos**: poderes ↔ cartas, encuentros → monstruos, palabras clave de cartas → páginas centrales de palabras clave, movimientos de monstruos → páginas de poderes (con información emergente), páginas de actos → encuentros/eventos, filas de listas de niveles → pestaña Estadísticas del detalle de entidad
- **Open Graph y Twitter Cards**: imágenes OG por entidad y Twitter Cards `summary_large_image`
- **URLs canónicas**: cada página declara una URL canónica

## Widgets integrables

### Widget de información emergente
Agrega información emergente al pasar el cursor para los 13 tipos de entidad en cualquier sitio web:
```html
<script src="https://spire-codex.com/widget/spire-codex-tooltip.js"></script>
<p>Start with [[Bash]] and [[relic:Burning Blood]].</p>
```

### Widget de registro de cambios
Integra un visor interactivo de registros de cambios:
```html
<div id="scx-changelog"></div>
<script src="https://spire-codex.com/widget/spire-codex-changelog.js"></script>
```

Documentación completa: [spire-codex.com/developers](https://spire-codex.com/developers)

## Hoja de ruta

- ~~Páginas de detalle individuales~~ ✅
- ~~Búsqueda global~~ ✅
- ~~Compatibilidad multilingüe (15 idiomas)~~ ✅
- ~~SEO (JSON-LD, OG/Twitter, mapa del sitio, hreflang)~~ ✅
- ~~Widget de información emergente (los 13 tipos de entidad)~~ ✅
- ~~Páginas de comparación de personajes (10 pares)~~ ✅
- ~~Páginas centrales de palabras clave~~ ✅
- ~~Guía del mercader (precios obtenidos del C# descompilado)~~ ✅
- ~~Documentación para desarrolladores + exportaciones de datos~~ ✅
- ~~SEO internacional (13 páginas de inicio por idioma)~~ ✅
- ~~Matriz de exploración de cartas (41 páginas de SEO programático)~~ ✅
- ~~Guías de la comunidad~~ ✅ - Markdown con metadatos YAML, formulario de envío, widget de información emergente y redes sociales del autor
- ~~Página de mecánicas del juego~~ ✅ - 27 páginas SEO individuales: tasas de obtención, combate, mapa, jefes, secretos y curiosidades
- ~~Partidas de la comunidad~~ ✅ - Envío de partidas, explorador, partidas compartidas y estadísticas en vivo
- ~~Descripciones de mejoras de cartas~~ ✅ - upgrade_description para las 403 cartas mejorables
- ~~Poderes innatos de monstruos~~ ✅ - 42 monstruos con poderes de AfterAddedToRoom
- ~~Condiciones de desbloqueo de logros~~ ✅ - Categoría, personaje y umbral obtenidos del código fuente C#
- ~~Patrones de ataque de monstruos~~ ✅ - 112 monstruos con IA cíclica/aleatoria/condicional/mixta obtenida de máquinas de estados de C#
- ~~Condiciones previas de eventos~~ ✅ - 25 eventos con condiciones de IsAllowed() analizadas a partir del código fuente C#
- ~~Retención del archivo beta~~ ✅ - Los datos y las imágenes beta versionados permanecen conservados; `/beta` sirve la compilación activa y `/images` permite explorar recursos archivados
- ~~Bot de Discord~~ ✅ - [Knowledge Demon](https://bot.spire-codex.com): comandos slash para cada entidad (`/card`, `/relic`, `/monster`, `/potion`, `/character`, `/event`, `/power`, `/enchantment`, `/lookup`, `/meta`), RSS de noticias de Steam y un conjunto completo de herramientas de moderación bifurcado de [Kernel](https://github.com/ptrlrd/kernel)
- ~~Codex Score y lista de niveles~~ ✅ - Calificación por entidad calculada a partir de partidas de la comunidad mediante **contracción bayesiana**: `shrunk = (wins + PRIOR_WEIGHT × baseline) / (n + PRIOR_WEIGHT)`, luego escalada de 0 a 100 y asignada a S/A/B/C/D/F. Evita el ruido de muestras pequeñas (una carta con una sola partida y resultado 1/1 no recibe una S: retrocede hacia el valor previo). Se precalienta al iniciar el backend. Se muestra como `ScoreBadge` en la pestaña Estadísticas de las páginas de detalle, en páginas dedicadas de listas de niveles y en la página de metodología `/leaderboards/scoring`.
- ~~Pestaña Estadísticas en páginas de detalle~~ ✅ - Insignia principal de puntuación + resumen en prosa + enlaces a partidas recientes mediante `EntityRunStats`.
- **Constructor de mazos** - Diseño teórico interactivo de mazos
- **Backend de base de datos** - Reemplazar la carga de archivos JSON por idioma con PostgreSQL JSONB (u otra alternativa). El almacenamiento de partidas enviadas ya se migró de SQLite a MongoDB (mayo de 2026).

## Agradecimientos

Gracias a **vesper-arch**, **terracubist**, **U77654**, **Purple Aspired Dreaming**, **Kobaru** y **Severi** por las pruebas de control de calidad, los informes de errores y sus contribuciones. La lista completa de colaboradores -incluidos los donantes de Ko-fi que mantienen el proyecto en funcionamiento- se encuentra en [spire-codex.com/thank-you](https://spire-codex.com/thank-you).

## Pila tecnológica

- **Backend**: Python, FastAPI, Pydantic, slowapi, compresión GZip
- **Base de datos de partidas**: MongoDB (estadísticas de la comunidad, tablas de clasificación, cuentas de usuario), con una colección materializada `stats_summary` y un actualizador en segundo plano con elección de líder. La ruta heredada de SQLite se conserva como alternativa sin conexión.
- **Cuentas**: Steam OpenID + Discord OAuth, cookies de sesión JWT
- **Frontend**: Next.js 16 (App Router), TypeScript, Tailwind CSS, compatibilidad con 15 idiomas
- **Imágenes/CDN**: Cloudflare R2 servido mediante `cdn.spire-codex.com` (webp)
- **Analítica y observabilidad**: Umami autoalojado, Prometheus + node-exporter
- **Renderizador de Spine**: Node.js, Playwright, @esotericsoftware/spine-webgl (WebGL mediante Chrome sin interfaz gráfica)
- **Infraestructura**: Docker, CI de GitHub Actions (ejecutor autoalojado) con caché de BuildKit respaldada por registro, despliegue mediante Ansible/SSH
- **Herramientas**: Python (flujo de actualización, comparación de registros de cambios, copia de imágenes)

## Licencia

- **Código fuente**: [PolyForm Noncommercial 1.0.0](LICENSE.md) - uso, modificación y redistribución gratuitos para fines no comerciales. No está permitida la venta del software.
- **API alojada**: [API_TERMS.md](API_TERMS.md) - gratuita para cualquier uso dentro de los límites de solicitudes publicados; comunícate por Discord o mediante un issue si necesitas más.
- **Datos del juego** (cartas, reliquias, monstruos, etc.): © Mega Crit Games. Se ofrecen aquí como referencia para la comunidad bajo condiciones de uso legítimo / educativo. No uses estos datos para recompilar, volver a empaquetar ni redistribuir el juego.

Las contribuciones se aceptan bajo los mismos términos de PolyForm Noncommercial 1.0.0; consulta [CONTRIBUTING.md](CONTRIBUTING.md#license).
