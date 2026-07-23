<p align="center">
  <img src="frontend/public/spire-codex-white-silent-black-background.png" alt="Logotipo do Spire Codex" width="200" />
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

Um banco de dados e uma API abrangentes para os dados do jogo **Slay the Spire 2**, criados por meio da engenharia reversa dos arquivos do jogo. Compatível com todos os **15 idiomas** incluídos no jogo.

**Site ao vivo**: [spire-codex.com](https://spire-codex.com)

**ID do aplicativo Steam**: 2868840

## Como foi criado

Slay the Spire 2 foi desenvolvido com Godot 4, mas toda a lógica do jogo reside em uma DLL C#/.NET 8 (`sts2.dll`), não em GDScript. O pipeline de dados:

1. **Extração do PCK** - O [GDRE Tools](https://github.com/bruvzg/gdsdecomp) extrai o arquivo `.pck` do Godot para recuperar imagens, animações Spine e dados de localização (cerca de 9.947 arquivos).

2. **Descompilação da DLL** - O [ILSpy](https://github.com/icsharpcode/ILSpy) descompila `sts2.dll` em cerca de 3.300 arquivos de código-fonte C# legíveis, contendo todos os modelos do jogo.

3. **Análise dos dados** - 22 analisadores Python baseados em expressões regulares extraem dados estruturados do código-fonte C# descompilado, gerando JSON por idioma em `data/{lang}/`:
   - **Cartas**: construtores `base(cost, CardType, CardRarity, TargetType)` + `DamageVar`, `BlockVar`, `PowerVar<T>` para atributos
   - **Personagens**: `StartingHp`, `StartingGold`, `MaxEnergy`, `StartingDeck`, `StartingRelics`
   - **Relíquias/Poções**: raridade, conjunto e descrições resolvidas a partir de modelos SmartFormat
   - **Monstros**: faixas de PV, escalonamento de ascensão via `AscensionHelper`, máquinas de estados de movimentos com intenções por movimento (Ataque/Defesa/Bônus/Penalidade/Status/Invocação/Cura), valores de dano, quantidades de golpes múltiplos (incluindo padrões de AscensionHelper), poderes inatos de `AfterAddedToRoom` (42 monstros com variantes de ascensão), poderes aplicados por movimento (alvo + quantidade de `PowerCmd.Apply<T>`), bloqueio, cura, contexto do encontro (ato, tipo de sala), **padrões de ataque** analisados de `GenerateMoveStateMachine()` (112 monstros - cíclico, aleatório, condicional, misto)
   - **Encantamentos**: restrições de tipo de carta, possibilidade de acumulação, escalonamento baseado em Amount
   - **Encontros**: composições de monstros, tipo de sala (Chefe/Elite/Monstro), posicionamento no ato, tags
   - **Eventos**: árvores de decisão com várias páginas (56 de 66 eventos), escolhas com resultados, posicionamento no ato, referências de modelos `StringVar` resolvidas para nomes de exibição, valores calculados em tempo de execução (custos crescentes via `GetDecipherCost()`, faixas de ouro via `CalculateVars` com `NextInt`/`NextFloat`, padrões de cura total), **pré-condições** de `IsAllowed()` (25 eventos - condições de ouro, PV, ato, baralho, relíquia e poção)
   - **Anciões**: 8 NPCs Anciões com epítetos, diálogos específicos por personagem, ofertas de relíquias e ícones de retrato
   - **Poderes**: PowerType (Bônus/Penalidade), PowerStackType (Contador/Único), DynamicVars, descrições
   - **Épocas/Histórias**: dados de progressão da linha do tempo com requisitos de desbloqueio
   - **Orbes**: valores passivos/de evocação, descrições
   - **Aflições**: possibilidade de acumulação, texto adicional da carta, descrições
   - **Modificadores**: descrições dos modificadores de partida
   - **Palavras-chave**: definições de palavras-chave das cartas (Exaurir, Etéreo, Inato etc.)
   - **Intenções**: descrições das intenções dos monstros com ícones
   - **Conquistas**: condições de desbloqueio, descrições, categorias, associação a personagens e limites obtidos do código-fonte C# (33 conquistas)
   - **Atos**: ordem de descoberta dos chefes, encontros, eventos, anciões, quantidade de salas
   - **Níveis de Ascensão**: 11 níveis (0–10) com descrições obtidas da localização
   - **Conjuntos de Poções**: conjuntos específicos por personagem analisados a partir de classes de conjunto e referências de épocas
   - **Traduções**: mapas de filtros por idioma (tipos de carta, raridades, palavras-chave → nomes localizados) e strings da interface (títulos de seções, descrições, nomes de personagens) para consumo pelo frontend

4. **Resolução de descrições** - Um módulo compartilhado `description_resolver.py` resolve modelos de localização SmartFormat (`{Damage:diff()}`, `{Energy:energyIcons()}`, `{Cards:plural:card|cards}`) em texto legível, com marcadores de rich text para renderização no frontend. Variáveis dinâmicas de tempo de execução (por exemplo, `{Card}`, `{Relic}`) são preservadas como espaços reservados legíveis. Referências `StringVar` em eventos (por exemplo, `{Enchantment1}` → `ModelDb.Enchantment<Sharp>().Title`) são resolvidas para nomes de exibição por meio de consulta à localização.

5. **Renderização Spine** - Personagens e monstros são animações esqueléticas Spine, não imagens estáticas. Um renderizador Node.js headless monta poses ociosas em retratos PNG de 512×512. Todos os 111 monstros têm imagens: 100 renderizados a partir de esqueletos Spine, 6 usando aliases de esqueletos compartilhados (Flyconid→flying_mushrooms, Ovicopter→egg_layer, Crusher/Rocket→kaiser_crab) e 5 obtidos de recursos estáticos do jogo (Doormaker). Também renderiza todos os 5 personagens (poses de combate, local de descanso e seleção de personagem), NPCs e planos de fundo. Variantes baseadas em skins (Cultists, Bowlbugs, Cubex) são renderizadas individualmente. Consulte [Renderizador Spine](#renderizador-spine) abaixo.

6. **Imagens** - Retratos de cartas, ícones de relíquias/poções, arte de personagens, sprites de monstros, ícones de retratos dos Anciões e ícones de encontros com chefes são extraídos dos recursos do jogo e servidos como arquivos estáticos.

7. **Comparação de changelogs** - Uma ferramenta de diff compara dados JSON entre versões do jogo (por meio de referências git ou diretórios), acompanhando entidades adicionadas/removidas/alteradas por categoria, com diferenças no nível dos campos. Os changelogs são identificados pela versão do jogo no Steam + um número opcional de revisão do Codex.

## Estrutura do projeto

```
spire-codex/
├── backend/                    # Backend FastAPI
│   ├── app/
│   │   ├── main.py             # Entrada do aplicativo, CORS, GZip, limitação de taxa, arquivos estáticos
│   │   ├── dependencies.py     # Dependências compartilhadas (validação de idioma, nomes dos idiomas)
│   │   ├── routers/            # Endpoints da API (mais de 25 roteadores)
│   │   ├── models/schemas.py   # Modelos Pydantic
│   │   ├── services/           # Carregamento de dados JSON (cache LRU, suporte a 14 idiomas)
│   │   └── parsers/            # Analisadores de código-fonte C# → JSON
│   │       ├── card_parser.py
│   │       ├── character_parser.py
│   │       ├── monster_parser.py
│   │       ├── relic_parser.py
│   │       ├── potion_parser.py
│   │       ├── enchantment_parser.py
│   │       ├── encounter_parser.py
│   │       ├── event_parser.py
│   │       ├── power_parser.py
│   │       ├── keyword_parser.py        # Palavras-chave, intenções, orbes, aflições, modificadores, conquistas (com condições de desbloqueio)
│   │       ├── guide_parser.py          # Guias Markdown com frontmatter YAML
│   │       ├── epoch_parser.py
│   │       ├── act_parser.py
│   │       ├── ascension_parser.py
│   │       ├── pool_parser.py            # Adiciona o conjunto do personagem às poções
│   │       ├── translation_parser.py    # Gera translations.json por idioma
│   │       ├── description_resolver.py   # Resolvedor SmartFormat compartilhado
│   │       ├── parser_paths.py           # Configuração compartilhada de caminhos (substituições por variáveis de ambiente para a versão beta)
│   │       └── parse_all.py              # Orquestra todos os analisadores (15 idiomas)
│   ├── static/images/          # Imagens do jogo (não incluídas no repositório)
│   ├── scripts/copy_images.py  # Copia imagens da extração → static
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/                   # Next.js 16 + TypeScript + Tailwind CSS
│   ├── app/
│   │   ├── contexts/           # LanguageContext, BetaVersionContext
│   │   ├── components/         # CardGrid, RichDescription, SearchFilter,
│   │   │                       #   GlobalSearch, Navbar, Footer, LanguageSelector, VersionSelector
│   │   └── ...                 # Páginas: cartas, personagens, relíquias, monstros, poções,
│   │                           #   encantamentos, encontros, eventos, poderes, linha do tempo,
│   │                           #   referência, imagens, changelog, sobre, mercador, comparação,
│   │                           #   mechanics/[slug], guides/[slug], guides/submit,
│   │                           #   placares, leaderboards/submit, leaderboards/stats,
│   │                           #   runs/[hash] (visualização compartilhada da partida)
│   │                           #   Páginas de detalhes: cards/[id], characters/[id], relics/[id],
│   │                           #   monsters/[id], potions/[id], enchantments/[id],
│   │                           #   encounters/[id], events/[id], powers/[id], keywords/[id],
│   │                           #   acts/[id], ascensions/[id], intents/[id], orbs/[id],
│   │                           #   afflictions/[id], modifiers/[id], achievements/[id]
│   │                           #   i18n: [lang]/... espelha todas as rotas para 14 idiomas além do inglês
│   ├── lib/
│   │   ├── api.ts              # Cliente da API + interfaces TypeScript
│   │   ├── fetch-cache.ts      # Cache de requisições em memória no cliente (TTL de 5 min)
│   │   ├── seo.ts              # Utilitários de SEO compartilhados (stripTags, SITE_URL, SITE_NAME)
│   │   ├── jsonld.ts           # Construtores de esquemas JSON-LD (BreadcrumbList, CollectionPage, Article, WebSite, FAQPage)
│   │   ├── ui-translations.ts # Traduções de strings da interface para 14 idiomas além do inglês
│   │   ├── languages.ts       # Configuração de i18n - 14 códigos de idioma, mapeamentos hreflang
│   │   └── use-lang-prefix.ts # Hook para construção de URLs com reconhecimento de idioma
│   └── Dockerfile
├── tools/
│   ├── spine-renderer/         # Renderizador headless de esqueletos Spine
│   │   ├── render_webgl.mjs     # Renderizador WebGL (um esqueleto) - sem artefatos nas junções
│   │   ├── render_all_webgl.mjs # Renderizador WebGL em lote (todos os arquivos .skel)
│   │   ├── render_gif.mjs      # Renderizador de animações (WebP/GIF/APNG com suporte a skin + animação)
│   │   ├── render.mjs           # Renderizador canvas legado (tem junções entre triângulos)
│   │   ├── render_all.mjs       # Renderizador canvas legado em lote
│   │   ├── render_skins2.mjs    # Renderizador de variantes de skin
│   │   ├── render_utils.mjs     # Utilitários compartilhados de renderização em canvas
│   │   └── package.json
│   ├── diff_data.py            # Gerador de diffs de changelog
│   ├── update.py               # Pipeline de atualização multiplataforma
│   └── deploy.py               # Build local do Docker + envio para o Docker Hub
├── data/                       # Arquivos de dados JSON analisados
│   ├── {lang}/                 # Diretórios por idioma (eng, kor, jpn, fra etc.)
│   ├── changelogs/             # Arquivos JSON de changelog (identificados pela versão do jogo)
│   ├── guides/                 # Arquivos de guia Markdown com frontmatter YAML
│   ├── guides.json             # Dados de guias analisados
│   ├── runs/                   # Arquivos JSON de partidas enviadas (por hash do jogador)
│   └── runs.db                 # SQLite legado (substituído pelo MongoDB; mantido como alternativa offline)
├── extraction/                 # Arquivos brutos do jogo (não incluídos no repositório)
│   ├── raw/                    # Projeto Godot extraído pelo GDRE (estável)
│   ├── decompiled/             # Saída do ILSpy (estável)
│   └── beta/                   # Ramificação beta do Steam (raw/ + decompiled/)
├── data-beta/                  # Dados beta analisados (versionados: v0.102.0/, v0.103.0/, latest → link simbólico)
├── docker-compose.yml          # Desenvolvimento local
├── docker-compose.prod.yml     # Produção
├── .github/workflows/
│   └── ci.yml                  # CI do GitHub Actions: lint, verificação de tipos, varredura de segredos, build+push do Docker, implantação via SSH
└── .forgejo/workflows/
    └── build.yml               # Alternativa de CI do Forgejo mantida (baseada em buildah, inativa)
```

## Serviços públicos

| Host | Finalidade |
|---|---|
| [`spire-codex.com`](https://spire-codex.com) | Site público e API de mesma origem. O canal beta ativo fica em `/beta`. |
| `cdn.spire-codex.com` | Host de objetos Cloudflare R2 para arte do jogo, renderizações completas de cartas, renderizações localizadas e recursos beta arquivados. |
| [`bot.spire-codex.com`](https://bot.spire-codex.com) | Página inicial do Knowledge Demon e painel da equipe autenticado pelo Discord. O bot consome a API principal do Codex. |
| `analytics.spire-codex.com` | Script e painel Umami auto-hospedados. Seu banco de dados PostgreSQL permanece em uma rede Docker privada. |
| `tierlists.spire-codex.com` | Host de objetos R2 dedicado às imagens de pré-visualização geradas para listas de níveis. |
| `beta.spire-codex.com` | Host público desativado. O Cloudflare redireciona as solicitações para o mesmo caminho no domínio raiz. |

Os hosts da CDN e das listas de níveis são armazenamentos de objetos, não sites navegáveis, portanto um `404` na raiz de qualquer um deles é esperado.

## Páginas do site

| Página | Rota | Descrição |
|---|---|---|
| Início | `/` | Painel com contagens de entidades, cartões de categorias e links de personagens |
| Cartas | `/cards` | Grade filtrável de cartas com visualização detalhada em modal |
| Detalhes da carta | `/cards/[id]` | Atributos completos da carta, informações de melhoria e imagem |
| Personagens | `/characters` | Grade de visão geral dos personagens |
| Detalhes do personagem | `/characters/[id]` | Atributos, baralho/relíquias iniciais, citações e árvores de diálogo de NPCs |
| Relíquias | `/relics` | Grade filtrável de relíquias |
| Detalhes da relíquia | `/relics/[id]` | Informações completas da relíquia com texto de ambientação em rich text |
| Monstros | `/monsters` | Grade de monstros com PV, movimentos e renderizações Spine |
| Detalhes do monstro | `/monsters/[id]` | PV, movimentos com intenções/dano/poderes/bloqueio, links de encontros e dicas de poderes |
| Poções | `/potions` | Grade filtrável de poções (raridade, conjunto do personagem) |
| Detalhes da poção | `/potions/[id]` | Informações completas da poção |
| Encantamentos | `/enchantments` | Lista de encantamentos com filtros por tipo de carta |
| Detalhes do encantamento | `/enchantments/[id]` | Informações completas do encantamento |
| Encontros | `/encounters` | Composições de encontros por ato/tipo de sala |
| Detalhes do encontro | `/encounters/[id]` | Formação de monstros, tipo de sala e tags |
| Eventos | `/events` | Árvores de eventos com várias páginas e escolhas expansíveis |
| Detalhes do evento | `/events/[id]` | Páginas completas do evento, opções e diálogo dos Anciões |
| Poderes | `/powers` | Bônus, penalidades e poderes neutros |
| Detalhes do poder | `/powers/[id]` | Informações do poder com as cartas que o aplicam |
| Palavras-chave | `/keywords` | Lista de palavras-chave das cartas |
| Detalhes da palavra-chave | `/keywords/[id]` | Descrição da palavra-chave com grade filtrável de cartas |
| Mercador | `/merchant` | Preços de cartas/relíquias/poções, custos de remoção de cartas e mercador falso |
| Comparação | `/compare` | Central de comparação de personagens (10 pares) |
| Detalhes da comparação | `/compare/[pair]` | Comparação lado a lado de personagens |
| Desenvolvedores | `/developers` | Documentação da API, documentação de widgets e exportações de dados |
| Vitrine | `/showcase` | Galeria de projetos da comunidade |
| Linha do tempo | `/timeline` | Progressão de épocas agrupada por era e requisitos de desbloqueio |
| Detalhes do ato | `/acts/[id]` | Chefes, encontros, eventos e anciões de um ato |
| Detalhes da ascensão | `/ascensions/[id]` | Descrição do nível de ascensão com navegação anterior/próximo |
| Detalhes da intenção | `/intents/[id]` | Ícone e descrição da intenção |
| Detalhes do orbe | `/orbs/[id]` | Ícone do orbe e descrição passiva/de evocação |
| Detalhes da aflição | `/afflictions/[id]` | Descrição da aflição e possibilidade de acumulação |
| Detalhes do modificador | `/modifiers/[id]` | Descrição do modificador da partida |
| Detalhes da conquista | `/achievements/[id]` | Descrição da conquista |
| Distintivos | `/badges` | Todos os 25 distintivos de fim de partida agrupados por níveis / nível único / somente multijogador |
| Detalhes do distintivo | `/badges/[id]` | Detalhamento por nível (Bronze / Prata / Ouro), indicadores de vitória obrigatória + multijogador e ícone |
| Mecânicas | `/mechanics` | Central de mecânicas do jogo - 27 seções clicáveis com páginas individuais de SEO |
| Detalhes da mecânica | `/mechanics/[slug]` | Probabilidades de cartas, distribuição de relíquias, obtenção de poções, geração de mapa, conjuntos de chefes, combate, segredos e curiosidades |
| Guias | `/guides` | Guias de estratégia da comunidade com pesquisa/filtro |
| Detalhes do guia | `/guides/[slug]` | Guia completo com renderização de Markdown + widget de dica |
| Enviar guia | `/guides/submit` | Formulário de envio de guia (webhook do Discord) |
| Placares | `/leaderboards` | Classificações de Vitórias Mais Rápidas e Maior Ascensão com filtros de modo individual/cooperativo e modo de jogo (padrão / diário / Hoje / personalizado). Todo o estado dos filtros fica na URL, portanto qualquer visualização pode ser compartilhada |
| Explorar partidas | `/runs` | Navegador completo de partidas com barra de pesquisa por expressões (intervalos `user:`, `char:`, `asc:`, AND de múltiplos valores `card:`/`relic:`, intervalos `version:`, `mode:`, `result:`, `players:`), além de filtros suspensos, ordenação e URLs compartilháveis |
| Enviar uma partida | `/leaderboards/submit` | Envio de `.run` por arrastar e soltar, com link para o aplicativo complementar Overwolf, login pelo Steam/Discord para associar partidas automaticamente e suas partidas recentes |
| Estatísticas | `/leaderboards/stats` | Tabelas classificadas (taxa de escolha, taxa de vitória, contagem) para cartas, relíquias, poções e encontros. Filtre por personagem / ascensão / resultado |
| Perfil | `/profile` | Estatísticas do usuário conectado (principais cartas/relíquias/poções, detalhamento por personagem), recordes pessoais, comparação competitiva (placar diário de hoje, posições globais, taxa de vitória em relação à comunidade) e gerenciamento de partidas |
| Configurações | `/settings` | Configurações da conta: nome de usuário, e-mail, Steam/Discord vinculados |
| Partida compartilhada | `/runs/[hash]` | Resumo de vitória/derrota no estilo do jogo, com ícones clicáveis dos nós do mapa, faixa de relíquias e grade de cartas em miniatura |
| Referência | `/reference` | Todos os itens são clicáveis - atos, ascensões, palavras-chave, orbes, aflições, intenções, modificadores e conquistas |
| Imagens | `/images` | Recursos navegáveis do jogo com download em ZIP por categoria |
| Changelog | `/changelog` | Diffs de dados entre atualizações do jogo |
| Sobre | `/about` | Informações do projeto, estatísticas e visualização do pipeline |
| Agradecimentos | `/thank-you` | Apoiadores do Ko-fi e colaboradores da comunidade (separado da página Sobre para permitir links diretos) |
| Knowledge Demon | `/knowledge-demon` | Página informativa do bot do Discord - comandos de barra, recursos de moderação e chamada para instalação |
| Notícias | `/news` | Feed espelhado de anúncios do Steam; links canônicos apontam de volta ao Steam, para que seja complementar, não duplicado |
| Artigo de notícia | `/news/[gid]` | Um único anúncio do Steam com corpo BBCode sanitizado e JSON-LD `NewsArticle` |
| Lista de níveis | `/tier-list` | Central de listas de níveis do Codex Score (níveis S → F) para cartas / relíquias / poções |
| Detalhes da lista de níveis | `/tier-list/[type]` | Linhas visuais S/A/B/C/D/F para um tipo de entidade, obtidas de `/api/runs/scores/{type}` |
| Pontuação | `/leaderboards/scoring` | Página da metodologia do Codex Score - regularização bayesiana, peso a priori, faixa da escala e limites dos níveis |

## Endpoints da API

Todos os endpoints de dados aceitam um parâmetro de consulta opcional `?lang=` (padrão: `eng`). As respostas são **compactadas com GZip** e armazenadas em cache com `Cache-Control: public, max-age=300`.

| Endpoint | Descrição | Filtros |
|---|---|---|
| `GET /api/cards` | Todas as cartas | `color`, `type`, `rarity`, `keyword`, `search`, `lang` |
| `GET /api/cards/{id}` | Uma carta | `lang` |
| `GET /api/characters` | Todos os personagens | `search`, `lang` |
| `GET /api/characters/{id}` | Um personagem (com citações e diálogos) | `lang` |
| `GET /api/relics` | Todas as relíquias | `rarity`, `pool`, `search`, `lang` |
| `GET /api/relics/{id}` | Uma relíquia | `lang` |
| `GET /api/monsters` | Todos os monstros | `type`, `search`, `lang` |
| `GET /api/monsters/{id}` | Um monstro | `lang` |
| `GET /api/potions` | Todas as poções | `rarity`, `pool`, `search`, `lang` |
| `GET /api/potions/{id}` | Uma poção | `lang` |
| `GET /api/enchantments` | Todos os encantamentos | `card_type`, `search`, `lang` |
| `GET /api/enchantments/{id}` | Um encantamento | `lang` |
| `GET /api/encounters` | Todos os encontros | `room_type`, `act`, `search`, `lang` |
| `GET /api/encounters/{id}` | Um encontro | `lang` |
| `GET /api/events` | Todos os eventos | `type`, `act`, `search`, `lang` |
| `GET /api/events/{id}` | Um evento | `lang` |
| `GET /api/powers` | Todos os poderes | `type`, `stack_type`, `search`, `lang` |
| `GET /api/powers/{id}` | Um poder | `lang` |
| `GET /api/keywords` | Definições das palavras-chave das cartas | `lang` |
| `GET /api/keywords/{id}` | Uma palavra-chave | `lang` |
| `GET /api/intents` | Tipos de intenção dos monstros | `lang` |
| `GET /api/intents/{id}` | Uma intenção | `lang` |
| `GET /api/orbs` | Todos os orbes | `lang` |
| `GET /api/orbs/{id}` | Um orbe | `lang` |
| `GET /api/afflictions` | Aflições das cartas | `lang` |
| `GET /api/afflictions/{id}` | Uma aflição | `lang` |
| `GET /api/modifiers` | Modificadores de partida | `lang` |
| `GET /api/modifiers/{id}` | Um modificador | `lang` |
| `GET /api/achievements` | Todas as conquistas | `lang` |
| `GET /api/achievements/{id}` | Uma conquista | `lang` |
| `GET /api/badges` | Todos os distintivos de fim de partida | `tiered`, `multiplayer_only`, `requires_win`, `search`, `lang` |
| `GET /api/badges/{id}` | Um distintivo com detalhamento por nível | `lang` |
| `GET /api/history/{entity_type}/{entity_id}` | Histórico de versões por entidade (não diferencia maiúsculas de minúsculas, mais recentes primeiro) | - |
| `GET /api/epochs` | Épocas da linha do tempo | `era`, `search`, `lang` |
| `GET /api/epochs/{id}` | Uma época | `lang` |
| `GET /api/stories` | Entradas de história | `lang` |
| `GET /api/stories/{id}` | Uma história | `lang` |
| `GET /api/acts` | Todos os atos | `lang` |
| `GET /api/acts/{id}` | Um ato | `lang` |
| `GET /api/ascensions` | Níveis de ascensão (0–10) | `lang` |
| `GET /api/ascensions/{id}` | Um nível de ascensão | `lang` |
| `GET /api/stats` | Contagens de entidades em todas as categorias | `lang` |
| `GET /api/languages` | Idiomas disponíveis com nomes de exibição | - |
| `GET /api/translations` | Mapas de tradução para valores de filtros e strings da interface | `lang` |
| `GET /api/images` | Categorias de imagens com listas de arquivos. Categorias com prefixo beta aceitam `?version=`. | - |
| `GET /api/images/beta/versions` | Versões disponíveis do arquivo de imagens beta + destino do link simbólico `latest` | - |
| `GET /api/images/{category}/download` | Download ZIP da categoria de imagens. Categorias beta aceitam `?version=`. | - |
| `GET /api/changelogs` | Resumos de changelogs (todas as versões) | - |
| `GET /api/changelogs/{tag}` | Changelog completo de uma tag de versão | - |
| `GET /api/guides` | Guias da comunidade | `category`, `difficulty`, `tag`, `search` |
| `GET /api/guides/{slug}` | Um guia (com conteúdo Markdown) | - |
| `POST /api/guides` | Enviar guia (encaminhado ao Discord) | - |
| `POST /api/runs` | Enviar uma partida (JSON do arquivo .run) | `username` |
| `GET /api/runs/list` | Listar/explorar partidas enviadas | `character`, `win`, `username`, `seed`, `build_id`, `build_ids`, `players`, `game_mode`, `ascension`, `ascension_min`, `ascension_max`, `card`, `relic`, `today`, `sort`, `page`, `limit` |
| `GET /api/runs/shared/{hash}` | Dados completos da partida por hash (mescla `username` do banco de dados) | - |
| `GET /api/runs/stats` | Estatísticas agregadas da comunidade | `character`, `win`, `ascension`, `game_mode`, `players` |
| `GET /api/runs/leaderboard` | Placar classificado somente com vitórias | `category` (`fastest`, `highest_ascension`), `character`, `players`, `game_mode`, `today`, `page`, `limit` |
| `GET /api/runs/leaderboard/rank/{hash}` | Posição de uma única partida vitoriosa em sua classificação | `category` |
| `GET /api/runs/scores/{type}` | Codex Score (pontuação de taxa de vitória regularizada por Bayes + nível S/A/B/C/D/F) por entidade | `type` = `cards`/`relics`/`potions` |
| `GET /api/runs/encounter-stats` | Agregados por encontro (aparições, taxa de fatalidade, média de dano/turnos) | `act`, `room_type`, `multiplayer`, `page`, `limit` |
| `POST /api/runs/claim` | Associar um nome de usuário a partidas enviadas anteriormente por hash | - |
| `GET /api/runs/versions` | Versões distintas do jogo entre as partidas enviadas | - |
| `GET /api/exports/{lang}` | ZIP de todos os JSONs de entidades de um idioma | `lang` |
| `GET /api/news` | Anúncios do Steam + notícias da comunidade (arquivados localmente) | `feed_type`, `feedname`, `tag`, `since`, `search`, `limit`, `offset` |
| `GET /api/news/{gid}` | Um artigo de notícia (corpo HTML/BBCode bruto) | - |
| `GET /api/merchant/config` | Configuração de preços do mercador extraída automaticamente | - |
| `POST /api/feedback` | Enviar feedback (encaminhado ao Discord) | - |
| `GET /api/versions` | Metadados de versão expostos pela raiz de dados ativa | - |

**Contas de usuário** (sessão por cookie/JWT; login pelo Steam ou Discord):

| Endpoint | Descrição |
|---|---|
| `GET /api/auth/me` | Usuário conectado atualmente |
| `GET /api/auth/steam/redirect` | Iniciar login pelo Steam OpenID |
| `GET /api/auth/discord/start` | Iniciar login pelo Discord OAuth |
| `POST /api/auth/logout` | Limpar o cookie da sessão |
| `PATCH /api/auth/username` / `PATCH /api/auth/email` | Atualizar campos do perfil |
| `GET /api/auth/runs` / `POST /api/auth/runs/upload` / `DELETE /api/auth/runs/{hash}` | Listar, enviar e remover as partidas do usuário |
| `GET /api/auth/stats` | Estatísticas agregadas por usuário (página de perfil) |
| `GET /api/auth/personal-bests` | Partida individual/cooperativa mais rápida, maior ascensão e desafios diários de hoje e de todos os tempos |
| `GET /api/auth/competitive` | Placar diário de hoje, posições globais e taxa de vitória em relação à comunidade |

Limitada a **60 solicitações por minuto** por IP. O envio de feedback e guias é limitado a **3–5 por minuto** por IP. Documentação interativa em `/docs` (Swagger UI).

### Localização

Todos os dados do jogo são servidos em 15 idiomas usando os próprios arquivos de localização de Slay the Spire 2. Passe `?lang=` para qualquer endpoint de dados. Use `?channel=beta` para os dados da versão beta pública ativa; conjuntos arquivados de imagens beta usam `?version=`.

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

**O que é localizado**: nomes e descrições de entidades provenientes do jogo, tipos de carta, raridades, palavras-chave, poderes, encontros, nomes de personagens, títulos de seções, rotas localizadas e a maioria dos rótulos compartilhados da interface.

**O que permanece em inglês**: identificadores da API e valores estruturais de filtros, como `room_type`, `type`/`stack_type` de poderes e `pool`, além das marcas dos produtos e de parte do conteúdo editorial ou criado pela comunidade.

Os parâmetros de filtro (`type=Attack`, `rarity=Rare`, `keyword=Exhaust`) sempre usam valores em inglês, independentemente do idioma - o backend os traduz para os equivalentes localizados antes de fazer a correspondência.

Exemplo: `GET /api/cards?lang=kor&type=Attack` retorna dados de cartas em coreano cujo tipo é "공격", filtrados corretamente mesmo que o parâmetro esteja em inglês.

### Formatação rich text

Os campos de texto (`description`, `loss_text`, `flavor`, `text` de diálogos, `title`/`description` de opções) podem conter tags no estilo BBCode do Godot preservadas dos dados de localização do jogo:

| Tag | Tipo | Exemplo | Renderizado como |
|---|---|---|---|
| `[gold]...[/gold]` | Cor | `[gold]Enchant[/gold]` | Texto dourado |
| `[red]...[/red]` | Cor | `[red]blood[/red]` | Texto vermelho |
| `[blue]...[/blue]` | Cor | `[blue]2[/blue]` | Texto azul |
| `[green]...[/green]` | Cor | `[green]healed[/green]` | Texto verde |
| `[purple]...[/purple]` | Cor | `[purple]Sharp[/purple]` | Texto roxo |
| `[orange]...[/orange]` | Cor | `[orange]hulking figure[/orange]` | Texto laranja |
| `[pink]...[/pink]` | Cor | - | Texto rosa |
| `[aqua]...[/aqua]` | Cor | `[aqua]Ascending Spirit[/aqua]` | Texto ciano |
| `[sine]...[/sine]` | Efeito | `[sine]swirling vortex[/sine]` | Texto animado ondulante |
| `[jitter]...[/jitter]` | Efeito | `[jitter]CLANG![/jitter]` | Texto animado tremendo |
| `[b]...[/b]` | Efeito | `[b]bold text[/b]` | Texto em negrito |
| `[i]...[/i]` | Efeito | `[i]whispers[/i]` | Texto em itálico |
| `[energy:N]` | Ícone | `[energy:2]` | Ícone(s) de energia |
| `[star:N]` | Ícone | `[star:1]` | Ícone(s) de estrela |
| `[Card]`, `[Relic]` | Espaço reservado | `[Card]` | Dinâmico em tempo de execução (itálico) |

As tags podem ser aninhadas: `[b][jitter]CLANG![/jitter][/b]`, `[gold][sine]swirling vortex[/sine][/gold]`.

Se você estiver consumindo a API diretamente, poderá remover essas tags com uma expressão regular como `\[/?[a-z]+(?::\d+)?\]` ou renderizá-las em seu próprio frontend. O campo `description_raw` (quando disponível) contém o modelo SmartFormat não resolvido.

## Execução local

### Pré-requisitos

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

O backend é executado em **http://localhost:8000**.

### Frontend

```bash
cd frontend
npm install
NEXT_PUBLIC_API_URL=http://localhost:8000 npm run dev
```

O frontend é executado em **http://localhost:3000**.

### Docker

```bash
docker compose up --build
```

Inicia os dois serviços (backend na porta 8000, frontend na porta 3000).

### Variáveis de ambiente

A API principal, somente leitura, não precisa de configuração. Os recursos opcionais abaixo são habilitados por variáveis de ambiente (definidas no ambiente do backend ou no arquivo compose):

| Variável | Usada por | Observações |
|---|---|---|
| `MONGO_URL` | Backend | Banco de dados de partidas (estatísticas da comunidade, placares, contas). Quando não definida, o backend usa como alternativa o caminho do SQLite legado (`data/runs.db`). |
| `JWT_SECRET` | Backend | Assina os tokens de sessão das contas de usuário. |
| `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` | Backend | Login pelo Discord OAuth. |
| `FRONTEND_URL`, `SPIRE_CODEX_PUBLIC_BASE` | Backend | URLs de redirecionamento / retorno do OAuth. |
| `ENVIRONMENT` | Backend | `production` ativa o comportamento de cookies seguros. |
| `NEXT_PUBLIC_API_URL` | Frontend (build) | Base da API; vazia em produção para que imagens/dados sejam resolvidos na mesma origem. |
| `NEXT_PUBLIC_CDN_URL` | Frontend (build) | Quando definida (por exemplo, `https://cdn.spire-codex.com`), as imagens são carregadas da CDN em vez de `/static`. |
| `NEXT_PUBLIC_SITE_URL` | Frontend (build) | URL canônica do site para metadados. |

As contas de usuário e a CDN ficam desativadas por padrão, portanto o projeto funciona de ponta a ponta sem nenhuma dessas variáveis.

## Pipeline de atualização

Um script Python multiplataforma cuida de todo o fluxo de atualização quando uma nova versão do jogo é lançada:

```bash
# Pipeline completo - extrair arquivos do jogo, analisar dados, renderizar sprites e copiar imagens:
python3 tools/update.py

# Especificar manualmente o caminho de instalação do jogo:
python3 tools/update.py --game-dir "/path/to/Slay the Spire 2"

# Pular a extração (o diretório extraction/ já contém dados recentes):
python3 tools/update.py --skip-extract

# Reanalisar somente os dados (sem extração ou renderização):
python3 tools/update.py --parse-only

# Renderizar novamente somente os sprites Spine:
python3 tools/update.py --render-only

# Gerar um changelog após a atualização:
python3 tools/update.py --changelog --game-version "0.98.2" --build-id "22238966"
```

O script detecta automaticamente seu sistema operacional e encontra o diretório de instalação do Steam. Requisitos por etapa:

| Etapa | Ferramenta | Instalação |
|---|---|---|
| Extração do PCK | `gdre_tools` | [Versões do GDRE Tools](https://github.com/bruvzg/gdsdecomp/releases) |
| Descompilação da DLL | `ilspycmd` | `dotnet tool install ilspycmd -g` |
| Análise de dados | Python 3.10+ | Integrado |
| Cópia de imagens | Python 3.10+ | Integrado |
| Renderização Spine | Node.js 20+ | [nodejs.org](https://nodejs.org) |

### Etapas manuais

Se preferir executar as etapas individualmente:

```bash
# Analisar todos os dados (todos os 15 idiomas)
cd backend/app/parsers && python3 parse_all.py

# Analisar um único idioma
cd backend/app/parsers && python3 parse_all.py --lang eng

# Copiar imagens da extração para static (PNG + WebP da mesma fonte - sem
# encadeamento com perdas por meio de um WebP já existente no backend). WebP com quality=95, method=6.
python3 backend/scripts/copy_images.py

# Renderizar sprites Spine (WebGL - sem artefatos nas junções dos triângulos)
cd tools/spine-renderer && npm install
npx playwright install chromium           # Somente na primeira vez
node render_all_webgl.mjs                 # Todos os 138 esqueletos via Chrome headless
node render_webgl.mjs <skel_dir> <out> [size] [--skin=a,b] [--anim=name] [--anim-time=N]

# Substituições comuns por monstro:
#   --skin=moss1,diamondeye   combina skins variantes com a padrão (cubex_construct)
#   --skin=skin1              troca a padrão por uma variante (scroll_of_biting)
#   --anim-time=0.5           avança a animação N segundos antes da captura
#   --anim=attack             substitui a animação ociosa escolhida automaticamente
#
# Substituição de espaços reservados de fumaça: gas_bomb_2.png, the_forgotten_2.png e
# living_smog_2.png são fornecidos como placas magenta "Smoke Placeholder" na fonte.
# render_webgl.mjs os substitui por uma nuvem ameixa-escura gerada proceduralmente
# nas mesmas dimensões antes do envio ao GL e depois força slot.color.a = 1.0
# nos slots substituídos (os artistas definiram alfa baixo esperando um shader).

# Reenquadrar sprites de monstros pequenos demais (pós-processamento - recorta para a
# caixa delimitadora alfa real e redimensiona para preencher cerca de 92% do quadro de 512x512):
python3 tools/rescale_bestiary.py fuzzy_wurm_crawler thieving_hopper terror_eel

# Renderizador canvas legado (tem artefatos nas junções dos triângulos - evite)
# node render_all.mjs / node render.mjs
```

## Sistema de changelog

Acompanhe o que muda entre as atualizações do jogo com diffs no nível dos campos em todas as categorias de entidades.

### Geração de um changelog

```bash
# Comparar os dados atuais com uma referência git:
python3 tools/diff_data.py HEAD~1 --format json \
    --game-version "0.98.2" --build-id "22238966" \
    --title "March Update"

# Pré-visualizar como texto ou Markdown:
python3 tools/diff_data.py HEAD~1 --format text
python3 tools/diff_data.py HEAD~1 --format md
```

### Esquema do changelog

Cada arquivo JSON de changelog contém:

| Campo | Descrição |
|---|---|
| `app_id` | ID do aplicativo Steam (2868840) |
| `game_version` | Versão do jogo no Steam (por exemplo, `"0.98.2"`) |
| `build_id` | ID do build do Steam |
| `tag` | Chave de versão exclusiva (por exemplo, `"1.0.3"`) |
| `date` | Data da atualização |
| `title` | Título legível |
| `summary` | Contagens: `{ added, removed, changed }` |
| `features` / `fixes` / `api_changes` | Notas de versão selecionadas manualmente. Preservadas durante regenerações de uma tag existente com `diff_data.py` - o diff de dados é sobrescrito, mas esses arrays são mesclados. |
| `categories` | Diffs por categoria com entidades adicionadas/removidas/alteradas. Alterações de campos percorrem recursivamente dicionários/listas aninhados, de modo que cada folha ocupe sua própria linha (por exemplo, `vars.DamageVar: 8 → 10`) em vez do opaco `vars: 2 fields → 2 fields`. |

### Retenção de gravação única

Os arquivos em `data/changelogs/` são registros históricos de gravação única. `.github/workflows/changelog-guard.yml` bloqueia qualquer PR que **modifique ou exclua** um changelog existente. Novos arquivos (`A`) sempre são permitidos; modificações exigem o rótulo `changelog-edit-approved` no PR. Consulte `CONTRIBUTING.md → Changelog Retention` para conhecer a política e o fluxo de substituição.

### Histórico por entidade

`GET /api/history/{entity_type}/{entity_id}` percorre todos os changelogs e retorna as entradas que afetaram a entidade solicitada, das mais recentes para as mais antigas. A seção de Histórico de Versões em cada página de detalhes (`/cards/{id}`, `/monsters/{id}` etc.) é alimentada por esse endpoint.

## Implantação

### CI/CD (GitHub Actions)

Pushes para `main` acionam `.github/workflows/ci.yml` no runner Kubernetes auto-hospedado. O fluxo de trabalho executa varredura de segredos, verificações do ESLint e TypeScript, lint e verificação de formatação do ruff, depois cria e envia as imagens estáveis com a tag `:latest`. Ele também continua criando as imagens beta independentes com a tag `:beta` para `docker-compose.beta.yml`; essas imagens são mantidas operacionalmente, mas as páginas beta públicas são servidas pela implantação principal em `/beta`.

O frontend estável recebe `UMAMI_WEBSITE_ID`. A imagem beta independente recebe `UMAMI_BETA_WEBSITE_ID`, embora o tráfego público de `/beta` use o frontend estável e sua propriedade de análise.

A CI **não** faz a implantação. O job de implantação automática executado a cada hora no host da DigitalOcean cuida da implantação.

> **Observação:** `.forgejo/workflows/build.yml` é mantido como uma alternativa inativa baseada em buildah.

### Build local + envio

Ignore a CI e envie diretamente de sua máquina:

```bash
# Criar e enviar as duas imagens:
python3 tools/deploy.py

# Somente frontend:
python3 tools/deploy.py --frontend

# Somente backend:
python3 tools/deploy.py --backend

# Testar o build sem enviar:
python3 tools/deploy.py --no-push

# Marcar uma versão:
python3 tools/deploy.py --tag v0.98.2

# Criar e enviar imagens beta (tag :beta, ignora o IndexNow):
python3 tools/deploy.py --beta
```

Detecta automaticamente Apple Silicon e faz compilação cruzada para `linux/amd64` via `docker buildx`. Exige a execução prévia de `docker login`.

### Produção

O aplicativo público e a pilha beta independente mantida são executados no mesmo host da DigitalOcean. O tráfego público usa `spire-codex.com`; o host secundário da Lightsail executa o MongoDB.

**Implantação automática** - um cron executado a cada hora no host da DigitalOcean inicia `/usr/local/bin/spire-codex-autodeploy` às :03. Quando o commit em checkout avança, ele baixa e recria tanto `docker-compose.prod.yml` quanto `docker-compose.beta.yml`, exceto em atualizações limitadas a `data/news/*`. Em seguida, limpa o cache do Cloudflare. Os logs são gravados em `/var/log/spire-codex-autodeploy.log`. Consulte [`infrastructure/ansible/README.md`](infrastructure/ansible/README.md) para obter instruções de instalação e operação.

**Implantação manual**:

```bash
cd infrastructure/ansible
./bin/do-ansible playbooks/deploy.yml

# Pilha beta independente mantida
./bin/do-ansible playbooks/deploy.yml -e compose_file=docker-compose.beta.yml
```

Os dados de produção são montados por bind (`./data:/data:ro` para o frontend e com leitura e gravação para o backend). As notícias e o estado das partidas são lidos dos dados montados no momento da solicitação, portanto atualizações em `data/news/*.json` não exigem reinicialização dos contêineres.

### Canal beta (spire-codex.com/beta)

O aplicativo público serve os dados estáveis e do `public-beta` do Steam como dois canais de conteúdo. As páginas beta ficam em [`spire-codex.com/beta`](https://spire-codex.com/beta), com rotas localizadas em `/{lang}/beta/...`. A página principal `/images` também expõe as versões arquivadas dos recursos beta.

`beta.spire-codex.com` foi desativado para uso público. No momento, o Cloudflare envia um `302` que preserva o caminho para o domínio raiz, mas não adiciona `/beta` nem `channel=beta`. Portanto, links antigos de páginas chegam à página estável correspondente, e solicitações antigas da API recebem dados estáveis após seguir o redirecionamento. Novos clientes da API precisam usar a API principal com um canal explícito, por exemplo, `https://spire-codex.com/api/cards?channel=beta`.

**Arquitetura**: `get_channel` resolve `?channel=beta|stable` em um `ContextVar` do Python; ele também reconhece um cabeçalho de host `beta.*` para tráfego direto à origem. `data_service.py` carrega solicitações beta de `data-beta/<latest>/` e usa os dados estáveis como alternativa por arquivo. `GET /api/beta/diff` e `GET /api/beta/version` descrevem a versão beta ativa, e o frontend renderiza o canal selecionado em `/beta`.

A pilha separada `docker-compose.beta.yml` e as imagens `:beta` continuam sendo criadas e recriadas pela automação de implantação. Elas não são o site beta público enquanto o redirecionamento do Cloudflare estiver ativo.

**Layout dos dados**: cada build arquivado fica em `data-beta/<version>/`, e o ponteiro `latest` seleciona o build ativo. Cada versão tem seu próprio diretório `changelogs/`. Os arquivos de imagens beta espelham esse layout em `backend/static/images/beta/<version>/{cards,monsters,misc,ui,vfx}/`.

**Ingestão automatizada** - `tools/beta-watch/` é executado como um job launchd no Mac de desenvolvimento às quintas-feiras, das 15:00 às 22:45, a cada 15 minutos. Quando o SteamCMD informa um novo ID de build do `public-beta`, ele extrai e descompila o jogo, analisa todos os idiomas, gera o diff, sincroniza as imagens versionadas e abre um PR `auto/beta-<version>`. Consulte [`tools/beta-watch/README.md`](tools/beta-watch/README.md) para obter instruções de instalação e operação.

**Ingestão manual**:

```bash
VERSION=vX.Y.Z
PREVIOUS=vA.B.C

# Primeiro extraia e descompile os arquivos beta do jogo; depois, faça a análise a partir da raiz do repositório.
(cd backend/app/parsers && \
  EXTRACTION_DIR=../../../extraction/beta \
  DATA_DIR="../../../data-beta/$VERSION" \
  python3 parse_all.py)

VERSION="$VERSION" tools/beta-watch/sync-images.sh

python3 tools/diff_data.py "data-beta/$PREVIOUS/eng" "data-beta/$VERSION/eng" \
  --format json --output-dir "data-beta/$VERSION/changelogs" \
  --game-version "${VERSION#v}" --title "Beta ${VERSION#v}"
```

`sync-images.sh` atualiza o link simbólico de imagens `latest`. O PR de ingestão contém as alterações de dados e imagens versionadas; após a mesclagem, a implantação automática atualiza as duas pilhas mantidas.

## Renderizador Spine

Os sprites dos monstros em StS2 são animações esqueléticas [Spine](http://esotericsoftware.com/) - cada monstro é composto por um `.skel` (esqueleto binário) + `.atlas` + spritesheet `.png`, não por uma única imagem. O renderizador os monta em retratos PNG estáticos.

### Renderizador WebGL (atual)

O renderizador WebGL (`render_webgl.mjs`, `render_all_webgl.mjs`) usa **Playwright + spine-webgl** para renderizar esqueletos por meio da GPU do Chrome headless. Isso produz renderizações limpas, **sem artefatos nas junções dos triângulos**.

**Como funciona:**
1. Inicia o Chrome headless via Playwright com WebGL habilitado
2. Carrega os dados do esqueleto + atlas + texturas como base64 na página do navegador
3. Cria um canvas WebGL e configura o shader spine-webgl + polygon batcher
4. Aplica a animação ociosa e calcula os limites (excluindo slots de sombra/chão)
5. Renderiza por rasterização de triângulos na GPU - sem caminhos de recorte do canvas, sem junções
6. Lê os pixels brutos via `gl.readPixels` e inverte verticalmente (o WebGL trabalha de baixo para cima)
7. Grava o PNG via node-canvas para preservar a transparência

**Um esqueleto:**
```bash
node render_webgl.mjs <skel_dir> <output_path> [size]
node render_webgl.mjs ../../extraction/raw/animations/backgrounds/neow_room ../../backend/static/images/misc/neow.png 2048
```

**Todos os esqueletos em lote:**
```bash
node render_all_webgl.mjs  # Renderiza 138 esqueletos em backend/static/images/renders/
```

### Cobertura da renderização

| Categoria | Renderizados | Total | Observações |
|---|---|---|---|
| Monstros | 99 | 103 diretórios | Todos os 111 monstros do jogo têm imagens (99 renderizados + aliases/estáticos) |
| Personagens | 16 | 16 | Poses de combate, local de descanso e seleção |
| Planos de fundo/NPCs | 14 | 17 | Neow, Tezcatara, salas do mercador, menu principal |
| VFX/UI | 9 | 22 | A maioria dos VFX exige quadros específicos de animação |
| **Total** | **138** | **158** | 20 ignorados (sem atlas, somente VFX, vazios) |

### Renderizador de animações

O renderizador de animações (`render_gif.mjs`) renderiza animações ociosas/de ataque do Spine como WebP, GIF ou APNG animado. Compatível com variantes de skin, seleção de animações e transmissão de quadros para o disco em animações grandes.

**Formatos de saída compatíveis:**
- **`.webp`** (recomendado) - WebP animado sem perdas, com alfa completo, cerca de 33% menor que APNG. Os quadros são transmitidos para o disco para evitar falta de memória.
- **`.gif`** - 256 cores, transparência binária. Arquivos menores, porém com qualidade mais baixa.
- **`.apng`** - alfa completo como WebP, mas com arquivos maiores.

```bash
# Renderizar WebP animado sem perdas (recomendado)
NODE_OPTIONS="--max-old-space-size=8192" node render_gif.mjs <skel_dir> <output.webp> [size] [--fps=N]

# Com variante de skin (para bowlbug, cultists, cubex etc.)
node render_gif.mjs <skel_dir> output.webp 256 --fps=10 --skin=rock

# Animação específica (padrão: ciclo ocioso)
node render_gif.mjs <skel_dir> output.webp 256 --fps=12 --anim=attack

# Modo de silhueta branca (para ícones de nós de chefes no mapa)
node render_gif.mjs <skel_dir> output.webp 256 --white
```

**Biblioteca de animações:** 209 WebPs animados sem perdas:
- 15 animações de personagens (combate/seleção/descanso × 5 personagens) em 512×512
- 103 animações ociosas de monstros em 256×256
- 91 animações de ataque de monstros em 256×256

**Variantes de skin:** 13 monstros têm variantes de skin (bowlbug, cubex_construct, cultists etc.). Use `--skin=` para selecionar. A skin padrão geralmente mostra apenas o esqueleto base sem o corpo.

**Shader do nó de chefe no mapa:** o jogo usa `boss_map_point.gdshader`, que trata os canais RGB como máscaras:
- **Canal vermelho** × `map_color` (padrão: bege `0.671, 0.58, 0.478`) → cor de preenchimento
- **Canal azul** × `black_layer_color` (padrão: preto `0, 0, 0`) → cor do contorno
- **Canal verde** × branco `1, 1, 1` → realces

### Renderizador canvas legado

O renderizador canvas (`render.mjs`, `render_all.mjs`) usa `spine-canvas` com `triangleRendering = true`. Isso produz **artefatos visíveis de malha em wireframe** devido à suavização dos caminhos `clip()` do canvas entre triângulos adjacentes. Use o renderizador WebGL em vez dele.

### Dependências

- `@esotericsoftware/spine-webgl` ^4.2.107 - Runtime Spine para WebGL (atual)
- `playwright` - Chrome headless para renderização WebGL
- `gif-encoder-2` - Codificação GIF para o renderizador de animações
- `canvas` ^3.1.0 - Implementação de Canvas para Node.js (buffer de quadros para o renderizador de animações)
- `Pillow` (Python) - monta WebP/APNG a partir dos quadros PNG renderizados
- `@esotericsoftware/spine-canvas` ^4.2.106 - Runtime Spine para Canvas (legado)

## Extração dos arquivos do jogo

Se precisar fazer a extração do zero:

```bash
# Extrair o PCK (GDRE Tools)
/path/to/gdre_tools --headless --recover="/path/to/sts2.pck" --output-dir=extraction/raw

# Descompilar a DLL (CLI do ILSpy)
ilspycmd -p -o extraction/decompiled "/path/to/sts2.dll"
```

Locais de instalação do Steam:
- **Windows**: `C:\Program Files (x86)\Steam\steamapps\common\Slay the Spire 2\`
- **macOS**: `~/Library/Application Support/Steam/steamapps/common/Slay the Spire 2/`
- **Linux**: `~/.local/share/Steam/steamapps/common/Slay the Spire 2/`

## Versionamento

Spire Codex usa versionamento semântico **`1.X.Y`**:

| Segmento | Significado |
|---------|---------|
| **1** | Versão principal do Spire Codex (permanece igual, exceto em uma reescrita completa) |
| **X** | Incrementado quando a Mega Crit lança um patch do jogo |
| **Y** | Incrementado para nossas próprias correções e melhorias no analisador/frontend |

Exemplos: `v1.0.0` = versão inicial, `v1.0.1` = nossas correções de bugs, `v1.1.0` = primeiro patch da Mega Crit incorporado.

## SEO

- **Dados estruturados (JSON-LD)**: WebSite + VideoGame (início), CollectionPage + ItemList (páginas de listas), Article + BreadcrumbList + FAQPage (páginas de detalhes), SoftwareApplication (desenvolvedores), NewsArticle (news/[gid])
- **Formato do título**: `"Slay the Spire 2 (sts2) {Page Title} | Spire Codex"` - padronizado em todas as páginas. Partidas usam `"{username} - {char} - Ascension {N} {win/loss} - Slay the Spire 2 (sts2) | Spire Codex"`. "(sts2)" aparece em linha para que consultas como `sts2 tier list` / `sts2 card list` sejam correspondidas em diferentes localidades.
- **Sitemap**: XML plano em `/sitemap.xml` com `force-dynamic` (renderizado no servidor, não durante o build). Mais de 20.000 URLs, incluindo páginas de detalhes de entidades, páginas da matriz de navegação, páginas de listas de níveis, metodologia de pontuação, detalhes de runs/[hash] e espelhos i18n de todos os tipos de entidade
- **SEO internacional**: rotas `/{lang}/` para 14 idiomas além do inglês com alternativas hreflang **bidirecionais** - as páginas raiz em inglês também emitem alternativas para cada localidade + `x-default` via `buildLanguageAlternates(path)` em `lib/seo.ts` (corrige o agrupamento de conteúdo duplicado "Crawled - not indexed" do GSC, em que o Google tratava as páginas localizadas como duplicadas sem referências de retorno)
- **SEO programático**: 41 páginas de navegação de cartas em `/cards/browse/` (rare-attacks, ironclad-skills etc.) + 3 páginas de listas de níveis (`/tier-list/{cards,relics,potions}`)
- **EntityProse com reconhecimento de localidade**: páginas de detalhes renderizam um breve parágrafo específico da localidade, em vez de corpos idênticos em inglês em todas as localidades
- **Links internos**: Poderes ↔ cartas, encontros → monstros, palavras-chave das cartas → páginas centrais de palavras-chave, movimentos de monstros → páginas de poderes (com dicas), páginas de atos → encontros/eventos, linhas de listas de níveis → aba Estatísticas nos detalhes das entidades
- **Open Graph e Twitter Cards**: imagens OG por entidade, Twitter Cards `summary_large_image`
- **URLs canônicas**: todas as páginas declaram uma URL canônica

## Widgets incorporáveis

### Widget de dicas
Adicione dicas ao passar o cursor para todos os 13 tipos de entidade em qualquer site:
```html
<script src="https://spire-codex.com/widget/spire-codex-tooltip.js"></script>
<p>Start with [[Bash]] and [[relic:Burning Blood]].</p>
```

### Widget de changelog
Incorpore um visualizador interativo de changelog:
```html
<div id="scx-changelog"></div>
<script src="https://spire-codex.com/widget/spire-codex-changelog.js"></script>
```

Documentação completa: [spire-codex.com/developers](https://spire-codex.com/developers)

## Roteiro

- ~~Páginas individuais de detalhes~~ ✅
- ~~Pesquisa global~~ ✅
- ~~Suporte a vários idiomas (15 idiomas)~~ ✅
- ~~SEO (JSON-LD, OG/Twitter, sitemap, hreflang)~~ ✅
- ~~Widget de dicas (todos os 13 tipos de entidade)~~ ✅
- ~~Páginas de comparação de personagens (10 pares)~~ ✅
- ~~Páginas centrais de palavras-chave~~ ✅
- ~~Guia do mercador (preços obtidos do C# descompilado)~~ ✅
- ~~Documentação para desenvolvedores + exportações de dados~~ ✅
- ~~SEO internacional (13 páginas iniciais de idiomas)~~ ✅
- ~~Matriz de navegação de cartas (41 páginas programáticas de SEO)~~ ✅
- ~~Guias da comunidade~~ ✅ - Markdown com frontmatter YAML, formulário de envio, widget de dicas e redes sociais do autor
- ~~Página de mecânicas do jogo~~ ✅ - 27 páginas individuais de SEO: taxas de obtenção, combate, mapa, chefes, segredos e curiosidades
- ~~Partidas da comunidade~~ ✅ - Envio de partidas, navegador, partidas compartilhadas e estatísticas ao vivo
- ~~Descrições de melhorias das cartas~~ ✅ - upgrade_description para todas as 403 cartas que podem ser melhoradas
- ~~Poderes inatos dos monstros~~ ✅ - 42 monstros com poderes de AfterAddedToRoom
- ~~Condições de desbloqueio das conquistas~~ ✅ - Categoria, personagem e limite obtidos do código-fonte C#
- ~~Padrões de ataque dos monstros~~ ✅ - 112 monstros com IA cíclica/aleatória/condicional/mista obtida das máquinas de estados C#
- ~~Pré-condições dos eventos~~ ✅ - 25 eventos com condições de IsAllowed() analisadas do código-fonte C#
- ~~Retenção do arquivo beta~~ ✅ - Dados e imagens beta versionados permanecem preservados; `/beta` serve o build ativo e `/images` permite explorar os recursos arquivados
- ~~Bot do Discord~~ ✅ - [Knowledge Demon](https://bot.spire-codex.com): comandos de barra para todas as entidades (`/card`, `/relic`, `/monster`, `/potion`, `/character`, `/event`, `/power`, `/enchantment`, `/lookup`, `/meta`), RSS de notícias do Steam e um conjunto completo de ferramentas de moderação derivado do [Kernel](https://github.com/ptrlrd/kernel)
- ~~Codex Score e Lista de Níveis~~ ✅ - Nota por entidade calculada a partir das partidas da comunidade usando **regularização bayesiana**: `shrunk = (wins + PRIOR_WEIGHT × baseline) / (n + PRIOR_WEIGHT)`, depois dimensionada de 0 a 100 e mapeada para S/A/B/C/D/F. Evita ruído de amostras pequenas (uma carta usada em 1 partida e com resultado 1/1 não recebe S - ela regride à distribuição a priori). Pré-aquecida na inicialização do backend. Exibida como `ScoreBadge` na aba Estatísticas das páginas de detalhes, em páginas dedicadas de listas de níveis e na página de metodologia em `/leaderboards/scoring`.
- ~~Aba Estatísticas nas páginas de detalhes~~ ✅ - Distintivo de destaque da pontuação + resumo em prosa + links para partidas recentes via `EntityRunStats`.
- **Construtor de baralhos** - Experimentação interativa de baralhos teóricos
- **Backend de banco de dados** - Substituir o carregamento de JSON por idioma por PostgreSQL JSONB (ou alternativa). O armazenamento de partidas enviadas já foi migrado do SQLite para o MongoDB (maio de 2026).

## Agradecimentos

Agradecemos a **vesper-arch**, **terracubist**, **U77654**, **Purple Aspired Dreaming**, **Kobaru** e **Severi** pelos testes de QA, relatórios de bugs e contribuições. A lista completa de apoiadores - incluindo doadores do Ko-fi que mantêm o projeto em funcionamento - está em [spire-codex.com/thank-you](https://spire-codex.com/thank-you).

## Stack tecnológica

- **Backend**: Python, FastAPI, Pydantic, slowapi, compactação GZip
- **Banco de dados de partidas**: MongoDB (estatísticas da comunidade, placares, contas de usuário), com uma coleção materializada `stats_summary` e um atualizador em segundo plano com eleição de líder. O caminho do SQLite legado é mantido como alternativa offline.
- **Contas**: Steam OpenID + Discord OAuth, cookies de sessão JWT
- **Frontend**: Next.js 16 (App Router), TypeScript, Tailwind CSS, suporte a 15 idiomas
- **Imagens/CDN**: Cloudflare R2 servido por `cdn.spire-codex.com` (webp)
- **Análises e observabilidade**: Umami auto-hospedado, Prometheus + node-exporter
- **Renderizador Spine**: Node.js, Playwright, @esotericsoftware/spine-webgl (WebGL via Chrome headless)
- **Infraestrutura**: Docker, CI do GitHub Actions (runner auto-hospedado) com cache do BuildKit apoiado por registro, implantação via Ansible/SSH
- **Ferramentas**: Python (pipeline de atualização, comparação de changelogs, cópia de imagens)

## Licença

- **Código-fonte**: [PolyForm Noncommercial 1.0.0](LICENSE.md) - uso, modificação e redistribuição gratuitos para fins não comerciais. A venda do software não é permitida.
- **API hospedada**: [API_TERMS.md](API_TERMS.md) - gratuita para qualquer uso dentro dos limites de taxa publicados; entre em contato pelo Discord ou por uma issue se precisar de mais.
- **Dados do jogo** (cartas, relíquias, monstros etc.): © Mega Crit Games. Disponibilizados aqui como referência comunitária sob termos de uso justo / educacional. Não use esses dados para recompilar, reempacotar ou redistribuir o jogo.

As contribuições são aceitas sob os mesmos termos da PolyForm Noncommercial 1.0.0 - consulte [CONTRIBUTING.md](CONTRIBUTING.md#license).
