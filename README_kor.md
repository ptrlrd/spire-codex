<p align="center">
  <img src="frontend/public/spire-codex-white-silent-black-background.png" alt="Spire Codex 로고" width="200" />
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

게임 파일을 리버스 엔지니어링하여 구축한 **Slay the Spire 2** 게임 데이터용 종합 데이터베이스 및 API입니다. 게임에 포함된 **15개 언어**를 모두 지원합니다.

**라이브 사이트**: [spire-codex.com](https://spire-codex.com)

**Steam 앱 ID**: 2868840

## 구축 방식

Slay the Spire 2는 Godot 4로 제작되었지만, 모든 게임 로직은 GDScript가 아니라 C#/.NET 8 DLL(`sts2.dll`)에 들어 있습니다. 데이터 파이프라인은 다음과 같습니다.

1. **PCK 추출** - [GDRE Tools](https://github.com/bruvzg/gdsdecomp)를 사용해 Godot `.pck` 파일에서 이미지, Spine 애니메이션, 현지화 데이터를 추출합니다(약 9,947개 파일).

2. **DLL 디컴파일** - [ILSpy](https://github.com/icsharpcode/ILSpy)를 사용해 `sts2.dll`을 모든 게임 모델이 포함된, 사람이 읽을 수 있는 약 3,300개의 C# 소스 파일로 디컴파일합니다.

3. **데이터 파싱** - 정규식 기반 Python 파서 22개가 디컴파일된 C# 소스에서 구조화된 데이터를 추출하고, 언어별 JSON을 `data/{lang}/`에 출력합니다.
   - **카드**: `base(cost, CardType, CardRarity, TargetType)` 생성자 + 능력치용 `DamageVar`, `BlockVar`, `PowerVar<T>`
   - **캐릭터**: `StartingHp`, `StartingGold`, `MaxEnergy`, `StartingDeck`, `StartingRelics`
   - **유물/포션**: 희귀도, 풀, SmartFormat 템플릿에서 해석한 설명
   - **몬스터**: HP 범위, `AscensionHelper`를 통한 승천 스케일링, 행동별 의도(Attack/Defend/Buff/Debuff/Status/Summon/Heal)를 포함한 행동 상태 머신, 피해량, 다중 타격 횟수(AscensionHelper 패턴 포함), `AfterAddedToRoom`의 선천적 파워(승천 변형이 있는 몬스터 42종), 행동별 적용 파워(`PowerCmd.Apply<T>`에서 대상 + 수치), 방어도, 회복, 조우 맥락(막, 방 유형), `GenerateMoveStateMachine()`에서 파싱한 **공격 패턴**(몬스터 112종 - 순환, 무작위, 조건부, 혼합)
   - **인챈트**: 카드 유형 제한, 중첩 가능 여부, Amount 기반 스케일링
   - **조우**: 몬스터 구성, 방 유형(Boss/Elite/Monster), 등장 막, 태그
   - **이벤트**: 여러 페이지로 구성된 의사 결정 트리(이벤트 66개 중 56개), 결과가 포함된 선택지, 등장 막, 표시 이름으로 해석된 `StringVar` 모델 참조, 런타임 계산 값(`GetDecipherCost()`를 통한 증가 비용, `NextInt`/`NextFloat`가 포함된 `CalculateVars`를 통한 골드 범위, 완전 회복 패턴), `IsAllowed()`에서 가져온 **선행 조건**(이벤트 25개 - 골드, HP, 막, 덱, 유물, 포션 조건)
   - **고대인**: 이명, 캐릭터별 대화, 유물 제안, 초상화 아이콘이 포함된 고대인 NPC 8명
   - **파워**: PowerType(Buff/Debuff), PowerStackType(Counter/Single), DynamicVars, 설명
   - **에포크/스토리**: 해금 요구 사항이 포함된 타임라인 진행 데이터
   - **구체**: 지속/발현 수치, 설명
   - **고난**: 중첩 가능 여부, 추가 카드 텍스트, 설명
   - **변형 요소**: 런 변형 요소 설명
   - **키워드**: 카드 키워드 정의(Exhaust, Ethereal, Innate 등)
   - **의도**: 아이콘이 포함된 몬스터 의도 설명
   - **도전 과제**: 해금 조건, 설명, 카테고리, 캐릭터 연관 관계, C# 소스에서 가져온 임계값(도전 과제 33개)
   - **막**: 보스 발견 순서, 조우, 이벤트, 고대인, 방 개수
   - **승천 레벨**: 현지화에서 가져온 설명이 포함된 11개 레벨(0~10)
   - **포션 풀**: 풀 클래스와 에포크 참조에서 파싱한 캐릭터별 풀
   - **번역**: 프런트엔드에서 사용할 언어별 필터 맵(카드 유형, 희귀도, 키워드 → 현지화된 이름) 및 UI 문자열(섹션 제목, 설명, 캐릭터 이름)

4. **설명 해석** - 공유 `description_resolver.py` 모듈이 SmartFormat 현지화 템플릿(`{Damage:diff()}`, `{Energy:energyIcons()}`, `{Cards:plural:card|cards}`)을 프런트엔드 렌더링용 서식 있는 텍스트 마커가 포함된 사람이 읽기 쉬운 텍스트로 변환합니다. 런타임 동적 변수(예: `{Card}`, `{Relic}`)는 읽을 수 있는 자리표시자로 유지됩니다. 이벤트의 `StringVar` 참조(예: `{Enchantment1}` → `ModelDb.Enchantment<Sharp>().Title`)는 현지화 조회를 통해 표시 이름으로 변환됩니다.

5. **Spine 렌더링** - 캐릭터와 몬스터는 정적 이미지가 아니라 Spine 골격 애니메이션입니다. 헤드리스 Node.js 렌더러가 대기 자세를 조합하여 512×512 초상화 PNG를 생성합니다. 몬스터 111종 모두 이미지가 있습니다. 100종은 Spine 골격에서 렌더링하고, 6종은 공유 골격의 별칭을 사용하며(Flyconid→flying_mushrooms, Ovicopter→egg_layer, Crusher/Rocket→kaiser_crab), 5종은 정적 게임 애셋을 사용합니다(Doormaker). 캐릭터 5명(전투, 휴식 장소, 캐릭터 선택 자세), NPC, 배경도 모두 렌더링합니다. 스킨 기반 변형(Cultists, Bowlbugs, Cubex)은 각각 따로 렌더링합니다. 아래의 [Spine 렌더러](#spine-렌더러)를 참조하세요.

6. **이미지** - 게임 애셋에서 카드 초상화, 유물/포션 아이콘, 캐릭터 아트, 몬스터 스프라이트, 고대인 초상화 아이콘, 보스 조우 아이콘을 추출하여 정적 파일로 제공합니다.

7. **변경 로그 차이 비교** - 차이 비교 도구가 게임 버전 간 JSON 데이터(git 참조 또는 디렉터리 사용)를 비교하여 카테고리별 추가/삭제/변경 엔티티를 필드 수준 차이와 함께 추적합니다. 변경 로그의 키는 Steam 게임 버전과 선택적 Codex 리비전 번호로 구성됩니다.

## 프로젝트 구조

```
spire-codex/
├── backend/                    # FastAPI 백엔드
│   ├── app/
│   │   ├── main.py             # 앱 진입점, CORS, GZip, 속도 제한, 정적 파일
│   │   ├── dependencies.py     # 공유 의존성(언어 검증, 언어 이름)
│   │   ├── routers/            # API 엔드포인트(라우터 25개 이상)
│   │   ├── models/schemas.py   # Pydantic 모델
│   │   ├── services/           # JSON 데이터 로딩(LRU 캐시, 14개 언어 지원)
│   │   └── parsers/            # C# 소스 → JSON 파서
│   │       ├── card_parser.py
│   │       ├── character_parser.py
│   │       ├── monster_parser.py
│   │       ├── relic_parser.py
│   │       ├── potion_parser.py
│   │       ├── enchantment_parser.py
│   │       ├── encounter_parser.py
│   │       ├── event_parser.py
│   │       ├── power_parser.py
│   │       ├── keyword_parser.py        # 키워드, 의도, 구체, 고난, 변형 요소, 도전 과제(해금 조건 포함)
│   │       ├── guide_parser.py          # YAML 프런트매터가 포함된 Markdown 가이드
│   │       ├── epoch_parser.py
│   │       ├── act_parser.py
│   │       ├── ascension_parser.py
│   │       ├── pool_parser.py            # 포션에 캐릭터 풀 추가
│   │       ├── translation_parser.py    # 언어별 translations.json 생성
│   │       ├── description_resolver.py   # 공유 SmartFormat 해석기
│   │       ├── parser_paths.py           # 공유 경로 구성(베타용 환경 변수 재정의)
│   │       └── parse_all.py              # 모든 파서 조정(15개 언어)
│   ├── static/images/          # 게임 이미지(커밋하지 않음)
│   ├── scripts/copy_images.py  # 추출 디렉터리 → 정적 디렉터리로 이미지 복사
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/                   # Next.js 16 + TypeScript + Tailwind CSS
│   ├── app/
│   │   ├── contexts/           # LanguageContext, BetaVersionContext
│   │   ├── components/         # CardGrid, RichDescription, SearchFilter,
│   │   │                       #   GlobalSearch, Navbar, Footer, LanguageSelector, VersionSelector
│   │   └── ...                 # 페이지: cards, characters, relics, monsters, potions,
│   │                           #   enchantments, encounters, events, powers, timeline,
│   │                           #   reference, images, changelog, about, merchant, compare,
│   │                           #   mechanics/[slug], guides/[slug], guides/submit,
│   │                           #   leaderboards, leaderboards/submit, leaderboards/stats,
│   │                           #   runs/[hash] (공유 런 보기)
│   │                           #   상세 페이지: cards/[id], characters/[id], relics/[id],
│   │                           #   monsters/[id], potions/[id], enchantments/[id],
│   │                           #   encounters/[id], events/[id], powers/[id], keywords/[id],
│   │                           #   acts/[id], ascensions/[id], intents/[id], orbs/[id],
│   │                           #   afflictions/[id], modifiers/[id], achievements/[id]
│   │                           #   i18n: [lang]/...가 영어 외 14개 언어의 모든 경로를 미러링
│   ├── lib/
│   │   ├── api.ts              # API 클라이언트 + TypeScript 인터페이스
│   │   ├── fetch-cache.ts      # 클라이언트 측 인메모리 가져오기 캐시(5분 TTL)
│   │   ├── seo.ts              # 공유 SEO 유틸리티(stripTags, SITE_URL, SITE_NAME)
│   │   ├── jsonld.ts           # JSON-LD 스키마 빌더(BreadcrumbList, CollectionPage, Article, WebSite, FAQPage)
│   │   ├── ui-translations.ts # 영어 외 14개 언어의 UI 문자열 번역
│   │   ├── languages.ts       # i18n 구성 - 14개 언어 코드, hreflang 매핑
│   │   └── use-lang-prefix.ts # 언어 인식 URL 구성을 위한 훅
│   └── Dockerfile
├── tools/
│   ├── spine-renderer/         # 헤드리스 Spine 골격 렌더러
│   │   ├── render_webgl.mjs     # WebGL 렌더러(단일 골격) - 이음새 아티팩트 없음
│   │   ├── render_all_webgl.mjs # WebGL 일괄 렌더러(모든 .skel 파일)
│   │   ├── render_gif.mjs      # 애니메이션 렌더러(스킨 + 애니메이션을 지원하는 WebP/GIF/APNG)
│   │   ├── render.mjs           # 레거시 캔버스 렌더러(삼각형 이음새 있음)
│   │   ├── render_all.mjs       # 레거시 캔버스 일괄 렌더러
│   │   ├── render_skins2.mjs    # 스킨 변형 렌더러
│   │   ├── render_utils.mjs     # 공유 캔버스 렌더링 유틸리티
│   │   └── package.json
│   ├── diff_data.py            # 변경 로그 차이 생성기
│   ├── update.py               # 크로스 플랫폼 업데이트 파이프라인
│   └── deploy.py               # 로컬 Docker 빌드 + Docker Hub 푸시
├── data/                       # 파싱된 JSON 데이터 파일
│   ├── {lang}/                 # 언어별 디렉터리(eng, kor, jpn, fra 등)
│   ├── changelogs/             # 변경 로그 JSON 파일(게임 버전별)
│   ├── guides/                 # YAML 프런트매터가 포함된 Markdown 가이드 파일
│   ├── guides.json             # 파싱된 가이드 데이터
│   ├── runs/                   # 제출된 런 JSON 파일(플레이어 해시별)
│   └── runs.db                 # 레거시 SQLite(MongoDB로 대체됨, 오프라인 대체 수단으로 유지)
├── extraction/                 # 원시 게임 파일(커밋하지 않음)
│   ├── raw/                    # GDRE로 추출한 Godot 프로젝트(안정 버전)
│   ├── decompiled/             # ILSpy 출력(안정 버전)
│   └── beta/                   # Steam 베타 브랜치(raw/ + decompiled/)
├── data-beta/                  # 파싱된 베타 데이터(버전별: v0.102.0/, v0.103.0/, latest → 심볼릭 링크)
├── docker-compose.yml          # 로컬 개발
├── docker-compose.prod.yml     # 프로덕션
├── .github/workflows/
│   └── ci.yml                  # GitHub Actions CI: 린트, 유형 검사, 비밀 정보 검사, Docker 빌드+푸시, SSH 배포
└── .forgejo/workflows/
    └── build.yml               # 유지 중인 Forgejo CI 대체 수단(buildah 기반, 비활성)
```

## 공개 서비스

| 호스트 | 용도 |
|---|---|
| [`spire-codex.com`](https://spire-codex.com) | 공개 웹사이트 및 동일 출처 API입니다. 활성 베타 채널은 `/beta` 아래에 있습니다. |
| `cdn.spire-codex.com` | 게임 아트, 전체 카드 렌더링, 현지화 렌더링, 보관된 베타 애셋을 위한 Cloudflare R2 객체 호스트입니다. |
| [`bot.spire-codex.com`](https://bot.spire-codex.com) | Knowledge Demon 랜딩 페이지 및 Discord 인증 스태프 대시보드입니다. 봇은 기본 Codex API를 사용합니다. |
| `analytics.spire-codex.com` | 자체 호스팅 Umami 스크립트 및 대시보드입니다. PostgreSQL 데이터베이스는 비공개 Docker 네트워크에 유지됩니다. |
| `tierlists.spire-codex.com` | 생성된 티어 목록 미리보기 이미지 전용 R2 객체 호스트입니다. |
| `beta.spire-codex.com` | 폐기된 공개 호스트입니다. Cloudflare가 요청을 최상위 도메인의 동일한 경로로 리디렉션합니다. |

CDN과 티어 목록 호스트는 탐색 가능한 웹사이트가 아니라 객체 저장소이므로, 어느 쪽이든 루트에서 `404`가 반환되는 것이 정상입니다.

## 웹사이트 페이지

| 페이지 | 경로 | 설명 |
|---|---|---|
| 홈 | `/` | 엔티티 개수, 카테고리 카드, 캐릭터 링크가 포함된 대시보드 |
| 카드 | `/cards` | 모달 상세 보기가 포함된 필터링 가능한 카드 그리드 |
| 카드 상세 | `/cards/[id]` | 전체 카드 능력치, 업그레이드 정보, 이미지 |
| 캐릭터 | `/characters` | 캐릭터 개요 그리드 |
| 캐릭터 상세 | `/characters/[id]` | 능력치, 시작 덱/유물, 인용문, NPC 대화 트리 |
| 유물 | `/relics` | 필터링 가능한 유물 그리드 |
| 유물 상세 | `/relics/[id]` | 서식 있는 풍미 텍스트가 포함된 전체 유물 정보 |
| 몬스터 | `/monsters` | HP, 행동, Spine 렌더링이 포함된 몬스터 그리드 |
| 몬스터 상세 | `/monsters/[id]` | HP, 의도/피해/파워/방어도가 포함된 행동, 조우 링크, 파워 툴팁 |
| 포션 | `/potions` | 필터링 가능한 포션 그리드(희귀도, 캐릭터 풀) |
| 포션 상세 | `/potions/[id]` | 전체 포션 정보 |
| 인챈트 | `/enchantments` | 카드 유형 필터가 포함된 인챈트 목록 |
| 인챈트 상세 | `/enchantments/[id]` | 전체 인챈트 정보 |
| 조우 | `/encounters` | 막/방 유형별 조우 구성 |
| 조우 상세 | `/encounters/[id]` | 몬스터 구성, 방 유형, 태그 |
| 이벤트 | `/events` | 확장 가능한 선택지가 포함된 다중 페이지 이벤트 트리 |
| 이벤트 상세 | `/events/[id]` | 전체 이벤트 페이지, 선택지, 고대인 대화 |
| 파워 | `/powers` | 버프, 디버프, 중립 파워 |
| 파워 상세 | `/powers/[id]` | 이 파워를 적용하는 카드가 포함된 파워 정보 |
| 키워드 | `/keywords` | 카드 키워드 목록 |
| 키워드 상세 | `/keywords/[id]` | 필터링 가능한 카드 그리드가 포함된 키워드 설명 |
| 상인 | `/merchant` | 카드/유물/포션 가격, 카드 제거 비용, 가짜 상인 |
| 비교 | `/compare` | 캐릭터 비교 허브(10쌍) |
| 비교 상세 | `/compare/[pair]` | 캐릭터 나란히 비교 |
| 개발자 | `/developers` | API 문서, 위젯 문서, 데이터 내보내기 |
| 쇼케이스 | `/showcase` | 커뮤니티 프로젝트 갤러리 |
| 타임라인 | `/timeline` | 시대별 그룹화 및 해금 요구 사항이 포함된 에포크 진행 |
| 막 상세 | `/acts/[id]` | 막의 보스, 조우, 이벤트, 고대인 |
| 승천 상세 | `/ascensions/[id]` | 이전/다음 탐색이 포함된 승천 레벨 설명 |
| 의도 상세 | `/intents/[id]` | 의도 아이콘, 설명 |
| 구체 상세 | `/orbs/[id]` | 구체 아이콘, 지속/발현 설명 |
| 고난 상세 | `/afflictions/[id]` | 고난 설명, 중첩 가능 여부 |
| 변형 요소 상세 | `/modifiers/[id]` | 런 변형 요소 설명 |
| 도전 과제 상세 | `/achievements/[id]` | 도전 과제 설명 |
| 배지 | `/badges` | 티어형/단일 티어/멀티플레이 전용으로 그룹화된 런 종료 배지 25개 |
| 배지 상세 | `/badges/[id]` | 티어별 분석(Bronze / Silver / Gold), 승리 필요 여부 + 멀티플레이 플래그, 아이콘 |
| 메커니즘 | `/mechanics` | 개별 SEO 페이지가 있는 클릭 가능한 섹션 27개로 구성된 게임 메커니즘 허브 |
| 메커니즘 상세 | `/mechanics/[slug]` | 카드 확률, 유물 분배, 포션 드롭, 지도 생성, 보스 풀, 전투, 비밀 및 잡학 |
| 가이드 | `/guides` | 검색/필터가 포함된 커뮤니티 전략 가이드 |
| 가이드 상세 | `/guides/[slug]` | Markdown 렌더링 + 툴팁 위젯이 포함된 전체 가이드 |
| 가이드 제출 | `/guides/submit` | 가이드 제출 양식(Discord 웹훅) |
| 순위표 | `/leaderboards` | 싱글/협동 및 게임 모드 필터(standard / daily / Today / custom)가 포함된 최단 시간 승리 및 최고 승천 순위표. 모든 필터 상태가 URL에 있으므로 어떤 보기든 공유 가능 |
| 런 둘러보기 | `/runs` | 표현식 검색창(`user:`, `char:`, `asc:` 범위, `card:`/`relic:` 다중 값 AND, `version:` 범위, `mode:`, `result:`, `players:`), 드롭다운 필터, 정렬, 공유 가능한 URL이 포함된 전체 런 브라우저 |
| 런 제출 | `/leaderboards/submit` | Overwolf 컴패니언 링크, 런 자동 연결을 위한 Steam/Discord 로그인, 최근 런이 포함된 드래그 앤 드롭 `.run` 업로드 |
| 통계 | `/leaderboards/stats` | 카드, 유물, 포션, 조우의 순위표(선택률, 승률, 횟수). 캐릭터/승천/결과별 필터링 |
| 프로필 | `/profile` | 로그인한 사용자의 통계(상위 카드/유물/포션, 캐릭터별 분석), 개인 최고 기록, 경쟁 비교(오늘의 일일 순위표, 글로벌 순위, 커뮤니티 대비 승률), 런 관리 |
| 설정 | `/settings` | 계정 설정: 사용자 이름, 이메일, 연결된 Steam/Discord |
| 공유 런 | `/runs/[hash]` | 클릭 가능한 지도 노드 아이콘, 유물 줄, 작은 카드 그리드가 포함된 게임 내 스타일의 승리/패배 요약 |
| 참조 | `/reference` | 모두 클릭 가능 - 막, 승천, 키워드, 구체, 고난, 의도, 변형 요소, 도전 과제 |
| 이미지 | `/images` | 카테고리별 ZIP 다운로드가 가능한 탐색형 게임 애셋 |
| 변경 로그 | `/changelog` | 게임 업데이트 간 데이터 차이 |
| 소개 | `/about` | 프로젝트 정보, 통계, 파이프라인 시각화 |
| 감사 | `/thank-you` | Ko-fi 후원자 및 커뮤니티 기여자(직접 링크할 수 있도록 소개 페이지에서 분리) |
| Knowledge Demon | `/knowledge-demon` | Discord 봇 정보 페이지 - 슬래시 명령어, 관리 기능, 설치 CTA |
| 뉴스 | `/news` | 미러링된 Steam 공지 피드. 중복이 아닌 보완 콘텐츠가 되도록 정식 링크는 Steam을 가리킴 |
| 뉴스 기사 | `/news/[gid]` | 정리된 BBCode 본문과 `NewsArticle` JSON-LD가 포함된 단일 Steam 공지 |
| 티어 목록 | `/tier-list` | 카드/유물/포션의 Codex Score 티어 목록 허브(S → F 티어) |
| 티어 목록 상세 | `/tier-list/[type]` | `/api/runs/scores/{type}`에서 가져온 한 엔티티 유형의 시각적 S/A/B/C/D/F 행 |
| 점수 산정 | `/leaderboards/scoring` | Codex Score 방법론 페이지 - 베이즈 축소, 사전 가중치, 척도 범위, 티어 경계값 |

## API 엔드포인트

모든 데이터 엔드포인트는 선택적 `?lang=` 쿼리 매개변수를 허용합니다(기본값: `eng`). 응답은 **GZip으로 압축**되며 `Cache-Control: public, max-age=300`으로 캐시됩니다.

| 엔드포인트 | 설명 | 필터 |
|---|---|---|
| `GET /api/cards` | 모든 카드 | `color`, `type`, `rarity`, `keyword`, `search`, `lang` |
| `GET /api/cards/{id}` | 단일 카드 | `lang` |
| `GET /api/characters` | 모든 캐릭터 | `search`, `lang` |
| `GET /api/characters/{id}` | 단일 캐릭터(인용문, 대화 포함) | `lang` |
| `GET /api/relics` | 모든 유물 | `rarity`, `pool`, `search`, `lang` |
| `GET /api/relics/{id}` | 단일 유물 | `lang` |
| `GET /api/monsters` | 모든 몬스터 | `type`, `search`, `lang` |
| `GET /api/monsters/{id}` | 단일 몬스터 | `lang` |
| `GET /api/potions` | 모든 포션 | `rarity`, `pool`, `search`, `lang` |
| `GET /api/potions/{id}` | 단일 포션 | `lang` |
| `GET /api/enchantments` | 모든 인챈트 | `card_type`, `search`, `lang` |
| `GET /api/enchantments/{id}` | 단일 인챈트 | `lang` |
| `GET /api/encounters` | 모든 조우 | `room_type`, `act`, `search`, `lang` |
| `GET /api/encounters/{id}` | 단일 조우 | `lang` |
| `GET /api/events` | 모든 이벤트 | `type`, `act`, `search`, `lang` |
| `GET /api/events/{id}` | 단일 이벤트 | `lang` |
| `GET /api/powers` | 모든 파워 | `type`, `stack_type`, `search`, `lang` |
| `GET /api/powers/{id}` | 단일 파워 | `lang` |
| `GET /api/keywords` | 카드 키워드 정의 | `lang` |
| `GET /api/keywords/{id}` | 단일 키워드 | `lang` |
| `GET /api/intents` | 몬스터 의도 유형 | `lang` |
| `GET /api/intents/{id}` | 단일 의도 | `lang` |
| `GET /api/orbs` | 모든 구체 | `lang` |
| `GET /api/orbs/{id}` | 단일 구체 | `lang` |
| `GET /api/afflictions` | 카드 고난 | `lang` |
| `GET /api/afflictions/{id}` | 단일 고난 | `lang` |
| `GET /api/modifiers` | 런 변형 요소 | `lang` |
| `GET /api/modifiers/{id}` | 단일 변형 요소 | `lang` |
| `GET /api/achievements` | 모든 도전 과제 | `lang` |
| `GET /api/achievements/{id}` | 단일 도전 과제 | `lang` |
| `GET /api/badges` | 모든 런 종료 배지 | `tiered`, `multiplayer_only`, `requires_win`, `search`, `lang` |
| `GET /api/badges/{id}` | 티어별 분석이 포함된 단일 배지 | `lang` |
| `GET /api/history/{entity_type}/{entity_id}` | 엔티티별 버전 기록(대소문자 구분 없음, 최신순) | - |
| `GET /api/epochs` | 타임라인 에포크 | `era`, `search`, `lang` |
| `GET /api/epochs/{id}` | 단일 에포크 | `lang` |
| `GET /api/stories` | 스토리 항목 | `lang` |
| `GET /api/stories/{id}` | 단일 스토리 | `lang` |
| `GET /api/acts` | 모든 막 | `lang` |
| `GET /api/acts/{id}` | 단일 막 | `lang` |
| `GET /api/ascensions` | 승천 레벨(0~10) | `lang` |
| `GET /api/ascensions/{id}` | 단일 승천 레벨 | `lang` |
| `GET /api/stats` | 모든 카테고리의 엔티티 개수 | `lang` |
| `GET /api/languages` | 표시 이름이 포함된 사용 가능한 언어 | - |
| `GET /api/translations` | 필터 값 및 UI 문자열의 번역 맵 | `lang` |
| `GET /api/images` | 파일 목록이 포함된 이미지 카테고리. 베타 접두사 카테고리는 `?version=`을 허용합니다. | - |
| `GET /api/images/beta/versions` | 사용 가능한 베타 이미지 아카이브 버전 + `latest` 심볼릭 링크 대상 | - |
| `GET /api/images/{category}/download` | 이미지 카테고리 ZIP 다운로드. 베타 카테고리는 `?version=`을 허용합니다. | - |
| `GET /api/changelogs` | 변경 로그 요약(모든 버전) | - |
| `GET /api/changelogs/{tag}` | 버전 태그의 전체 변경 로그 | - |
| `GET /api/guides` | 커뮤니티 가이드 | `category`, `difficulty`, `tag`, `search` |
| `GET /api/guides/{slug}` | 단일 가이드(Markdown 콘텐츠 포함) | - |
| `POST /api/guides` | 가이드 제출(Discord로 프록시) | - |
| `POST /api/runs` | 런 제출(.run 파일 JSON) | `username` |
| `GET /api/runs/list` | 제출된 런 목록/탐색 | `character`, `win`, `username`, `seed`, `build_id`, `build_ids`, `players`, `game_mode`, `ascension`, `ascension_min`, `ascension_max`, `card`, `relic`, `today`, `sort`, `page`, `limit` |
| `GET /api/runs/shared/{hash}` | 해시별 전체 런 데이터(DB의 `username` 병합) | - |
| `GET /api/runs/stats` | 집계된 커뮤니티 통계 | `character`, `win`, `ascension`, `game_mode`, `players` |
| `GET /api/runs/leaderboard` | 승리만 포함한 순위표 | `category`(`fastest`, `highest_ascension`), `character`, `players`, `game_mode`, `today`, `page`, `limit` |
| `GET /api/runs/leaderboard/rank/{hash}` | 해당 순위표에서 단일 승리 런의 순위 | `category` |
| `GET /api/runs/scores/{type}` | 엔티티별 Codex Score(베이즈 축소 승률 점수 + S/A/B/C/D/F 티어) | `type` = `cards`/`relics`/`potions` |
| `GET /api/runs/encounter-stats` | 조우별 집계(등장, 치명률, 평균 피해/턴) | `act`, `room_type`, `multiplayer`, `page`, `limit` |
| `POST /api/runs/claim` | 이전에 제출한 런에 해시를 사용해 사용자 이름 연결 | - |
| `GET /api/runs/versions` | 제출된 런 전체의 고유 게임 버전 | - |
| `GET /api/exports/{lang}` | 한 언어의 모든 엔티티 JSON ZIP | `lang` |
| `GET /api/news` | Steam 공지 + 커뮤니티 뉴스(로컬 보관) | `feed_type`, `feedname`, `tag`, `since`, `search`, `limit`, `offset` |
| `GET /api/news/{gid}` | 단일 뉴스 기사(원시 HTML/BBCode 본문) | - |
| `GET /api/merchant/config` | 자동 추출된 상인 가격 구성 | - |
| `POST /api/feedback` | 피드백 제출(Discord로 프록시) | - |
| `GET /api/versions` | 활성 데이터 루트가 노출하는 버전 메타데이터 | - |

**사용자 계정**(쿠키/JWT 세션, Steam 또는 Discord로 로그인):

| 엔드포인트 | 설명 |
|---|---|
| `GET /api/auth/me` | 현재 로그인한 사용자 |
| `GET /api/auth/steam/redirect` | Steam OpenID 로그인 시작 |
| `GET /api/auth/discord/start` | Discord OAuth 로그인 시작 |
| `POST /api/auth/logout` | 세션 쿠키 삭제 |
| `PATCH /api/auth/username` / `PATCH /api/auth/email` | 프로필 필드 업데이트 |
| `GET /api/auth/runs` / `POST /api/auth/runs/upload` / `DELETE /api/auth/runs/{hash}` | 사용자 런 목록 조회, 업로드, 삭제 |
| `GET /api/auth/stats` | 사용자별 집계 통계(프로필 페이지) |
| `GET /api/auth/personal-bests` | 최단 싱글/협동, 최고 승천, 오늘 및 역대 일일 기록 |
| `GET /api/auth/competitive` | 오늘의 일일 순위표, 글로벌 순위, 커뮤니티 대비 승률 |

IP당 **분당 60개 요청**으로 제한됩니다. 피드백 및 가이드 제출은 IP당 **분당 3~5개**로 제한됩니다. 대화형 문서는 `/docs`(Swagger UI)에서 확인할 수 있습니다.

### 현지화

모든 게임 데이터는 Slay the Spire 2 자체 현지화 파일을 사용해 15개 언어로 제공됩니다. 모든 데이터 엔드포인트에 `?lang=`을 전달할 수 있습니다. 활성 공개 베타 데이터에는 `?channel=beta`를 사용하고, 보관된 베타 이미지 세트에는 `?version=`을 사용하세요.

| 코드 | 언어 | 코드 | 언어 |
|------|----------|------|----------|
| `eng` | 영어 | `kor` | 한국어 |
| `deu` | 독일어 | `pol` | 폴란드어 |
| `esp` | 스페인어(스페인) | `ptb` | 포르투갈어(브라질) |
| `fra` | 프랑스어 | `rus` | 러시아어 |
| `ita` | 이탈리아어 | `spa` | 스페인어(라틴아메리카) |
| `jpn` | 일본어 | `tha` | 태국어 |
| `tur` | 튀르키예어 | `zhs` | 중국어 간체 |
| `zht` | 중국어 번체 | | |

**현지화되는 항목**: 게임에서 가져온 엔티티 이름과 설명, 카드 유형, 희귀도, 키워드, 파워, 조우, 캐릭터 이름, 섹션 제목, 현지화된 경로, 대부분의 공유 UI 레이블.

**영어로 유지되는 항목**: `room_type`, 파워 `type`/`stack_type`, `pool` 같은 API 식별자와 구조적 필터 값, 제품 브랜딩, 일부 편집 또는 커뮤니티 작성 콘텐츠.

필터 매개변수(`type=Attack`, `rarity=Rare`, `keyword=Exhaust`)는 언어와 관계없이 항상 영어 값을 사용합니다. 백엔드는 일치 여부를 확인하기 전에 이를 현지화된 값으로 변환합니다.

예: `GET /api/cards?lang=kor&type=Attack`은 매개변수가 영어여도 올바르게 필터링하여 유형이 "공격"인 한국어 카드 데이터를 반환합니다.

### 서식 있는 텍스트 형식

텍스트 필드(`description`, `loss_text`, `flavor`, 대화 `text`, 선택지 `title`/`description`)에는 게임 현지화 데이터에서 보존된 Godot BBCode 스타일 태그가 포함될 수 있습니다.

| 태그 | 유형 | 예시 | 렌더링 결과 |
|---|---|---|---|
| `[gold]...[/gold]` | 색상 | `[gold]Enchant[/gold]` | 금색 텍스트 |
| `[red]...[/red]` | 색상 | `[red]blood[/red]` | 빨간색 텍스트 |
| `[blue]...[/blue]` | 색상 | `[blue]2[/blue]` | 파란색 텍스트 |
| `[green]...[/green]` | 색상 | `[green]healed[/green]` | 녹색 텍스트 |
| `[purple]...[/purple]` | 색상 | `[purple]Sharp[/purple]` | 보라색 텍스트 |
| `[orange]...[/orange]` | 색상 | `[orange]hulking figure[/orange]` | 주황색 텍스트 |
| `[pink]...[/pink]` | 색상 | - | 분홍색 텍스트 |
| `[aqua]...[/aqua]` | 색상 | `[aqua]Ascending Spirit[/aqua]` | 청록색 텍스트 |
| `[sine]...[/sine]` | 효과 | `[sine]swirling vortex[/sine]` | 물결치는 애니메이션 텍스트 |
| `[jitter]...[/jitter]` | 효과 | `[jitter]CLANG![/jitter]` | 흔들리는 애니메이션 텍스트 |
| `[b]...[/b]` | 효과 | `[b]bold text[/b]` | 굵은 텍스트 |
| `[i]...[/i]` | 효과 | `[i]whispers[/i]` | 기울임꼴 텍스트 |
| `[energy:N]` | 아이콘 | `[energy:2]` | 에너지 아이콘 |
| `[star:N]` | 아이콘 | `[star:1]` | 별 아이콘 |
| `[Card]`, `[Relic]` | 자리표시자 | `[Card]` | 런타임 동적 값(기울임꼴) |

태그는 중첩할 수 있습니다: `[b][jitter]CLANG![/jitter][/b]`, `[gold][sine]swirling vortex[/sine][/gold]`.

API를 직접 사용하는 경우 `\[/?[a-z]+(?::\d+)?\]` 같은 정규식으로 이러한 태그를 제거하거나 자체 프런트엔드에서 렌더링할 수 있습니다. `description_raw` 필드(사용 가능한 경우)에는 해석되지 않은 SmartFormat 템플릿이 들어 있습니다.

## 로컬에서 실행하기

### 사전 요구 사항

- Python 3.10+
- Node.js 20+

### 백엔드

```bash
python -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r backend/requirements.txt

cd backend
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

백엔드는 **http://localhost:8000**에서 실행됩니다.

### 프런트엔드

```bash
cd frontend
npm install
NEXT_PUBLIC_API_URL=http://localhost:8000 npm run dev
```

프런트엔드는 **http://localhost:3000**에서 실행됩니다.

### Docker

```bash
docker compose up --build
```

두 서비스가 모두 시작됩니다(백엔드 8000, 프런트엔드 3000).

### 환경 변수

핵심 읽기 전용 API에는 구성이 필요하지 않습니다. 아래의 선택적 기능은 환경 변수로 활성화됩니다(백엔드 환경 또는 compose 파일에 설정).

| 변수 | 사용 주체 | 참고 |
|---|---|---|
| `MONGO_URL` | 백엔드 | 런 데이터베이스(커뮤니티 통계, 순위표, 계정). 설정하지 않으면 백엔드는 레거시 SQLite 경로(`data/runs.db`)로 대체합니다. |
| `JWT_SECRET` | 백엔드 | 사용자 계정 세션 토큰에 서명합니다. |
| `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` | 백엔드 | Discord OAuth 로그인입니다. |
| `FRONTEND_URL`, `SPIRE_CODEX_PUBLIC_BASE` | 백엔드 | OAuth 리디렉션/반환 URL입니다. |
| `ENVIRONMENT` | 백엔드 | `production`은 보안 쿠키 동작을 활성화합니다. |
| `NEXT_PUBLIC_API_URL` | 프런트엔드(빌드) | API 기준 주소입니다. 프로덕션에서는 비워 두어 이미지/데이터가 동일 출처에서 해석되게 합니다. |
| `NEXT_PUBLIC_CDN_URL` | 프런트엔드(빌드) | 설정하면(예: `https://cdn.spire-codex.com`) 이미지가 `/static` 대신 CDN에서 로드됩니다. |
| `NEXT_PUBLIC_SITE_URL` | 프런트엔드(빌드) | 메타데이터용 정식 사이트 URL입니다. |

사용자 계정과 CDN은 기본적으로 비활성화되어 있으므로, 이들 변수가 하나도 없어도 프로젝트 전체를 실행할 수 있습니다.

## 업데이트 파이프라인

새 게임 버전이 출시되면 크로스 플랫폼 Python 스크립트가 전체 업데이트 워크플로를 처리합니다.

```bash
# 전체 파이프라인 - 게임 파일 추출, 데이터 파싱, 스프라이트 렌더링, 이미지 복사:
python3 tools/update.py

# 게임 설치 경로를 직접 지정:
python3 tools/update.py --game-dir "/path/to/Slay the Spire 2"

# 추출 건너뛰기(이미 최신 extraction/ 디렉터리가 있는 경우):
python3 tools/update.py --skip-extract

# 데이터만 다시 파싱(추출 또는 렌더링 없음):
python3 tools/update.py --parse-only

# Spine 스프라이트만 다시 렌더링:
python3 tools/update.py --render-only

# 업데이트 후 변경 로그 생성:
python3 tools/update.py --changelog --game-version "0.98.2" --build-id "22238966"
```

스크립트는 운영 체제를 자동 감지하고 Steam 설치 디렉터리를 찾습니다. 단계별 요구 사항은 다음과 같습니다.

| 단계 | 도구 | 설치 |
|---|---|---|
| PCK 추출 | `gdre_tools` | [GDRE Tools 릴리스](https://github.com/bruvzg/gdsdecomp/releases) |
| DLL 디컴파일 | `ilspycmd` | `dotnet tool install ilspycmd -g` |
| 데이터 파싱 | Python 3.10+ | 내장 |
| 이미지 복사 | Python 3.10+ | 내장 |
| Spine 렌더링 | Node.js 20+ | [nodejs.org](https://nodejs.org) |

### 수동 단계

각 단계를 개별적으로 실행하려는 경우:

```bash
# 모든 데이터 파싱(15개 언어 전체)
cd backend/app/parsers && python3 parse_all.py

# 단일 언어 파싱
cd backend/app/parsers && python3 parse_all.py --lang eng

# 추출 디렉터리에서 정적 디렉터리로 이미지 복사(동일 소스에서 PNG + WebP 생성 -
# 기존 백엔드 WebP를 거치는 손실 체인 없음). WebP quality=95, method=6.
python3 backend/scripts/copy_images.py

# Spine 스프라이트 렌더링(WebGL - 삼각형 이음새 아티팩트 없음)
cd tools/spine-renderer && npm install
npx playwright install chromium           # 최초 한 번만
node render_all_webgl.mjs                 # 헤드리스 Chrome으로 138개 골격 전체 렌더링
node render_webgl.mjs <skel_dir> <out> [size] [--skin=a,b] [--anim=name] [--anim-time=N]

# 몬스터별 일반적인 재정의:
#   --skin=moss1,diamondeye   변형 스킨을 기본 스킨과 결합(cubex_construct)
#   --skin=skin1              기본 스킨을 변형으로 교체(scroll_of_biting)
#   --anim-time=0.5           스냅샷 전에 애니메이션을 N초 진행
#   --anim=attack             자동 선택된 대기 애니메이션 재정의
#
# 연기 자리표시자 대체: gas_bomb_2.png, the_forgotten_2.png,
# living_smog_2.png는 소스에서 자홍색 "Smoke Placeholder" 보드로 제공됩니다.
# render_webgl.mjs는 GL 업로드 전에 이를 같은 크기의 절차적으로 생성된
# 짙은 자두색 구름으로 교체한 다음, 대체된 슬롯에서 slot.color.a = 1.0을 강제합니다
# (아티스트가 셰이더 사용을 전제로 낮은 알파를 설정했기 때문입니다).

# 크기가 작은 몬스터 스프라이트 프레임 재조정(후처리 - 실제 알파
# bbox로 자르고 512x512 프레임의 약 92%를 채우도록 확대):
python3 tools/rescale_bestiary.py fuzzy_wurm_crawler thieving_hopper terror_eel

# 레거시 캔버스 렌더러(삼각형 이음새 아티팩트 있음 - 사용하지 않는 것을 권장)
# node render_all.mjs / node render.mjs
```

## 변경 로그 시스템

모든 엔티티 카테고리에서 필드 수준 차이를 통해 게임 업데이트 사이의 변경 사항을 추적합니다.

### 변경 로그 생성

```bash
# 현재 데이터를 git 참조와 비교:
python3 tools/diff_data.py HEAD~1 --format json \
    --game-version "0.98.2" --build-id "22238966" \
    --title "March Update"

# 텍스트 또는 Markdown으로 미리보기:
python3 tools/diff_data.py HEAD~1 --format text
python3 tools/diff_data.py HEAD~1 --format md
```

### 변경 로그 스키마

각 변경 로그 JSON 파일에는 다음 항목이 포함됩니다.

| 필드 | 설명 |
|---|---|
| `app_id` | Steam 앱 ID(2868840) |
| `game_version` | Steam 게임 버전(예: `"0.98.2"`) |
| `build_id` | Steam 빌드 ID |
| `tag` | 고유 버전 키(예: `"1.0.3"`) |
| `date` | 업데이트 날짜 |
| `title` | 사람이 읽을 수 있는 제목 |
| `summary` | 개수: `{ added, removed, changed }` |
| `features` / `fixes` / `api_changes` | 직접 선별한 릴리스 노트입니다. 기존 태그를 `diff_data.py`로 다시 생성해도 보존됩니다. 데이터 차이는 덮어쓰지만 이 배열들은 병합됩니다. |
| `categories` | 추가/삭제/변경 엔티티가 포함된 카테고리별 차이입니다. 필드 변경은 중첩된 사전/목록 내부까지 재귀적으로 탐색하므로, 불투명한 `vars: 2 fields → 2 fields` 대신 각 말단이 개별 행(예: `vars.DamageVar: 8 → 10`)으로 표시됩니다. |

### 한 번만 기록하는 보존 정책

`data/changelogs/` 아래의 파일은 한 번만 기록되는 역사적 기록입니다. `.github/workflows/changelog-guard.yml`은 기존 변경 로그를 **수정하거나 삭제**하는 모든 PR을 차단합니다. 새 파일(`A`)은 항상 허용되며, 수정하려면 PR에 `changelog-edit-approved` 레이블이 필요합니다. 정책 및 재정의 워크플로는 `CONTRIBUTING.md → Changelog Retention`을 참조하세요.

### 엔티티별 기록

`GET /api/history/{entity_type}/{entity_id}`는 모든 변경 로그를 순회하여 요청한 엔티티에 영향을 준 항목을 최신순으로 반환합니다. 모든 상세 페이지(`/cards/{id}`, `/monsters/{id}` 등)의 버전 기록 레일은 이 엔드포인트를 사용합니다.

## 배포

### CI/CD(GitHub Actions)

`main`에 푸시하면 자체 호스팅 Kubernetes 러너에서 `.github/workflows/ci.yml`이 실행됩니다. 워크플로는 비밀 정보 검사, ESLint와 TypeScript 검사, ruff 린트 및 형식 검사를 수행한 다음 안정 버전 이미지를 `:latest`로 빌드하고 푸시합니다. 또한 `docker-compose.beta.yml`용 독립 베타 이미지를 `:beta`로 계속 빌드합니다. 이 이미지들은 운영상 유지되지만 공개 베타 페이지는 기본 배포의 `/beta`에서 제공됩니다.

안정 버전 프런트엔드는 `UMAMI_WEBSITE_ID`를 받습니다. 독립 베타 이미지는 `UMAMI_BETA_WEBSITE_ID`를 받지만, 공개 `/beta` 트래픽은 안정 버전 프런트엔드와 해당 분석 속성을 사용합니다.

CI는 배포를 **수행하지 않습니다**. DigitalOcean 호스트의 시간별 자동 배포 작업이 배포를 담당합니다.

> **참고:** `.forgejo/workflows/build.yml`은 비활성 buildah 기반 대체 수단으로 유지됩니다.

### 로컬 빌드 + 푸시

CI를 건너뛰고 로컬 머신에서 직접 푸시할 수 있습니다.

```bash
# 두 이미지 모두 빌드하고 푸시:
python3 tools/deploy.py

# 프런트엔드만:
python3 tools/deploy.py --frontend

# 백엔드만:
python3 tools/deploy.py --backend

# 푸시하지 않고 빌드 테스트:
python3 tools/deploy.py --no-push

# 릴리스 태그 지정:
python3 tools/deploy.py --tag v0.98.2

# 베타 이미지 빌드 및 푸시(:beta 태그, IndexNow 건너뜀):
python3 tools/deploy.py --beta
```

Apple Silicon을 자동 감지하고 `docker buildx`를 통해 `linux/amd64`로 크로스 컴파일합니다. 먼저 `docker login`을 실행해야 합니다.

### 프로덕션

공개 애플리케이션과 유지 중인 독립 베타 스택은 같은 DigitalOcean 호스트에서 실행됩니다. 공개 트래픽은 `spire-codex.com`을 사용하며, 보조 Lightsail 호스트에서 MongoDB가 실행됩니다.

**자동 배포** - DigitalOcean 호스트의 시간별 cron이 매시 03분에 `/usr/local/bin/spire-codex-autodeploy`를 실행합니다. 체크아웃된 커밋이 갱신되면 `data/news/*`에만 한정된 업데이트를 제외하고 `docker-compose.prod.yml`과 `docker-compose.beta.yml`을 모두 가져와 다시 생성합니다. 이후 Cloudflare 캐시를 제거합니다. 로그는 `/var/log/spire-codex-autodeploy.log`에 기록됩니다. 설치 및 운영 방법은 [`infrastructure/ansible/README.md`](infrastructure/ansible/README.md)를 참조하세요.

**수동 배포**:

```bash
cd infrastructure/ansible
./bin/do-ansible playbooks/deploy.yml

# 유지 중인 독립 베타 스택
./bin/do-ansible playbooks/deploy.yml -e compose_file=docker-compose.beta.yml
```

프로덕션 데이터는 바인드 마운트됩니다(프런트엔드는 `./data:/data:ro`, 백엔드는 읽기-쓰기). 뉴스와 런 상태는 요청 시 마운트된 데이터에서 읽으므로 `data/news/*.json` 업데이트에는 컨테이너 재시작이 필요하지 않습니다.

### 베타 채널(spire-codex.com/beta)

공개 애플리케이션은 안정 버전과 Steam `public-beta` 데이터를 두 개의 콘텐츠 채널로 제공합니다. 베타 페이지는 [`spire-codex.com/beta`](https://spire-codex.com/beta)에 있으며, 현지화된 경로는 `/{lang}/beta/...`입니다. 기본 `/images` 페이지에서도 보관된 베타 애셋 버전을 제공합니다.

`beta.spire-codex.com`은 공개 사용이 중단되었습니다. 현재 Cloudflare는 경로를 보존하는 `302`를 최상위 도메인으로 전송하지만 `/beta` 또는 `channel=beta`를 추가하지는 않습니다. 따라서 이전 페이지 링크는 일치하는 안정 버전 페이지로 이동하며, 이전 API 요청은 리디렉션을 따른 뒤 안정 버전 데이터를 받습니다. 새로운 API 클라이언트는 명시적 채널과 함께 기본 API를 사용해야 합니다. 예: `https://spire-codex.com/api/cards?channel=beta`.

**아키텍처**: `get_channel`은 `?channel=beta|stable`을 Python `ContextVar`로 해석하며, 직접 오리진 트래픽을 위한 `beta.*` 호스트 헤더도 인식합니다. `data_service.py`는 베타 요청을 `data-beta/<latest>/`에서 로드하고 파일별로 안정 버전으로 대체합니다. `GET /api/beta/diff`와 `GET /api/beta/version`은 활성 베타를 설명하며, 프런트엔드는 선택된 채널을 `/beta` 아래에 렌더링합니다.

별도의 `docker-compose.beta.yml` 스택과 `:beta` 이미지는 여전히 배포 자동화에 의해 빌드되고 다시 생성됩니다. Cloudflare 리디렉션이 활성화된 동안에는 공개 베타 사이트가 아닙니다.

**데이터 배치**: 보관된 각 빌드는 `data-beta/<version>/` 아래에 있으며, `latest` 포인터가 활성 빌드를 선택합니다. 각 버전에는 자체 `changelogs/` 디렉터리가 있습니다. 베타 이미지 아카이브는 `backend/static/images/beta/<version>/{cards,monsters,misc,ui,vfx}/`에서 동일한 구조를 사용합니다.

**자동 수집** - `tools/beta-watch/`는 개발용 Mac에서 목요일 15:00부터 22:45까지 15분마다 launchd 작업으로 실행됩니다. SteamCMD가 새로운 `public-beta` 빌드 ID를 보고하면 게임을 추출하고 디컴파일한 뒤 모든 언어를 파싱하고, 차이를 생성하고, 버전별 이미지를 동기화하며, `auto/beta-<version>` PR을 엽니다. 설치 및 운영 방법은 [`tools/beta-watch/README.md`](tools/beta-watch/README.md)를 참조하세요.

**수동 수집**:

```bash
VERSION=vX.Y.Z
PREVIOUS=vA.B.C

# 먼저 베타 게임 파일을 추출하고 디컴파일한 다음 저장소 루트에서 파싱합니다.
(cd backend/app/parsers && \
  EXTRACTION_DIR=../../../extraction/beta \
  DATA_DIR="../../../data-beta/$VERSION" \
  python3 parse_all.py)

VERSION="$VERSION" tools/beta-watch/sync-images.sh

python3 tools/diff_data.py "data-beta/$PREVIOUS/eng" "data-beta/$VERSION/eng" \
  --format json --output-dir "data-beta/$VERSION/changelogs" \
  --game-version "${VERSION#v}" --title "Beta ${VERSION#v}"
```

`sync-images.sh`는 `latest` 이미지 심볼릭 링크를 업데이트합니다. 수집 PR에는 버전별 데이터 및 이미지 변경 사항이 포함되며, 병합 후 자동 배포가 유지 중인 두 스택을 모두 새로 고칩니다.

## Spine 렌더러

StS2의 몬스터 스프라이트는 단일 이미지가 아니라 [Spine](http://esotericsoftware.com/) 골격 애니메이션입니다. 각 몬스터는 `.skel`(바이너리 골격) + `.atlas` + `.png` 스프라이트시트로 구성됩니다. 렌더러는 이를 조합하여 정적 초상화 PNG를 만듭니다.

### WebGL 렌더러(현재)

WebGL 렌더러(`render_webgl.mjs`, `render_all_webgl.mjs`)는 **Playwright + spine-webgl**을 사용해 헤드리스 Chrome의 GPU로 골격을 렌더링합니다. 이를 통해 **삼각형 이음새 아티팩트가 없는** 깔끔한 렌더링을 생성합니다.

**작동 방식:**
1. WebGL을 활성화한 상태로 Playwright를 통해 헤드리스 Chrome을 실행합니다.
2. 골격 데이터 + 아틀라스 + 텍스처를 base64로 브라우저 페이지에 로드합니다.
3. WebGL 캔버스를 만들고 spine-webgl 셰이더 + 폴리곤 배처를 설정합니다.
4. 대기 애니메이션을 적용하고 경계를 계산합니다(그림자/바닥 슬롯 제외).
5. GPU 삼각형 래스터화를 통해 렌더링합니다. 캔버스 클립 경로도, 이음새도 없습니다.
6. `gl.readPixels`로 원시 픽셀을 읽고 수직으로 뒤집습니다(WebGL은 아래에서 위 방향).
7. 투명도를 보존하기 위해 node-canvas로 PNG를 작성합니다.

**단일 골격:**
```bash
node render_webgl.mjs <skel_dir> <output_path> [size]
node render_webgl.mjs ../../extraction/raw/animations/backgrounds/neow_room ../../backend/static/images/misc/neow.png 2048
```

**모든 골격 일괄 처리:**
```bash
node render_all_webgl.mjs  # 138개 골격을 backend/static/images/renders/에 렌더링
```

### 렌더링 범위

| 카테고리 | 렌더링됨 | 전체 | 참고 |
|---|---|---|---|
| 몬스터 | 99 | 디렉터리 103개 | 게임 몬스터 111종 모두 이미지 보유(렌더링 99종 + 별칭/정적 이미지) |
| 캐릭터 | 16 | 16 | 전투, 휴식 장소, 선택 자세 |
| 배경/NPC | 14 | 17 | Neow, Tezcatara, 상인 방, 메인 메뉴 |
| VFX/UI | 9 | 22 | 대부분의 VFX에는 특정 애니메이션 프레임 필요 |
| **전체** | **138** | **158** | 20개 건너뜀(아틀라스 없음, VFX 전용, 빈 항목) |

### 애니메이션 렌더러

애니메이션 렌더러(`render_gif.mjs`)는 Spine 대기/공격 애니메이션을 애니메이션 WebP, GIF 또는 APNG로 렌더링합니다. 스킨 변형, 애니메이션 선택, 대용량 애니메이션의 프레임-디스크 스트리밍을 지원합니다.

**지원되는 출력 형식:**
- **`.webp`**(권장) - 완전한 알파를 지원하는 무손실 애니메이션 WebP로, APNG보다 약 33% 작습니다. OOM을 방지하기 위해 프레임을 디스크로 스트리밍합니다.
- **`.gif`** - 256색, 이진 투명도. 파일은 가장 작지만 품질이 가장 낮습니다.
- **`.apng`** - WebP처럼 완전한 알파를 지원하지만 파일 크기가 더 큽니다.

```bash
# 무손실 애니메이션 WebP 렌더링(권장)
NODE_OPTIONS="--max-old-space-size=8192" node render_gif.mjs <skel_dir> <output.webp> [size] [--fps=N]

# 스킨 변형 사용(bowlbug, cultists, cubex 등)
node render_gif.mjs <skel_dir> output.webp 256 --fps=10 --skin=rock

# 특정 애니메이션(기본값: 대기 루프)
node render_gif.mjs <skel_dir> output.webp 256 --fps=12 --anim=attack

# 흰색 실루엣 모드(보스 지도 노드 아이콘용)
node render_gif.mjs <skel_dir> output.webp 256 --white
```

**애니메이션 라이브러리:** 무손실 애니메이션 WebP 209개:
- 512×512 캐릭터 애니메이션 15개(전투/선택/휴식 × 캐릭터 5명)
- 256×256 몬스터 대기 애니메이션 103개
- 256×256 몬스터 공격 애니메이션 91개

**스킨 변형:** 몬스터 13종에 스킨 변형이 있습니다(bowlbug, cubex_construct, cultists 등). `--skin=`을 사용해 선택하세요. 기본 스킨은 몸체 없이 기본 골격만 표시하는 경우가 많습니다.

**보스 지도 노드 셰이더:** 게임은 RGB 채널을 마스크로 취급하는 `boss_map_point.gdshader`를 사용합니다.
- **빨간색 채널** × `map_color`(기본값: 베이지색 `0.671, 0.58, 0.478`) → 채우기 색상
- **파란색 채널** × `black_layer_color`(기본값: 검은색 `0, 0, 0`) → 외곽선 색상
- **녹색 채널** × 흰색 `1, 1, 1` → 강조 표시

### 레거시 캔버스 렌더러

캔버스 렌더러(`render.mjs`, `render_all.mjs`)는 `triangleRendering = true`로 `spine-canvas`를 사용합니다. 인접 삼각형 사이에서 캔버스 `clip()` 경로의 앤티앨리어싱 때문에 **눈에 보이는 와이어프레임 메시 아티팩트**가 발생합니다. 대신 WebGL 렌더러를 사용하세요.

### 의존성

- `@esotericsoftware/spine-webgl` ^4.2.107 - WebGL용 Spine 런타임(현재)
- `playwright` - WebGL 렌더링용 헤드리스 Chrome
- `gif-encoder-2` - 애니메이션 렌더러용 GIF 인코딩
- `canvas` ^3.1.0 - Node.js Canvas 구현(애니메이션 렌더러의 프레임 버퍼)
- `Pillow`(Python) - 렌더링된 PNG 프레임에서 WebP/APNG 조립
- `@esotericsoftware/spine-canvas` ^4.2.106 - Canvas용 Spine 런타임(레거시)

## 게임 파일 추출

처음부터 추출해야 하는 경우:

```bash
# PCK 추출(GDRE Tools)
/path/to/gdre_tools --headless --recover="/path/to/sts2.pck" --output-dir=extraction/raw

# DLL 디컴파일(ILSpy CLI)
ilspycmd -p -o extraction/decompiled "/path/to/sts2.dll"
```

Steam 설치 위치:
- **Windows**: `C:\Program Files (x86)\Steam\steamapps\common\Slay the Spire 2\`
- **macOS**: `~/Library/Application Support/Steam/steamapps/common/Slay the Spire 2/`
- **Linux**: `~/.local/share/Steam/steamapps/common/Slay the Spire 2/`

## 버전 관리

Spire Codex는 **`1.X.Y`** 시맨틱 버전 관리를 사용합니다.

| 구간 | 의미 |
|---------|---------|
| **1** | Spire Codex 메이저 버전(전체 재작성 전까지 유지) |
| **X** | Mega Crit가 게임 패치를 출시할 때 증가 |
| **Y** | 자체 파서/프런트엔드 수정 및 개선 시 증가 |

예: `v1.0.0` = 최초 릴리스, `v1.0.1` = 자체 버그 수정, `v1.1.0` = 첫 번째 Mega Crit 패치 반영.

## SEO

- **구조화된 데이터(JSON-LD)**: WebSite + VideoGame(홈), CollectionPage + ItemList(목록 페이지), Article + BreadcrumbList + FAQPage(상세 페이지), SoftwareApplication(개발자), NewsArticle(news/[gid])
- **제목 형식**: `"Slay the Spire 2 (sts2) {Page Title} | Spire Codex"` - 모든 페이지에서 표준화됩니다. 런은 `"{username} - {char} - Ascension {N} {win/loss} - Slay the Spire 2 (sts2) | Spire Codex"`를 사용합니다. 여러 로캘에서 `sts2 tier list` / `sts2 card list` 검색어가 일치하도록 "(sts2)"를 인라인으로 포함합니다.
- **사이트맵**: `force-dynamic`이 적용된 `/sitemap.xml`의 단일 계층 XML(빌드 시점이 아닌 서버 측 렌더링). 엔티티 상세 페이지, 탐색 매트릭스 페이지, 티어 목록 페이지, 점수 산정 방법론, runs/[hash] 상세, 모든 엔티티 유형의 i18n 미러를 포함한 약 20,000개 이상의 URL
- **국제 SEO**: 영어 외 14개 언어의 `/{lang}/` 경로와 **양방향** hreflang 대체 링크. 영어 루트 페이지도 `lib/seo.ts`의 `buildLanguageAlternates(path)`를 통해 모든 로캘 + `x-default` 대체 링크를 내보냅니다(역참조가 없어 Google이 현지화 페이지를 중복으로 취급하던 GSC "Crawled - not indexed" 중복 콘텐츠 클러스터 해결).
- **프로그래밍 방식 SEO**: `/cards/browse/`의 카드 탐색 페이지 41개(rare-attacks, ironclad-skills 등) + 티어 목록 페이지 3개(`/tier-list/{cards,relics,potions}`)
- **로캘 인식 EntityProse**: 상세 페이지는 모든 로캘에 동일한 영어 본문을 표시하는 대신 로캘별 짧은 문단을 렌더링합니다.
- **내부 링크**: 파워 ↔ 카드, 조우 → 몬스터, 카드 키워드 → 키워드 허브 페이지, 몬스터 행동 → 파워 페이지(툴팁 포함), 막 페이지 → 조우/이벤트, 티어 목록 행 → 엔티티 상세 통계 탭
- **Open Graph 및 Twitter Cards**: 엔티티별 OG 이미지, `summary_large_image` Twitter 카드
- **정식 URL**: 모든 페이지가 정식 URL을 선언합니다.

## 임베드 가능한 위젯

### 툴팁 위젯
모든 13개 엔티티 유형에 마우스를 올리면 표시되는 툴팁을 모든 웹사이트에 추가할 수 있습니다.
```html
<script src="https://spire-codex.com/widget/spire-codex-tooltip.js"></script>
<p>Start with [[Bash]] and [[relic:Burning Blood]].</p>
```

### 변경 로그 위젯
대화형 변경 로그 뷰어를 삽입할 수 있습니다.
```html
<div id="scx-changelog"></div>
<script src="https://spire-codex.com/widget/spire-codex-changelog.js"></script>
```

전체 문서: [spire-codex.com/developers](https://spire-codex.com/developers)

## 로드맵

- ~~개별 상세 페이지~~ ✅
- ~~전역 검색~~ ✅
- ~~다국어 지원(15개 언어)~~ ✅
- ~~SEO(JSON-LD, OG/Twitter, 사이트맵, hreflang)~~ ✅
- ~~툴팁 위젯(13개 엔티티 유형 전체)~~ ✅
- ~~캐릭터 비교 페이지(10쌍)~~ ✅
- ~~키워드 허브 페이지~~ ✅
- ~~상인 가이드(디컴파일된 C#의 가격 정보)~~ ✅
- ~~개발자 문서 + 데이터 내보내기~~ ✅
- ~~국제 SEO(13개 언어 랜딩 페이지)~~ ✅
- ~~카드 탐색 매트릭스(프로그래밍 방식 SEO 페이지 41개)~~ ✅
- ~~커뮤니티 가이드~~ ✅ - YAML 프런트매터가 포함된 Markdown, 제출 양식, 툴팁 위젯, 작성자 소셜 링크
- ~~게임 메커니즘 페이지~~ ✅ - 개별 SEO 페이지 27개: 드롭률, 전투, 지도, 보스, 비밀 및 잡학
- ~~커뮤니티 런~~ ✅ - 런 제출, 브라우저, 공유 런, 실시간 통계
- ~~카드 업그레이드 설명~~ ✅ - 업그레이드 가능한 카드 403개 전체의 upgrade_description
- ~~몬스터 선천적 파워~~ ✅ - AfterAddedToRoom에서 가져온 파워가 있는 몬스터 42종
- ~~도전 과제 해금 조건~~ ✅ - C# 소스의 카테고리, 캐릭터, 임계값
- ~~몬스터 공격 패턴~~ ✅ - C# 상태 머신에서 가져온 순환/무작위/조건부/혼합 AI가 적용된 몬스터 112종
- ~~이벤트 선행 조건~~ ✅ - C# 소스에서 파싱한 IsAllowed() 조건이 있는 이벤트 25개
- ~~베타 아카이브 보존~~ ✅ - 버전별 베타 데이터와 이미지가 계속 보존되며, `/beta`는 활성 빌드를 제공하고 `/images`에서는 보관된 애셋을 탐색할 수 있음
- ~~Discord 봇~~ ✅ - [Knowledge Demon](https://bot.spire-codex.com): 모든 엔티티용 슬래시 명령어(`/card`, `/relic`, `/monster`, `/potion`, `/character`, `/event`, `/power`, `/enchantment`, `/lookup`, `/meta`), Steam 뉴스 RSS, [Kernel](https://github.com/ptrlrd/kernel)에서 포크한 완전한 관리 도구 모음
- ~~Codex Score 및 티어 목록~~ ✅ - **베이즈 축소**를 사용해 커뮤니티 런에서 계산한 엔티티별 등급: `shrunk = (wins + PRIOR_WEIGHT × baseline) / (n + PRIOR_WEIGHT)`, 이후 0~100으로 조정하여 S/A/B/C/D/F에 매핑합니다. 적은 표본의 잡음을 방지합니다(한 게임에서 1/1을 기록한 카드가 S를 받지 않고 사전값으로 회귀). 백엔드 시작 시 미리 준비됩니다. 상세 페이지 통계 탭의 `ScoreBadge`, 전용 티어 목록 페이지, `/leaderboards/scoring`의 방법론 페이지에서 제공됩니다.
- ~~상세 페이지 통계 탭~~ ✅ - `EntityRunStats`를 통한 점수 대표 배지 + 설명 요약 + 최근 런 링크
- **덱 빌더** - 대화형 덱 이론 구성
- **데이터베이스 백엔드** - 언어별 JSON 로딩을 PostgreSQL JSONB(또는 대안)로 교체. 런 제출 저장소는 이미 SQLite에서 MongoDB로 이전됨(2026년 5월).

## 감사의 말

QA 테스트, 버그 보고, 기여를 해주신 **vesper-arch**, **terracubist**, **U77654**, **Purple Aspired Dreaming**, **Kobaru**, **Severi**에게 감사드립니다. 프로젝트 운영을 지속할 수 있게 해주는 Ko-fi 후원자를 포함한 전체 후원자 목록은 [spire-codex.com/thank-you](https://spire-codex.com/thank-you)에서 확인할 수 있습니다.

## 기술 스택

- **백엔드**: Python, FastAPI, Pydantic, slowapi, GZip 압축
- **런 데이터베이스**: MongoDB(커뮤니티 통계, 순위표, 사용자 계정), 구체화된 `stats_summary` 컬렉션 및 리더 선출형 백그라운드 새로 고침 프로세스 포함. 레거시 SQLite 경로는 오프라인 대체 수단으로 유지됩니다.
- **계정**: Steam OpenID + Discord OAuth, JWT 세션 쿠키
- **프런트엔드**: Next.js 16(App Router), TypeScript, Tailwind CSS, 15개 언어 지원
- **이미지/CDN**: `cdn.spire-codex.com`을 통해 제공되는 Cloudflare R2(webp)
- **분석 및 관측성**: 자체 호스팅 Umami, Prometheus + node-exporter
- **Spine 렌더러**: Node.js, Playwright, @esotericsoftware/spine-webgl(헤드리스 Chrome을 통한 WebGL)
- **인프라**: Docker, 레지스트리 기반 BuildKit 캐시를 사용하는 GitHub Actions CI(자체 호스팅 러너), Ansible/SSH 배포
- **도구**: Python(업데이트 파이프라인, 변경 로그 차이 비교, 이미지 복사)

## 라이선스

- **소스 코드**: [PolyForm Noncommercial 1.0.0](LICENSE.md) - 비상업적 목적으로 자유롭게 사용, 수정, 재배포할 수 있습니다. 소프트웨어 판매는 허용되지 않습니다.
- **호스팅 API**: [API_TERMS.md](API_TERMS.md) - 공개된 속도 제한 내에서 어떤 용도로든 무료로 사용할 수 있습니다. 더 많은 사용량이 필요하면 Discord 또는 이슈를 통해 문의하세요.
- **게임 데이터**(카드, 유물, 몬스터 등): © Mega Crit Games. 공정 이용/교육 목적 조건에 따라 커뮤니티 참조 자료로 제공됩니다. 이 데이터를 사용해 게임을 다시 컴파일하거나, 재패키징하거나, 재배포하지 마세요.

기여물에는 동일한 PolyForm Noncommercial 1.0.0 조건이 적용됩니다. [CONTRIBUTING.md](CONTRIBUTING.md#license)를 참조하세요.
