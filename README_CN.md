# Spire Codex

<p align="center">
  <a href="README.md">English</a> |
  <a href="README_CN.md">中文</a>
</p>

一个通过逆向解析游戏文件构建的 **《杀戮尖塔 2》游戏数据综合数据库与 API**。支持游戏自带的 **14 种语言**。

**在线站点**：[spire-codex.com](https://spire-codex.com)

**Steam App ID**：2868840

## 构建方式

《杀戮尖塔 2》基于 Godot 4 游戏引擎构建，但全部游戏逻辑并不写在 GDScript 中，而是存放在一个 C#/.NET 8 的 DLL（`sts2.dll`）里。整条数据处理流水线如下：

1. **PCK 提取** —— 使用 [GDRE Tools](https://github.com/bruvzg/gdsdecomp) 提取 Godot 的 `.pck` 文件，恢复图片、Spine 动画和本地化数据（约 9,947 个文件）。
2. **DLL 反编译** —— 使用 [ILSpy](https://github.com/icsharpcode/ILSpy) 将 `sts2.dll` 反编译为约 3,300 个可读的 C# 源文件，包含所有游戏模型。
3. **数据解析** —— 使用 22 个基于 Python 正则表达式的解析器从反编译后的 C# 源码中提取结构化数据，并按语言输出 JSON 到 `data/{lang}/` 目录：
   - **卡牌**：通过 `base(cost, CardType, CardRarity, TargetType)` 构造器，以及 `DamageVar`、`BlockVar`、`PowerVar<T>` 提取数值
   - **角色**：`StartingHp`、`StartingGold`、`MaxEnergy`、`StartingDeck`、`StartingRelics`
   - **遗物 / 药水**：稀有度、所属池，以及通过 SmartFormat 模板解析出的描述
   - **怪物**：生命值区间、通过 `AscensionHelper` 处理的进阶难度数值变化、包含每个行动意图的行动状态机（攻击/防御/增益/减益/状态/召唤/治疗）、伤害值、多段攻击次数（包括通过 `AscensionHelper` 变化的连击段数）、从 AfterAddedToRoom 中解析出的入场自带能力（42 个怪物带有进阶难度变体）、每个行动施加的能力效果（从 `PowerCmd.Apply<T>` 中提取目标和数值）、格挡、治疗、遭遇上下文（章节、房间类型），以及从 `GenerateMoveStateMachine()` 中解析出的**出招模式 / AI 状态机**（112 个怪物——循环型、随机型、条件型、混合型）
   - **附魔**：卡牌类型限制、可叠加性、随附魔数值等级成长的效果
   - **遭遇**：怪物组合、房间类型（Boss/精英/普通）、所在章节、标签
   - **事件**：多页决策树（66 个事件中已解析 56 个）、带结果的选项、所在章节、解析为显示名称的 `StringVar` 模型引用、运行时计算值（例如通过 `GetDecipherCost()` 递增的费用、通过 `CalculateVars` 结合 `NextInt` / `NextFloat` 计算的金币范围、回满生命值的模式），以及从 `IsAllowed()` 中提取的事件前置条件
   - **先古之民**：8 位先古之民 NPC，包含称号、角色专属对话、提供的遗物选项、头像图标
   - **能力**：能力类型（增益 / 减益）、叠加类型（计数型 / 单实例）、动态变量、描述
   - **纪元/故事**：包含解锁条件的时间线推进数据
   - **充能球**：被动值、激发值、描述
   - **苦难**：是否可叠加、额外卡牌文本、描述
   - **修饰器**：Run 修饰器描述
   - **关键词**：卡牌关键词定义（消耗、虚无、固有等）
   - **意图**：怪物意图描述及图标
   - **成就**：解锁条件、描述、分类、角色归属、从 C# 源码中提取的阈值（33 项成就）
   - **章节**：Boss 解锁顺序、遭遇、事件、先古之民、房间数量
   - **进阶等级**：11 个等级（0–10），描述来自本地化文件
   - **药水池**：从池类和 epoch 引用中解析出的角色专属药水池
   - **翻译**：为前端生成按语言划分的筛选映射（卡牌类型、稀有度、关键词 → 本地化名称）和 UI 文本（章节标题、描述、角色名）
4. **描述解析** —— 共享的 `description_resolver.py` 模块会将 SmartFormat 本地化模板（如 `{Damage:diff()}`、`{Energy:energyIcons()}`、`{Cards:plural:card|cards}`）解析为可读文本，并保留富文本标记供前端渲染。运行时动态变量（例如 `{Card}`、`{Relic}`）会保留为可读占位符。事件中的 `StringVar` 引用（例如 `{Enchantment1}` → `ModelDb.Enchantment<Sharp>().Title`）则会通过本地化查找解析为显示名称。
5. **Spine 渲染** —— 角色和怪物并不是静态图片，而是 Spine 骨骼动画。项目使用无头 Node.js 渲染器，将待机姿势组装为 512×512 的头像 PNG。全部 111 个怪物都已配有图像：其中 100 个由 Spine 骨骼渲染而来，6 个通过共享骨骼别名复用（Flyconid→flying_mushrooms，Ovicopter→egg_layer，Crusher / Rocket→kaiser_crab），另有 5 个来自静态游戏资源（Doormaker）。同时还会渲染全部 5 个角色（战斗、休息点、角色选择姿态）、NPC 和背景。基于皮肤的变体（Cultists、Bowlbugs、Cubex）会分别渲染。详见下文 [Spine Renderer](#spine-renderer)。
6. **图片资源** —— 从游戏资源中提取卡牌立绘、遗物 / 药水图标、角色美术、怪物图像、先古之民头像图标以及 Boss 遭遇图标，并作为静态文件提供。
7. **更新日志差异比对** —— 差异工具可比较不同游戏版本之间的 JSON 数据（支持 git ref 或目录），按类别追踪新增 / 删除 / 修改的实体，并提供字段级 diff。更新日志使用 Steam 游戏版本号 + 可选的 Codex 修订号作为键。

## 项目结构

```text
spire-codex/
├── backend/                    # FastAPI 后端
│   ├── app/
│   │   ├── main.py             # 应用入口、CORS、GZip、限流、静态文件
│   │   ├── dependencies.py     # 公共依赖（语言校验、语言名称）
│   │   ├── routers/            # API 路由（25+ 个 router）
│   │   ├── models/schemas.py   # Pydantic 模型
│   │   ├── services/           # JSON 数据加载（LRU 缓存，支持 14 种语言）
│   │   └── parsers/            # C# 源码 → JSON 解析器
│   │       ├── card_parser.py
│   │       ├── character_parser.py
│   │       ├── monster_parser.py
│   │       ├── relic_parser.py
│   │       ├── potion_parser.py
│   │       ├── enchantment_parser.py
│   │       ├── encounter_parser.py
│   │       ├── event_parser.py
│   │       ├── power_parser.py
│   │       ├── keyword_parser.py        # 关键词、意图、充能球、苦难、修饰器、成就（含解锁条件）
│   │       ├── guide_parser.py          # 带 YAML frontmatter 的 Markdown 指南
│   │       ├── epoch_parser.py
│   │       ├── act_parser.py
│   │       ├── ascension_parser.py
│   │       ├── pool_parser.py           # 为药水补充角色池信息
│   │       ├── translation_parser.py    # 为每种语言生成 translations.json
│   │       ├── description_resolver.py  # 公共 SmartFormat 解析器
│   │       ├── parser_paths.py          # 公共路径配置（支持通过环境变量切换 beta）
│   │       └── parse_all.py             # 统一调度全部解析器（14 种语言）
│   ├── static/images/          # 游戏图片（未提交到仓库）
│   ├── scripts/copy_images.py  # 将提取结果中的图片复制到 static
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/                   # Next.js 16 + TypeScript + Tailwind CSS
│   ├── app/
│   │   ├── contexts/           # LanguageContext、BetaVersionContext
│   │   ├── components/         # CardGrid、RichDescription、SearchFilter、
│   │   │                       # GlobalSearch、Navbar、Footer、LanguageSelector
│   │   └── ...                 # 页面：cards、characters、relics、monsters、potions、
│   │                           # enchantments、encounters、events、powers、timeline、
│   │                           # reference、images、changelog、about、merchant、compare、
│   │                           # mechanics/[slug]、guides/[slug]、guides/submit、runs、meta
│   │                           # 详情页：cards/[id]、characters/[id]、relics/[id]、
│   │                           # monsters/[id]、potions/[id]、enchantments/[id]、
│   │                           # encounters/[id]、events/[id]、powers/[id]、keywords/[id]、
│   │                           # acts/[id]、ascensions/[id]、intents/[id]、orbs/[id]、
│   │                           # afflictions/[id]、modifiers/[id]、achievements/[id]
│   │                           # i18n: [lang]/... 为另外 13 种语言镜像所有路由
│   ├── lib/
│   │   ├── api.ts              # API 客户端 + TypeScript 接口
│   │   ├── fetch-cache.ts      # 客户端内存级 fetch 缓存（5 分钟 TTL）
│   │   ├── seo.ts              # 公共 SEO 工具（stripTags、SITE_URL、SITE_NAME）
│   │   ├── jsonld.ts           # JSON-LD schema 构建器（BreadcrumbList、CollectionPage、Article、WebSite、FAQPage）
│   │   ├── ui-translations.ts  # 13 种语言的 UI 文本翻译
│   │   ├── languages.ts        # i18n 配置——13 个语言代码、hreflang 映射
│   │   └── use-lang-prefix.ts  # 语言感知 URL 构建 Hook
│   └── Dockerfile
├── tools/
│   ├── spine-renderer/          # 无头 Spine 骨架渲染器
│   │   ├── render_webgl.mjs     # WebGL 渲染器（单骨架）—— 无接缝伪影
│   │   ├── render_all_webgl.mjs # WebGL 批量渲染器（全部 .skel 文件）
│   │   ├── render_gif.mjs       # 动画渲染器（WebP / GIF / APNG，支持皮肤与动画）
│   │   ├── render.mjs           # 旧版 Canvas 渲染器（存在三角形接缝）
│   │   ├── render_all.mjs       # 旧版 canvas 批量渲染器
│   │   ├── render_skins2.mjs    # 皮肤变体渲染器
│   │   ├── render_utils.mjs     # 共用 canvas 渲染工具
│   │   └── package.json
│   ├── diff_data.py            # 更新日志差异生成器
│   ├── update.py               # 跨平台更新流水线
│   └── deploy.py               # 本地 Docker 构建 + 推送到 Docker Hub
├── data/                       # 解析后的 JSON 数据文件
│   ├── {lang}/                 # 按语言划分的目录（eng、kor、jpn、fra 等）
│   ├── changelogs/             # 更新日志 JSON 文件（按游戏版本号索引）
│   ├── guides/                 # 带 YAML frontmatter 的 Markdown 指南文件
│   ├── guides.json             # 解析后的指南数据
│   ├── runs/                   # 用户提交的 run JSON 文件（按玩家 hash）
│   └── runs.db                 # 存储 run 元数据的 SQLite 数据库
├── extraction/                 # 原始游戏文件（未提交）
│   ├── raw/                    # 通过 GDRE 提取出的 Godot 项目（stable）
│   ├── decompiled/             # ILSpy 输出（stable）
│   └── beta/                   # Steam beta 分支（raw/ + decompiled/）
├── data-beta/                  # 解析后的 beta 数据（带版本目录：v0.102.0/、v0.103.0/、latest → 符号链接）
├── docker-compose.yml          # 本地开发
├── docker-compose.prod.yml     # 生产环境
├── docker-compose.beta.yml     # Beta 站点（beta.spire-codex.com）
└── .forgejo/workflows/
    └── build.yml               # CI：构建并推送到 Docker Hub
```

## 网站页面

| 页面 | 路由 | 说明 |
| --- | --- | --- |
| 首页 | `/` | 显示实体总数、分类卡片、角色入口的总览面板 |
| 卡牌 | `/cards` | 支持筛选的卡牌网格，带弹窗详情视图 |
| 卡牌详情 | `/cards/[id]` | 完整卡牌数值、升级信息、图片 |
| 角色 | `/characters` | 角色总览网格 |
| 角色详情 | `/characters/[id]` | 数值、初始牌组 / 遗物、台词、NPC 对话树 |
| 遗物 | `/relics` | 可筛选的遗物网格 |
| 遗物详情 | `/relics/[id]` | 完整遗物信息，以及以富文本形式呈现的背景描述 |
| 怪物 | `/monsters` | 包含生命值、行动、Spine 渲染图的怪物网格 |
| 怪物详情 | `/monsters/[id]` | 生命值、行动（含意图 / 伤害 / 能力 / 格挡）、遭遇链接、能力提示 |
| 药水 | `/potions` | 可筛选的药水网格（稀有度、角色池） |
| 药水详情 | `/potions/[id]` | 完整药水信息 |
| 附魔 | `/enchantments` | 支持卡牌类型筛选的附魔列表 |
| 附魔详情 | `/enchantments/[id]` | 完整附魔信息 |
| 遭遇 | `/encounters` | 按章节 / 房间类型分类的遭遇组合 |
| 遭遇详情 | `/encounters/[id]` | 怪物阵容、房间类型、标签 |
| 事件 | `/events` | 多页事件树，支持展开选项 |
| 事件详情 | `/events/[id]` | 完整事件页面、选项、先古之民对话 |
| 能力 | `/powers` | 增益、减益和中立能力 |
| 能力详情 | `/powers/[id]` | 能力信息及会施加该能力的卡牌 |
| 关键词 | `/keywords` | 卡牌关键词列表 |
| 关键词详情 | `/keywords/[id]` | 关键词说明，带可筛选卡牌网格 |
| 商人 | `/merchant` | 卡牌 / 遗物 / 药水价格，删牌费用，伪商人 |
| 对比 | `/compare` | 角色对比中心（10 组配对） |
| 对比详情 | `/compare/[pair]` | 角色并列对比 |
| 开发者 | `/developers` | API 文档、组件文档、数据导出 |
| 展示区 | `/showcase` | 社区项目展示 |
| 时间线 | `/timeline` | 按时代分组并带解锁条件的 Epoch 时间线 |
| 章节详情 | `/acts/[id]` | 某章节的 Boss、遭遇、事件、先古之民 |
| 进阶等级详情 | `/ascensions/[id]` | 进阶等级说明，支持前后导航 |
| 意图详情 | `/intents/[id]` | 意图图标、描述 |
| 充能球详情 | `/orbs/[id]` | 充能球图标、被动 / 触发描述 |
| 苦难详情 | `/afflictions/[id]` | 苦难描述、可叠加性 |
| 修饰器详情 | `/modifiers/[id]` | Run 修饰器描述 |
| 成就详情 | `/achievements/[id]` | 成就描述 |
| 机制 | `/mechanics` | 游戏机制总览 —— 27 个可点击分区，带独立 SEO 页面 |
| 机制详情 | `/mechanics/[slug]` | 卡牌概率、遗物分布、药水掉落、地图生成、Boss 池、战斗、彩蛋与冷知识 |
| 指南 | `/guides` | 社区策略指南，支持搜索 / 筛选 |
| 指南详情 | `/guides/[slug]` | 完整指南，支持 Markdown 渲染和 tooltip 组件 |
| 提交指南 | `/guides/submit` | 指南提交表单（Discord webhook） |
| Runs | `/runs` | 社区 run 浏览器，支持角色 / 胜负筛选 |
| Meta | `/meta` | 来自用户提交 runs 的实时社区统计 |
| 参考 | `/reference` | 所有条目可点击 —— 章节、进阶等级、关键词、充能球、苦难、意图、修饰器、成就 |
| 图片 | `/images` | 可浏览的游戏素材，支持按类别下载 ZIP |
| 更新日志 | `/changelog` | 游戏更新之间的数据差异 |
| 关于 | `/about` | 项目信息、统计、流水线可视化 |

## API 端点

所有数据端点都支持可选的 `?lang=` 查询参数（默认：`eng`）。响应会进行 **GZip 压缩**，并带有 `Cache-Control: public, max-age=300` 缓存头。

| 端点 | 说明 | 过滤参数 |
| --- | --- | --- |
| `GET /api/cards` | 所有卡牌 | `color`, `type`, `rarity`, `keyword`, `search`, `lang` |
| `GET /api/cards/{id}` | 单张卡牌 | `lang` |
| `GET /api/characters` | 所有角色 | `search`, `lang` |
| `GET /api/characters/{id}` | 单个角色（含台词、对话） | `lang` |
| `GET /api/relics` | 所有遗物 | `rarity`, `pool`, `search`, `lang` |
| `GET /api/relics/{id}` | 单个遗物 | `lang` |
| `GET /api/monsters` | 所有怪物 | `type`, `search`, `lang` |
| `GET /api/monsters/{id}` | 单个怪物 | `lang` |
| `GET /api/potions` | 所有药水 | `rarity`, `pool`, `search`, `lang` |
| `GET /api/potions/{id}` | 单个药水 | `lang` |
| `GET /api/enchantments` | 所有附魔 | `card_type`, `search`, `lang` |
| `GET /api/enchantments/{id}` | 单个附魔 | `lang` |
| `GET /api/encounters` | 所有遭遇 | `room_type`, `act`, `search`, `lang` |
| `GET /api/encounters/{id}` | 单个遭遇 | `lang` |
| `GET /api/events` | 所有事件 | `type`, `act`, `search`, `lang` |
| `GET /api/events/{id}` | 单个事件 | `lang` |
| `GET /api/powers` | 所有能力 | `type`, `stack_type`, `search`, `lang` |
| `GET /api/powers/{id}` | 单个能力 | `lang` |
| `GET /api/keywords` | 卡牌关键词定义 | `lang` |
| `GET /api/keywords/{id}` | 单个关键词 | `lang` |
| `GET /api/intents` | 怪物意图类型 | `lang` |
| `GET /api/intents/{id}` | 单个意图 | `lang` |
| `GET /api/orbs` | 所有充能球 | `lang` |
| `GET /api/orbs/{id}` | 单个充能球 | `lang` |
| `GET /api/afflictions` | 卡牌苦难 | `lang` |
| `GET /api/afflictions/{id}` | 单个苦难 | `lang` |
| `GET /api/modifiers` | Run 修饰器 | `lang` |
| `GET /api/modifiers/{id}` | 单个修饰器 | `lang` |
| `GET /api/achievements` | 所有成就 | `lang` |
| `GET /api/achievements/{id}` | 单个成就 | `lang` |
| `GET /api/epochs` | 时间线纪元 | `era`, `search`, `lang` |
| `GET /api/epochs/{id}` | 单个纪元 | `lang` |
| `GET /api/stories` | 故事条目 | `lang` |
| `GET /api/stories/{id}` | 单个故事 | `lang` |
| `GET /api/acts` | 所有章节 | `lang` |
| `GET /api/acts/{id}` | 单个章节 | `lang` |
| `GET /api/ascensions` | 进阶等级（0–10） | `lang` |
| `GET /api/ascensions/{id}` | 单个进阶等级 | `lang` |
| `GET /api/stats` | 所有分类的实体数量统计 | `lang` |
| `GET /api/languages` | 可用语言及显示名称 | — |
| `GET /api/translations` | 过滤值与 UI 文本的翻译映射 | `lang` |
| `GET /api/images` | 图片分类及文件列表 | — |
| `GET /api/images/{category}/download` | 某图片分类的 ZIP 下载 | — |
| `GET /api/changelogs` | 更新日志摘要（全部版本） | — |
| `GET /api/changelogs/{tag}` | 某版本标签的完整更新日志 | — |
| `GET /api/versions` | 可用数据版本（beta 多版本浏览） | — |
| `GET /api/guides` | 社区攻略 | `category`, `difficulty`, `tag`, `search` |
| `GET /api/guides/{slug}` | 单篇攻略（含 Markdown 内容） | — |
| `POST /api/guides` | 提交攻略（代理到 Discord） | — |
| `POST /api/runs` | 提交一个 run（`.run` 文件 JSON） | `username` |
| `GET /api/runs/list` | 已提交 runs 列表 | `character`, `win`, `username`, `page`, `limit` |
| `GET /api/runs/shared/{hash}` | 通过 hash 获取完整 run 数据 | — |
| `GET /api/runs/stats` | 聚合后的社区统计 | `character`, `win`, `ascension`, `game_mode`, `players` |
| `POST /api/feedback` | 提交反馈（代理到 Discord） | — |

每个 IP 每分钟限流 **60 次请求**。反馈和攻略提交接口每个 IP 每分钟限制 **3–5 次**。交互式文档位于 `/docs`（Swagger UI）。

### 本地化

所有游戏数据都使用《杀戮尖塔 2》自带的本地化文件，以 14 种语言提供。你可以在任意数据接口上通过 `?lang=` 指定语言。在 beta 站点上，可以通过传入 ?version=v0.102.0 来浏览指定的 beta 版本。


| 代码 | 语言 | 代码 | 语言 |
| --- | --- | --- | --- |
| `eng` | English | `kor` | 한국어 |
| `deu` | Deutsch | `pol` | Polski |
| `esp` | Español (ES) | `ptb` | Português (BR) |
| `fra` | Français | `rus` | Русский |
| `ita` | Italiano | `spa` | Español (LA) |
| `jpn` | 日本語 | `tha` | ไทย |
| `tur` | Türkçe | `zhs` | 简体中文 |

**已本地化的内容**：所有实体名称、描述、卡牌类型、稀有度、关键词、能力名称、遭遇中的怪物名称、角色名称、章节标题——凡是来自游戏本地化数据的内容，都会本地化。

**仍保持英文的内容**：UI 外壳（导航、过滤器标签、搜索占位符）、用于过滤的结构字段（room_type、能力的 type / stack_type、pool）、站点品牌名称。

过滤参数（如 type=Attack、rarity=Rare、keyword=Exhaust）无论当前语言是什么，都始终使用英文值；后端会在匹配前将它们映射到对应的本地化值。

示例：`GET /api/cards?lang=kor&type=Attack` 会返回韩文卡牌数据，其中卡牌类型会显示为“공격”，同时过滤依然能正确生效，即使参数本身使用的是英文。

### 富文本格式

文本字段（`description`、`loss_text`、`flavor`、对话 `text`、选项 `title` / `description`）可能会包含从游戏本地化数据中保留下来的 Godot BBCode 风格标签：

| 标签 | 类型 | 示例 | 渲染效果 |
| --- | --- | --- | --- |
| `[gold]...[/gold]` | 颜色 | `[gold]Enchant[/gold]` | 金色文本 |
| `[red]...[/red]` | 颜色 | `[red]blood[/red]` | 红色文本 |
| `[blue]...[/blue]` | 颜色 | `[blue]2[/blue]` | 蓝色文本 |
| `[green]...[/green]` | 颜色 | `[green]healed[/green]` | 绿色文本 |
| `[purple]...[/purple]` | 颜色 | `[purple]Sharp[/purple]` | 紫色文本 |
| `[orange]...[/orange]` | 颜色 | `[orange]hulking figure[/orange]` | 橙色文本 |
| `[pink]...[/pink]` | 颜色 | — | 粉色文本 |
| `[aqua]...[/aqua]` | 颜色 | `[aqua]Ascending Spirit[/aqua]` | 青色文本 |
| `[sine]...[/sine]` | 效果 | `[sine]swirling vortex[/sine]` | 波浪动画文本 |
| `[jitter]...[/jitter]` | 效果 | `[jitter]CLANG![/jitter]` | 抖动动画文本 |
| `[b]...[/b]` | 效果 | `[b]bold text[/b]` | 粗体 |
| `[i]...[/i]` | 效果 | `[i]whispers[/i]` | 斜体 |
| `[energy:N]` | 图标 | `[energy:2]` | 能量图标 |
| `[star:N]` | 图标 | `[star:1]` | 星星图标 |
| `[Card]`, `[Relic]` | 占位符 | `[Card]` | 运行时动态占位符（斜体） |

标签可以嵌套，例如：`[b][jitter]CLANG![/jitter][/b]`、`[gold][sine]swirling vortex[/sine][/gold]`。

如果你是直接消费 API，可以使用类似 `\[/?[a-z]+(?::\d+)?\]` 的正则去掉这些标签，也可以在自己的前端中实现渲染。`description_raw` 字段（如果提供）则包含尚未解析的 SmartFormat 模板。

## 本地运行

### 前置要求

- Python 3.10+
- Node.js 20+

### 后端

```bash
python -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r backend/requirements.txt

cd backend
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

后端运行于 **http://localhost:8000**。

### 前端

```bash
cd frontend
npm install
NEXT_PUBLIC_API_URL=http://localhost:8000 npm run dev
```

前端运行于 **http://localhost:3000**。

### Docker

```bash
docker compose up --build
```

会同时启动两个服务（后端在 8000，前端在 3000）。

## 更新流水线

当游戏发布新版本时，一个跨平台的 Python 脚本会处理完整更新流程：

```bash
# 完整流程——提取游戏文件、解析数据、渲染精灵、复制图片：
python3 tools/update.py

# 手动指定游戏安装目录：
python3 tools/update.py --game-dir "/path/to/Slay the Spire 2"

# 跳过提取（已经有新的 extraction/ 目录）：
python3 tools/update.py --skip-extract

# 仅重新解析数据（不提取、不渲染）：
python3 tools/update.py --parse-only

# 仅重新渲染 Spine 精灵图：
python3 tools/update.py --render-only

# 更新后生成 changelog：
python3 tools/update.py --changelog --game-version "0.98.2" --build-id "22238966"
```

脚本会自动检测你的操作系统并查找 Steam 安装目录。各步骤所需工具如下：

| 步骤 | 工具 | 安装方式 |
| --- | --- | --- |
| PCK 提取 | `gdre_tools` | [GDRE Tools releases](https://github.com/bruvzg/gdsdecomp/releases) |
| DLL 反编译 | `ilspycmd` | `dotnet tool install ilspycmd -g` |
| 数据解析 | Python 3.10+ | 内置 |
| 图片复制 | Python 3.10+ | 内置 |
| Spine 渲染 | Node.js 20+ | [nodejs.org](https://nodejs.org) |

### 手动步骤

如果你想逐步执行：

```bash
# 解析全部数据（14 种语言）
cd backend/app/parsers && python3 parse_all.py

# 解析单一语言
cd backend/app/parsers && python3 parse_all.py --lang eng

# 将图片从 extraction 复制到 static
python3 backend/scripts/copy_images.py

# 渲染 Spine 精灵图（WebGL —— 无三角形接缝伪影）
cd tools/spine-renderer && npm install
npx playwright install chromium           # 仅首次需要
node render_all_webgl.mjs                 # 通过无头 Chrome 渲染全部 138 个骨架
node render_webgl.mjs <skel_dir> <out> [size]  # 渲染单个骨架（例如高分辨率 ancient）

# 旧版 canvas 渲染器（有三角形接缝伪影 —— 不建议使用）
# node render_all.mjs / node render.mjs
```

## 更新日志系统

通过字段级差异跟踪游戏更新之间各个实体分类发生了什么变化。

### 生成更新日志

```bash
# 将当前数据与某个 git 引用进行比较：
python3 tools/diff_data.py HEAD~1 --format json \
    --game-version "0.98.2" --build-id "22238966" \
    --title "March Update"

# 以文本或 markdown 预览：
python3 tools/diff_data.py HEAD~1 --format text
python3 tools/diff_data.py HEAD~1 --format md
```

### 更新日志 Schema

每个 changelog JSON 文件包含：

| 字段 | 说明 |
| --- | --- |
| `app_id` | Steam App ID（2868840） |
| `game_version` | Steam 游戏版本号（如 `"0.98.2"`） |
| `build_id` | Steam build ID |
| `tag` | 唯一版本键（如 `"1.0.3"`） |
| `date` | 更新日期 |
| `title` | 可读标题 |
| `summary` | 汇总计数：`{ added, removed, changed }` |
| `categories` | 各分类的新增 / 删除 / 修改项差异 |

## 部署

### CI/CD（Forgejo）

推送到 `main` 会触发 `.forgejo/workflows/build.yml`，构建并通过 buildah 将前后端镜像推送到 Docker Hub。

### 本地构建 + 推送

跳过 CI，直接从本地机器推送：

```bash
# 构建并推送两个镜像：
python3 tools/deploy.py

# 仅前端：
python3 tools/deploy.py --frontend

# 仅后端：
python3 tools/deploy.py --backend

# 只测试构建，不推送：
python3 tools/deploy.py --no-push

# 打 release 标签：
python3 tools/deploy.py --tag v0.98.2

# 构建并推送 beta 镜像（:beta 标签，跳过 IndexNow）：
python3 tools/deploy.py --beta
```

会自动检测 Apple Silicon，并通过 `docker buildx` 交叉编译到 `linux/amd64`。首次使用前需要先执行 `docker login`。

### 生产环境

```bash
# 在生产服务器上拉取并重启：
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

生产数据通过 bind mount 挂载（`./data:/data:ro`）。数据变更后需要重启容器。

### Beta 站点（beta.spire-codex.com）

一个并行部署的站点，用于提供 Steam beta 分支数据，并支持多版本浏览。用户可以通过导航栏下拉框切换任意历史 beta 版本，所有版本都会永久保留。

**架构**：`VersionMiddleware` 从查询参数中读取 `?version=`，存入 Python `ContextVar`；`data_service.py` 在加载 JSON 时读取该值，因此无需修改 20+ 个 router 文件。前端使用 `BetaVersionContext` + `VersionSelector` 下拉组件，`fetch-cache.ts`会自动为所有 API 请求追加 `&version=X`。

**数据布局**：`data-beta/v0.102.0/eng/`、`data-beta/v0.103.0/eng/`，并通过一个 `latest`符号链接指向最新版本。每个版本都有独立的 `changelogs/` 目录。

```bash
# 1. 加入 Steam beta 分支（StS2 → Properties → Betas）

# 2. 提取并反编译 beta 游戏文件
"/Applications/Godot RE Tools.app/Contents/MacOS/Godot RE Tools" --headless \
  "--recover=<path_to_pck>" "--output=extraction/beta/raw"
~/.dotnet/tools/ilspycmd -p -o extraction/beta/decompiled "<path_to_dll>"

# 3. 解析到带版本号的目录中
cd backend/app/parsers
EXTRACTION_DIR=extraction/beta DATA_DIR=data-beta/v0.103.0 python3 parse_all.py

# 4. 生成 changelog（旧版本 → 新版本）
python3 tools/diff_data.py data-beta/v0.102.0/eng data-beta/v0.103.0/eng \
  --format json --output-dir data-beta/v0.103.0/changelogs \
  --game-version "0.103.0" --title "Beta v0.103.0"

# 5. 更新 latest 符号链接
cd data-beta && rm latest && ln -sf v0.103.0 latest

# 6. 构建并推送 beta Docker 镜像
python3 tools/deploy.py --beta

# 7. 在服务器上启动 beta 站点
docker compose -f docker-compose.beta.yml pull
docker compose -f docker-compose.beta.yml up -d
```

解析器通过 parser_paths.py 支持 EXTRACTION_DIR 和 DATA_DIR 环境变量，因此同一套解析代码可以同时面向稳定版和 beta 数据源。

## Spine 渲染器

StS2 中的怪物资源是 [Spine](http://esotericsoftware.com/) 骨骼动画形式 —— 每个怪物由 `.skel`（二进制骨架）+ `.atlas` + `.png` 精灵图集组成，而不是单张图片。渲染器的作用就是把这些资源组合成静态头像 PNG。

### WebGL 渲染器（当前方案）

WebGL 渲染器（`render_webgl.mjs`、`render_all_webgl.mjs`）使用 **Playwright + spine-webgl**，通过 headless Chrome 的 GPU 对骨骼进行渲染。这样可以得到**没有三角接缝伪影**的干净图像。

**工作原理：**

1. 通过 Playwright 启动启用了 WebGL 的 headless Chrome
2. 将 skeleton 数据、atlas 和纹理编码为 base64 后加载到浏览器页面中

3. 创建 WebGL canvas，初始化 spine-webgl shader 和 polygon batcher

4. 应用 idle 动画，并计算边界（排除 shadow / ground 插槽）

5. 通过 GPU 三角形栅格化进行渲染——不会使用 canvas clip() 路径，因此不会出现接缝

6. 通过 gl.readPixels 读取原始像素，并进行垂直翻转（WebGL 坐标原点在底部）

7. 使用 node-canvas 写出 PNG，以保留透明通道

   **渲染单个骨骼：**

```bash
node render_webgl.mjs <skel_dir> <output_path> [size]
node render_webgl.mjs ../../extraction/raw/animations/backgrounds/neow_room ../../backend/static/images/misc/neow.png 2048
```

**批量渲染全部骨骼：**

```bash
node render_all_webgl.mjs  # 将 138 个骨架渲染到 backend/static/images/renders/
```

### 渲染覆盖率

| 分类 | 已渲染 | 总数 | 说明 |
| --- | --- | --- | --- |
| 怪物 | 99 | 103 个目录 | 全部 111 个游戏怪物都有图像（99 个渲染 + 别名 / 静态资源） |
| 角色 | 16 | 16 | 战斗、休息点、选择界面姿势 |
| 背景 / NPC | 14 | 17 | Neow、Tezcatara、商人房间、主菜单 |
| VFX / UI | 9 | 22 | 大部分特效需要指定动画帧 |
| **总计** | **138** | **158** | 有 20 个被跳过（无 atlas、仅特效、空白） |

### 动画渲染器

动画渲染器（`render_gif.mjs`）可以把 Spine 的 idle / attack 动画渲染为动态 WebP、GIF 或 APNG。支持皮肤变体、动画选择，以及对大动画进行逐帧落盘以避免内存爆炸。

**支持的输出格式：**

- **`.webp`**（推荐）—— 无损动画 WebP，完整 alpha，文件体积约比 APNG 小 33%。并通过逐帧写盘避免 OOM
- **`.gif`** —— 256 色，二值透明。体积最小，但质量最低。
- **`.apng`** —— 与 WebP 一样支持完整 alpha，但文件更大。

```bash
# 渲染无损动态 WebP（推荐）
NODE_OPTIONS="--max-old-space-size=8192" node render_gif.mjs <skel_dir> <output.webp> [size] [--fps=N]

# 使用皮肤变体（适用于 bowlbug、cultists、cubex 等）
node render_gif.mjs <skel_dir> output.webp 256 --fps=10 --skin=rock

# 指定动画（默认：idle loop）
node render_gif.mjs <skel_dir> output.webp 256 --fps=12 --anim=attack

# 白色剪影模式（用于 Boss 地图节点图标）
node render_gif.mjs <skel_dir> output.webp 256 --white
```

**动画资源库：**209 个无损动画 WebP：

- 15 个角色动画（5 个角色 × 战斗 / 选择 / 休息）分辨率为 512×512
- 103 个怪物 idle 动画，分辨率为 256×256
- 91 个怪物 attack 动画，分辨率为 256×256

**皮肤变体：**13 个怪物具有皮肤变体（bowlbug、cubex_construct、cultists 等）。使用 `--skin=` 选择。默认皮肤通常只显示基础骨架，而不包含完整身体。

**Boss 地图节点着色器：**游戏使用 `boss_map_point.gdshader`，将 RGB 通道作为遮罩：

- **红色通道** × `map_color`（默认：米色 `0.671, 0.58, 0.478`）→ 填充颜色
- **蓝色通道** × `black_layer_color`（默认：黑色 `0, 0, 0`）→ 描边颜色
- **绿色通道** × 白色 `1, 1, 1` → 高亮

### 旧版 Canvas 渲染器

Canvas 渲染器（`render.mjs`、`render_all.mjs`）使用 `spine-canvas` 并开启 `triangleRendering = true`。由于 canvas `clip()` 在相邻三角形之间的抗锯齿处理，会产生**可见的线框网格伪影**。请改用 WebGL 渲染器。

### 依赖

- `@esotericsoftware/spine-webgl` ^4.2.107 —— 当前使用的 WebGL Spine 运行时
- `playwright` —— 用于 WebGL 渲染的 headless Chrome
- `gif-encoder-2` —— 动画渲染器的 GIF 编码
- `canvas` ^3.1.0 —— Node.js Canvas 实现（动画渲染器的帧缓冲）
- `Pillow`（Python）—— 将渲染出的 PNG 帧组装为 WebP / APNG
- `@esotericsoftware/spine-canvas` ^4.2.106 —— 旧版 Canvas Spine 运行时

## 提取游戏文件

如果你需要从零开始提取：

```bash
# 提取 PCK（GDRE Tools）
/path/to/gdre_tools --headless --recover="/path/to/sts2.pck" --output-dir=extraction/raw

# 反编译 DLL（ILSpy CLI）
ilspycmd -p -o extraction/decompiled "/path/to/sts2.dll"
```

Steam 安装路径：

- **Windows**：`C:\Program Files (x86)\Steam\steamapps\common\Slay the Spire 2\`
- **macOS**：`~/Library/Application Support/Steam/steamapps/common/Slay the Spire 2/`
- **Linux**：`~/.local/share/Steam/steamapps/common/Slay the Spire 2/`

## 版本号

Spire Codex 使用 **`1.X.Y`** 语义化版本规则：

| 段位 | 含义 |
| --- | --- |
| **1** | Spire Codex 的主版本号（除非整体重写，否则不会变化） |
| **X** | 当 Mega Crit 发布新的游戏补丁时递增 |
| **Y** | 当项目自身的解析器 / 前端修复与改进时递增 |

示例：`v1.0.0` = 初始发布，`v1.0.1` = 项目自身 bug 修复，`v1.1.0` = 接入了 Mega Crit 的第一版游戏补丁。

## SEO

- **结构化数据（JSON-LD）**：首页使用 WebSite + VideoGame，列表页使用 CollectionPage + ItemList，详情页使用 Article + BreadcrumbList + FAQPage，开发者页使用 SoftwareApplication
- **标题格式**：`"Slay the Spire 2 [Topic] - [Descriptor] | Spire Codex"` —— 全站统一
- **站点地图**：位于 `/sitemap.xml` 的扁平 XML，使用 `force-dynamic`（服务端动态渲染，而非构建时生成）。共约 20,000+ 个 URL，包含实体详情页、浏览矩阵页以及所有实体类型的多语言详情页
- **国际化 SEO**：为 13 种非英语语言提供 `/{lang}/` 路由，并配置 hreflang alternates
- **程序化 SEO**：在 `/cards/browse/` 下提供 41 个卡牌浏览页面（如 rare-attacks、ironclad-skills 等）
- **站内链接**：能力 ↔ 卡牌、遭遇 → 怪物、卡牌关键词 → 关键词中心页、怪物行动 → 能力页（带 tooltip）、章节页 → 遭遇 / 事件、所有参考实体均可点击
- **Open Graph 与 Twitter Cards**：为每个实体单独生成 OG 图片，`summary_large_image` Twitter 卡片
- **Canonical URL**：每个页面都会声明 canonical URL

## 可嵌入组件

### Tooltip 组件

可在任意网站上为 13 类实体添加悬浮提示：

```html
<script src="https://spire-codex.com/widget/spire-codex-tooltip.js"></script>
<p>Start with [[Bash]] and [[relic:Burning Blood]].</p>
```

### Changelog 组件

可嵌入一个可交互的更新日志查看器：

```html
<div id="scx-changelog"></div>
<script src="https://spire-codex.com/widget/spire-codex-changelog.js"></script>
```

完整文档见：[spire-codex.com/developers](https://spire-codex.com/developers)

## 路线图

- ~~独立详情页~~ ✅
- ~~全局搜索~~ ✅
- ~~多语言支持（14 种语言）~~ ✅
- ~~SEO（JSON-LD、OG/Twitter、sitemap、hreflang）~~ ✅
- ~~Tooltip 组件（全部 13 类实体）~~ ✅
- ~~角色对比页（10 组）~~ ✅
- ~~关键词中心页~~ ✅
- ~~商人指南（价格来自反编译后的 C#）~~ ✅
- ~~开发者文档 + 数据导出~~ ✅
- ~~国际化 SEO（13 种语言首页）~~ ✅
- ~~卡牌浏览矩阵（41 个程序化 SEO 页面）~~ ✅
- ~~社区攻略~~ ✅ —— 支持 YAML frontmatter 的 Markdown、投稿表单、tooltip 组件、作者社交链接
- ~~游戏机制页面~~ ✅ —— 27 个独立 SEO 页面：掉率、战斗、地图、Boss、彩蛋与冷知识
- ~~社区 runs~~ ✅ —— Run 提交、浏览器、共享 runs、实时统计
- ~~卡牌升级描述~~ ✅ —— 为全部 403 张可升级卡提供 `upgrade_description`
- ~~怪物自带入场能力~~ ✅ —— 42 个怪物，数据来自 `AfterAddedToRoom`
- ~~成就解锁条件~~ ✅ —— 分类、角色、阈值均来自 C# 源码
- ~~怪物出招模式~~ ✅ —— 112 个怪物，基于 C# 状态机解析出的循环 / 随机 / 条件 / 混合型 AI
- ~~事件前置条件~~ ✅ —— 25 个事件，条件来自 C# 源码中 IsAllowed() 的解析
- ~~Beta 多版本浏览~~ ✅ —— 版本下拉框，保留所有历史 beta，并支持查看 changelog
- **Discord 机器人** —— 卡牌查询、补丁提醒
- **构筑编辑器** —— 可交互式牌组理论构筑
- **数据库后端** —— 用 SQLite / PostgreSQL 替换 JSON 加载

## 致谢

感谢 **vesper-arch**、**terracubist**、**U77654**、**Purple Aspired Dreaming** 和 **Kobaru** 在 QA 测试、Bug 报告和贡献方面提供的帮助。

## 技术栈

- **后端**：Python、FastAPI、Pydantic、slowapi、GZip 压缩
- **前端**：Next.js 16（App Router）、TypeScript、Tailwind CSS、14 语言支持
- **Spine 渲染器**：Node.js、Playwright、@esotericsoftware/spine-webgl（通过无头 Chrome 使用 WebGL）
- **基础设施**：Docker、Forgejo CI、buildah
- **工具**：Python（更新流水线、changelog diff、图片复制）

## 免责声明

本项目仅用于教育目的。游戏数据版权归 Mega Crit Games 所有。不得将本项目用于重新编译或重新分发游戏。
