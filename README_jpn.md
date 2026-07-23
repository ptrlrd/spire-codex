<p align="center">
  <img src="frontend/public/spire-codex-white-silent-black-background.png" alt="Spire Codex logo" width="200" />
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

ゲームファイルのリバースエンジニアリングによって構築された、**Slay the Spire 2** のゲームデータを網羅するデータベースおよび API です。ゲームに同梱されている **15 言語**すべてに対応しています。

**公開サイト**: [spire-codex.com](https://spire-codex.com)

**Steam App ID**: 2868840

## 構築方法

Slay the Spire 2 は Godot 4 で構築されていますが、すべてのゲームロジックは GDScript ではなく C#/.NET 8 DLL（`sts2.dll`）に格納されています。データパイプラインは次のとおりです。

1. **PCK 抽出** - [GDRE Tools](https://github.com/bruvzg/gdsdecomp) で Godot の `.pck` ファイルを抽出し、画像、Spine アニメーション、ローカライズデータ（約 9,947 ファイル）を復元します。

2. **DLL 逆コンパイル** - [ILSpy](https://github.com/icsharpcode/ILSpy) で `sts2.dll` を逆コンパイルし、すべてのゲームモデルを含む、可読な約 3,300 個の C# ソースファイルを生成します。

3. **データ解析** - 正規表現ベースの 22 個の Python パーサーで、逆コンパイルされた C# ソースから構造化データを抽出し、言語別 JSON を `data/{lang}/` に出力します。
   - **カード**: `base(cost, CardType, CardRarity, TargetType)` コンストラクターと、ステータス用の `DamageVar`、`BlockVar`、`PowerVar<T>`
   - **キャラクター**: `StartingHp`、`StartingGold`、`MaxEnergy`、`StartingDeck`、`StartingRelics`
   - **レリック／ポーション**: レアリティ、プール、SmartFormat テンプレートから解決した説明
   - **モンスター**: HP 範囲、`AscensionHelper` によるアセンションスケーリング、各ムーブのインテント（Attack／Defend／Buff／Debuff／Status／Summon／Heal）を含むムーブステートマシン、ダメージ値、複数ヒット回数（AscensionHelper パターンを含む）、`AfterAddedToRoom` から取得した固有パワー（アセンション差分を含む 42 体）、各ムーブで付与されるパワー（`PowerCmd.Apply<T>` から対象と量を取得）、ブロック、回復、エンカウントのコンテキスト（Act、部屋タイプ）、`GenerateMoveStateMachine()` から解析した**攻撃パターン**（112 体 - サイクル、ランダム、条件付き、混合）
   - **エンチャント**: カードタイプ制限、スタック可否、Amount ベースのスケーリング
   - **エンカウント**: モンスター構成、部屋タイプ（Boss／Elite／Monster）、登場 Act、タグ
   - **イベント**: 複数ページの決定木（66 イベント中 56 件）、結果を伴う選択肢、登場 Act、表示名へ解決した `StringVar` モデル参照、実行時に計算される値（`GetDecipherCost()` による増加コスト、`NextInt`／`NextFloat` を含む `CalculateVars` によるゴールド範囲、全回復パターン）、`IsAllowed()` から取得した**前提条件**（25 イベント - ゴールド、HP、Act、デッキ、レリック、ポーションの条件）
   - **Ancient**: 8 人の Ancient NPC。異名、キャラクター固有の会話、レリックの提示、ポートレートアイコンを含む
   - **パワー**: PowerType（Buff／Debuff）、PowerStackType（Counter／Single）、DynamicVars、説明
   - **Epoch／ストーリー**: アンロック要件を含むタイムライン進行データ
   - **オーブ**: パッシブ／Evoke 値、説明
   - **Affliction**: スタック可否、追加カードテキスト、説明
   - **Modifier**: ラン Modifier の説明
   - **キーワード**: カードキーワードの定義（Exhaust、Ethereal、Innate など）
   - **インテント**: アイコン付きのモンスターインテント説明
   - **実績**: アンロック条件、説明、カテゴリ、関連キャラクター、C# ソースから取得したしきい値（33 実績）
   - **Act**: ボスの発見順、エンカウント、イベント、Ancient、部屋数
   - **アセンションレベル**: ローカライズデータから取得した説明を含む 11 レベル（0～10）
   - **ポーションプール**: プールクラスと Epoch 参照から解析したキャラクター固有のプール
   - **翻訳**: フロントエンドで使用する言語別フィルターマップ（カードタイプ、レアリティ、キーワード → ローカライズ名）と UI 文字列（セクションタイトル、説明、キャラクター名）

4. **説明の解決** - 共通の `description_resolver.py` モジュールで SmartFormat ローカライズテンプレート（`{Damage:diff()}`、`{Energy:energyIcons()}`、`{Cards:plural:card|cards}`）を解決し、フロントエンド描画用のリッチテキストマーカーを含む、人間が読めるテキストへ変換します。実行時に動的に決まる変数（例: `{Card}`、`{Relic}`）は、読みやすいプレースホルダーとして保持されます。イベント内の `StringVar` 参照（例: `{Enchantment1}` → `ModelDb.Enchantment<Sharp>().Title`）は、ローカライズ検索によって表示名へ解決されます。

5. **Spine レンダリング** - キャラクターとモンスターは静止画像ではなく、Spine のスケルタルアニメーションです。ヘッドレス Node.js レンダラーで待機ポーズを組み立て、512×512 のポートレート PNG を生成します。111 体すべてのモンスターに画像があります。100 体は Spine スケルトンからレンダリングし、6 体は共有スケルトンの別名を使用し（Flyconid→flying_mushrooms、Ovicopter→egg_layer、Crusher/Rocket→kaiser_crab）、5 体は静的なゲームアセット（Doormaker）を使用します。また、5 人すべてのキャラクター（戦闘、休憩所、キャラクター選択ポーズ）、NPC、背景もレンダリングします。スキンベースの差分（Cultists、Bowlbugs、Cubex）は個別にレンダリングされます。詳しくは後述の [Spine レンダラー](#spine-レンダラー)を参照してください。

6. **画像** - カードポートレート、レリック／ポーションアイコン、キャラクターアート、モンスタースプライト、Ancient ポートレートアイコン、ボスエンカウントアイコンをゲームアセットから抽出し、静的ファイルとして配信します。

7. **変更履歴の差分生成** - 差分ツールでゲームバージョン間の JSON データを比較し（git ref またはディレクトリを使用）、カテゴリごとに追加／削除／変更されたエンティティをフィールド単位の差分とともに追跡します。変更履歴は Steam のゲームバージョンと、任意の Codex リビジョン番号をキーとします。

## プロジェクト構成

```
spire-codex/
├── backend/                    # FastAPI バックエンド
│   ├── app/
│   │   ├── main.py             # アプリのエントリ、CORS、GZip、レート制限、静的ファイル
│   │   ├── dependencies.py     # 共通依存関係（言語検証、言語名）
│   │   ├── routers/            # API エンドポイント（25 個以上のルーター）
│   │   ├── models/schemas.py   # Pydantic モデル
│   │   ├── services/           # JSON データ読み込み（LRU キャッシュ、14 言語対応）
│   │   └── parsers/            # C# ソース → JSON パーサー
│   │       ├── card_parser.py
│   │       ├── character_parser.py
│   │       ├── monster_parser.py
│   │       ├── relic_parser.py
│   │       ├── potion_parser.py
│   │       ├── enchantment_parser.py
│   │       ├── encounter_parser.py
│   │       ├── event_parser.py
│   │       ├── power_parser.py
│   │       ├── keyword_parser.py        # キーワード、インテント、オーブ、Affliction、Modifier、実績（アンロック条件を含む）
│   │       ├── guide_parser.py          # YAML フロントマター付き Markdown ガイド
│   │       ├── epoch_parser.py
│   │       ├── act_parser.py
│   │       ├── ascension_parser.py
│   │       ├── pool_parser.py            # ポーションにキャラクタープールを追加
│   │       ├── translation_parser.py    # 言語ごとに translations.json を生成
│   │       ├── description_resolver.py   # 共通 SmartFormat リゾルバー
│   │       ├── parser_paths.py           # 共通パス設定（ベータ向け環境変数による上書き）
│   │       └── parse_all.py              # すべてのパーサーを統括（15 言語）
│   ├── static/images/          # ゲーム画像（コミット対象外）
│   ├── scripts/copy_images.py  # 抽出先から static へ画像をコピー
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/                   # Next.js 16 + TypeScript + Tailwind CSS
│   ├── app/
│   │   ├── contexts/           # LanguageContext、BetaVersionContext
│   │   ├── components/         # CardGrid、RichDescription、SearchFilter、
│   │   │                       #   GlobalSearch、Navbar、Footer、LanguageSelector、VersionSelector
│   │   └── ...                 # ページ: cards、characters、relics、monsters、potions、
│   │                           #   enchantments、encounters、events、powers、timeline、
│   │                           #   reference、images、changelog、about、merchant、compare、
│   │                           #   mechanics/[slug]、guides/[slug]、guides/submit、
│   │                           #   leaderboards、leaderboards/submit、leaderboards/stats、
│   │                           #   runs/[hash]（共有ラン表示）
│   │                           #   詳細ページ: cards/[id]、characters/[id]、relics/[id]、
│   │                           #   monsters/[id]、potions/[id]、enchantments/[id]、
│   │                           #   encounters/[id]、events/[id]、powers/[id]、keywords/[id]、
│   │                           #   acts/[id]、ascensions/[id]、intents/[id]、orbs/[id]、
│   │                           #   afflictions/[id]、modifiers/[id]、achievements/[id]
│   │                           #   i18n: [lang]/... は英語以外の 14 言語について全ルートをミラー
│   ├── lib/
│   │   ├── api.ts              # API クライアント + TypeScript インターフェース
│   │   ├── fetch-cache.ts      # クライアント側インメモリ fetch キャッシュ（TTL 5 分）
│   │   ├── seo.ts              # 共通 SEO ユーティリティ（stripTags、SITE_URL、SITE_NAME）
│   │   ├── jsonld.ts           # JSON-LD スキーマビルダー（BreadcrumbList、CollectionPage、Article、WebSite、FAQPage）
│   │   ├── ui-translations.ts # 英語以外の 14 言語向け UI 文字列翻訳
│   │   ├── languages.ts       # i18n 設定 - 14 言語コード、hreflang マッピング
│   │   └── use-lang-prefix.ts # 言語対応 URL 構築用フック
│   └── Dockerfile
├── tools/
│   ├── spine-renderer/         # ヘッドレス Spine スケルトンレンダラー
│   │   ├── render_webgl.mjs     # WebGL レンダラー（単一スケルトン）- 継ぎ目アーティファクトなし
│   │   ├── render_all_webgl.mjs # WebGL バッチレンダラー（すべての .skel ファイル）
│   │   ├── render_gif.mjs      # アニメーションレンダラー（スキン + アニメーション対応の WebP／GIF／APNG）
│   │   ├── render.mjs           # 旧 Canvas レンダラー（三角形の継ぎ目あり）
│   │   ├── render_all.mjs       # 旧 Canvas バッチレンダラー
│   │   ├── render_skins2.mjs    # スキン差分レンダラー
│   │   ├── render_utils.mjs     # 共通 Canvas レンダリングユーティリティ
│   │   └── package.json
│   ├── diff_data.py            # 変更履歴差分ジェネレーター
│   ├── update.py               # クロスプラットフォーム更新パイプライン
│   └── deploy.py               # ローカル Docker ビルド + Docker Hub への push
├── data/                       # 解析済み JSON データファイル
│   ├── {lang}/                 # 言語別ディレクトリ（eng、kor、jpn、fra など）
│   ├── changelogs/             # 変更履歴 JSON ファイル（ゲームバージョン別）
│   ├── guides/                 # YAML フロントマター付き Markdown ガイドファイル
│   ├── guides.json             # 解析済みガイドデータ
│   ├── runs/                   # 送信されたランの JSON ファイル（プレイヤーハッシュ別）
│   └── runs.db                 # 旧 SQLite（MongoDB に置換済み。オフライン時のフォールバックとして保持）
├── extraction/                 # 生のゲームファイル（コミット対象外）
│   ├── raw/                    # GDRE で抽出した Godot プロジェクト（安定版）
│   ├── decompiled/             # ILSpy 出力（安定版）
│   └── beta/                   # Steam ベータブランチ（raw/ + decompiled/）
├── data-beta/                  # 解析済みベータデータ（バージョン管理: v0.102.0/、v0.103.0/、latest → シンボリックリンク）
├── docker-compose.yml          # ローカル開発
├── docker-compose.prod.yml     # 本番環境
├── .github/workflows/
│   └── ci.yml                  # GitHub Actions CI: lint、型チェック、シークレットスキャン、Docker ビルド + push、SSH デプロイ
└── .forgejo/workflows/
    └── build.yml               # 保持されている Forgejo CI フォールバック（buildah ベース、現在は非稼働）
```

## 公開サービス

| ホスト | 用途 |
|---|---|
| [`spire-codex.com`](https://spire-codex.com) | 公開ウェブサイトおよび同一オリジン API。稼働中のベータチャンネルは `/beta` 配下にあります。 |
| `cdn.spire-codex.com` | ゲームアート、カードの完全レンダリング、ローカライズ済みレンダリング、アーカイブ済みベータアセット用の Cloudflare R2 オブジェクトホスト。 |
| [`bot.spire-codex.com`](https://bot.spire-codex.com) | Knowledge Demon のランディングページと、Discord 認証付きスタッフダッシュボード。Bot はメインの Codex API を利用します。 |
| `analytics.spire-codex.com` | セルフホストの Umami スクリプトおよびダッシュボード。その PostgreSQL データベースはプライベート Docker ネットワーク内に保持されます。 |
| `tierlists.spire-codex.com` | 生成された Tier List プレビュー画像専用の R2 オブジェクトホスト。 |
| `beta.spire-codex.com` | 廃止済みの公開ホスト。Cloudflare がリクエストを apex ドメイン上の同じパスへリダイレクトします。 |

CDN と Tier List のホストは閲覧可能なウェブサイトではなくオブジェクトストアであるため、いずれのルートでも `404` が返るのは想定どおりです。

## ウェブサイトのページ

| ページ | ルート | 説明 |
|---|---|---|
| ホーム | `/` | エンティティ数、カテゴリカード、キャラクターリンクを表示するダッシュボード |
| カード | `/cards` | モーダル詳細表示付きのフィルター可能なカードグリッド |
| カード詳細 | `/cards/[id]` | カードの全ステータス、アップグレード情報、画像 |
| キャラクター | `/characters` | キャラクター概要グリッド |
| キャラクター詳細 | `/characters/[id]` | ステータス、初期デッキ／レリック、台詞、NPC 会話ツリー |
| レリック | `/relics` | フィルター可能なレリックグリッド |
| レリック詳細 | `/relics/[id]` | リッチテキストのフレーバーを含むレリックの全情報 |
| モンスター | `/monsters` | HP、ムーブ、Spine レンダリングを表示するモンスターグリッド |
| モンスター詳細 | `/monsters/[id]` | HP、インテント／ダメージ／パワー／ブロック付きのムーブ、エンカウントリンク、パワーツールチップ |
| ポーション | `/potions` | フィルター可能なポーショングリッド（レアリティ、キャラクタープール） |
| ポーション詳細 | `/potions/[id]` | ポーションの全情報 |
| エンチャント | `/enchantments` | カードタイプフィルター付きのエンチャント一覧 |
| エンチャント詳細 | `/enchantments/[id]` | エンチャントの全情報 |
| エンカウント | `/encounters` | Act／部屋タイプ別のエンカウント構成 |
| エンカウント詳細 | `/encounters/[id]` | モンスター編成、部屋タイプ、タグ |
| イベント | `/events` | 展開可能な選択肢付きの複数ページイベントツリー |
| イベント詳細 | `/events/[id]` | イベントの全ページ、選択肢、Ancient の会話 |
| パワー | `/powers` | Buff、Debuff、中立パワー |
| パワー詳細 | `/powers/[id]` | このパワーを付与するカードを含むパワー情報 |
| キーワード | `/keywords` | カードキーワード一覧 |
| キーワード詳細 | `/keywords/[id]` | フィルター可能なカードグリッド付きのキーワード説明 |
| 商人 | `/merchant` | カード／レリック／ポーションの価格、カード削除費用、偽商人 |
| 比較 | `/compare` | キャラクター比較ハブ（10 組） |
| 比較詳細 | `/compare/[pair]` | キャラクターの並列比較 |
| 開発者 | `/developers` | API ドキュメント、ウィジェットドキュメント、データエクスポート |
| ショーケース | `/showcase` | コミュニティプロジェクトギャラリー |
| タイムライン | `/timeline` | 時代グループとアンロック要件を含む Epoch の進行 |
| Act 詳細 | `/acts/[id]` | Act のボス、エンカウント、イベント、Ancient |
| アセンション詳細 | `/ascensions/[id]` | 前／次ナビゲーション付きのアセンションレベル説明 |
| インテント詳細 | `/intents/[id]` | インテントアイコン、説明 |
| オーブ詳細 | `/orbs/[id]` | オーブアイコン、パッシブ／Evoke の説明 |
| Affliction 詳細 | `/afflictions/[id]` | Affliction の説明、スタック可否 |
| Modifier 詳細 | `/modifiers/[id]` | ラン Modifier の説明 |
| 実績詳細 | `/achievements/[id]` | 実績の説明 |
| バッジ | `/badges` | 25 個すべてのラン終了時バッジを、Tier あり／単一 Tier／マルチプレイヤー専用で分類 |
| バッジ詳細 | `/badges/[id]` | Tier 別内訳（Bronze／Silver／Gold）、勝利必須およびマルチプレイヤーフラグ、アイコン |
| メカニクス | `/mechanics` | ゲームメカニクスのハブ - 個別 SEO ページを持つクリック可能な 27 セクション |
| メカニクス詳細 | `/mechanics/[slug]` | カード確率、レリック分布、ポーションドロップ、マップ生成、ボスプール、戦闘、秘密とトリビア |
| ガイド | `/guides` | 検索／フィルター付きコミュニティ戦略ガイド |
| ガイド詳細 | `/guides/[slug]` | Markdown レンダリング + ツールチップウィジェット付きの完全なガイド |
| ガイド送信 | `/guides/submit` | ガイド送信フォーム（Discord webhook） |
| リーダーボード | `/leaderboards` | 最速勝利と最高アセンションのランキング。ソロ／協力プレイおよびゲームモード（standard／daily／Today／custom）で絞り込み可能。すべてのフィルター状態が URL に含まれるため、任意の表示を共有可能 |
| ラン閲覧 | `/runs` | 式検索バー（`user:`、`char:`、`asc:` の範囲、`card:`／`relic:` の複数値 AND、`version:` の範囲、`mode:`、`result:`、`players:`）、ドロップダウンフィルター、並べ替え、共有可能な URL を備えた完全なランブラウザー |
| ラン送信 | `/leaderboards/submit` | Overwolf コンパニオンへのリンク、ランの自動関連付け用 Steam／Discord サインイン、最近のランを備えた `.run` のドラッグ＆ドロップアップロード |
| 統計 | `/leaderboards/stats` | カード、レリック、ポーション、エンカウントのランキング表（選択率、勝率、件数）。キャラクター／アセンション／結果で絞り込み可能 |
| プロフィール | `/profile` | サインイン中ユーザーの統計（上位カード／レリック／ポーション、キャラクター別内訳）、自己ベスト、競争比較（本日の Daily リーダーボード、世界順位、コミュニティとの勝率比較）、ラン管理 |
| 設定 | `/settings` | アカウント設定: ユーザー名、メール、連携済み Steam／Discord |
| 共有ラン | `/runs/[hash]` | クリック可能なマップノードアイコン、レリック列、小型カードグリッドを備えたゲーム内風の勝利／敗北概要 |
| リファレンス | `/reference` | すべての項目をクリック可能 - Act、アセンション、キーワード、オーブ、Affliction、インテント、Modifier、実績 |
| 画像 | `/images` | カテゴリごとの ZIP ダウンロードに対応した閲覧可能なゲームアセット |
| 変更履歴 | `/changelog` | ゲームアップデート間のデータ差分 |
| このプロジェクトについて | `/about` | プロジェクト情報、統計、パイプラインの可視化 |
| 謝辞 | `/thank-you` | Ko-fi サポーターとコミュニティ貢献者（直接リンクできるよう About から分離） |
| Knowledge Demon | `/knowledge-demon` | Discord Bot の情報ページ - スラッシュコマンド、モデレーション機能、インストール CTA |
| ニュース | `/news` | Steam 告知のミラーフィード。重複ではなく補完となるよう canonical リンクは Steam に戻る |
| ニュース記事 | `/news/[gid]` | サニタイズ済み BBCode 本文と `NewsArticle` JSON-LD を含む単一の Steam 告知 |
| Tier List | `/tier-list` | カード／レリック／ポーション向け Codex Score Tier List ハブ（S → F Tier） |
| Tier List 詳細 | `/tier-list/[type]` | `/api/runs/scores/{type}` をデータソースとする、1 種類のエンティティ向け視覚的な S／A／B／C／D／F 行 |
| スコアリング | `/leaderboards/scoring` | Codex Score の算出方法ページ - ベイズ縮約、事前重み、スケール範囲、Tier のしきい値 |

## API エンドポイント

すべてのデータエンドポイントは、省略可能な `?lang=` クエリパラメーター（デフォルト: `eng`）を受け付けます。レスポンスは **GZip 圧縮**され、`Cache-Control: public, max-age=300` でキャッシュされます。

| エンドポイント | 説明 | フィルター |
|---|---|---|
| `GET /api/cards` | すべてのカード | `color`, `type`, `rarity`, `keyword`, `search`, `lang` |
| `GET /api/cards/{id}` | 単一カード | `lang` |
| `GET /api/characters` | すべてのキャラクター | `search`, `lang` |
| `GET /api/characters/{id}` | 単一キャラクター（台詞、会話を含む） | `lang` |
| `GET /api/relics` | すべてのレリック | `rarity`, `pool`, `search`, `lang` |
| `GET /api/relics/{id}` | 単一レリック | `lang` |
| `GET /api/monsters` | すべてのモンスター | `type`, `search`, `lang` |
| `GET /api/monsters/{id}` | 単一モンスター | `lang` |
| `GET /api/potions` | すべてのポーション | `rarity`, `pool`, `search`, `lang` |
| `GET /api/potions/{id}` | 単一ポーション | `lang` |
| `GET /api/enchantments` | すべてのエンチャント | `card_type`, `search`, `lang` |
| `GET /api/enchantments/{id}` | 単一エンチャント | `lang` |
| `GET /api/encounters` | すべてのエンカウント | `room_type`, `act`, `search`, `lang` |
| `GET /api/encounters/{id}` | 単一エンカウント | `lang` |
| `GET /api/events` | すべてのイベント | `type`, `act`, `search`, `lang` |
| `GET /api/events/{id}` | 単一イベント | `lang` |
| `GET /api/powers` | すべてのパワー | `type`, `stack_type`, `search`, `lang` |
| `GET /api/powers/{id}` | 単一パワー | `lang` |
| `GET /api/keywords` | カードキーワードの定義 | `lang` |
| `GET /api/keywords/{id}` | 単一キーワード | `lang` |
| `GET /api/intents` | モンスターのインテント種別 | `lang` |
| `GET /api/intents/{id}` | 単一インテント | `lang` |
| `GET /api/orbs` | すべてのオーブ | `lang` |
| `GET /api/orbs/{id}` | 単一オーブ | `lang` |
| `GET /api/afflictions` | カード Affliction | `lang` |
| `GET /api/afflictions/{id}` | 単一 Affliction | `lang` |
| `GET /api/modifiers` | ラン Modifier | `lang` |
| `GET /api/modifiers/{id}` | 単一 Modifier | `lang` |
| `GET /api/achievements` | すべての実績 | `lang` |
| `GET /api/achievements/{id}` | 単一実績 | `lang` |
| `GET /api/badges` | すべてのラン終了時バッジ | `tiered`, `multiplayer_only`, `requires_win`, `search`, `lang` |
| `GET /api/badges/{id}` | Tier 別内訳を含む単一バッジ | `lang` |
| `GET /api/history/{entity_type}/{entity_id}` | エンティティ別バージョン履歴（大文字・小文字を区別せず、新しい順） | - |
| `GET /api/epochs` | タイムライン Epoch | `era`, `search`, `lang` |
| `GET /api/epochs/{id}` | 単一 Epoch | `lang` |
| `GET /api/stories` | ストーリー項目 | `lang` |
| `GET /api/stories/{id}` | 単一ストーリー | `lang` |
| `GET /api/acts` | すべての Act | `lang` |
| `GET /api/acts/{id}` | 単一 Act | `lang` |
| `GET /api/ascensions` | アセンションレベル（0～10） | `lang` |
| `GET /api/ascensions/{id}` | 単一アセンションレベル | `lang` |
| `GET /api/stats` | 全カテゴリのエンティティ数 | `lang` |
| `GET /api/languages` | 表示名付きの利用可能な言語 | - |
| `GET /api/translations` | フィルター値および UI 文字列の翻訳マップ | `lang` |
| `GET /api/images` | ファイル一覧付きの画像カテゴリ。ベータ接頭辞付きカテゴリは `?version=` を受け付けます。 | - |
| `GET /api/images/beta/versions` | 利用可能なベータ画像アーカイブのバージョン + `latest` シンボリックリンクの参照先 | - |
| `GET /api/images/{category}/download` | 画像カテゴリの ZIP ダウンロード。ベータカテゴリは `?version=` を受け付けます。 | - |
| `GET /api/changelogs` | 変更履歴の概要（全バージョン） | - |
| `GET /api/changelogs/{tag}` | バージョンタグの完全な変更履歴 | - |
| `GET /api/guides` | コミュニティガイド | `category`, `difficulty`, `tag`, `search` |
| `GET /api/guides/{slug}` | 単一ガイド（Markdown コンテンツを含む） | - |
| `POST /api/guides` | ガイドを送信（Discord にプロキシ） | - |
| `POST /api/runs` | ラン（.run ファイルの JSON）を送信 | `username` |
| `GET /api/runs/list` | 送信済みランを一覧表示／閲覧 | `character`, `win`, `username`, `seed`, `build_id`, `build_ids`, `players`, `game_mode`, `ascension`, `ascension_min`, `ascension_max`, `card`, `relic`, `today`, `sort`, `page`, `limit` |
| `GET /api/runs/shared/{hash}` | ハッシュによる完全なランデータ（DB の `username` をマージ） | - |
| `GET /api/runs/stats` | 集計済みコミュニティ統計 | `character`, `win`, `ascension`, `game_mode`, `players` |
| `GET /api/runs/leaderboard` | 勝利のみのランキング形式リーダーボード | `category`（`fastest`, `highest_ascension`）、`character`, `players`, `game_mode`, `today`, `page`, `limit` |
| `GET /api/runs/leaderboard/rank/{hash}` | 対応するランキング内での単一勝利ランの順位 | `category` |
| `GET /api/runs/scores/{type}` | エンティティごとの Codex Score（ベイズ縮約済み勝率スコア + S／A／B／C／D／F Tier） | `type` = `cards`/`relics`/`potions` |
| `GET /api/runs/encounter-stats` | エンカウント別集計（出現、致死率、平均ダメージ／ターン数） | `act`, `room_type`, `multiplayer`, `page`, `limit` |
| `POST /api/runs/claim` | 以前送信されたランに、ハッシュを使用してユーザー名を関連付け | - |
| `GET /api/runs/versions` | 送信済みランに含まれる重複なしのゲームバージョン | - |
| `GET /api/exports/{lang}` | 1 言語分の全エンティティ JSON の ZIP | `lang` |
| `GET /api/news` | Steam 告知 + コミュニティニュース（ローカルにアーカイブ） | `feed_type`, `feedname`, `tag`, `since`, `search`, `limit`, `offset` |
| `GET /api/news/{gid}` | 単一ニュース記事（生の HTML／BBCode 本文） | - |
| `GET /api/merchant/config` | 自動抽出された商人価格設定 | - |
| `POST /api/feedback` | フィードバックを送信（Discord にプロキシ） | - |
| `GET /api/versions` | 稼働中データルートが公開するバージョンメタデータ | - |

**ユーザーアカウント**（Cookie／JWT セッション、Steam または Discord でサインイン）:

| エンドポイント | 説明 |
|---|---|
| `GET /api/auth/me` | 現在サインイン中のユーザー |
| `GET /api/auth/steam/redirect` | Steam OpenID サインインを開始 |
| `GET /api/auth/discord/start` | Discord OAuth サインインを開始 |
| `POST /api/auth/logout` | セッション Cookie を消去 |
| `PATCH /api/auth/username` / `PATCH /api/auth/email` | プロフィールフィールドを更新 |
| `GET /api/auth/runs` / `POST /api/auth/runs/upload` / `DELETE /api/auth/runs/{hash}` | ユーザーのランを一覧表示、アップロード、削除 |
| `GET /api/auth/stats` | ユーザー別の集計統計（プロフィールページ） |
| `GET /api/auth/personal-bests` | ソロ／協力プレイの最速、最高アセンション、本日および全期間の Daily |
| `GET /api/auth/competitive` | 本日の Daily リーダーボード、世界順位、コミュニティとの勝率比較 |

IP ごとに**毎分 60 リクエスト**へ制限されます。フィードバックとガイド送信は、IP ごとに**毎分 3～5 件**へ制限されます。対話型ドキュメントは `/docs`（Swagger UI）で利用できます。

### ローカライズ

すべてのゲームデータは、Slay the Spire 2 自身のローカライズファイルを使用して 15 言語で配信されます。任意のデータエンドポイントに `?lang=` を渡してください。稼働中の公開ベータデータには `?channel=beta` を使用し、アーカイブ済みベータ画像セットには `?version=` を使用します。

| コード | 言語 | コード | 言語 |
|------|----------|------|----------|
| `eng` | 英語 | `kor` | 韓国語 |
| `deu` | ドイツ語 | `pol` | ポーランド語 |
| `esp` | スペイン語（ES） | `ptb` | ポルトガル語（BR） |
| `fra` | フランス語 | `rus` | ロシア語 |
| `ita` | イタリア語 | `spa` | スペイン語（LA） |
| `jpn` | 日本語 | `tha` | タイ語 |
| `tur` | トルコ語 | `zhs` | 簡体字中国語 |
| `zht` | 繁体字中国語 | | |

**ローカライズされるもの**: ゲーム由来のエンティティ名と説明、カードタイプ、レアリティ、キーワード、パワー、エンカウント、キャラクター名、セクションタイトル、ローカライズ済みルート、および共通 UI ラベルの大部分。

**英語のまま維持されるもの**: API 識別子、`room_type`、パワーの `type`／`stack_type`、`pool` などの構造的なフィルター値、製品ブランド、一部の編集コンテンツまたはコミュニティ作成コンテンツ。

フィルターパラメーター（`type=Attack`、`rarity=Rare`、`keyword=Exhaust`）は、言語に関係なく常に英語の値を使用します。バックエンドが照合前にローカライズされた同等値へ変換します。

例: `GET /api/cards?lang=kor&type=Attack` は、パラメーターが英語でも正しくフィルタリングされ、タイプが「공격」である韓国語のカードデータを返します。

### リッチテキスト書式

テキストフィールド（`description`、`loss_text`、`flavor`、会話の `text`、選択肢の `title`／`description`）には、ゲームのローカライズデータから保持された Godot BBCode 形式のタグが含まれることがあります。

| タグ | 種別 | 例 | 描画結果 |
|---|---|---|---|
| `[gold]...[/gold]` | 色 | `[gold]Enchant[/gold]` | 金色のテキスト |
| `[red]...[/red]` | 色 | `[red]blood[/red]` | 赤色のテキスト |
| `[blue]...[/blue]` | 色 | `[blue]2[/blue]` | 青色のテキスト |
| `[green]...[/green]` | 色 | `[green]healed[/green]` | 緑色のテキスト |
| `[purple]...[/purple]` | 色 | `[purple]Sharp[/purple]` | 紫色のテキスト |
| `[orange]...[/orange]` | 色 | `[orange]hulking figure[/orange]` | オレンジ色のテキスト |
| `[pink]...[/pink]` | 色 | - | ピンク色のテキスト |
| `[aqua]...[/aqua]` | 色 | `[aqua]Ascending Spirit[/aqua]` | シアン色のテキスト |
| `[sine]...[/sine]` | 効果 | `[sine]swirling vortex[/sine]` | 波打つアニメーションテキスト |
| `[jitter]...[/jitter]` | 効果 | `[jitter]CLANG![/jitter]` | 震えるアニメーションテキスト |
| `[b]...[/b]` | 効果 | `[b]bold text[/b]` | 太字テキスト |
| `[i]...[/i]` | 効果 | `[i]whispers[/i]` | 斜体テキスト |
| `[energy:N]` | アイコン | `[energy:2]` | エネルギーアイコン |
| `[star:N]` | アイコン | `[star:1]` | 星アイコン |
| `[Card]`, `[Relic]` | プレースホルダー | `[Card]` | 実行時に動的に決定（斜体） |

タグは入れ子にできます: `[b][jitter]CLANG![/jitter][/b]`、`[gold][sine]swirling vortex[/sine][/gold]`。

API を直接利用する場合は、`\[/?[a-z]+(?::\d+)?\]` のような正規表現でこれらを除去するか、独自のフロントエンドで描画できます。`description_raw` フィールド（利用可能な場合）には、未解決の SmartFormat テンプレートが格納されています。

## ローカルでの実行

### 前提条件

- Python 3.10+
- Node.js 20+

### バックエンド

```bash
python -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r backend/requirements.txt

cd backend
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

バックエンドは **http://localhost:8000** で実行されます。

### フロントエンド

```bash
cd frontend
npm install
NEXT_PUBLIC_API_URL=http://localhost:8000 npm run dev
```

フロントエンドは **http://localhost:3000** で実行されます。

### Docker

```bash
docker compose up --build
```

両方のサービスを起動します（バックエンドは 8000、フロントエンドは 3000）。

### 環境変数

中核となる読み取り専用 API には設定は不要です。以下のオプション機能は、環境変数（バックエンド環境または Compose ファイルで設定）によって有効になります。

| 変数 | 使用箇所 | 備考 |
|---|---|---|
| `MONGO_URL` | バックエンド | ランデータベース（コミュニティ統計、リーダーボード、アカウント）。未設定の場合、バックエンドは旧 SQLite パス（`data/runs.db`）へフォールバックします。 |
| `JWT_SECRET` | バックエンド | ユーザーアカウントのセッショントークンへ署名します。 |
| `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` | バックエンド | Discord OAuth サインイン。 |
| `FRONTEND_URL`, `SPIRE_CODEX_PUBLIC_BASE` | バックエンド | OAuth のリダイレクト／戻り先 URL。 |
| `ENVIRONMENT` | バックエンド | `production` でセキュア Cookie の挙動を有効にします。 |
| `NEXT_PUBLIC_API_URL` | フロントエンド（ビルド時） | API ベース。本番環境では空にし、画像／データを同一オリジンから解決します。 |
| `NEXT_PUBLIC_CDN_URL` | フロントエンド（ビルド時） | 設定時（例: `https://cdn.spire-codex.com`）、画像を `/static` ではなく CDN から読み込みます。 |
| `NEXT_PUBLIC_SITE_URL` | フロントエンド（ビルド時） | メタデータ用の canonical サイト URL。 |

ユーザーアカウントと CDN はデフォルトで無効なため、これらを一切設定しなくてもプロジェクト全体を実行できます。

## 更新パイプライン

新しいゲームバージョンがリリースされた際、クロスプラットフォームの Python スクリプトで更新ワークフロー全体を処理します。

```bash
# 完全なパイプライン - ゲームファイルの抽出、データ解析、スプライトのレンダリング、画像のコピー:
python3 tools/update.py

# ゲームのインストールパスを手動で指定:
python3 tools/update.py --game-dir "/path/to/Slay the Spire 2"

# 抽出をスキップ（最新の extraction/ ディレクトリがすでにある場合）:
python3 tools/update.py --skip-extract

# データのみ再解析（抽出やレンダリングは行わない）:
python3 tools/update.py --parse-only

# Spine スプライトのみ再レンダリング:
python3 tools/update.py --render-only

# 更新後に変更履歴を生成:
python3 tools/update.py --changelog --game-version "0.98.2" --build-id "22238966"
```

スクリプトは OS を自動検出し、Steam のインストールディレクトリを検索します。各手順の要件は次のとおりです。

| 手順 | ツール | インストール |
|---|---|---|
| PCK 抽出 | `gdre_tools` | [GDRE Tools リリース](https://github.com/bruvzg/gdsdecomp/releases) |
| DLL 逆コンパイル | `ilspycmd` | `dotnet tool install ilspycmd -g` |
| データ解析 | Python 3.10+ | 組み込み |
| 画像コピー | Python 3.10+ | 組み込み |
| Spine レンダリング | Node.js 20+ | [nodejs.org](https://nodejs.org) |

### 手動手順

各手順を個別に実行する場合:

```bash
# すべてのデータを解析（全 15 言語）
cd backend/app/parsers && python3 parse_all.py

# 単一言語を解析
cd backend/app/parsers && python3 parse_all.py --lang eng

# 抽出先から static へ画像をコピー（同じソースから PNG + WebP を生成 -
# 既存のバックエンド WebP を経由する非可逆変換チェーンは使用しない）。WebP は quality=95、method=6。
python3 backend/scripts/copy_images.py

# Spine スプライトをレンダリング（WebGL - 三角形の継ぎ目アーティファクトなし）
cd tools/spine-renderer && npm install
npx playwright install chromium           # 初回のみ
node render_all_webgl.mjs                 # ヘッドレス Chrome ですべての 138 スケルトンを処理
node render_webgl.mjs <skel_dir> <out> [size] [--skin=a,b] [--anim=name] [--anim-time=N]

# モンスターごとの一般的な上書き:
#   --skin=moss1,diamondeye   差分スキンをデフォルトと組み合わせる（cubex_construct）
#   --skin=skin1              デフォルトを差分スキンへ切り替える（scroll_of_biting）
#   --anim-time=0.5           スナップショット前にアニメーションを N 秒進める
#   --anim=attack             自動選択された待機アニメーションを上書きする
#
# 煙プレースホルダーの置換: gas_bomb_2.png、the_forgotten_2.png、
# living_smog_2.png は、ソース内ではマゼンタ色の「Smoke Placeholder」ボードとして同梱されています。
# render_webgl.mjs は GL アップロード前に、それらを同じ寸法の手続き生成された濃いプラム色の雲へ置換し、
# 置換対象スロットの slot.color.a = 1.0 を強制します
# （アーティストがシェーダーの使用を想定して低いアルファ値を設定しているため）。

# 小さすぎるモンスタースプライトを再フレーミング（後処理 - 実際のアルファ境界ボックスへ切り抜き、
# 512x512 フレームの約 92% を満たすように拡大）:
python3 tools/rescale_bestiary.py fuzzy_wurm_crawler thieving_hopper terror_eel

# 旧 Canvas レンダラー（三角形の継ぎ目アーティファクトがあるため非推奨）
# node render_all.mjs / node render.mjs
```

## 変更履歴システム

すべてのエンティティカテゴリについてフィールド単位の差分を生成し、ゲームアップデート間の変更内容を追跡します。

### 変更履歴の生成

```bash
# 現在のデータを git ref と比較:
python3 tools/diff_data.py HEAD~1 --format json \
    --game-version "0.98.2" --build-id "22238966" \
    --title "March Update"

# テキストまたは Markdown でプレビュー:
python3 tools/diff_data.py HEAD~1 --format text
python3 tools/diff_data.py HEAD~1 --format md
```

### 変更履歴スキーマ

各変更履歴 JSON ファイルには次のフィールドが含まれます。

| フィールド | 説明 |
|---|---|
| `app_id` | Steam App ID（2868840） |
| `game_version` | Steam のゲームバージョン（例: `"0.98.2"`） |
| `build_id` | Steam ビルド ID |
| `tag` | 一意のバージョンキー（例: `"1.0.3"`） |
| `date` | 更新日 |
| `title` | 人間が読めるタイトル |
| `summary` | 件数: `{ added, removed, changed }` |
| `features` / `fixes` / `api_changes` | 手動で編集されたリリースノート。既存タグに対する `diff_data.py` の再生成でも保持されます。データ差分は上書きされますが、これらの配列はマージされます。 |
| `categories` | 追加／削除／変更されたエンティティを含むカテゴリ別差分。フィールド変更はネストされた dict／list 内へ再帰するため、不透明な `vars: 2 fields → 2 fields` ではなく、各リーフが個別の行（例: `vars.DamageVar: 8 → 10`）になります。 |

### 一度だけ書き込む保持方針

`data/changelogs/` 配下のファイルは、一度だけ書き込まれる履歴レコードです。`.github/workflows/changelog-guard.yml` は、既存の変更履歴を**変更または削除**する PR をブロックします。新規ファイル（`A`）は常に許可されます。変更には PR の `changelog-edit-approved` ラベルが必要です。ポリシーと上書きワークフローについては、`CONTRIBUTING.md → Changelog Retention` を参照してください。

### エンティティ別履歴

`GET /api/history/{entity_type}/{entity_id}` はすべての変更履歴を走査し、要求されたエンティティに影響した項目を新しい順に返します。各詳細ページ（`/cards/{id}`、`/monsters/{id}` など）の Version History レールは、このエンドポイントを使用しています。

## デプロイ

### CI/CD（GitHub Actions）

`main` への push により、セルフホスト Kubernetes runner 上で `.github/workflows/ci.yml` が起動します。ワークフローでは、シークレットスキャン、ESLint と TypeScript のチェック、ruff の lint とフォーマットチェックを実行した後、安定版イメージを `:latest` としてビルドし、push します。また、`docker-compose.beta.yml` 用のスタンドアロンベータイメージも引き続き `:beta` としてビルドします。これらのイメージは運用上保持されていますが、公開ベータページはメインデプロイの `/beta` で配信されます。

安定版フロントエンドには `UMAMI_WEBSITE_ID` が渡されます。スタンドアロンベータイメージには `UMAMI_BETA_WEBSITE_ID` が渡されますが、公開 `/beta` トラフィックは安定版フロントエンドとその分析プロパティを使用します。

CI はデプロイを**行いません**。DigitalOcean ホスト上の毎時 autodeploy ジョブがデプロイを処理します。

> **注:** `.forgejo/workflows/build.yml` は、非稼働の buildah ベースのフォールバックとして保持されています。

### ローカルビルド + Push

CI をスキップし、ローカルマシンから直接 push する場合:

```bash
# 両方のイメージをビルドして push:
python3 tools/deploy.py

# フロントエンドのみ:
python3 tools/deploy.py --frontend

# バックエンドのみ:
python3 tools/deploy.py --backend

# push せずにテストビルド:
python3 tools/deploy.py --no-push

# リリースにタグを付与:
python3 tools/deploy.py --tag v0.98.2

# ベータイメージをビルドして push（:beta タグ、IndexNow をスキップ）:
python3 tools/deploy.py --beta
```

Apple Silicon を自動検出し、`docker buildx` で `linux/amd64` 向けにクロスコンパイルします。事前に `docker login` が必要です。

### 本番環境

公開アプリケーションと、保持されているスタンドアロンベータスタックは、同じ DigitalOcean ホスト上で実行されます。公開トラフィックは `spire-codex.com` を使用し、セカンダリ Lightsail ホストでは MongoDB が稼働します。

**自動デプロイ** - DigitalOcean ホスト上の毎時 cron が、毎時 03 分に `/usr/local/bin/spire-codex-autodeploy` を実行します。チェックアウト済みコミットが進んだ場合、`data/news/*` のみに限定された更新を除き、`docker-compose.prod.yml` と `docker-compose.beta.yml` の両方を pull して再作成します。その後、Cloudflare キャッシュを消去します。ログは `/var/log/spire-codex-autodeploy.log` に書き込まれます。インストールと運用については、[`infrastructure/ansible/README.md`](infrastructure/ansible/README.md) を参照してください。

**手動デプロイ**:

```bash
cd infrastructure/ansible
./bin/do-ansible playbooks/deploy.yml

# 保持されているスタンドアロンベータスタック
./bin/do-ansible playbooks/deploy.yml -e compose_file=docker-compose.beta.yml
```

本番データは bind mount されます（フロントエンドは `./data:/data:ro`、バックエンドは読み書き可能）。ニュースとランの状態はリクエスト時にマウント済みデータから読み込まれるため、`data/news/*.json` の更新にコンテナの再起動は不要です。

### ベータチャンネル（spire-codex.com/beta）

公開アプリケーションでは、安定版データと Steam `public-beta` データを 2 つのコンテンツチャンネルとして配信します。ベータページは [`spire-codex.com/beta`](https://spire-codex.com/beta) にあり、ローカライズ済みルートは `/{lang}/beta/...` です。メインの `/images` ページから、アーカイブ済みベータアセットの各バージョンも参照できます。

`beta.spire-codex.com` は公開利用を終了しています。Cloudflare は現在、パスを保持する `302` を apex ドメインへ返しますが、`/beta` や `channel=beta` は追加しません。そのため、古いページリンクは対応する安定版ページに到達し、古い API リクエストはリダイレクト後に安定版データを受信します。新しい API クライアントは、明示的なチャンネル指定とともにメイン API を使用する必要があります。例: `https://spire-codex.com/api/cards?channel=beta`。

**アーキテクチャ**: `get_channel` は `?channel=beta|stable` を Python の `ContextVar` へ解決します。また、オリジンへの直接トラフィック向けに `beta.*` ホストヘッダーも認識します。`data_service.py` はベータリクエストを `data-beta/<latest>/` から読み込み、ファイル単位で安定版へフォールバックします。`GET /api/beta/diff` と `GET /api/beta/version` は稼働中のベータを説明し、フロントエンドは選択されたチャンネルを `/beta` 配下に描画します。

個別の `docker-compose.beta.yml` スタックと `:beta` イメージは、現在もデプロイ自動化によってビルドおよび再作成されています。Cloudflare リダイレクトが有効な間、これらは公開ベータサイトではありません。

**データ配置**: アーカイブされた各ビルドは `data-beta/<version>/` 配下にあり、`latest` ポインターが稼働中のビルドを選択します。各バージョンには独自の `changelogs/` ディレクトリがあります。ベータ画像アーカイブも `backend/static/images/beta/<version>/{cards,monsters,misc,ui,vfx}/` で同じ構成を使用します。

**自動取り込み** - `tools/beta-watch/` は、開発用 Mac 上で木曜日の 15:00～22:45 に 15 分間隔の launchd ジョブとして実行されます。SteamCMD が新しい `public-beta` ビルド ID を報告すると、ゲームを抽出および逆コンパイルし、すべての言語を解析し、差分を生成し、バージョン別画像を同期して、`auto/beta-<version>` PR を作成します。インストールと運用については、[`tools/beta-watch/README.md`](tools/beta-watch/README.md) を参照してください。

**手動取り込み**:

```bash
VERSION=vX.Y.Z
PREVIOUS=vA.B.C

# 先にベータ版ゲームファイルを抽出して逆コンパイルし、その後リポジトリルートから解析します。
(cd backend/app/parsers && \
  EXTRACTION_DIR=../../../extraction/beta \
  DATA_DIR="../../../data-beta/$VERSION" \
  python3 parse_all.py)

VERSION="$VERSION" tools/beta-watch/sync-images.sh

python3 tools/diff_data.py "data-beta/$PREVIOUS/eng" "data-beta/$VERSION/eng" \
  --format json --output-dir "data-beta/$VERSION/changelogs" \
  --game-version "${VERSION#v}" --title "Beta ${VERSION#v}"
```

`sync-images.sh` は `latest` 画像シンボリックリンクを更新します。取り込み PR には、バージョン別データと画像の変更が含まれます。マージ後、autodeploy が保持されている両方のスタックを更新します。

## Spine レンダラー

StS2 のモンスタースプライトは単一画像ではなく、[Spine](http://esotericsoftware.com/) のスケルタルアニメーションです。各モンスターは `.skel`（バイナリスケルトン）+ `.atlas` + `.png` スプライトシートで構成されます。レンダラーはこれらを組み立て、静的なポートレート PNG を生成します。

### WebGL レンダラー（現行）

WebGL レンダラー（`render_webgl.mjs`、`render_all_webgl.mjs`）は、**Playwright + spine-webgl** を使用し、ヘッドレス Chrome の GPU でスケルトンをレンダリングします。これにより、**三角形の継ぎ目アーティファクトがない**きれいなレンダリングを生成できます。

**動作の仕組み:**
1. WebGL を有効にしたヘッドレス Chrome を Playwright で起動
2. スケルトンデータ + atlas + テクスチャを base64 としてブラウザーページへ読み込み
3. WebGL Canvas を作成し、spine-webgl シェーダー + ポリゴンバッチャーを設定
4. 待機アニメーションを適用し、境界を計算（影／地面スロットを除外）
5. GPU の三角形ラスタライズで描画 - Canvas のクリップパスや継ぎ目はなし
6. `gl.readPixels` で生ピクセルを読み込み、垂直反転（WebGL は下から上）
7. 透明度を保持するため、node-canvas で PNG を書き込み

**単一スケルトン:**
```bash
node render_webgl.mjs <skel_dir> <output_path> [size]
node render_webgl.mjs ../../extraction/raw/animations/backgrounds/neow_room ../../backend/static/images/misc/neow.png 2048
```

**すべてのスケルトンを一括処理:**
```bash
node render_all_webgl.mjs  # 138 個のスケルトンを backend/static/images/renders/ へレンダリング
```

### レンダリング対象範囲

| カテゴリ | レンダリング済み | 合計 | 備考 |
|---|---|---|---|
| モンスター | 99 | 103 ディレクトリ | ゲーム内の 111 体すべてに画像あり（99 体をレンダリング + 別名／静的画像） |
| キャラクター | 16 | 16 | 戦闘、休憩所、選択ポーズ |
| 背景／NPC | 14 | 17 | Neow、Tezcatara、商人の部屋、メインメニュー |
| VFX／UI | 9 | 22 | ほとんどの VFX には特定のアニメーションフレームが必要 |
| **合計** | **138** | **158** | 20 件をスキップ（atlas なし、VFX 専用、空白） |

### アニメーションレンダラー

アニメーションレンダラー（`render_gif.mjs`）は、Spine の待機／攻撃アニメーションをアニメーション WebP、GIF、または APNG としてレンダリングします。スキン差分、アニメーション選択、大規模アニメーション向けのフレーム単位ディスクストリーミングに対応しています。

**対応出力形式:**
- **`.webp`**（推奨）- 完全なアルファを持つ可逆圧縮アニメーション WebP。APNG より約 33% 小さくなります。OOM を防ぐため、フレームをディスクへストリーミングします。
- **`.gif`** - 256 色、二値透過。ファイルは最小ですが、品質も最低です。
- **`.apng`** - WebP と同様に完全なアルファを持ちますが、ファイルサイズは大きくなります。

```bash
# 可逆圧縮アニメーション WebP をレンダリング（推奨）
NODE_OPTIONS="--max-old-space-size=8192" node render_gif.mjs <skel_dir> <output.webp> [size] [--fps=N]

# スキン差分付き（bowlbug、cultists、cubex など）
node render_gif.mjs <skel_dir> output.webp 256 --fps=10 --skin=rock

# 特定のアニメーション（デフォルト: 待機ループ）
node render_gif.mjs <skel_dir> output.webp 256 --fps=12 --anim=attack

# 白いシルエットモード（ボスマップノードアイコン用）
node render_gif.mjs <skel_dir> output.webp 256 --white
```

**アニメーションライブラリ:** 可逆圧縮アニメーション WebP 209 個:
- 512×512 のキャラクターアニメーション 15 個（戦闘／選択／休憩 × 5 キャラクター）
- 256×256 のモンスター待機アニメーション 103 個
- 256×256 のモンスター攻撃アニメーション 91 個

**スキン差分:** 13 体のモンスターにスキン差分があります（bowlbug、cubex_construct、cultists など）。`--skin=` で選択します。デフォルトスキンでは、胴体のないベーススケルトンのみが表示されることがあります。

**ボスマップノードシェーダー:** ゲームでは RGB チャンネルをマスクとして扱う `boss_map_point.gdshader` を使用します。
- **赤チャンネル** × `map_color`（デフォルト: ベージュ `0.671, 0.58, 0.478`）→ 塗りつぶし色
- **青チャンネル** × `black_layer_color`（デフォルト: 黒 `0, 0, 0`）→ 輪郭色
- **緑チャンネル** × 白 `1, 1, 1` → ハイライト

### 旧 Canvas レンダラー

Canvas レンダラー（`render.mjs`、`render_all.mjs`）は、`triangleRendering = true` を設定した `spine-canvas` を使用します。隣接する三角形間で Canvas の `clip()` パスにアンチエイリアスがかかるため、**目に見えるワイヤーフレーム状のメッシュアーティファクト**が発生します。代わりに WebGL レンダラーを使用してください。

### 依存関係

- `@esotericsoftware/spine-webgl` ^4.2.107 - WebGL 用 Spine ランタイム（現行）
- `playwright` - WebGL レンダリング用ヘッドレス Chrome
- `gif-encoder-2` - アニメーションレンダラー用 GIF エンコード
- `canvas` ^3.1.0 - Node.js Canvas 実装（アニメーションレンダラーのフレームバッファー）
- `Pillow`（Python）- レンダリング済み PNG フレームから WebP／APNG を組み立て
- `@esotericsoftware/spine-canvas` ^4.2.106 - Canvas 用 Spine ランタイム（旧式）

## ゲームファイルの抽出

最初から抽出する必要がある場合:

```bash
# PCK を抽出（GDRE Tools）
/path/to/gdre_tools --headless --recover="/path/to/sts2.pck" --output-dir=extraction/raw

# DLL を逆コンパイル（ILSpy CLI）
ilspycmd -p -o extraction/decompiled "/path/to/sts2.dll"
```

Steam のインストール場所:
- **Windows**: `C:\Program Files (x86)\Steam\steamapps\common\Slay the Spire 2\`
- **macOS**: `~/Library/Application Support/Steam/steamapps/common/Slay the Spire 2/`
- **Linux**: `~/.local/share/Steam/steamapps/common/Slay the Spire 2/`

## バージョニング

Spire Codex は **`1.X.Y`** セマンティックバージョニングを使用します。

| セグメント | 意味 |
|---------|---------|
| **1** | Spire Codex のメジャーバージョン（全面的に書き直さない限り維持） |
| **X** | Mega Crit がゲームパッチをリリースしたときに増加 |
| **Y** | 独自のパーサー／フロントエンド修正や改善で増加 |

例: `v1.0.0` = 初回リリース、`v1.0.1` = 独自のバグ修正、`v1.1.0` = Mega Crit の最初のパッチを反映。

## SEO

- **構造化データ（JSON-LD）**: WebSite + VideoGame（ホーム）、CollectionPage + ItemList（一覧ページ）、Article + BreadcrumbList + FAQPage（詳細ページ）、SoftwareApplication（開発者）、NewsArticle（news/[gid]）
- **タイトル形式**: `"Slay the Spire 2 (sts2) {Page Title} | Spire Codex"` - 全ページで標準化。ランでは `"{username} - {char} - Ascension {N} {win/loss} - Slay the Spire 2 (sts2) | Spire Codex"` を使用します。ロケールをまたぐ `sts2 tier list`／`sts2 card list` クエリに一致するよう、"(sts2)" をインラインで使用します。
- **サイトマップ**: `/sitemap.xml` のフラット XML。`force-dynamic` を使用し、ビルド時ではなくサーバー側で描画します。エンティティ詳細ページ、閲覧マトリクスページ、Tier List ページ、スコアリング手法、runs/[hash] 詳細、全エンティティタイプの i18n ミラーを含む約 20,000 件以上の URL
- **国際 SEO**: 英語以外の 14 言語向け `/{lang}/` ルートと、**双方向**の hreflang alternates。英語ルートページでも、`lib/seo.ts` の `buildLanguageAlternates(path)` を介して、すべてのロケール + `x-default` の alternates を出力します（Google が逆参照のないローカライズ済みページを重複として扱っていた GSC の「クロール済み - インデックス未登録」重複コンテンツクラスタを修正）
- **プログラマティック SEO**: `/cards/browse/` に 41 個のカード閲覧ページ（rare-attacks、ironclad-skills など）+ 3 個の Tier List ページ（`/tier-list/{cards,relics,potions}`）
- **ロケール対応 EntityProse**: 詳細ページでは、すべてのロケールで同一の英語本文を表示する代わりに、ロケール固有の短い段落を描画
- **内部リンク**: パワー ↔ カード、エンカウント → モンスター、カードキーワード → キーワードハブページ、モンスターのムーブ → パワーページ（ツールチップ付き）、Act ページ → エンカウント／イベント、Tier List 行 → エンティティ詳細の Stats タブ
- **Open Graph と Twitter Cards**: エンティティ別 OG 画像、`summary_large_image` Twitter Card
- **Canonical URL**: すべてのページで canonical URL を宣言

## 埋め込み可能なウィジェット

### ツールチップウィジェット
任意のウェブサイトで、全 13 種類のエンティティにホバー可能なツールチップを追加できます。
```html
<script src="https://spire-codex.com/widget/spire-codex-tooltip.js"></script>
<p>Start with [[Bash]] and [[relic:Burning Blood]].</p>
```

### 変更履歴ウィジェット
対話型の変更履歴ビューアーを埋め込めます。
```html
<div id="scx-changelog"></div>
<script src="https://spire-codex.com/widget/spire-codex-changelog.js"></script>
```

完全なドキュメント: [spire-codex.com/developers](https://spire-codex.com/developers)

## ロードマップ

- ~~個別の詳細ページ~~ ✅
- ~~グローバル検索~~ ✅
- ~~多言語対応（15 言語）~~ ✅
- ~~SEO（JSON-LD、OG／Twitter、サイトマップ、hreflang）~~ ✅
- ~~ツールチップウィジェット（全 13 種類のエンティティ）~~ ✅
- ~~キャラクター比較ページ（10 組）~~ ✅
- ~~キーワードハブページ~~ ✅
- ~~商人ガイド（逆コンパイル済み C# から取得した価格）~~ ✅
- ~~開発者ドキュメント + データエクスポート~~ ✅
- ~~国際 SEO（13 言語のランディングページ）~~ ✅
- ~~カード閲覧マトリクス（41 個のプログラマティック SEO ページ）~~ ✅
- ~~コミュニティガイド~~ ✅ - YAML フロントマター付き Markdown、送信フォーム、ツールチップウィジェット、著者のソーシャルリンク
- ~~ゲームメカニクスページ~~ ✅ - ドロップ率、戦闘、マップ、ボス、秘密とトリビアに関する 27 個の個別 SEO ページ
- ~~コミュニティラン~~ ✅ - ラン送信、ブラウザー、共有ラン、ライブ統計
- ~~カードアップグレード説明~~ ✅ - アップグレード可能な全 403 カードの upgrade_description
- ~~モンスターの固有パワー~~ ✅ - AfterAddedToRoom から取得したパワーを持つ 42 体のモンスター
- ~~実績のアンロック条件~~ ✅ - C# ソースから取得したカテゴリ、キャラクター、しきい値
- ~~モンスターの攻撃パターン~~ ✅ - C# ステートマシンから取得したサイクル／ランダム／条件付き／混合 AI を持つ 112 体のモンスター
- ~~イベントの前提条件~~ ✅ - C# ソースから解析した IsAllowed() 条件を持つ 25 イベント
- ~~ベータアーカイブの保持~~ ✅ - バージョン別のベータデータと画像を保持。`/beta` は稼働中のビルドを配信し、`/images` ではアーカイブ済みアセットを閲覧可能
- ~~Discord Bot~~ ✅ - [Knowledge Demon](https://bot.spire-codex.com): すべてのエンティティ向けスラッシュコマンド（`/card`、`/relic`、`/monster`、`/potion`、`/character`、`/event`、`/power`、`/enchantment`、`/lookup`、`/meta`）、Steam ニュース RSS、および [Kernel](https://github.com/ptrlrd/kernel) からフォークした完全なモデレーションツールキット
- ~~Codex Score と Tier List~~ ✅ - コミュニティランから**ベイズ縮約**を使用して算出するエンティティ別評価: `shrunk = (wins + PRIOR_WEIGHT × baseline) / (n + PRIOR_WEIGHT)`。その後 0～100 にスケーリングし、S／A／B／C／D／F へマッピングします。少数サンプルによるノイズを防ぎます（1 ゲームのみで 1/1 のカードが S になることはなく、事前分布へ回帰します）。バックエンド起動時に事前ウォームアップされます。詳細ページの Stats タブにある `ScoreBadge`、専用 Tier List ページ、`/leaderboards/scoring` の手法ページで表示されます。
- ~~詳細ページの Stats タブ~~ ✅ - `EntityRunStats` によるスコアのヒーローバッジ + 概要説明 + 最近のランへのリンク。
- **デッキビルダー** - 対話型のデッキ構築シミュレーション
- **データベースバックエンド** - 言語別 JSON 読み込みを PostgreSQL JSONB（または代替）へ置換。ラン送信ストレージはすでに SQLite から MongoDB へ移行済み（2026 年 5 月）。

## 謝辞

QA テスト、バグ報告、貢献を行ってくれた **vesper-arch**、**terracubist**、**U77654**、**Purple Aspired Dreaming**、**Kobaru**、**Severi** に感謝します。運営を支えてくれている Ko-fi 寄付者を含む、サポーターの完全な一覧は [spire-codex.com/thank-you](https://spire-codex.com/thank-you) に掲載しています。

## 技術スタック

- **バックエンド**: Python、FastAPI、Pydantic、slowapi、GZip 圧縮
- **ランデータベース**: MongoDB（コミュニティ統計、リーダーボード、ユーザーアカウント）。マテリアライズされた `stats_summary` コレクションと、リーダー選出方式のバックグラウンド更新処理を使用。旧 SQLite パスはオフライン時のフォールバックとして保持。
- **アカウント**: Steam OpenID + Discord OAuth、JWT セッション Cookie
- **フロントエンド**: Next.js 16（App Router）、TypeScript、Tailwind CSS、15 言語対応
- **画像／CDN**: `cdn.spire-codex.com` 経由で配信する Cloudflare R2（webp）
- **分析と可観測性**: セルフホスト Umami、Prometheus + node-exporter
- **Spine レンダラー**: Node.js、Playwright、@esotericsoftware/spine-webgl（ヘッドレス Chrome 経由の WebGL）
- **インフラストラクチャ**: Docker、レジストリバックエンドの BuildKit キャッシュを使用する GitHub Actions CI（セルフホスト runner）、Ansible／SSH デプロイ
- **ツール**: Python（更新パイプライン、変更履歴差分、画像コピー）

## ライセンス

- **ソースコード**: [PolyForm Noncommercial 1.0.0](LICENSE.md) - 非商用目的であれば、自由に使用、変更、再配布できます。ソフトウェアの販売は許可されていません。
- **ホスト済み API**: [API_TERMS.md](API_TERMS.md) - 公開されているレート制限内であれば、用途を問わず無料で使用できます。さらに必要な場合は、Discord または issue でお問い合わせください。
- **ゲームデータ**（カード、レリック、モンスターなど）: © Mega Crit Games。フェアユース／教育目的の条件に基づき、コミュニティ向けリファレンスとして配信しています。このデータを使用してゲームを再コンパイル、再パッケージ、または再配布しないでください。

貢献物には同じ PolyForm Noncommercial 1.0.0 の条件が適用されます。詳しくは [CONTRIBUTING.md](CONTRIBUTING.md#license) を参照してください。
