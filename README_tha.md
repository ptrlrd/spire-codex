<p align="center">
  <img src="frontend/public/spire-codex-white-silent-black-background.png" alt="โลโก้ Spire Codex" width="200" />
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

ฐานข้อมูลและ API ที่ครอบคลุมสำหรับข้อมูลเกม **Slay the Spire 2** ซึ่งสร้างขึ้นด้วยการทำวิศวกรรมย้อนกลับไฟล์เกม รองรับ **15 ภาษา** ทั้งหมดที่มาพร้อมกับเกม

**เว็บไซต์จริง**: [spire-codex.com](https://spire-codex.com)

**Steam App ID**: 2868840

## วิธีการสร้าง

Slay the Spire 2 สร้างด้วย Godot 4 แต่ตรรกะทั้งหมดของเกมอยู่ใน DLL ของ C#/.NET 8 (`sts2.dll`) ไม่ใช่ GDScript ไปป์ไลน์ข้อมูลมีดังนี้:

1. **การแยกไฟล์ PCK** - [GDRE Tools](https://github.com/bruvzg/gdsdecomp) แยกไฟล์ `.pck` ของ Godot เพื่อกู้คืนรูปภาพ แอนิเมชัน Spine และข้อมูลการแปลภาษา (ประมาณ 9,947 ไฟล์)

2. **การถอดรหัส DLL** - [ILSpy](https://github.com/icsharpcode/ILSpy) ถอดรหัส `sts2.dll` เป็นไฟล์ซอร์ส C# ที่อ่านได้ประมาณ 3,300 ไฟล์ ซึ่งมีโมเดลเกมทั้งหมด

3. **การแยกวิเคราะห์ข้อมูล** - ตัวแยกวิเคราะห์ Python ที่ใช้ regex จำนวน 22 ตัวแยกข้อมูลแบบมีโครงสร้างจากซอร์ส C# ที่ถอดรหัสแล้ว และส่งออก JSON แยกตามภาษาไปยัง `data/{lang}/`:
   - **การ์ด**: คอนสตรักเตอร์ `base(cost, CardType, CardRarity, TargetType)` + `DamageVar`, `BlockVar`, `PowerVar<T>` สำหรับค่าสถิติ
   - **ตัวละคร**: `StartingHp`, `StartingGold`, `MaxEnergy`, `StartingDeck`, `StartingRelics`
   - **รีลิก/โพชัน**: ระดับความหายาก พูล และคำอธิบายที่แก้ค่าจากเทมเพลต SmartFormat
   - **มอนสเตอร์**: ช่วง HP, การปรับสเกล Ascension ผ่าน `AscensionHelper`, สเตตแมชชีนของท่าพร้อมเจตนาแยกตามท่า (Attack/Defend/Buff/Debuff/Status/Summon/Heal), ค่าความเสียหาย, จำนวนครั้งที่โจมตี (รวมถึงรูปแบบ AscensionHelper), พลังติดตัวจาก `AfterAddedToRoom` (มอนสเตอร์ 42 ตัวพร้อมตัวแปรตาม Ascension), พลังที่ใช้ในแต่ละท่า (เป้าหมาย + ปริมาณจาก `PowerCmd.Apply<T>`), บล็อก, การรักษา, บริบทของการเผชิญหน้า (องก์, ประเภทห้อง), **รูปแบบการโจมตี** ที่แยกวิเคราะห์จาก `GenerateMoveStateMachine()` (มอนสเตอร์ 112 ตัว - วนรอบ, สุ่ม, มีเงื่อนไข, ผสม)
   - **การเสริมพลัง**: ข้อจำกัดประเภทการ์ด การซ้อนทับ และการปรับสเกลตาม Amount
   - **การเผชิญหน้า**: องค์ประกอบมอนสเตอร์ ประเภทห้อง (Boss/Elite/Monster) ตำแหน่งในองก์ และแท็ก
   - **อีเวนต์**: โครงสร้างการตัดสินใจหลายหน้า (56 จาก 66 อีเวนต์), ตัวเลือกพร้อมผลลัพธ์, ตำแหน่งในองก์, การอ้างอิงโมเดล `StringVar` ที่แปลงเป็นชื่อสำหรับแสดงผล, ค่าที่คำนวณขณะรัน (ค่าใช้จ่ายที่เพิ่มขึ้นผ่าน `GetDecipherCost()`, ช่วงทองผ่าน `CalculateVars` พร้อม `NextInt`/`NextFloat`, รูปแบบการรักษาจนเต็ม), **เงื่อนไขเบื้องต้น** จาก `IsAllowed()` (25 อีเวนต์ - เงื่อนไขทอง, HP, องก์, เด็ค, รีลิก, โพชัน)
   - **Ancients**: NPC Ancient 8 ตัวพร้อมสร้อยนาม บทสนทนาเฉพาะตัวละคร ข้อเสนอรีลิก และไอคอนภาพเหมือน
   - **พลัง**: PowerType (Buff/Debuff), PowerStackType (Counter/Single), DynamicVars และคำอธิบาย
   - **Epochs/เรื่องราว**: ข้อมูลความก้าวหน้าของไทม์ไลน์พร้อมข้อกำหนดการปลดล็อก
   - **ออร์บ**: ค่าพาสซีฟ/Evoke และคำอธิบาย
   - **สถานะผิดปกติ**: การซ้อนทับ ข้อความเพิ่มเติมบนการ์ด และคำอธิบาย
   - **ตัวปรับแต่ง**: คำอธิบายตัวปรับแต่งการเล่น
   - **คีย์เวิร์ด**: คำจำกัดความคีย์เวิร์ดของการ์ด (Exhaust, Ethereal, Innate ฯลฯ)
   - **เจตนา**: คำอธิบายเจตนาของมอนสเตอร์พร้อมไอคอน
   - **ความสำเร็จ**: เงื่อนไขการปลดล็อก คำอธิบาย หมวดหมู่ ความเกี่ยวข้องกับตัวละคร และค่าเกณฑ์จากซอร์ส C# (33 ความสำเร็จ)
   - **องก์**: ลำดับการค้นพบบอส การเผชิญหน้า อีเวนต์ Ancient และจำนวนห้อง
   - **ระดับ Ascension**: 11 ระดับ (0–10) พร้อมคำอธิบายจากข้อมูลการแปลภาษา
   - **พูลโพชัน**: พูลเฉพาะตัวละครที่แยกวิเคราะห์จากคลาสพูลและการอ้างอิง epoch
   - **คำแปล**: แมปตัวกรองแยกตามภาษา (ประเภทการ์ด, ระดับความหายาก, คีย์เวิร์ด → ชื่อที่แปลแล้ว) และสตริง UI (ชื่อส่วน, คำอธิบาย, ชื่อตัวละคร) สำหรับฟรอนต์เอนด์

4. **การแก้ค่าคำอธิบาย** - โมดูล `description_resolver.py` ที่ใช้ร่วมกันแก้ค่าเทมเพลตการแปลภาษา SmartFormat (`{Damage:diff()}`, `{Energy:energyIcons()}`, `{Cards:plural:card|cards}`) ให้เป็นข้อความที่มนุษย์อ่านได้ พร้อมมาร์กเกอร์ริชเท็กซ์สำหรับการเรนเดอร์บนฟรอนต์เอนด์ ตัวแปรแบบไดนามิกขณะรัน (เช่น `{Card}`, `{Relic}`) จะถูกเก็บไว้เป็นตัวยึดตำแหน่งที่อ่านได้ การอ้างอิง `StringVar` ในอีเวนต์ (เช่น `{Enchantment1}` → `ModelDb.Enchantment<Sharp>().Title`) จะถูกแปลงเป็นชื่อสำหรับแสดงผลผ่านการค้นหาข้อมูลการแปลภาษา

5. **การเรนเดอร์ Spine** - ตัวละครและมอนสเตอร์เป็นแอนิเมชันโครงกระดูก Spine ไม่ใช่ภาพนิ่ง ตัวเรนเดอร์ Node.js แบบ headless ประกอบท่าทางขณะอยู่นิ่งเป็นภาพเหมือน PNG ขนาด 512×512 มอนสเตอร์ทั้ง 111 ตัวมีภาพ: 100 ตัวเรนเดอร์จากโครงกระดูก Spine, 6 ตัวใช้นามแฝงจากโครงกระดูกร่วมกัน (Flyconid→flying_mushrooms, Ovicopter→egg_layer, Crusher/Rocket→kaiser_crab) และ 5 ตัวจากแอสเซตเกมแบบภาพนิ่ง (Doormaker) นอกจากนี้ยังเรนเดอร์ตัวละครทั้ง 5 ตัว (ท่าต่อสู้ จุดพัก และหน้าจอเลือกตัวละคร), NPC และฉากหลัง ตัวแปรที่อิงกับสกิน (Cultists, Bowlbugs, Cubex) จะถูกเรนเดอร์แยกกัน ดู [ตัวเรนเดอร์ Spine](#ตัวเรนเดอร์-spine) ด้านล่าง

6. **รูปภาพ** - ภาพการ์ด ไอคอนรีลิก/โพชัน ภาพตัวละคร สไปรต์มอนสเตอร์ ไอคอนภาพเหมือน Ancient และไอคอนการเผชิญหน้าบอสที่แยกจากแอสเซตเกมและให้บริการเป็นไฟล์สแตติก

7. **การเปรียบเทียบความต่างของบันทึกการเปลี่ยนแปลง** - เครื่องมือ diff เปรียบเทียบข้อมูล JSON ระหว่างเวอร์ชันเกม (ผ่าน git refs หรือไดเรกทอรี) โดยติดตามเอนทิตีที่เพิ่ม/ลบ/เปลี่ยนแปลงในแต่ละหมวดหมู่ พร้อมความต่างระดับฟิลด์ บันทึกการเปลี่ยนแปลงใช้เวอร์ชันเกม Steam + หมายเลขการแก้ไข Codex ที่ไม่บังคับเป็นคีย์

## โครงสร้างโปรเจกต์

```
spire-codex/
├── backend/                    # แบ็กเอนด์ FastAPI
│   ├── app/
│   │   ├── main.py             # จุดเริ่มต้นแอป, CORS, GZip, การจำกัดอัตรา, ไฟล์สแตติก
│   │   ├── dependencies.py     # การพึ่งพาที่ใช้ร่วมกัน (การตรวจสอบ lang, ชื่อภาษา)
│   │   ├── routers/            # เอนด์พอยต์ API (เราเตอร์มากกว่า 25 ตัว)
│   │   ├── models/schemas.py   # โมเดล Pydantic
│   │   ├── services/           # การโหลดข้อมูล JSON (แคช LRU, รองรับ 14 ภาษา)
│   │   └── parsers/            # ซอร์ส C# → ตัวแยกวิเคราะห์ JSON
│   │       ├── card_parser.py
│   │       ├── character_parser.py
│   │       ├── monster_parser.py
│   │       ├── relic_parser.py
│   │       ├── potion_parser.py
│   │       ├── enchantment_parser.py
│   │       ├── encounter_parser.py
│   │       ├── event_parser.py
│   │       ├── power_parser.py
│   │       ├── keyword_parser.py        # คีย์เวิร์ด, เจตนา, ออร์บ, สถานะผิดปกติ, ตัวปรับแต่ง, ความสำเร็จ (พร้อมเงื่อนไขปลดล็อก)
│   │       ├── guide_parser.py          # คู่มือ Markdown พร้อม YAML frontmatter
│   │       ├── epoch_parser.py
│   │       ├── act_parser.py
│   │       ├── ascension_parser.py
│   │       ├── pool_parser.py            # เพิ่มพูลตัวละครให้โพชัน
│   │       ├── translation_parser.py    # สร้าง translations.json แยกตามภาษา
│   │       ├── description_resolver.py   # ตัวแก้ค่า SmartFormat ที่ใช้ร่วมกัน
│   │       ├── parser_paths.py           # การกำหนดค่าพาธร่วมกัน (ตัวแปรสภาพแวดล้อมใช้แทนค่าสำหรับ beta)
│   │       └── parse_all.py              # ควบคุมตัวแยกวิเคราะห์ทั้งหมด (15 ภาษา)
│   ├── static/images/          # รูปภาพเกม (ไม่คอมมิต)
│   ├── scripts/copy_images.py  # คัดลอกรูปภาพจากข้อมูลที่แยกแล้ว → static
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/                   # Next.js 16 + TypeScript + Tailwind CSS
│   ├── app/
│   │   ├── contexts/           # LanguageContext, BetaVersionContext
│   │   ├── components/         # CardGrid, RichDescription, SearchFilter,
│   │   │                       #   GlobalSearch, Navbar, Footer, LanguageSelector, VersionSelector
│   │   └── ...                 # หน้า: การ์ด, ตัวละคร, รีลิก, มอนสเตอร์, โพชัน,
│   │                           #   การเสริมพลัง, การเผชิญหน้า, อีเวนต์, พลัง, ไทม์ไลน์,
│   │                           #   ข้อมูลอ้างอิง, รูปภาพ, บันทึกการเปลี่ยนแปลง, เกี่ยวกับ, พ่อค้า, เปรียบเทียบ,
│   │                           #   mechanics/[slug], guides/[slug], guides/submit,
│   │                           #   leaderboards, leaderboards/submit, leaderboards/stats,
│   │                           #   runs/[hash] (มุมมองการเล่นที่แชร์)
│   │                           #   หน้ารายละเอียด: cards/[id], characters/[id], relics/[id],
│   │                           #   monsters/[id], potions/[id], enchantments/[id],
│   │                           #   encounters/[id], events/[id], powers/[id], keywords/[id],
│   │                           #   acts/[id], ascensions/[id], intents/[id], orbs/[id],
│   │                           #   afflictions/[id], modifiers/[id], achievements/[id]
│   │                           #   i18n: [lang]/... จำลองเส้นทางทั้งหมดสำหรับ 14 ภาษาที่ไม่ใช่ภาษาอังกฤษ
│   ├── lib/
│   │   ├── api.ts              # ไคลเอนต์ API + อินเทอร์เฟซ TypeScript
│   │   ├── fetch-cache.ts      # แคช fetch ในหน่วยความจำฝั่งไคลเอนต์ (TTL 5 นาที)
│   │   ├── seo.ts              # ยูทิลิตี SEO ที่ใช้ร่วมกัน (stripTags, SITE_URL, SITE_NAME)
│   │   ├── jsonld.ts           # ตัวสร้างสคีมา JSON-LD (BreadcrumbList, CollectionPage, Article, WebSite, FAQPage)
│   │   ├── ui-translations.ts # คำแปลสตริง UI สำหรับ 14 ภาษาที่ไม่ใช่ภาษาอังกฤษ
│   │   ├── languages.ts       # การกำหนดค่า i18n - รหัสภาษา 14 รหัส, แมป hreflang
│   │   └── use-lang-prefix.ts # Hook สำหรับสร้าง URL ที่รองรับภาษา
│   └── Dockerfile
├── tools/
│   ├── spine-renderer/         # ตัวเรนเดอร์โครงกระดูก Spine แบบ headless
│   │   ├── render_webgl.mjs     # ตัวเรนเดอร์ WebGL (โครงกระดูกเดียว) - ไม่มีรอยต่อ
│   │   ├── render_all_webgl.mjs # ตัวเรนเดอร์ WebGL แบบชุด (ไฟล์ .skel ทั้งหมด)
│   │   ├── render_gif.mjs      # ตัวเรนเดอร์แอนิเมชัน (WebP/GIF/APNG พร้อมรองรับสกิน + แอนิเมชัน)
│   │   ├── render.mjs           # ตัวเรนเดอร์ canvas รุ่นเก่า (มีรอยต่อสามเหลี่ยม)
│   │   ├── render_all.mjs       # ตัวเรนเดอร์ canvas แบบชุดรุ่นเก่า
│   │   ├── render_skins2.mjs    # ตัวเรนเดอร์ตัวแปรสกิน
│   │   ├── render_utils.mjs     # ยูทิลิตีการเรนเดอร์ canvas ที่ใช้ร่วมกัน
│   │   └── package.json
│   ├── diff_data.py            # ตัวสร้าง diff ของบันทึกการเปลี่ยนแปลง
│   ├── update.py               # ไปป์ไลน์อัปเดตข้ามแพลตฟอร์ม
│   └── deploy.py               # บิลด์ Docker ในเครื่อง + พุชไปยัง Docker Hub
├── data/                       # ไฟล์ข้อมูล JSON ที่แยกวิเคราะห์แล้ว
│   ├── {lang}/                 # ไดเรกทอรีแยกตามภาษา (eng, kor, jpn, fra ฯลฯ)
│   ├── changelogs/             # ไฟล์ JSON บันทึกการเปลี่ยนแปลง (ใช้เวอร์ชันเกมเป็นคีย์)
│   ├── guides/                 # ไฟล์คู่มือ Markdown พร้อม YAML frontmatter
│   ├── guides.json             # ข้อมูลคู่มือที่แยกวิเคราะห์แล้ว
│   ├── runs/                   # ไฟล์ JSON การเล่นที่ส่งเข้ามา (แยกตามแฮชผู้เล่น)
│   └── runs.db                 # SQLite รุ่นเก่า (แทนที่ด้วย MongoDB; เก็บไว้เป็นทางเลือกสำรองออฟไลน์)
├── extraction/                 # ไฟล์เกมดิบ (ไม่คอมมิต)
│   ├── raw/                    # โปรเจกต์ Godot ที่แยกด้วย GDRE (stable)
│   ├── decompiled/             # เอาต์พุต ILSpy (stable)
│   └── beta/                   # บรานช์ Steam beta (raw/ + decompiled/)
├── data-beta/                  # ข้อมูล beta ที่แยกวิเคราะห์แล้ว (แยกเวอร์ชัน: v0.102.0/, v0.103.0/, latest → symlink)
├── docker-compose.yml          # การพัฒนาในเครื่อง
├── docker-compose.prod.yml     # โปรดักชัน
├── .github/workflows/
│   └── ci.yml                  # GitHub Actions CI: lint, ตรวจสอบชนิด, สแกนข้อมูลลับ, บิลด์+พุช Docker, ดีพลอยผ่าน SSH
└── .forgejo/workflows/
    └── build.yml               # เก็บไว้เป็น CI สำรองของ Forgejo (ใช้ buildah, ไม่ทำงาน)
```

## บริการสาธารณะ

| โฮสต์ | วัตถุประสงค์ |
|---|---|
| [`spire-codex.com`](https://spire-codex.com) | เว็บไซต์สาธารณะและ API แบบ same-origin ช่อง beta ที่ใช้งานอยู่ภายใต้ `/beta` |
| `cdn.spire-codex.com` | โฮสต์ออบเจ็กต์ Cloudflare R2 สำหรับภาพเกม ภาพการ์ดแบบเต็ม ภาพที่แปลภาษาแล้ว และแอสเซต beta ที่เก็บถาวร |
| [`bot.spire-codex.com`](https://bot.spire-codex.com) | หน้าแรก Knowledge Demon และแดชบอร์ดเจ้าหน้าที่ที่ยืนยันตัวตนด้วย Discord บอตใช้ API หลักของ Codex |
| `analytics.spire-codex.com` | สคริปต์และแดชบอร์ด Umami ที่โฮสต์เอง ฐานข้อมูล PostgreSQL อยู่ในเครือข่าย Docker ส่วนตัว |
| `tierlists.spire-codex.com` | โฮสต์ออบเจ็กต์ R2 โดยเฉพาะสำหรับภาพตัวอย่างรายการจัดอันดับที่สร้างขึ้น |
| `beta.spire-codex.com` | โฮสต์สาธารณะที่เลิกใช้งานแล้ว Cloudflare เปลี่ยนเส้นทางคำขอไปยังพาธเดียวกันบนโดเมนหลัก |

โฮสต์ CDN และรายการจัดอันดับเป็นที่เก็บออบเจ็กต์ ไม่ใช่เว็บไซต์ที่เรียกดูได้ ดังนั้นการได้รับ `404` ที่รากของทั้งสองโฮสต์ถือเป็นเรื่องปกติ

## หน้าเว็บไซต์

| หน้า | เส้นทาง | คำอธิบาย |
|---|---|---|
| หน้าหลัก | `/` | แดชบอร์ดพร้อมจำนวนเอนทิตี การ์ดหมวดหมู่ และลิงก์ตัวละคร |
| การ์ด | `/cards` | กริดการ์ดที่กรองได้พร้อมมุมมองรายละเอียดแบบโมดอล |
| รายละเอียดการ์ด | `/cards/[id]` | ค่าสถิติการ์ดทั้งหมด ข้อมูลการอัปเกรด และรูปภาพ |
| ตัวละคร | `/characters` | กริดภาพรวมตัวละคร |
| รายละเอียดตัวละคร | `/characters/[id]` | ค่าสถิติ เด็ค/รีลิกเริ่มต้น คำพูด และโครงสร้างบทสนทนา NPC |
| รีลิก | `/relics` | กริดรีลิกที่กรองได้ |
| รายละเอียดรีลิก | `/relics/[id]` | ข้อมูลรีลิกทั้งหมดพร้อมข้อความบรรยากาศแบบริชเท็กซ์ |
| มอนสเตอร์ | `/monsters` | กริดมอนสเตอร์พร้อม HP ท่าต่าง ๆ และภาพเรนเดอร์ Spine |
| รายละเอียดมอนสเตอร์ | `/monsters/[id]` | HP, ท่าพร้อมเจตนา/ความเสียหาย/พลัง/บล็อก, ลิงก์การเผชิญหน้า และทูลทิปพลัง |
| โพชัน | `/potions` | กริดโพชันที่กรองได้ (ระดับความหายาก, พูลตัวละคร) |
| รายละเอียดโพชัน | `/potions/[id]` | ข้อมูลโพชันทั้งหมด |
| การเสริมพลัง | `/enchantments` | รายการการเสริมพลังพร้อมตัวกรองประเภทการ์ด |
| รายละเอียดการเสริมพลัง | `/enchantments/[id]` | ข้อมูลการเสริมพลังทั้งหมด |
| การเผชิญหน้า | `/encounters` | องค์ประกอบการเผชิญหน้าแยกตามองก์/ประเภทห้อง |
| รายละเอียดการเผชิญหน้า | `/encounters/[id]` | รายชื่อมอนสเตอร์ ประเภทห้อง และแท็ก |
| อีเวนต์ | `/events` | โครงสร้างอีเวนต์หลายหน้าพร้อมตัวเลือกที่ขยายได้ |
| รายละเอียดอีเวนต์ | `/events/[id]` | หน้าอีเวนต์ ตัวเลือก และบทสนทนา Ancient ทั้งหมด |
| พลัง | `/powers` | บัฟ ดีบัฟ และพลังเป็นกลาง |
| รายละเอียดพลัง | `/powers/[id]` | ข้อมูลพลังพร้อมการ์ดที่ใช้พลังนี้ |
| คีย์เวิร์ด | `/keywords` | รายการคีย์เวิร์ดของการ์ด |
| รายละเอียดคีย์เวิร์ด | `/keywords/[id]` | คำอธิบายคีย์เวิร์ดพร้อมกริดการ์ดที่กรองได้ |
| พ่อค้า | `/merchant` | ราคาการ์ด/รีลิก/โพชัน ค่าใช้จ่ายในการนำการ์ดออก และพ่อค้าปลอม |
| เปรียบเทียบ | `/compare` | ศูนย์รวมการเปรียบเทียบตัวละคร (10 คู่) |
| รายละเอียดการเปรียบเทียบ | `/compare/[pair]` | การเปรียบเทียบตัวละครแบบเคียงข้างกัน |
| นักพัฒนา | `/developers` | เอกสาร API, เอกสารวิดเจ็ต และการส่งออกข้อมูล |
| ผลงานตัวอย่าง | `/showcase` | แกลเลอรีโปรเจกต์ชุมชน |
| ไทม์ไลน์ | `/timeline` | ความก้าวหน้าของ epoch พร้อมการจัดกลุ่มตามยุคและข้อกำหนดการปลดล็อก |
| รายละเอียดองก์ | `/acts/[id]` | บอส การเผชิญหน้า อีเวนต์ และ Ancient สำหรับองก์ |
| รายละเอียด Ascension | `/ascensions/[id]` | คำอธิบายระดับ Ascension พร้อมการนำทางก่อนหน้า/ถัดไป |
| รายละเอียดเจตนา | `/intents/[id]` | ไอคอนและคำอธิบายเจตนา |
| รายละเอียดออร์บ | `/orbs/[id]` | ไอคอนออร์บและคำอธิบายพาสซีฟ/Evoke |
| รายละเอียดสถานะผิดปกติ | `/afflictions/[id]` | คำอธิบายสถานะผิดปกติและการซ้อนทับ |
| รายละเอียดตัวปรับแต่ง | `/modifiers/[id]` | คำอธิบายตัวปรับแต่งการเล่น |
| รายละเอียดความสำเร็จ | `/achievements/[id]` | คำอธิบายความสำเร็จ |
| ตรา | `/badges` | ตราจบการเล่นทั้ง 25 รายการ จัดกลุ่มตามแบบมีระดับ / ระดับเดียว / เฉพาะผู้เล่นหลายคน |
| รายละเอียดตรา | `/badges/[id]` | รายละเอียดแยกตามระดับ (Bronze / Silver / Gold), แฟล็กต้องชนะ + ผู้เล่นหลายคน และไอคอน |
| กลไก | `/mechanics` | ศูนย์รวมกลไกเกม - 27 ส่วนที่คลิกได้พร้อมหน้า SEO แยกกัน |
| รายละเอียดกลไก | `/mechanics/[slug]` | โอกาสการ์ด การกระจายรีลิก การดรอปโพชัน การสร้างแผนที่ พูลบอส การต่อสู้ ความลับและเกร็ดความรู้ |
| คู่มือ | `/guides` | คู่มือกลยุทธ์จากชุมชนพร้อมการค้นหา/กรอง |
| รายละเอียดคู่มือ | `/guides/[slug]` | คู่มือฉบับเต็มพร้อมการเรนเดอร์ Markdown + วิดเจ็ตทูลทิป |
| ส่งคู่มือ | `/guides/submit` | แบบฟอร์มส่งคู่มือ (Discord webhook) |
| กระดานผู้นำ | `/leaderboards` | ตารางชัยชนะเร็วที่สุดและ Ascension สูงสุด พร้อมตัวกรองเล่นคนเดียว/ร่วมมือและโหมดเกม (standard / daily / Today / custom) สถานะตัวกรองทั้งหมดอยู่ใน URL จึงแชร์ทุกมุมมองได้ |
| เรียกดูการเล่น | `/runs` | เบราว์เซอร์การเล่นแบบเต็มพร้อมแถบค้นหานิพจน์ (`user:`, `char:`, ช่วง `asc:`, `card:`/`relic:` แบบหลายค่า AND, ช่วง `version:`, `mode:`, `result:`, `players:`) รวมถึงตัวกรองแบบดรอปดาวน์ การเรียงลำดับ และ URL ที่แชร์ได้ |
| ส่งการเล่น | `/leaderboards/submit` | อัปโหลด `.run` แบบลากแล้ววาง พร้อมลิงก์แอปคู่หู Overwolf, การลงชื่อเข้าใช้ Steam/Discord เพื่อเชื่อมโยงการเล่นโดยอัตโนมัติ และการเล่นล่าสุดของคุณ |
| สถิติ | `/leaderboards/stats` | ตารางจัดอันดับ (อัตราการเลือก, อัตราชนะ, จำนวน) สำหรับการ์ด รีลิก โพชัน และการเผชิญหน้า กรองตามตัวละคร / Ascension / ผลลัพธ์ |
| โปรไฟล์ | `/profile` | สถิติของผู้ใช้ที่ลงชื่อเข้าใช้ (การ์ด/รีลิก/โพชันยอดนิยม, รายละเอียดแยกตามตัวละคร), สถิติส่วนตัวที่ดีที่สุด, การเปรียบเทียบเชิงแข่งขัน (กระดานผู้นำรายวันของวันนี้, อันดับทั่วโลก, อัตราชนะเทียบกับชุมชน) และการจัดการการเล่น |
| การตั้งค่า | `/settings` | การตั้งค่าบัญชี: ชื่อผู้ใช้ อีเมล และ Steam/Discord ที่เชื่อมโยง |
| การเล่นที่แชร์ | `/runs/[hash]` | สรุปชัยชนะ/พ่ายแพ้ในรูปแบบภายในเกม พร้อมไอคอนโหนดแผนที่ที่คลิกได้ แถบรีลิก และกริดการ์ดขนาดเล็ก |
| ข้อมูลอ้างอิง | `/reference` | ทุกรายการคลิกได้ - องก์, Ascension, คีย์เวิร์ด, ออร์บ, สถานะผิดปกติ, เจตนา, ตัวปรับแต่ง และความสำเร็จ |
| รูปภาพ | `/images` | แอสเซตเกมที่เรียกดูได้ พร้อมดาวน์โหลด ZIP แยกตามหมวดหมู่ |
| บันทึกการเปลี่ยนแปลง | `/changelog` | ความต่างของข้อมูลระหว่างการอัปเดตเกม |
| เกี่ยวกับ | `/about` | ข้อมูลโปรเจกต์ สถิติ และภาพแสดงไปป์ไลน์ |
| ขอบคุณ | `/thank-you` | ผู้สนับสนุน Ko-fi และผู้มีส่วนร่วมในชุมชน (แยกจากหน้าเกี่ยวกับเพื่อให้ลิงก์ไปยังหน้านี้ได้โดยตรง) |
| Knowledge Demon | `/knowledge-demon` | หน้าข้อมูลสำหรับบอต Discord - คำสั่ง slash, คุณสมบัติการดูแล และ CTA สำหรับติดตั้ง |
| ข่าว | `/news` | ฟีดประกาศ Steam ที่มิเรอร์ไว้ พร้อมลิงก์ canonical กลับไปยัง Steam เพื่อให้เป็นเนื้อหาเสริม ไม่ใช่เนื้อหาซ้ำ |
| บทความข่าว | `/news/[gid]` | ประกาศ Steam รายการเดียวพร้อมเนื้อหา BBCode ที่ทำความสะอาดแล้วและ `NewsArticle` JSON-LD |
| รายการจัดอันดับ | `/tier-list` | ศูนย์รวมรายการจัดอันดับ Codex Score (ระดับ S → F) สำหรับการ์ด / รีลิก / โพชัน |
| รายละเอียดรายการจัดอันดับ | `/tier-list/[type]` | แถว S/A/B/C/D/F แบบภาพสำหรับเอนทิตีหนึ่งประเภท โดยรับข้อมูลจาก `/api/runs/scores/{type}` |
| การให้คะแนน | `/leaderboards/scoring` | หน้าวิธีการ Codex Score - Bayesian shrinkage, น้ำหนัก prior, ช่วงสเกล และเกณฑ์ระดับ |

## เอนด์พอยต์ API

เอนด์พอยต์ข้อมูลทั้งหมดรองรับพารามิเตอร์คำค้น `?lang=` ที่ไม่บังคับ (ค่าเริ่มต้น: `eng`) การตอบกลับจะถูก **บีบอัดด้วย GZip** และแคชด้วย `Cache-Control: public, max-age=300`

| เอนด์พอยต์ | คำอธิบาย | ตัวกรอง |
|---|---|---|
| `GET /api/cards` | การ์ดทั้งหมด | `color`, `type`, `rarity`, `keyword`, `search`, `lang` |
| `GET /api/cards/{id}` | การ์ดหนึ่งใบ | `lang` |
| `GET /api/characters` | ตัวละครทั้งหมด | `search`, `lang` |
| `GET /api/characters/{id}` | ตัวละครหนึ่งตัว (พร้อมคำพูดและบทสนทนา) | `lang` |
| `GET /api/relics` | รีลิกทั้งหมด | `rarity`, `pool`, `search`, `lang` |
| `GET /api/relics/{id}` | รีลิกหนึ่งชิ้น | `lang` |
| `GET /api/monsters` | มอนสเตอร์ทั้งหมด | `type`, `search`, `lang` |
| `GET /api/monsters/{id}` | มอนสเตอร์หนึ่งตัว | `lang` |
| `GET /api/potions` | โพชันทั้งหมด | `rarity`, `pool`, `search`, `lang` |
| `GET /api/potions/{id}` | โพชันหนึ่งชิ้น | `lang` |
| `GET /api/enchantments` | การเสริมพลังทั้งหมด | `card_type`, `search`, `lang` |
| `GET /api/enchantments/{id}` | การเสริมพลังหนึ่งรายการ | `lang` |
| `GET /api/encounters` | การเผชิญหน้าทั้งหมด | `room_type`, `act`, `search`, `lang` |
| `GET /api/encounters/{id}` | การเผชิญหน้าหนึ่งรายการ | `lang` |
| `GET /api/events` | อีเวนต์ทั้งหมด | `type`, `act`, `search`, `lang` |
| `GET /api/events/{id}` | อีเวนต์หนึ่งรายการ | `lang` |
| `GET /api/powers` | พลังทั้งหมด | `type`, `stack_type`, `search`, `lang` |
| `GET /api/powers/{id}` | พลังหนึ่งรายการ | `lang` |
| `GET /api/keywords` | คำจำกัดความคีย์เวิร์ดของการ์ด | `lang` |
| `GET /api/keywords/{id}` | คีย์เวิร์ดหนึ่งรายการ | `lang` |
| `GET /api/intents` | ประเภทเจตนาของมอนสเตอร์ | `lang` |
| `GET /api/intents/{id}` | เจตนาหนึ่งรายการ | `lang` |
| `GET /api/orbs` | ออร์บทั้งหมด | `lang` |
| `GET /api/orbs/{id}` | ออร์บหนึ่งลูก | `lang` |
| `GET /api/afflictions` | สถานะผิดปกติของการ์ด | `lang` |
| `GET /api/afflictions/{id}` | สถานะผิดปกติหนึ่งรายการ | `lang` |
| `GET /api/modifiers` | ตัวปรับแต่งการเล่น | `lang` |
| `GET /api/modifiers/{id}` | ตัวปรับแต่งหนึ่งรายการ | `lang` |
| `GET /api/achievements` | ความสำเร็จทั้งหมด | `lang` |
| `GET /api/achievements/{id}` | ความสำเร็จหนึ่งรายการ | `lang` |
| `GET /api/badges` | ตราจบการเล่นทั้งหมด | `tiered`, `multiplayer_only`, `requires_win`, `search`, `lang` |
| `GET /api/badges/{id}` | ตราหนึ่งรายการพร้อมรายละเอียดระดับ | `lang` |
| `GET /api/history/{entity_type}/{entity_id}` | ประวัติเวอร์ชันรายเอนทิตี (ไม่สนตัวพิมพ์ใหญ่-เล็ก, ใหม่สุดก่อน) | - |
| `GET /api/epochs` | Epoch ของไทม์ไลน์ | `era`, `search`, `lang` |
| `GET /api/epochs/{id}` | Epoch หนึ่งรายการ | `lang` |
| `GET /api/stories` | รายการเรื่องราว | `lang` |
| `GET /api/stories/{id}` | เรื่องราวหนึ่งรายการ | `lang` |
| `GET /api/acts` | องก์ทั้งหมด | `lang` |
| `GET /api/acts/{id}` | องก์หนึ่งรายการ | `lang` |
| `GET /api/ascensions` | ระดับ Ascension (0–10) | `lang` |
| `GET /api/ascensions/{id}` | ระดับ Ascension หนึ่งระดับ | `lang` |
| `GET /api/stats` | จำนวนเอนทิตีในทุกหมวดหมู่ | `lang` |
| `GET /api/languages` | ภาษาที่พร้อมใช้งานพร้อมชื่อสำหรับแสดงผล | - |
| `GET /api/translations` | แมปคำแปลสำหรับค่าตัวกรองและสตริง UI | `lang` |
| `GET /api/images` | หมวดหมู่รูปภาพพร้อมรายการไฟล์ หมวดหมู่ที่ขึ้นต้นด้วย Beta รองรับ `?version=` | - |
| `GET /api/images/beta/versions` | เวอร์ชันคลังรูปภาพ beta ที่พร้อมใช้งาน + เป้าหมาย symlink `latest` | - |
| `GET /api/images/{category}/download` | ดาวน์โหลดหมวดหมู่รูปภาพเป็น ZIP หมวดหมู่ Beta รองรับ `?version=` | - |
| `GET /api/changelogs` | สรุปบันทึกการเปลี่ยนแปลง (ทุกเวอร์ชัน) | - |
| `GET /api/changelogs/{tag}` | บันทึกการเปลี่ยนแปลงฉบับเต็มสำหรับแท็กเวอร์ชัน | - |
| `GET /api/guides` | คู่มือจากชุมชน | `category`, `difficulty`, `tag`, `search` |
| `GET /api/guides/{slug}` | คู่มือหนึ่งรายการ (พร้อมเนื้อหา Markdown) | - |
| `POST /api/guides` | ส่งคู่มือ (พร็อกซีไปยัง Discord) | - |
| `POST /api/runs` | ส่งการเล่น (JSON ของไฟล์ .run) | `username` |
| `GET /api/runs/list` | แสดงรายการ/เรียกดูการเล่นที่ส่งเข้ามา | `character`, `win`, `username`, `seed`, `build_id`, `build_ids`, `players`, `game_mode`, `ascension`, `ascension_min`, `ascension_max`, `card`, `relic`, `today`, `sort`, `page`, `limit` |
| `GET /api/runs/shared/{hash}` | ข้อมูลการเล่นฉบับเต็มตามแฮช (รวม `username` จาก DB) | - |
| `GET /api/runs/stats` | สถิติชุมชนแบบรวม | `character`, `win`, `ascension`, `game_mode`, `players` |
| `GET /api/runs/leaderboard` | กระดานผู้นำแบบจัดอันดับเฉพาะชัยชนะ | `category` (`fastest`, `highest_ascension`), `character`, `players`, `game_mode`, `today`, `page`, `limit` |
| `GET /api/runs/leaderboard/rank/{hash}` | อันดับของการเล่นที่ชนะหนึ่งรายการภายในตารางของตน | `category` |
| `GET /api/runs/scores/{type}` | Codex Score (คะแนนอัตราชนะที่ปรับด้วย Bayesian shrinkage + ระดับ S/A/B/C/D/F) ต่อเอนทิตี | `type` = `cards`/`relics`/`potions` |
| `GET /api/runs/encounter-stats` | ค่าสถิติรวมต่อการเผชิญหน้า (การปรากฏ อัตราการตาย ความเสียหาย/เทิร์นเฉลี่ย) | `act`, `room_type`, `multiplayer`, `page`, `limit` |
| `POST /api/runs/claim` | ผูกชื่อผู้ใช้กับการเล่นที่ส่งไว้ก่อนหน้าตามแฮช | - |
| `GET /api/runs/versions` | เวอร์ชันเกมที่ไม่ซ้ำกันจากการเล่นที่ส่งเข้ามา | - |
| `GET /api/exports/{lang}` | ZIP ของ JSON เอนทิตีทั้งหมดสำหรับหนึ่งภาษา | `lang` |
| `GET /api/news` | ประกาศ Steam + ข่าวชุมชน (เก็บถาวรในเครื่อง) | `feed_type`, `feedname`, `tag`, `since`, `search`, `limit`, `offset` |
| `GET /api/news/{gid}` | บทความข่าวหนึ่งรายการ (เนื้อหา HTML/BBCode ดิบ) | - |
| `GET /api/merchant/config` | การกำหนดค่าราคาพ่อค้าที่แยกโดยอัตโนมัติ | - |
| `POST /api/feedback` | ส่งความคิดเห็น (พร็อกซีไปยัง Discord) | - |
| `GET /api/versions` | เมทาดาทาเวอร์ชันที่เปิดเผยโดยรากข้อมูลที่ใช้งานอยู่ | - |

**บัญชีผู้ใช้** (เซสชัน cookie/JWT; ลงชื่อเข้าใช้ด้วย Steam หรือ Discord):

| เอนด์พอยต์ | คำอธิบาย |
|---|---|
| `GET /api/auth/me` | ผู้ใช้ที่ลงชื่อเข้าใช้อยู่ในปัจจุบัน |
| `GET /api/auth/steam/redirect` | เริ่มการลงชื่อเข้าใช้ด้วย Steam OpenID |
| `GET /api/auth/discord/start` | เริ่มการลงชื่อเข้าใช้ด้วย Discord OAuth |
| `POST /api/auth/logout` | ล้างคุกกี้เซสชัน |
| `PATCH /api/auth/username` / `PATCH /api/auth/email` | อัปเดตฟิลด์โปรไฟล์ |
| `GET /api/auth/runs` / `POST /api/auth/runs/upload` / `DELETE /api/auth/runs/{hash}` | แสดงรายการ อัปโหลด และลบการเล่นของผู้ใช้ |
| `GET /api/auth/stats` | สถิติรวมรายผู้ใช้ (หน้าโปรไฟล์) |
| `GET /api/auth/personal-bests` | เล่นคนเดียว/ร่วมมือเร็วที่สุด, Ascension สูงสุด, รายวันของวันนี้และตลอดกาล |
| `GET /api/auth/competitive` | กระดานผู้นำรายวันของวันนี้ อันดับทั่วโลก และอัตราชนะเทียบกับชุมชน |

จำกัดอัตราไว้ที่ **60 คำขอต่อนาที** ต่อ IP การส่งความคิดเห็นและคู่มือจำกัดไว้ที่ **3-5 รายการต่อนาที** ต่อ IP เอกสารแบบโต้ตอบอยู่ที่ `/docs` (Swagger UI)

### การแปลภาษา

ข้อมูลเกมทั้งหมดให้บริการใน 15 ภาษาโดยใช้ไฟล์การแปลภาษาของ Slay the Spire 2 เอง ส่ง `?lang=` ไปยังเอนด์พอยต์ข้อมูลใดก็ได้ ใช้ `?channel=beta` สำหรับข้อมูล public beta ที่ใช้งานอยู่ ส่วนชุดรูปภาพ beta ที่เก็บถาวรใช้ `?version=`

| รหัส | ภาษา | รหัส | ภาษา |
|------|----------|------|----------|
| `eng` | English | `kor` | 한국어 |
| `deu` | Deutsch | `pol` | Polski |
| `esp` | Español (ES) | `ptb` | Português (BR) |
| `fra` | Français | `rus` | Русский |
| `ita` | Italiano | `spa` | Español (LA) |
| `jpn` | 日本語 | `tha` | ไทย |
| `tur` | Türkçe | `zhs` | 简体中文 |
| `zht` | 繁體中文 | | |

**สิ่งที่แปลภาษาแล้ว**: ชื่อและคำอธิบายเอนทิตีที่มาจากเกม ประเภทการ์ด ระดับความหายาก คีย์เวิร์ด พลัง การเผชิญหน้า ชื่อตัวละคร ชื่อส่วน เส้นทางที่แปลภาษาแล้ว และป้ายกำกับ UI ที่ใช้ร่วมกันส่วนใหญ่

**สิ่งที่ยังคงเป็นภาษาอังกฤษ**: ตัวระบุ API และค่าตัวกรองเชิงโครงสร้าง เช่น `room_type`, `type`/`stack_type` ของพลัง และ `pool` รวมถึงแบรนด์ผลิตภัณฑ์และเนื้อหาบางส่วนที่เขียนโดยกองบรรณาธิการหรือชุมชน

พารามิเตอร์ตัวกรอง (`type=Attack`, `rarity=Rare`, `keyword=Exhaust`) ใช้ค่าภาษาอังกฤษเสมอโดยไม่คำนึงถึงภาษา - แบ็กเอนด์จะแปลค่าเหล่านี้เป็นค่าภาษาท้องถิ่นก่อนจับคู่

ตัวอย่าง: `GET /api/cards?lang=kor&type=Attack` ส่งคืนข้อมูลการ์ดภาษาเกาหลีซึ่งมีประเภทเป็น "공격" และกรองได้อย่างถูกต้องแม้ว่าพารามิเตอร์จะเป็นภาษาอังกฤษ

### การจัดรูปแบบริชเท็กซ์

ฟิลด์ข้อความ (`description`, `loss_text`, `flavor`, `text` ของบทสนทนา, `title`/`description` ของตัวเลือก) อาจมีแท็กสไตล์ Godot BBCode ที่คงไว้จากข้อมูลการแปลภาษาของเกม:

| แท็ก | ประเภท | ตัวอย่าง | เรนเดอร์เป็น |
|---|---|---|---|
| `[gold]...[/gold]` | สี | `[gold]Enchant[/gold]` | ข้อความสีทอง |
| `[red]...[/red]` | สี | `[red]blood[/red]` | ข้อความสีแดง |
| `[blue]...[/blue]` | สี | `[blue]2[/blue]` | ข้อความสีน้ำเงิน |
| `[green]...[/green]` | สี | `[green]healed[/green]` | ข้อความสีเขียว |
| `[purple]...[/purple]` | สี | `[purple]Sharp[/purple]` | ข้อความสีม่วง |
| `[orange]...[/orange]` | สี | `[orange]hulking figure[/orange]` | ข้อความสีส้ม |
| `[pink]...[/pink]` | สี | - | ข้อความสีชมพู |
| `[aqua]...[/aqua]` | สี | `[aqua]Ascending Spirit[/aqua]` | ข้อความสีฟ้าอมเขียว |
| `[sine]...[/sine]` | เอฟเฟกต์ | `[sine]swirling vortex[/sine]` | ข้อความแอนิเมชันแบบคลื่น |
| `[jitter]...[/jitter]` | เอฟเฟกต์ | `[jitter]CLANG![/jitter]` | ข้อความแอนิเมชันแบบสั่น |
| `[b]...[/b]` | เอฟเฟกต์ | `[b]bold text[/b]` | ข้อความตัวหนา |
| `[i]...[/i]` | เอฟเฟกต์ | `[i]whispers[/i]` | ข้อความตัวเอียง |
| `[energy:N]` | ไอคอน | `[energy:2]` | ไอคอนพลังงาน |
| `[star:N]` | ไอคอน | `[star:1]` | ไอคอนดาว |
| `[Card]`, `[Relic]` | ตัวยึดตำแหน่ง | `[Card]` | ไดนามิกขณะรัน (ตัวเอียง) |

สามารถซ้อนแท็กกันได้: `[b][jitter]CLANG![/jitter][/b]`, `[gold][sine]swirling vortex[/sine][/gold]`

หากคุณใช้ API โดยตรง คุณสามารถลบแท็กเหล่านี้ด้วย regex เช่น `\[/?[a-z]+(?::\d+)?\]` หรือเรนเดอร์ในฟรอนต์เอนด์ของคุณเอง ฟิลด์ `description_raw` (ในกรณีที่มี) จะมีเทมเพลต SmartFormat ที่ยังไม่ได้แก้ค่า

## การรันในเครื่อง

### ข้อกำหนดเบื้องต้น

- Python 3.10+
- Node.js 20+

### แบ็กเอนด์

```bash
python -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r backend/requirements.txt

cd backend
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

แบ็กเอนด์ทำงานที่ **http://localhost:8000**

### ฟรอนต์เอนด์

```bash
cd frontend
npm install
NEXT_PUBLIC_API_URL=http://localhost:8000 npm run dev
```

ฟรอนต์เอนด์ทำงานที่ **http://localhost:3000**

### Docker

```bash
docker compose up --build
```

เริ่มบริการทั้งสองรายการ (แบ็กเอนด์บน 8000, ฟรอนต์เอนด์บน 3000)

### ตัวแปรสภาพแวดล้อม

API หลักแบบอ่านอย่างเดียวไม่ต้องมีการกำหนดค่า คุณสมบัติเสริมด้านล่าง
เปิดใช้งานด้วยตัวแปรสภาพแวดล้อม (ตั้งค่าในสภาพแวดล้อมของแบ็กเอนด์หรือไฟล์ compose):

| ตัวแปร | ใช้โดย | หมายเหตุ |
|---|---|---|
| `MONGO_URL` | แบ็กเอนด์ | ฐานข้อมูลการเล่น (สถิติชุมชน, กระดานผู้นำ, บัญชี) หากไม่ตั้งค่า แบ็กเอนด์จะย้อนกลับไปใช้พาธ SQLite รุ่นเก่า (`data/runs.db`) |
| `JWT_SECRET` | แบ็กเอนด์ | ลงนามโทเค็นเซสชันบัญชีผู้ใช้ |
| `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` | แบ็กเอนด์ | การลงชื่อเข้าใช้ด้วย Discord OAuth |
| `FRONTEND_URL`, `SPIRE_CODEX_PUBLIC_BASE` | แบ็กเอนด์ | URL เปลี่ยนเส้นทาง / กลับจาก OAuth |
| `ENVIRONMENT` | แบ็กเอนด์ | `production` เปิดใช้พฤติกรรม secure-cookie |
| `NEXT_PUBLIC_API_URL` | ฟรอนต์เอนด์ (ขณะบิลด์) | ฐาน API; เว้นว่างในโปรดักชันเพื่อให้รูปภาพ/ข้อมูลใช้ same-origin |
| `NEXT_PUBLIC_CDN_URL` | ฟรอนต์เอนด์ (ขณะบิลด์) | เมื่อตั้งค่า (เช่น `https://cdn.spire-codex.com`) รูปภาพจะโหลดจาก CDN แทน `/static` |
| `NEXT_PUBLIC_SITE_URL` | ฟรอนต์เอนด์ (ขณะบิลด์) | URL canonical ของเว็บไซต์สำหรับเมทาดาทา |

บัญชีผู้ใช้และ CDN ปิดใช้งานตามค่าเริ่มต้น ดังนั้นโปรเจกต์จึงทำงานแบบครบวงจร
ได้โดยไม่ต้องใช้ตัวแปรเหล่านี้

## ไปป์ไลน์อัปเดต

สคริปต์ Python ข้ามแพลตฟอร์มจัดการเวิร์กโฟลว์อัปเดตทั้งหมดเมื่อมีการเผยแพร่เกมเวอร์ชันใหม่:

```bash
# ไปป์ไลน์เต็มรูปแบบ - แยกไฟล์เกม แยกวิเคราะห์ข้อมูล เรนเดอร์สไปรต์ และคัดลอกรูปภาพ:
python3 tools/update.py

# ระบุพาธติดตั้งเกมด้วยตนเอง:
python3 tools/update.py --game-dir "/path/to/Slay the Spire 2"

# ข้ามการแยกไฟล์ (มีไดเรกทอรี extraction/ ที่ใหม่อยู่แล้ว):
python3 tools/update.py --skip-extract

# แยกวิเคราะห์ข้อมูลใหม่เท่านั้น (ไม่แยกไฟล์หรือเรนเดอร์):
python3 tools/update.py --parse-only

# เรนเดอร์สไปรต์ Spine ใหม่เท่านั้น:
python3 tools/update.py --render-only

# สร้างบันทึกการเปลี่ยนแปลงหลังอัปเดต:
python3 tools/update.py --changelog --game-version "0.98.2" --build-id "22238966"
```

สคริปต์จะตรวจหาระบบปฏิบัติการของคุณและค้นหาไดเรกทอรีติดตั้ง Steam โดยอัตโนมัติ ข้อกำหนดสำหรับแต่ละขั้นตอน:

| ขั้นตอน | เครื่องมือ | การติดตั้ง |
|---|---|---|
| การแยก PCK | `gdre_tools` | [รุ่นเผยแพร่ของ GDRE Tools](https://github.com/bruvzg/gdsdecomp/releases) |
| การถอดรหัส DLL | `ilspycmd` | `dotnet tool install ilspycmd -g` |
| การแยกวิเคราะห์ข้อมูล | Python 3.10+ | มีในตัว |
| การคัดลอกรูปภาพ | Python 3.10+ | มีในตัว |
| การเรนเดอร์ Spine | Node.js 20+ | [nodejs.org](https://nodejs.org) |

### ขั้นตอนแบบทำด้วยตนเอง

หากคุณต้องการรันแต่ละขั้นตอนแยกกัน:

```bash
# แยกวิเคราะห์ข้อมูลทั้งหมด (ครบ 15 ภาษา)
cd backend/app/parsers && python3 parse_all.py

# แยกวิเคราะห์ภาษาเดียว
cd backend/app/parsers && python3 parse_all.py --lang eng

# คัดลอกรูปภาพจากข้อมูลที่แยกแล้วไปยัง static (PNG + WebP จากซอร์สเดียวกัน - ไม่มี
# กระบวนการสูญเสียคุณภาพต่อเนื่องผ่าน WebP ที่มีอยู่ในแบ็กเอนด์) WebP ที่ quality=95, method=6
python3 backend/scripts/copy_images.py

# เรนเดอร์สไปรต์ Spine (WebGL - ไม่มีรอยต่อสามเหลี่ยม)
cd tools/spine-renderer && npm install
npx playwright install chromium           # เฉพาะครั้งแรก
node render_all_webgl.mjs                 # โครงกระดูกทั้ง 138 ชุดผ่าน Chrome แบบ headless
node render_webgl.mjs <skel_dir> <out> [size] [--skin=a,b] [--anim=name] [--anim-time=N]

# ค่าที่ใช้แทนทั่วไปสำหรับมอนสเตอร์แต่ละตัว:
#   --skin=moss1,diamondeye   รวมสกินตัวแปรกับค่าเริ่มต้น (cubex_construct)
#   --skin=skin1              สลับค่าเริ่มต้นเป็นตัวแปร (scroll_of_biting)
#   --anim-time=0.5           เลื่อนแอนิเมชันไป N วินาทีก่อนจับภาพ
#   --anim=attack             ใช้แทนแอนิเมชัน idle ที่เลือกอัตโนมัติ
#
# การแทนที่ตัวยึดตำแหน่งควัน: gas_bomb_2.png, the_forgotten_2.png และ
# living_smog_2.png มาพร้อมป้าย "Smoke Placeholder" สีม่วงแดงในซอร์ส
# render_webgl.mjs แทนที่ด้วยกลุ่มเมฆสีพลัมเข้มที่สร้างตามขั้นตอนวิธี
# ในขนาดเดิมก่อนอัปโหลด GL จากนั้นบังคับ slot.color.a = 1.0
# บนสล็อตที่ถูกแทนที่ (ศิลปินตั้งค่า alpha ต่ำโดยคาดว่าจะใช้ shader)

# จัดเฟรมสไปรต์มอนสเตอร์ที่เล็กเกินไปใหม่ (ประมวลผลภายหลัง - ครอปตามกรอบ alpha จริง
# และปรับสเกลให้เต็มประมาณ 92% ของเฟรม 512x512):
python3 tools/rescale_bestiary.py fuzzy_wurm_crawler thieving_hopper terror_eel

# ตัวเรนเดอร์ canvas รุ่นเก่า (มีรอยต่อสามเหลี่ยม - ควรหลีกเลี่ยง)
# node render_all.mjs / node render.mjs
```

## ระบบบันทึกการเปลี่ยนแปลง

ติดตามสิ่งที่เปลี่ยนแปลงระหว่างการอัปเดตเกมด้วย diff ระดับฟิลด์ในทุกหมวดหมู่เอนทิตี

### การสร้างบันทึกการเปลี่ยนแปลง

```bash
# เปรียบเทียบข้อมูลปัจจุบันกับ git ref:
python3 tools/diff_data.py HEAD~1 --format json \
    --game-version "0.98.2" --build-id "22238966" \
    --title "March Update"

# แสดงตัวอย่างเป็นข้อความหรือ Markdown:
python3 tools/diff_data.py HEAD~1 --format text
python3 tools/diff_data.py HEAD~1 --format md
```

### สคีมาบันทึกการเปลี่ยนแปลง

ไฟล์ JSON บันทึกการเปลี่ยนแปลงแต่ละไฟล์ประกอบด้วย:

| ฟิลด์ | คำอธิบาย |
|---|---|
| `app_id` | Steam App ID (2868840) |
| `game_version` | เวอร์ชันเกม Steam (เช่น `"0.98.2"`) |
| `build_id` | Steam build ID |
| `tag` | คีย์เวอร์ชันที่ไม่ซ้ำกัน (เช่น `"1.0.3"`) |
| `date` | วันที่อัปเดต |
| `title` | ชื่อที่มนุษย์อ่านได้ |
| `summary` | จำนวน: `{ added, removed, changed }` |
| `features` / `fixes` / `api_changes` | บันทึกรุ่นเผยแพร่ที่คัดสรรด้วยตนเอง โดยจะถูกเก็บไว้เมื่อ `diff_data.py` สร้างแท็กเดิมใหม่ - diff ข้อมูลจะถูกเขียนทับ แต่อาร์เรย์เหล่านี้จะถูกรวมเข้าด้วยกัน |
| `categories` | Diff แยกตามหมวดหมู่พร้อมเอนทิตีที่เพิ่ม/ลบ/เปลี่ยนแปลง การเปลี่ยนแปลงฟิลด์จะไล่ลงไปใน dict/list ที่ซ้อนกัน เพื่อให้แต่ละ leaf เป็นแถวของตัวเอง (เช่น `vars.DamageVar: 8 → 10`) แทน `vars: 2 fields → 2 fields` ที่ไม่แสดงรายละเอียด |

### การเก็บรักษาแบบเขียนครั้งเดียว

ไฟล์ภายใต้ `data/changelogs/` เป็นบันทึกประวัติแบบเขียนครั้งเดียว `.github/workflows/changelog-guard.yml` จะบล็อก PR ใด ๆ ที่ **แก้ไขหรือลบ** บันทึกการเปลี่ยนแปลงที่มีอยู่ อนุญาตไฟล์ใหม่ (`A`) เสมอ ส่วนการแก้ไขต้องมีป้ายกำกับ `changelog-edit-approved` บน PR ดูนโยบายและเวิร์กโฟลว์การใช้ข้อยกเว้นได้ที่ `CONTRIBUTING.md → Changelog Retention`

### ประวัติรายเอนทิตี

`GET /api/history/{entity_type}/{entity_id}` จะไล่ตรวจบันทึกการเปลี่ยนแปลงทุกไฟล์และส่งคืนรายการที่กระทบเอนทิตีที่ร้องขอ โดยเรียงจากใหม่สุด แถบประวัติเวอร์ชันในหน้ารายละเอียดทุกหน้า (`/cards/{id}`, `/monsters/{id}` ฯลฯ) ใช้ข้อมูลจากเอนด์พอยต์นี้

## การดีพลอย

### CI/CD (GitHub Actions)

การพุชไปยัง `main` จะทริกเกอร์ `.github/workflows/ci.yml` บน Kubernetes runner ที่โฮสต์เอง เวิร์กโฟลว์จะสแกนข้อมูลลับ ตรวจสอบ ESLint และ TypeScript ตรวจสอบ lint และการจัดรูปแบบด้วย ruff จากนั้นบิลด์และพุชอิมเมจ stable ภายใต้ `:latest` นอกจากนี้ยังคงบิลด์อิมเมจ beta แบบแยกภายใต้ `:beta` สำหรับ `docker-compose.beta.yml`; อิมเมจเหล่านั้นยังคงเก็บไว้เพื่อการปฏิบัติงาน แต่หน้า public beta ให้บริการโดยดีพลอยเมนต์หลักที่ `/beta`

ฟรอนต์เอนด์ stable ได้รับ `UMAMI_WEBSITE_ID` อิมเมจ beta แบบแยกได้รับ `UMAMI_BETA_WEBSITE_ID` แม้ว่าทราฟฟิกสาธารณะ `/beta` จะใช้ฟรอนต์เอนด์ stable และพร็อพเพอร์ตีการวิเคราะห์ของฟรอนต์เอนด์นั้น

CI **ไม่** ทำการดีพลอย งาน autodeploy รายชั่วโมงบนโฮสต์ DigitalOcean เป็นผู้จัดการการดีพลอย

> **หมายเหตุ:** `.forgejo/workflows/build.yml` ถูกเก็บไว้เป็นทางเลือกสำรองแบบ buildah ที่ไม่ได้ใช้งาน

### บิลด์ + พุชในเครื่อง

ข้าม CI และพุชโดยตรงจากเครื่องของคุณ:

```bash
# บิลด์และพุชอิมเมจทั้งสอง:
python3 tools/deploy.py

# เฉพาะฟรอนต์เอนด์:
python3 tools/deploy.py --frontend

# เฉพาะแบ็กเอนด์:
python3 tools/deploy.py --backend

# ทดสอบบิลด์โดยไม่พุช:
python3 tools/deploy.py --no-push

# ติดแท็กรุ่นเผยแพร่:
python3 tools/deploy.py --tag v0.98.2

# บิลด์และพุชอิมเมจ beta (แท็ก :beta, ข้าม IndexNow):
python3 tools/deploy.py --beta
```

ตรวจหา Apple Silicon โดยอัตโนมัติและคอมไพล์ข้ามแพลตฟอร์มเป็น `linux/amd64` ผ่าน `docker buildx` ต้องรัน `docker login` ก่อน

### โปรดักชัน

แอปพลิเคชันสาธารณะและสแตก beta แบบแยกที่เก็บไว้ทำงานบนโฮสต์ DigitalOcean เดียวกัน ทราฟฟิกสาธารณะใช้ `spire-codex.com`; โฮสต์ Lightsail รองทำงาน MongoDB

**Autodeploy** - cron รายชั่วโมงบนโฮสต์ DigitalOcean รัน `/usr/local/bin/spire-codex-autodeploy` ตอนนาทีที่ :03 เมื่อคอมมิตที่ checkout ไว้เลื่อนไปข้างหน้า ระบบจะ pull และสร้างทั้ง `docker-compose.prod.yml` และ `docker-compose.beta.yml` ใหม่ ยกเว้นการอัปเดตที่จำกัดอยู่ใน `data/news/*` จากนั้นจะล้างแคช Cloudflare บันทึกถูกเขียนไปยัง `/var/log/spire-codex-autodeploy.log` ดูการติดตั้งและการปฏิบัติงานได้ที่ [`infrastructure/ansible/README.md`](infrastructure/ansible/README.md)

**ดีพลอยด้วยตนเอง**:

```bash
cd infrastructure/ansible
./bin/do-ansible playbooks/deploy.yml

# สแตก beta แบบแยกที่เก็บไว้
./bin/do-ansible playbooks/deploy.yml -e compose_file=docker-compose.beta.yml
```

ข้อมูลโปรดักชันถูก bind mount (`./data:/data:ro` สำหรับฟรอนต์เอนด์ และอ่าน-เขียนสำหรับแบ็กเอนด์) สถานะข่าวและการเล่นจะถูกอ่านจากข้อมูลที่ mount ไว้เมื่อมีคำขอ ดังนั้นการอัปเดต `data/news/*.json` จึงไม่ต้องรีสตาร์ตคอนเทนเนอร์

### ช่อง Beta (spire-codex.com/beta)

แอปพลิเคชันสาธารณะให้บริการข้อมูล stable และ Steam `public-beta` เป็นสองช่องเนื้อหา หน้า Beta อยู่ที่ [`spire-codex.com/beta`](https://spire-codex.com/beta) พร้อมเส้นทางที่แปลภาษาแล้วที่ `/{lang}/beta/...` หน้า `/images` หลักยังเปิดให้เข้าถึงแอสเซต beta เวอร์ชันที่เก็บถาวรด้วย

`beta.spire-codex.com` เลิกใช้งานสาธารณะแล้ว ปัจจุบัน Cloudflare ส่ง `302` โดยคงพาธไปยังโดเมนหลัก แต่ไม่ได้เพิ่ม `/beta` หรือ `channel=beta` ดังนั้นลิงก์หน้าเก่าจะไปยังหน้า stable ที่ตรงกัน และคำขอ API เก่าจะได้รับข้อมูล stable หลังติดตามการเปลี่ยนเส้นทาง ไคลเอนต์ API ใหม่ต้องใช้ API หลักพร้อมระบุช่องอย่างชัดเจน เช่น `https://spire-codex.com/api/cards?channel=beta`

**สถาปัตยกรรม**: `get_channel` แปลง `?channel=beta|stable` เป็น Python `ContextVar`; และยังเข้าใจส่วนหัวโฮสต์ `beta.*` สำหรับทราฟฟิกตรงไปยัง origin ด้วย `data_service.py` โหลดคำขอ beta จาก `data-beta/<latest>/` และย้อนกลับไปใช้ stable แยกตามไฟล์ `GET /api/beta/diff` และ `GET /api/beta/version` อธิบาย beta ที่ใช้งานอยู่ และฟรอนต์เอนด์เรนเดอร์ช่องที่เลือกภายใต้ `/beta`

สแตก `docker-compose.beta.yml` และอิมเมจ `:beta` แยกต่างหากยังคงถูกบิลด์และสร้างใหม่โดยระบบอัตโนมัติในการดีพลอย แต่ไม่ใช่เว็บไซต์ public beta ขณะที่การเปลี่ยนเส้นทาง Cloudflare ยังทำงานอยู่

**รูปแบบข้อมูล**: แต่ละบิลด์ที่เก็บถาวรอยู่ภายใต้ `data-beta/<version>/` และตัวชี้ `latest` เลือกบิลด์ที่ใช้งานอยู่ แต่ละเวอร์ชันมีไดเรกทอรี `changelogs/` ของตนเอง คลังรูปภาพ Beta ใช้โครงสร้างเดียวกันที่ `backend/static/images/beta/<version>/{cards,monsters,misc,ui,vfx}/`

**การนำเข้าอัตโนมัติ** - `tools/beta-watch/` ทำงานเป็นงาน launchd บน Mac สำหรับพัฒนาในวันพฤหัสบดี ตั้งแต่ 15:00 ถึง 22:45 ทุก 15 นาที เมื่อ SteamCMD รายงาน build ID ใหม่ของ `public-beta` ระบบจะแยกและถอดรหัสเกม แยกวิเคราะห์ทุกภาษา สร้าง diff ซิงค์รูปภาพแยกเวอร์ชัน และเปิด PR `auto/beta-<version>` ดูการติดตั้งและการปฏิบัติงานได้ที่ [`tools/beta-watch/README.md`](tools/beta-watch/README.md)

**การนำเข้าด้วยตนเอง**:

```bash
VERSION=vX.Y.Z
PREVIOUS=vA.B.C

# แยกและถอดรหัสไฟล์เกม beta ก่อน จากนั้นแยกวิเคราะห์จากรากของรีโพ
(cd backend/app/parsers && \
  EXTRACTION_DIR=../../../extraction/beta \
  DATA_DIR="../../../data-beta/$VERSION" \
  python3 parse_all.py)

VERSION="$VERSION" tools/beta-watch/sync-images.sh

python3 tools/diff_data.py "data-beta/$PREVIOUS/eng" "data-beta/$VERSION/eng" \
  --format json --output-dir "data-beta/$VERSION/changelogs" \
  --game-version "${VERSION#v}" --title "Beta ${VERSION#v}"
```

`sync-images.sh` อัปเดต symlink รูปภาพ `latest` PR การนำเข้าจะมีการเปลี่ยนแปลงข้อมูลและรูปภาพแบบแยกเวอร์ชัน หลัง merge แล้ว autodeploy จะรีเฟรชสแตกที่เก็บไว้ทั้งสองรายการ

## ตัวเรนเดอร์ Spine

สไปรต์มอนสเตอร์ใน StS2 เป็นแอนิเมชันโครงกระดูก [Spine](http://esotericsoftware.com/) - มอนสเตอร์แต่ละตัวประกอบด้วย `.skel` (โครงกระดูกไบนารี) + `.atlas` + สไปรต์ชีต `.png` ไม่ใช่รูปภาพเดียว ตัวเรนเดอร์จะประกอบไฟล์เหล่านี้เป็นภาพเหมือน PNG แบบภาพนิ่ง

### ตัวเรนเดอร์ WebGL (ปัจจุบัน)

ตัวเรนเดอร์ WebGL (`render_webgl.mjs`, `render_all_webgl.mjs`) ใช้ **Playwright + spine-webgl** เพื่อเรนเดอร์โครงกระดูกผ่าน GPU ของ Chrome แบบ headless ซึ่งให้ภาพเรนเดอร์ที่สะอาดและ **ไม่มีรอยต่อสามเหลี่ยม**

**วิธีการทำงาน:**
1. เปิด Chrome แบบ headless ผ่าน Playwright โดยเปิดใช้ WebGL
2. โหลดข้อมูลโครงกระดูก + atlas + เท็กซ์เจอร์เป็น base64 เข้าในหน้าเบราว์เซอร์
3. สร้าง canvas WebGL และตั้งค่า shader + polygon batcher ของ spine-webgl
4. ใช้แอนิเมชัน idle และคำนวณขอบเขต (ไม่รวมสล็อตเงา/พื้น)
5. เรนเดอร์ผ่านการแรสเตอร์สามเหลี่ยมด้วย GPU - ไม่มีพาธ clip ของ canvas และไม่มีรอยต่อ
6. อ่านพิกเซลดิบผ่าน `gl.readPixels` และพลิกแนวตั้ง (WebGL เรียงจากล่างขึ้นบน)
7. เขียน PNG ผ่าน node-canvas เพื่อรักษาความโปร่งใส

**โครงกระดูกเดียว:**
```bash
node render_webgl.mjs <skel_dir> <output_path> [size]
node render_webgl.mjs ../../extraction/raw/animations/backgrounds/neow_room ../../backend/static/images/misc/neow.png 2048
```

**โครงกระดูกทั้งหมดแบบชุด:**
```bash
node render_all_webgl.mjs  # เรนเดอร์โครงกระดูก 138 ชุดไปยัง backend/static/images/renders/
```

### ความครอบคลุมของการเรนเดอร์

| หมวดหมู่ | เรนเดอร์แล้ว | ทั้งหมด | หมายเหตุ |
|---|---|---|---|
| มอนสเตอร์ | 99 | 103 ไดเรกทอรี | มอนสเตอร์ทั้ง 111 ตัวในเกมมีรูปภาพ (เรนเดอร์ 99 + นามแฝง/ภาพนิ่ง) |
| ตัวละคร | 16 | 16 | ท่าต่อสู้ จุดพัก และท่าเลือก |
| ฉากหลัง/NPC | 14 | 17 | Neow, Tezcatara, ห้องพ่อค้า, เมนูหลัก |
| VFX/UI | 9 | 22 | VFX ส่วนใหญ่ต้องใช้เฟรมแอนิเมชันเฉพาะ |
| **รวม** | **138** | **158** | ข้าม 20 รายการ (ไม่มี atlas, มีเฉพาะ VFX, ว่างเปล่า) |

### ตัวเรนเดอร์แอนิเมชัน

ตัวเรนเดอร์แอนิเมชัน (`render_gif.mjs`) เรนเดอร์แอนิเมชัน idle/attack ของ Spine เป็น WebP, GIF หรือ APNG แบบเคลื่อนไหว รองรับตัวแปรสกิน การเลือกแอนิเมชัน และการสตรีมเฟรมลงดิสก์สำหรับแอนิเมชันขนาดใหญ่

**รูปแบบเอาต์พุตที่รองรับ:**
- **`.webp`** (แนะนำ) - WebP แบบเคลื่อนไหวที่ไม่สูญเสียคุณภาพ พร้อม alpha เต็มรูปแบบ และเล็กกว่า APNG ประมาณ 33% สตรีมเฟรมลงดิสก์เพื่อป้องกัน OOM
- **`.gif`** - 256 สี ความโปร่งใสแบบไบนารี ไฟล์เล็กที่สุดแต่คุณภาพต่ำสุด
- **`.apng`** - alpha เต็มรูปแบบเช่นเดียวกับ WebP แต่ไฟล์ใหญ่กว่า

```bash
# เรนเดอร์ WebP แบบเคลื่อนไหวที่ไม่สูญเสียคุณภาพ (แนะนำ)
NODE_OPTIONS="--max-old-space-size=8192" node render_gif.mjs <skel_dir> <output.webp> [size] [--fps=N]

# พร้อมตัวแปรสกิน (สำหรับ bowlbug, cultists, cubex ฯลฯ)
node render_gif.mjs <skel_dir> output.webp 256 --fps=10 --skin=rock

# แอนิเมชันเฉพาะ (ค่าเริ่มต้น: วนลูป idle)
node render_gif.mjs <skel_dir> output.webp 256 --fps=12 --anim=attack

# โหมดภาพเงาสีขาว (สำหรับไอคอนโหนดแผนที่บอส)
node render_gif.mjs <skel_dir> output.webp 256 --white
```

**ไลบรารีแอนิเมชัน:** WebP แบบเคลื่อนไหวที่ไม่สูญเสียคุณภาพ 209 รายการ:
- แอนิเมชันตัวละคร 15 รายการ (ต่อสู้/เลือก/พัก × ตัวละคร 5 ตัว) ที่ 512×512
- แอนิเมชัน idle ของมอนสเตอร์ 103 รายการที่ 256×256
- แอนิเมชันโจมตีของมอนสเตอร์ 91 รายการที่ 256×256

**ตัวแปรสกิน:** มอนสเตอร์ 13 ตัวมีตัวแปรสกิน (bowlbug, cubex_construct, cultists ฯลฯ) ใช้ `--skin=` เพื่อเลือก สกินเริ่มต้นมักแสดงเฉพาะโครงกระดูกฐานโดยไม่มีลำตัว

**Shader โหนดแผนที่บอส:** เกมใช้ `boss_map_point.gdshader` ซึ่งใช้ช่อง RGB เป็นมาสก์:
- **ช่องสีแดง** × `map_color` (ค่าเริ่มต้น: สีเบจ `0.671, 0.58, 0.478`) → สีเติม
- **ช่องสีน้ำเงิน** × `black_layer_color` (ค่าเริ่มต้น: สีดำ `0, 0, 0`) → สีเส้นขอบ
- **ช่องสีเขียว** × สีขาว `1, 1, 1` → ไฮไลต์

### ตัวเรนเดอร์ Canvas รุ่นเก่า

ตัวเรนเดอร์ canvas (`render.mjs`, `render_all.mjs`) ใช้ `spine-canvas` พร้อม `triangleRendering = true` ซึ่งทำให้เกิด **อาร์ติแฟกต์เมชโครงลวดที่มองเห็นได้** เนื่องจากการลดรอยหยักของพาธ `clip()` ใน canvas ระหว่างสามเหลี่ยมที่อยู่ติดกัน ให้ใช้ตัวเรนเดอร์ WebGL แทน

### การพึ่งพา

- `@esotericsoftware/spine-webgl` ^4.2.107 - รันไทม์ Spine สำหรับ WebGL (ปัจจุบัน)
- `playwright` - Chrome แบบ headless สำหรับการเรนเดอร์ WebGL
- `gif-encoder-2` - การเข้ารหัส GIF สำหรับตัวเรนเดอร์แอนิเมชัน
- `canvas` ^3.1.0 - การใช้งาน Canvas ของ Node.js (เฟรมบัฟเฟอร์สำหรับตัวเรนเดอร์แอนิเมชัน)
- `Pillow` (Python) - ประกอบ WebP/APNG จากเฟรม PNG ที่เรนเดอร์แล้ว
- `@esotericsoftware/spine-canvas` ^4.2.106 - รันไทม์ Spine สำหรับ Canvas (รุ่นเก่า)

## การแยกไฟล์เกม

หากคุณต้องการแยกไฟล์ใหม่ตั้งแต่ต้น:

```bash
# แยก PCK (GDRE Tools)
/path/to/gdre_tools --headless --recover="/path/to/sts2.pck" --output-dir=extraction/raw

# ถอดรหัส DLL (ILSpy CLI)
ilspycmd -p -o extraction/decompiled "/path/to/sts2.dll"
```

ตำแหน่งติดตั้ง Steam:
- **Windows**: `C:\Program Files (x86)\Steam\steamapps\common\Slay the Spire 2\`
- **macOS**: `~/Library/Application Support/Steam/steamapps/common/Slay the Spire 2/`
- **Linux**: `~/.local/share/Steam/steamapps/common/Slay the Spire 2/`

## การกำหนดเวอร์ชัน

Spire Codex ใช้การกำหนดเวอร์ชันเชิงความหมายแบบ **`1.X.Y`**:

| ส่วน | ความหมาย |
|---------|---------|
| **1** | เวอร์ชันหลักของ Spire Codex (คงเดิม เว้นแต่จะเขียนใหม่ทั้งหมด) |
| **X** | เพิ่มเมื่อ Mega Crit เผยแพร่แพตช์เกม |
| **Y** | เพิ่มสำหรับการแก้ไขและปรับปรุงตัวแยกวิเคราะห์/ฟรอนต์เอนด์ของเราเอง |

ตัวอย่าง: `v1.0.0` = รุ่นเผยแพร่เริ่มต้น, `v1.0.1` = การแก้บั๊กของเรา, `v1.1.0` = รวมแพตช์แรกจาก Mega Crit

## SEO

- **ข้อมูลแบบมีโครงสร้าง (JSON-LD)**: WebSite + VideoGame (หน้าหลัก), CollectionPage + ItemList (หน้ารายการ), Article + BreadcrumbList + FAQPage (หน้ารายละเอียด), SoftwareApplication (นักพัฒนา), NewsArticle (news/[gid])
- **รูปแบบชื่อเรื่อง**: `"Slay the Spire 2 (sts2) {Page Title} | Spire Codex"` - กำหนดมาตรฐานในทุกหน้า การเล่นใช้ `"{username} - {char} - Ascension {N} {win/loss} - Slay the Spire 2 (sts2) | Spire Codex"` วาง "(sts2)" ไว้ในบรรทัดเพื่อให้ตรงกับคำค้นข้ามภาษา `sts2 tier list` / `sts2 card list`
- **Sitemap**: XML แบบแบนที่ `/sitemap.xml` พร้อม `force-dynamic` (เรนเดอร์ฝั่งเซิร์ฟเวอร์ ไม่ใช่ขณะบิลด์) มี URL มากกว่า 20,000 รายการ รวมถึงหน้ารายละเอียดเอนทิตี หน้าตารางการเรียกดู หน้ารายการจัดอันดับ วิธีการให้คะแนน รายละเอียด runs/[hash] และมิเรอร์ i18n สำหรับเอนทิตีทุกประเภท
- **SEO ระหว่างประเทศ**: เส้นทาง `/{lang}/` สำหรับ 14 ภาษาที่ไม่ใช่ภาษาอังกฤษ พร้อม hreflang alternate แบบ **สองทิศทาง** - หน้ารากภาษาอังกฤษยังส่ง alternate สำหรับทุก locale + `x-default` ผ่าน `buildLanguageAlternates(path)` ใน `lib/seo.ts` (แก้คลัสเตอร์เนื้อหาซ้ำ "Crawled - not indexed" ใน GSC ซึ่ง Google มองหน้าที่แปลภาษาแล้วเป็นหน้าซ้ำเนื่องจากไม่มีการอ้างอิงย้อนกลับ)
- **SEO แบบโปรแกรม**: หน้าเรียกดูการ์ด 41 หน้าที่ `/cards/browse/` (rare-attacks, ironclad-skills ฯลฯ) + หน้ารายการจัดอันดับ 3 หน้า (`/tier-list/{cards,relics,potions}`)
- **EntityProse ที่รองรับ locale**: หน้ารายละเอียดเรนเดอร์ย่อหน้าสั้น ๆ ที่เฉพาะเจาะจงต่อ locale แทนเนื้อหาภาษาอังกฤษที่เหมือนกันในทุก locale
- **การเชื่อมโยงภายใน**: พลัง ↔ การ์ด, การเผชิญหน้า → มอนสเตอร์, คีย์เวิร์ดการ์ด → หน้าศูนย์รวมคีย์เวิร์ด, ท่ามอนสเตอร์ → หน้าพลัง (พร้อมทูลทิป), หน้าองก์ → การเผชิญหน้า/อีเวนต์, แถวรายการจัดอันดับ → แท็บสถิติในหน้ารายละเอียดเอนทิตี
- **Open Graph และ Twitter Cards**: รูปภาพ OG แยกตามเอนทิตี, Twitter card แบบ `summary_large_image`
- **URL Canonical**: ทุกหน้าประกาศ URL canonical

## วิดเจ็ตแบบฝังได้

### วิดเจ็ตทูลทิป
เพิ่มทูลทิปเมื่อวางเมาส์สำหรับเอนทิตีทั้ง 13 ประเภทลงในเว็บไซต์ใดก็ได้:
```html
<script src="https://spire-codex.com/widget/spire-codex-tooltip.js"></script>
<p>Start with [[Bash]] and [[relic:Burning Blood]].</p>
```

### วิดเจ็ตบันทึกการเปลี่ยนแปลง
ฝังตัวดูบันทึกการเปลี่ยนแปลงแบบโต้ตอบ:
```html
<div id="scx-changelog"></div>
<script src="https://spire-codex.com/widget/spire-codex-changelog.js"></script>
```

เอกสารฉบับเต็ม: [spire-codex.com/developers](https://spire-codex.com/developers)

## แผนงาน

- ~~หน้ารายละเอียดแยก~~ ✅
- ~~การค้นหาทั่วทั้งระบบ~~ ✅
- ~~รองรับหลายภาษา (15 ภาษา)~~ ✅
- ~~SEO (JSON-LD, OG/Twitter, sitemap, hreflang)~~ ✅
- ~~วิดเจ็ตทูลทิป (เอนทิตีทั้ง 13 ประเภท)~~ ✅
- ~~หน้าเปรียบเทียบตัวละคร (10 คู่)~~ ✅
- ~~หน้าศูนย์รวมคีย์เวิร์ด~~ ✅
- ~~คู่มือพ่อค้า (ราคาจาก C# ที่ถอดรหัสแล้ว)~~ ✅
- ~~เอกสารนักพัฒนา + การส่งออกข้อมูล~~ ✅
- ~~SEO ระหว่างประเทศ (หน้าแรก 13 ภาษา)~~ ✅
- ~~ตารางเรียกดูการ์ด (หน้า SEO แบบโปรแกรม 41 หน้า)~~ ✅
- ~~คู่มือจากชุมชน~~ ✅ - Markdown พร้อม YAML frontmatter, แบบฟอร์มส่ง, วิดเจ็ตทูลทิป และโซเชียลของผู้เขียน
- ~~หน้ากลไกเกม~~ ✅ - หน้า SEO แยก 27 หน้า: อัตราดรอป การต่อสู้ แผนที่ บอส ความลับและเกร็ดความรู้
- ~~การเล่นจากชุมชน~~ ✅ - การส่งการเล่น เบราว์เซอร์ การเล่นที่แชร์ และสถิติสด
- ~~คำอธิบายการอัปเกรดการ์ด~~ ✅ - upgrade_description สำหรับการ์ดที่อัปเกรดได้ทั้ง 403 ใบ
- ~~พลังติดตัวของมอนสเตอร์~~ ✅ - มอนสเตอร์ 42 ตัวพร้อมพลังจาก AfterAddedToRoom
- ~~เงื่อนไขปลดล็อกความสำเร็จ~~ ✅ - หมวดหมู่ ตัวละคร และเกณฑ์จากซอร์ส C#
- ~~รูปแบบการโจมตีของมอนสเตอร์~~ ✅ - มอนสเตอร์ 112 ตัวพร้อม AI แบบวนรอบ/สุ่ม/มีเงื่อนไข/ผสมจากสเตตแมชชีน C#
- ~~เงื่อนไขเบื้องต้นของอีเวนต์~~ ✅ - อีเวนต์ 25 รายการพร้อมเงื่อนไข IsAllowed() ที่แยกวิเคราะห์จากซอร์ส C#
- ~~การเก็บรักษาคลัง Beta~~ ✅ - เก็บข้อมูลและรูปภาพ beta แบบแยกเวอร์ชันไว้; `/beta` ให้บริการบิลด์ที่ใช้งานอยู่ และ `/images` ใช้เรียกดูแอสเซตที่เก็บถาวร
- ~~บอต Discord~~ ✅ - [Knowledge Demon](https://bot.spire-codex.com): คำสั่ง slash สำหรับทุกเอนทิตี (`/card`, `/relic`, `/monster`, `/potion`, `/character`, `/event`, `/power`, `/enchantment`, `/lookup`, `/meta`), RSS ข่าว Steam และชุดเครื่องมือดูแลเต็มรูปแบบที่ fork จาก [Kernel](https://github.com/ptrlrd/kernel)
- ~~Codex Score และรายการจัดอันดับ~~ ✅ - เกรดรายเอนทิตีที่คำนวณจากการเล่นของชุมชนด้วย **Bayesian shrinkage**: `shrunk = (wins + PRIOR_WEIGHT × baseline) / (n + PRIOR_WEIGHT)` จากนั้นปรับสเกลเป็น 0–100 และแมปเป็น S/A/B/C/D/F ป้องกันสัญญาณรบกวนจากตัวอย่างขนาดเล็ก (การ์ดที่เล่น 1 เกมและชนะ 1/1 จะไม่ได้ S - คะแนนจะถอยกลับไปหา prior) อุ่นแคชล่วงหน้าเมื่อแบ็กเอนด์เริ่มทำงาน แสดงเป็น `ScoreBadge` ในแท็บสถิติของหน้ารายละเอียด หน้ารายการจัดอันดับเฉพาะ และหน้าวิธีการที่ `/leaderboards/scoring`
- ~~แท็บสถิติในหน้ารายละเอียด~~ ✅ - ตราคะแนนเด่น + สรุปแบบร้อยแก้ว + ลิงก์การเล่นล่าสุดผ่าน `EntityRunStats`
- **เครื่องมือสร้างเด็ค** - การวางแผนเด็คเชิงทฤษฎีแบบโต้ตอบ
- **แบ็กเอนด์ฐานข้อมูล** - แทนการโหลด JSON แยกตามภาษาด้วย PostgreSQL JSONB (หรือทางเลือกอื่น) พื้นที่จัดเก็บการส่งการเล่นย้ายจาก SQLite ไปยัง MongoDB แล้ว (พฤษภาคม 2026)

## กิตติกรรมประกาศ

ขอขอบคุณ **vesper-arch**, **terracubist**, **U77654**, **Purple Aspired Dreaming**, **Kobaru** และ **Severi** สำหรับการทดสอบ QA รายงานบั๊ก และการมีส่วนร่วม รายชื่อผู้สนับสนุนทั้งหมด - รวมถึงผู้บริจาค Ko-fi ที่ช่วยให้โครงการดำเนินต่อไปได้ - อยู่ที่ [spire-codex.com/thank-you](https://spire-codex.com/thank-you)

## เทคโนโลยีที่ใช้

- **แบ็กเอนด์**: Python, FastAPI, Pydantic, slowapi, การบีบอัด GZip
- **ฐานข้อมูลการเล่น**: MongoDB (สถิติชุมชน, กระดานผู้นำ, บัญชีผู้ใช้) พร้อมคอลเลกชัน `stats_summary` แบบ materialized และตัวรีเฟรชเบื้องหลังที่เลือกผู้นำ เก็บพาธ SQLite รุ่นเก่าไว้เป็นทางเลือกสำรองออฟไลน์
- **บัญชี**: Steam OpenID + Discord OAuth, คุกกี้เซสชัน JWT
- **ฟรอนต์เอนด์**: Next.js 16 (App Router), TypeScript, Tailwind CSS, รองรับ 15 ภาษา
- **รูปภาพ/CDN**: Cloudflare R2 ให้บริการผ่าน `cdn.spire-codex.com` (webp)
- **การวิเคราะห์และการสังเกตการณ์**: Umami ที่โฮสต์เอง, Prometheus + node-exporter
- **ตัวเรนเดอร์ Spine**: Node.js, Playwright, @esotericsoftware/spine-webgl (WebGL ผ่าน Chrome แบบ headless)
- **โครงสร้างพื้นฐาน**: Docker, GitHub Actions CI (runner ที่โฮสต์เอง) พร้อมแคช BuildKit ที่ใช้ registry, การดีพลอยด้วย Ansible/SSH
- **เครื่องมือ**: Python (ไปป์ไลน์อัปเดต, การเปรียบเทียบ diff ของบันทึกการเปลี่ยนแปลง, การคัดลอกรูปภาพ)

## ใบอนุญาต

- **ซอร์สโค้ด**: [PolyForm Noncommercial 1.0.0](LICENSE.md) - ใช้งาน แก้ไข และเผยแพร่ต่อได้ฟรีสำหรับวัตถุประสงค์ที่ไม่ใช่เชิงพาณิชย์ ไม่อนุญาตให้จำหน่ายซอฟต์แวร์
- **API ที่โฮสต์ไว้**: [API_TERMS.md](API_TERMS.md) - ใช้งานได้ฟรีสำหรับทุกวัตถุประสงค์ภายในขีดจำกัดอัตราที่เผยแพร่ไว้ หากต้องการมากกว่านี้ โปรดติดต่อผ่าน Discord หรือ issue
- **ข้อมูลเกม** (การ์ด รีลิก มอนสเตอร์ ฯลฯ): © Mega Crit Games ให้บริการที่นี่เป็นข้อมูลอ้างอิงสำหรับชุมชนภายใต้เงื่อนไขการใช้งานโดยชอบธรรม / เพื่อการศึกษา ห้ามใช้ข้อมูลนี้เพื่อคอมไพล์ใหม่ จัดแพ็กเกจใหม่ หรือเผยแพร่เกมต่อ

การมีส่วนร่วมได้รับการยอมรับภายใต้เงื่อนไข PolyForm Noncommercial 1.0.0 เดียวกัน - ดู [CONTRIBUTING.md](CONTRIBUTING.md#license)
