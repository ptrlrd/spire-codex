<p align="center">
  <img src="frontend/public/spire-codex-white-silent-black-background.png" alt="Spire Codex logosu" width="200" />
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

Oyun dosyalarının tersine mühendisliğiyle oluşturulmuş, **Slay the Spire 2** oyun verileri için kapsamlı bir veritabanı ve API. Oyunla birlikte sunulan **15 dilin** tamamını destekler.

**Canlı site**: [spire-codex.com](https://spire-codex.com)

**Steam Uygulama Kimliği**: 2868840

## Nasıl Oluşturuldu?

Slay the Spire 2, Godot 4 ile oluşturulmuştur ancak tüm oyun mantığı GDScript'te değil, bir C#/.NET 8 DLL'sinde (`sts2.dll`) bulunur. Veri işlem hattı:

1. **PCK Çıkarma** - [GDRE Tools](https://github.com/bruvzg/gdsdecomp), görselleri, Spine animasyonlarını ve yerelleştirme verilerini kurtarmak için Godot `.pck` dosyasını çıkarır (~9.947 dosya).

2. **DLL Tersine Derleme** - [ILSpy](https://github.com/icsharpcode/ILSpy), `sts2.dll` dosyasını tüm oyun modellerini içeren, okunabilir yaklaşık 3.300 C# kaynak dosyasına dönüştürür.

3. **Veri Ayrıştırma** - Düzenli ifade tabanlı 22 Python ayrıştırıcısı, tersine derlenmiş C# kaynağından yapılandırılmış verileri çıkararak `data/{lang}/` dizinine dil başına JSON çıktısı verir:
   - **Kartlar**: İstatistikler için `base(cost, CardType, CardRarity, TargetType)` oluşturucuları + `DamageVar`, `BlockVar`, `PowerVar<T>`
   - **Karakterler**: `StartingHp`, `StartingGold`, `MaxEnergy`, `StartingDeck`, `StartingRelics`
   - **Kalıntılar/İksirler**: Nadirlik, havuz ve SmartFormat şablonlarından çözümlenen açıklamalar
   - **Canavarlar**: Can aralıkları, `AscensionHelper` aracılığıyla yükseliş ölçeklendirmesi, hamle başına niyetleri (Attack/Defend/Buff/Debuff/Status/Summon/Heal), hasar değerlerini, çoklu vuruş sayılarını (`AscensionHelper` kalıpları dâhil), `AfterAddedToRoom` kaynaklı doğuştan güçleri (yükseliş varyantları bulunan 42 canavar), hamle başına uygulanan güçleri (`PowerCmd.Apply<T>` üzerinden hedef + miktar), bloğu, iyileştirmeyi, karşılaşma bağlamını (perde, oda türü) içeren hamle durum makineleri, `GenerateMoveStateMachine()` üzerinden ayrıştırılan **saldırı kalıpları** (112 canavar - döngüsel, rastgele, koşullu, karma)
   - **Büyüler**: Kart türü kısıtlamaları, biriktirilebilirlik, Amount tabanlı ölçeklendirme
   - **Karşılaşmalar**: Canavar bileşimleri, oda türü (Boss/Elite/Monster), perde yerleşimi, etiketler
   - **Etkinlikler**: Çok sayfalı karar ağaçları (66 etkinliğin 56'sı), sonuçlarıyla birlikte seçenekler, perde yerleşimi, görünen adlara çözümlenen `StringVar` model başvuruları, çalışma zamanında hesaplanan değerler (`GetDecipherCost()` aracılığıyla artan maliyetler, `NextInt`/`NextFloat` ile `CalculateVars` aracılığıyla altın aralıkları, tamamen iyileştirme kalıpları), `IsAllowed()` kaynaklı **ön koşullar** (25 etkinlik - altın, can, perde, deste, kalıntı ve iksir koşulları)
   - **Kadimler**: Sıfatları, karaktere özgü diyalogları, kalıntı teklifleri ve portre simgeleriyle 8 Kadim NPC
   - **Güçler**: PowerType (Buff/Debuff), PowerStackType (Counter/Single), DynamicVars, açıklamalar
   - **Çağlar/Hikâyeler**: Kilit açma gereksinimleriyle zaman çizelgesi ilerleme verileri
   - **Küreler**: Pasif/Tetikleme değerleri, açıklamalar
   - **Musibetler**: Biriktirilebilirlik, ek kart metni, açıklamalar
   - **Değiştiriciler**: Koşu değiştiricisi açıklamaları
   - **Anahtar Sözcükler**: Kart anahtar sözcüğü tanımları (Exhaust, Ethereal, Innate vb.)
   - **Niyetler**: Simgelerle birlikte canavar niyeti açıklamaları
   - **Başarımlar**: Kilit açma koşulları, açıklamalar, kategoriler, karakter ilişkisi ve C# kaynağından eşikler (33 başarım)
   - **Perdeler**: Boss keşif sırası, karşılaşmalar, etkinlikler, kadimler, oda sayıları
   - **Yükseliş Seviyeleri**: Yerelleştirmeden alınan açıklamalarla 11 seviye (0–10)
   - **İksir Havuzları**: Havuz sınıflarından ve çağ başvurularından ayrıştırılan karaktere özgü havuzlar
   - **Çeviriler**: Ön yüz kullanımı için dil başına filtre eşlemeleri (kart türleri, nadirlikler, anahtar sözcükler → yerelleştirilmiş adlar) ve kullanıcı arayüzü dizeleri (bölüm başlıkları, açıklamalar, karakter adları)

4. **Açıklama Çözümleme** - Paylaşılan `description_resolver.py` modülü, SmartFormat yerelleştirme şablonlarını (`{Damage:diff()}`, `{Energy:energyIcons()}`, `{Cards:plural:card|cards}`) ön yüzde işlenmek üzere zengin metin işaretçileri içeren, insanlar tarafından okunabilir metne dönüştürür. Çalışma zamanında dinamik olan değişkenler (ör. `{Card}`, `{Relic}`), okunabilir yer tutucular olarak korunur. Etkinliklerdeki `StringVar` başvuruları (ör. `{Enchantment1}` → `ModelDb.Enchantment<Sharp>().Title`), yerelleştirme araması aracılığıyla görünen adlara çözümlenir.

5. **Spine İşleme** - Karakterler ve canavarlar statik görseller değil, Spine iskelet animasyonlarıdır. Başsız bir Node.js işleyicisi, boşta durma pozlarını 512×512 portre PNG'leri hâlinde birleştirir. 111 canavarın tamamının görseli vardır: 100'ü Spine iskeletlerinden işlenmiş, 6'sı paylaşılan iskeletlerden diğer adla eşlenmiş (Flyconid→flying_mushrooms, Ovicopter→egg_layer, Crusher/Rocket→kaiser_crab) ve 5'i statik oyun varlıklarından alınmıştır (Doormaker). Ayrıca 5 karakterin tamamını (savaş, dinlenme alanı ve karakter seçme pozları), NPC'leri ve arka planları işler. Dış görünüm tabanlı varyantlar (Cultists, Bowlbugs, Cubex) ayrı ayrı işlenir. Aşağıdaki [Spine İşleyicisi](#spine-işleyicisi) bölümüne bakın.

6. **Görseller** - Oyun varlıklarından çıkarılıp statik dosyalar olarak sunulan kart portreleri, kalıntı/iksir simgeleri, karakter çizimleri, canavar görselleri, Kadim portre simgeleri ve boss karşılaşması simgeleri.

7. **Değişiklik Günlüğü Farklarını Bulma** - Bir fark aracı, oyun sürümleri arasındaki JSON verilerini (git başvuruları veya dizinler aracılığıyla) karşılaştırarak kategori başına eklenen/kaldırılan/değiştirilen varlıkları alan düzeyindeki farklarla izler. Değişiklik günlükleri, Steam oyun sürümü + isteğe bağlı Codex revizyon numarasına göre anahtarlanır.

## Proje Yapısı

```
spire-codex/
├── backend/                    # FastAPI arka ucu
│   ├── app/
│   │   ├── main.py             # Uygulama girişi, CORS, GZip, hız sınırlama, statik dosyalar
│   │   ├── dependencies.py     # Paylaşılan bağımlılıklar (dil doğrulama, dil adları)
│   │   ├── routers/            # API uç noktaları (25+ yönlendirici)
│   │   ├── models/schemas.py   # Pydantic modelleri
│   │   ├── services/           # JSON veri yükleme (LRU önbellekli, 14 dil desteği)
│   │   └── parsers/            # C# kaynağı → JSON ayrıştırıcıları
│   │       ├── card_parser.py
│   │       ├── character_parser.py
│   │       ├── monster_parser.py
│   │       ├── relic_parser.py
│   │       ├── potion_parser.py
│   │       ├── enchantment_parser.py
│   │       ├── encounter_parser.py
│   │       ├── event_parser.py
│   │       ├── power_parser.py
│   │       ├── keyword_parser.py        # Anahtar sözcükler, niyetler, küreler, musibetler, değiştiriciler, başarımlar (kilit açma koşullarıyla)
│   │       ├── guide_parser.py          # YAML ön bilgili Markdown rehberleri
│   │       ├── epoch_parser.py
│   │       ├── act_parser.py
│   │       ├── ascension_parser.py
│   │       ├── pool_parser.py            # İksirlere karakter havuzu ekler
│   │       ├── translation_parser.py    # Her dil için translations.json oluşturur
│   │       ├── description_resolver.py   # Paylaşılan SmartFormat çözümleyicisi
│   │       ├── parser_paths.py           # Paylaşılan yol yapılandırması (beta için ortam değişkeni geçersiz kılmaları)
│   │       └── parse_all.py              # Tüm ayrıştırıcıları yönetir (15 dil)
│   ├── static/images/          # Oyun görselleri (depoya işlenmez)
│   ├── scripts/copy_images.py  # Görselleri çıkarma dizininden → static dizinine kopyalar
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/                   # Next.js 16 + TypeScript + Tailwind CSS
│   ├── app/
│   │   ├── contexts/           # LanguageContext, BetaVersionContext
│   │   ├── components/         # CardGrid, RichDescription, SearchFilter,
│   │   │                       #   GlobalSearch, Navbar, Footer, LanguageSelector, VersionSelector
│   │   └── ...                 # Sayfalar: cards, characters, relics, monsters, potions,
│   │                           #   enchantments, encounters, events, powers, timeline,
│   │                           #   reference, images, changelog, about, merchant, compare,
│   │                           #   mechanics/[slug], guides/[slug], guides/submit,
│   │                           #   leaderboards, leaderboards/submit, leaderboards/stats,
│   │                           #   runs/[hash] (paylaşılan koşu görünümü)
│   │                           #   Ayrıntı sayfaları: cards/[id], characters/[id], relics/[id],
│   │                           #   monsters/[id], potions/[id], enchantments/[id],
│   │                           #   encounters/[id], events/[id], powers/[id], keywords/[id],
│   │                           #   acts/[id], ascensions/[id], intents/[id], orbs/[id],
│   │                           #   afflictions/[id], modifiers/[id], achievements/[id]
│   │                           #   i18n: [lang]/..., İngilizce dışındaki 14 dil için tüm rotaları yansıtır
│   ├── lib/
│   │   ├── api.ts              # API istemcisi + TypeScript arayüzleri
│   │   ├── fetch-cache.ts      # İstemci tarafı bellek içi fetch önbelleği (5 dk. TTL)
│   │   ├── seo.ts              # Paylaşılan SEO yardımcıları (stripTags, SITE_URL, SITE_NAME)
│   │   ├── jsonld.ts           # JSON-LD şema oluşturucuları (BreadcrumbList, CollectionPage, Article, WebSite, FAQPage)
│   │   ├── ui-translations.ts # İngilizce dışındaki 14 dil için kullanıcı arayüzü dizesi çevirileri
│   │   ├── languages.ts       # i18n yapılandırması - 14 dil kodu, hreflang eşlemeleri
│   │   └── use-lang-prefix.ts # Dile duyarlı URL oluşturma kancası
│   └── Dockerfile
├── tools/
│   ├── spine-renderer/         # Başsız Spine iskelet işleyicisi
│   │   ├── render_webgl.mjs     # WebGL işleyicisi (tek iskelet) - birleşme izi yapıları yok
│   │   ├── render_all_webgl.mjs # WebGL toplu işleyicisi (tüm .skel dosyaları)
│   │   ├── render_gif.mjs      # Animasyon işleyicisi (dış görünüm + animasyon destekli WebP/GIF/APNG)
│   │   ├── render.mjs           # Eski canvas işleyicisi (üçgen birleşme izleri var)
│   │   ├── render_all.mjs       # Eski canvas toplu işleyicisi
│   │   ├── render_skins2.mjs    # Dış görünüm varyantı işleyicisi
│   │   ├── render_utils.mjs     # Paylaşılan canvas işleme yardımcıları
│   │   └── package.json
│   ├── diff_data.py            # Değişiklik günlüğü fark oluşturucusu
│   ├── update.py               # Platformlar arası güncelleme işlem hattı
│   └── deploy.py               # Yerel Docker derlemesi + Docker Hub'a gönderme
├── data/                       # Ayrıştırılmış JSON veri dosyaları
│   ├── {lang}/                 # Dil başına dizinler (eng, kor, jpn, fra vb.)
│   ├── changelogs/             # Değişiklik günlüğü JSON dosyaları (oyun sürümüne göre anahtarlanır)
│   ├── guides/                 # YAML ön bilgili Markdown rehber dosyaları
│   ├── guides.json             # Ayrıştırılmış rehber verileri
│   ├── runs/                   # Gönderilen koşu JSON dosyaları (oyuncu karması başına)
│   └── runs.db                 # Eski SQLite (MongoDB ile değiştirildi; çevrimdışı geri dönüş olarak tutuluyor)
├── extraction/                 # Ham oyun dosyaları (depoya işlenmez)
│   ├── raw/                    # GDRE ile çıkarılmış Godot projesi (kararlı)
│   ├── decompiled/             # ILSpy çıktısı (kararlı)
│   └── beta/                   # Steam beta dalı (raw/ + decompiled/)
├── data-beta/                  # Ayrıştırılmış beta verileri (sürümlü: v0.102.0/, v0.103.0/, latest → sembolik bağlantı)
├── docker-compose.yml          # Yerel geliştirme
├── docker-compose.prod.yml     # Üretim
├── .github/workflows/
│   └── ci.yml                  # GitHub Actions CI: lint, tür denetimi, gizli bilgi taraması, Docker derleme+gönderme, SSH ile dağıtım
└── .forgejo/workflows/
    └── build.yml               # Korunan Forgejo CI geri dönüşü (buildah tabanlı, etkin değil)
```

## Genel Hizmetler

| Sunucu | Amaç |
|---|---|
| [`spire-codex.com`](https://spire-codex.com) | Genel web sitesi ve aynı kaynaklı API. Etkin beta kanalı `/beta` altında bulunur. |
| `cdn.spire-codex.com` | Oyun çizimleri, tam kart işlemeleri, yerelleştirilmiş işlemeler ve arşivlenmiş beta varlıkları için Cloudflare R2 nesne sunucusu. |
| [`bot.spire-codex.com`](https://bot.spire-codex.com) | Knowledge Demon açılış sayfası ve Discord ile kimliği doğrulanmış personel panosu. Bot, ana Codex API'sini kullanır. |
| `analytics.spire-codex.com` | Kendi sunucumuzda barındırılan Umami betiği ve panosu. PostgreSQL veritabanı özel bir Docker ağında kalır. |
| `tierlists.spire-codex.com` | Oluşturulan kademe listesi önizleme görselleri için özel R2 nesne sunucusu. |
| `beta.spire-codex.com` | Kullanımdan kaldırılan genel sunucu. Cloudflare, istekleri ana etki alanındaki aynı yola yönlendirir. |

CDN ve kademe listesi sunucuları, göz atılabilir web siteleri yerine nesne depolarıdır; bu nedenle iki kök dizinde de `404` alınması beklenen bir durumdur.

## Web Sitesi Sayfaları

| Sayfa | Rota | Açıklama |
|---|---|---|
| Ana Sayfa | `/` | Varlık sayıları, kategori kartları ve karakter bağlantıları içeren pano |
| Kartlar | `/cards` | Kalıcı ayrıntı görünümüne sahip, filtrelenebilir kart ızgarası |
| Kart Ayrıntısı | `/cards/[id]` | Tüm kart istatistikleri, yükseltme bilgileri, görsel |
| Karakterler | `/characters` | Karakter genel bakış ızgarası |
| Karakter Ayrıntısı | `/characters/[id]` | İstatistikler, başlangıç destesi/kalıntıları, alıntılar, NPC diyalog ağaçları |
| Kalıntılar | `/relics` | Filtrelenebilir kalıntı ızgarası |
| Kalıntı Ayrıntısı | `/relics/[id]` | Zengin metinli hikâye içeriğiyle tüm kalıntı bilgileri |
| Canavarlar | `/monsters` | Can, hamleler ve Spine işlemeleriyle canavar ızgarası |
| Canavar Ayrıntısı | `/monsters/[id]` | Can, niyet/hasar/güç/blok içeren hamleler, karşılaşma bağlantıları, güç araç ipuçları |
| İksirler | `/potions` | Filtrelenebilir iksir ızgarası (nadirlik, karakter havuzu) |
| İksir Ayrıntısı | `/potions/[id]` | Tüm iksir bilgileri |
| Büyüler | `/enchantments` | Kart türü filtreleriyle büyü listesi |
| Büyü Ayrıntısı | `/enchantments/[id]` | Tüm büyü bilgileri |
| Karşılaşmalar | `/encounters` | Perde/oda türüne göre karşılaşma bileşimleri |
| Karşılaşma Ayrıntısı | `/encounters/[id]` | Canavar dizilimi, oda türü, etiketler |
| Etkinlikler | `/events` | Genişletilebilir seçeneklere sahip çok sayfalı etkinlik ağaçları |
| Etkinlik Ayrıntısı | `/events/[id]` | Tüm etkinlik sayfaları, seçenekler, Kadim diyaloğu |
| Güçler | `/powers` | Güçlendirmeler, zayıflatmalar ve tarafsız güçler |
| Güç Ayrıntısı | `/powers/[id]` | Bu gücü uygulayan kartlarla birlikte güç bilgileri |
| Anahtar Sözcükler | `/keywords` | Kart anahtar sözcüğü listesi |
| Anahtar Sözcük Ayrıntısı | `/keywords/[id]` | Filtrelenebilir kart ızgarasıyla anahtar sözcük açıklaması |
| Tüccar | `/merchant` | Kart/kalıntı/iksir fiyatlandırması, kart kaldırma maliyetleri, sahte tüccar |
| Karşılaştır | `/compare` | Karakter karşılaştırma merkezi (10 çift) |
| Karşılaştırma Ayrıntısı | `/compare/[pair]` | Yan yana karakter karşılaştırması |
| Geliştiriciler | `/developers` | API belgeleri, widget belgeleri, veri dışa aktarımları |
| Vitrin | `/showcase` | Topluluk projeleri galerisi |
| Zaman Çizelgesi | `/timeline` | Çağ gruplaması ve kilit açma gereksinimleriyle çağ ilerlemesi |
| Perde Ayrıntısı | `/acts/[id]` | Bir perde için boss'lar, karşılaşmalar, etkinlikler ve kadimler |
| Yükseliş Ayrıntısı | `/ascensions/[id]` | Önceki/sonraki gezinmesine sahip yükseliş seviyesi açıklaması |
| Niyet Ayrıntısı | `/intents/[id]` | Niyet simgesi, açıklama |
| Küre Ayrıntısı | `/orbs/[id]` | Küre simgesi, pasif/tetikleme açıklaması |
| Musibet Ayrıntısı | `/afflictions/[id]` | Musibet açıklaması, biriktirilebilirlik |
| Değiştirici Ayrıntısı | `/modifiers/[id]` | Koşu değiştiricisi açıklaması |
| Başarım Ayrıntısı | `/achievements/[id]` | Başarım açıklaması |
| Rozetler | `/badges` | Kademeli / tek kademeli / yalnızca çok oyunculu olarak gruplandırılmış 25 koşu sonu rozetinin tamamı |
| Rozet Ayrıntısı | `/badges/[id]` | Kademe başına döküm (Bronz / Gümüş / Altın), galibiyet gereksinimi + çok oyunculu işaretleri, simge |
| Mekanikler | `/mechanics` | Oyun mekanikleri merkezi - ayrı SEO sayfalarına sahip, tıklanabilir 27 bölüm |
| Mekanik Ayrıntısı | `/mechanics/[slug]` | Kart olasılıkları, kalıntı dağılımı, iksir düşürmeleri, harita oluşturma, boss havuzları, savaş, sırlar ve ilginç bilgiler |
| Rehberler | `/guides` | Arama/filtreleme özellikli topluluk strateji rehberleri |
| Rehber Ayrıntısı | `/guides/[slug]` | Markdown işleme + araç ipucu widget'ı içeren tam rehber |
| Rehber Gönder | `/guides/submit` | Rehber gönderme formu (Discord webhook'u) |
| Liderlik Tabloları | `/leaderboards` | Tek oyunculu/eşli ve oyun modu filtrelerine (standard / daily / Today / custom) sahip En Hızlı Galibiyetler ve En Yüksek Yükseliş sıralamaları. Tüm filtre durumu URL'de olduğundan her görünüm paylaşılabilir |
| Koşulara Göz At | `/runs` | İfade arama çubuğu (`user:`, `char:`, `asc:` aralıkları, `card:`/`relic:` çok değerli AND, `version:` aralıkları, `mode:`, `result:`, `players:`), açılır filtreler, sıralama ve paylaşılabilir URL'ler içeren tam koşu tarayıcısı |
| Koşu Gönder | `/leaderboards/submit` | Overwolf yardımcı uygulaması bağlantısı, koşuları otomatik olarak ilişkilendirmek için Steam/Discord ile oturum açma ve son koşularınızla birlikte sürükle-bırak `.run` yükleme |
| İstatistikler | `/leaderboards/stats` | Kartlar, kalıntılar, iksirler ve karşılaşmalar için sıralamalı tablolar (seçilme oranı, kazanma oranı, sayı). Karaktere / yükselişe / sonuca göre filtreleyin |
| Profil | `/profile` | Oturum açmış kullanıcının istatistikleri (en iyi kartlar/kalıntılar/iksirler, karakter dökümü), kişisel rekorları, rekabetçi karşılaştırması (bugünün günlük liderlik tablosu, küresel sıralamalar, topluluğa karşı kazanma oranı) ve koşu yönetimi |
| Ayarlar | `/settings` | Hesap ayarları: kullanıcı adı, e-posta, bağlı Steam/Discord |
| Paylaşılan Koşu | `/runs/[hash]` | Tıklanabilir harita düğümü simgeleri, kalıntı şeridi ve küçük kart ızgarasıyla oyun içi tarzda zafer/yenilgi özeti |
| Başvuru | `/reference` | Tüm öğeler tıklanabilir - perdeler, yükselişler, anahtar sözcükler, küreler, musibetler, niyetler, değiştiriciler, başarımlar |
| Görseller | `/images` | Kategori başına ZIP indirmeli, göz atılabilir oyun varlıkları |
| Değişiklik Günlüğü | `/changelog` | Oyun güncellemeleri arasındaki veri farkları |
| Hakkında | `/about` | Proje bilgileri, istatistikler, işlem hattı görselleştirmesi |
| Teşekkürler | `/thank-you` | Ko-fi destekçileri ve topluluk katkıcıları (sayfaya doğrudan bağlantı verilebilmesi için Hakkında sayfasından ayrılmıştır) |
| Knowledge Demon | `/knowledge-demon` | Discord botu bilgi sayfası - eğik çizgi komutları, moderasyon özellikleri, yükleme eylem çağrısı |
| Haberler | `/news` | Yansıtılmış Steam duyuru akışı; yinelenen değil tamamlayıcı olması için standart bağlantılar Steam'e geri döner |
| Haber makalesi | `/news/[gid]` | Temizlenmiş BBCode gövdesi ve `NewsArticle` JSON-LD'si içeren tek Steam duyurusu |
| Kademe Listesi | `/tier-list` | Kartlar / kalıntılar / iksirler için Codex Score kademe listesi merkezi (S → F kademeleri) |
| Kademe Listesi Ayrıntısı | `/tier-list/[type]` | `/api/runs/scores/{type}` kaynağından alınan, tek bir varlık türü için görsel S/A/B/C/D/F satırları |
| Puanlama | `/leaderboards/scoring` | Codex Score metodolojisi sayfası - Bayesçi daraltma, önsel ağırlık, ölçek aralığı, kademe eşikleri |

## API Uç Noktaları

Tüm veri uç noktaları isteğe bağlı bir `?lang=` sorgu parametresini kabul eder (varsayılan: `eng`). Yanıtlar **GZip ile sıkıştırılır** ve `Cache-Control: public, max-age=300` ile önbelleğe alınır.

| Uç Nokta | Açıklama | Filtreler |
|---|---|---|
| `GET /api/cards` | Tüm kartlar | `color`, `type`, `rarity`, `keyword`, `search`, `lang` |
| `GET /api/cards/{id}` | Tek kart | `lang` |
| `GET /api/characters` | Tüm karakterler | `search`, `lang` |
| `GET /api/characters/{id}` | Tek karakter (alıntılar ve diyaloglarla) | `lang` |
| `GET /api/relics` | Tüm kalıntılar | `rarity`, `pool`, `search`, `lang` |
| `GET /api/relics/{id}` | Tek kalıntı | `lang` |
| `GET /api/monsters` | Tüm canavarlar | `type`, `search`, `lang` |
| `GET /api/monsters/{id}` | Tek canavar | `lang` |
| `GET /api/potions` | Tüm iksirler | `rarity`, `pool`, `search`, `lang` |
| `GET /api/potions/{id}` | Tek iksir | `lang` |
| `GET /api/enchantments` | Tüm büyüler | `card_type`, `search`, `lang` |
| `GET /api/enchantments/{id}` | Tek büyü | `lang` |
| `GET /api/encounters` | Tüm karşılaşmalar | `room_type`, `act`, `search`, `lang` |
| `GET /api/encounters/{id}` | Tek karşılaşma | `lang` |
| `GET /api/events` | Tüm etkinlikler | `type`, `act`, `search`, `lang` |
| `GET /api/events/{id}` | Tek etkinlik | `lang` |
| `GET /api/powers` | Tüm güçler | `type`, `stack_type`, `search`, `lang` |
| `GET /api/powers/{id}` | Tek güç | `lang` |
| `GET /api/keywords` | Kart anahtar sözcüğü tanımları | `lang` |
| `GET /api/keywords/{id}` | Tek anahtar sözcük | `lang` |
| `GET /api/intents` | Canavar niyeti türleri | `lang` |
| `GET /api/intents/{id}` | Tek niyet | `lang` |
| `GET /api/orbs` | Tüm küreler | `lang` |
| `GET /api/orbs/{id}` | Tek küre | `lang` |
| `GET /api/afflictions` | Kart musibetleri | `lang` |
| `GET /api/afflictions/{id}` | Tek musibet | `lang` |
| `GET /api/modifiers` | Koşu değiştiricileri | `lang` |
| `GET /api/modifiers/{id}` | Tek değiştirici | `lang` |
| `GET /api/achievements` | Tüm başarımlar | `lang` |
| `GET /api/achievements/{id}` | Tek başarım | `lang` |
| `GET /api/badges` | Tüm koşu sonu rozetleri | `tiered`, `multiplayer_only`, `requires_win`, `search`, `lang` |
| `GET /api/badges/{id}` | Kademe dökümüyle tek rozet | `lang` |
| `GET /api/history/{entity_type}/{entity_id}` | Varlık başına sürüm geçmişi (büyük/küçük harfe duyarsız, en yeni önce) | - |
| `GET /api/epochs` | Zaman çizelgesi çağları | `era`, `search`, `lang` |
| `GET /api/epochs/{id}` | Tek çağ | `lang` |
| `GET /api/stories` | Hikâye girdileri | `lang` |
| `GET /api/stories/{id}` | Tek hikâye | `lang` |
| `GET /api/acts` | Tüm perdeler | `lang` |
| `GET /api/acts/{id}` | Tek perde | `lang` |
| `GET /api/ascensions` | Yükseliş seviyeleri (0–10) | `lang` |
| `GET /api/ascensions/{id}` | Tek yükseliş seviyesi | `lang` |
| `GET /api/stats` | Tüm kategorilerdeki varlık sayıları | `lang` |
| `GET /api/languages` | Görünen adlarıyla kullanılabilir diller | - |
| `GET /api/translations` | Filtre değerleri ve kullanıcı arayüzü dizeleri için çeviri eşlemeleri | `lang` |
| `GET /api/images` | Dosya listeleriyle görsel kategorileri. Beta ön ekli kategoriler `?version=` kabul eder. | - |
| `GET /api/images/beta/versions` | Kullanılabilir beta görsel arşivi sürümleri + `latest` sembolik bağlantısının hedefi | - |
| `GET /api/images/{category}/download` | Görsel kategorisinin ZIP olarak indirilmesi. Beta kategorileri `?version=` kabul eder. | - |
| `GET /api/changelogs` | Değişiklik günlüğü özetleri (tüm sürümler) | - |
| `GET /api/changelogs/{tag}` | Bir sürüm etiketi için tam değişiklik günlüğü | - |
| `GET /api/guides` | Topluluk rehberleri | `category`, `difficulty`, `tag`, `search` |
| `GET /api/guides/{slug}` | Tek rehber (Markdown içeriğiyle) | - |
| `POST /api/guides` | Rehber gönderme (Discord'a vekâlet edilir) | - |
| `POST /api/runs` | Koşu gönderme (.run dosyası JSON'u) | `username` |
| `GET /api/runs/list` | Gönderilen koşuları listeleme/gözden geçirme | `character`, `win`, `username`, `seed`, `build_id`, `build_ids`, `players`, `game_mode`, `ascension`, `ascension_min`, `ascension_max`, `card`, `relic`, `today`, `sort`, `page`, `limit` |
| `GET /api/runs/shared/{hash}` | Karma değerine göre tam koşu verileri (DB'deki `username` birleştirilir) | - |
| `GET /api/runs/stats` | Toplu topluluk istatistikleri | `character`, `win`, `ascension`, `game_mode`, `players` |
| `GET /api/runs/leaderboard` | Yalnızca galibiyetlerin yer aldığı sıralamalı liderlik tablosu | `category` (`fastest`, `highest_ascension`), `character`, `players`, `game_mode`, `today`, `page`, `limit` |
| `GET /api/runs/leaderboard/rank/{hash}` | Tek bir galibiyet koşusunun kendi sıralamasındaki derecesi | `category` |
| `GET /api/runs/scores/{type}` | Varlık başına Codex Score (Bayesçi daraltılmış kazanma oranı puanı + S/A/B/C/D/F kademesi) | `type` = `cards`/`relics`/`potions` |
| `GET /api/runs/encounter-stats` | Karşılaşma başına toplamlar (görünme, ölümcüllük oranı, ortalama hasar/tur) | `act`, `room_type`, `multiplayer`, `page`, `limit` |
| `POST /api/runs/claim` | Daha önce gönderilmiş koşulara karma değeriyle kullanıcı adı ekleme | - |
| `GET /api/runs/versions` | Gönderilen koşulardaki farklı oyun sürümleri | - |
| `GET /api/exports/{lang}` | Bir dil için tüm varlık JSON'larının ZIP'i | `lang` |
| `GET /api/news` | Steam duyuruları + topluluk haberleri (yerel olarak arşivlenir) | `feed_type`, `feedname`, `tag`, `since`, `search`, `limit`, `offset` |
| `GET /api/news/{gid}` | Tek haber makalesi (ham HTML/BBCode gövdesi) | - |
| `GET /api/merchant/config` | Otomatik çıkarılan tüccar fiyatlandırma yapılandırması | - |
| `POST /api/feedback` | Geri bildirim gönderme (Discord'a vekâlet edilir) | - |
| `GET /api/versions` | Etkin veri kökü tarafından sunulan sürüm meta verileri | - |

**Kullanıcı hesapları** (çerez/JWT oturumu; Steam veya Discord ile oturum açın):

| Uç Nokta | Açıklama |
|---|---|
| `GET /api/auth/me` | Oturum açmış mevcut kullanıcı |
| `GET /api/auth/steam/redirect` | Steam OpenID oturum açma işlemini başlatır |
| `GET /api/auth/discord/start` | Discord OAuth oturum açma işlemini başlatır |
| `POST /api/auth/logout` | Oturum çerezini temizler |
| `PATCH /api/auth/username` / `PATCH /api/auth/email` | Profil alanlarını günceller |
| `GET /api/auth/runs` / `POST /api/auth/runs/upload` / `DELETE /api/auth/runs/{hash}` | Kullanıcının koşularını listeler, yükler ve kaldırır |
| `GET /api/auth/stats` | Kullanıcı başına toplu istatistikler (profil sayfası) |
| `GET /api/auth/personal-bests` | En hızlı tek oyunculu/eşli koşu, en yüksek yükseliş, bugünün ve tüm zamanların günlük koşusu |
| `GET /api/auth/competitive` | Bugünün günlük liderlik tablosu, küresel sıralamalar, topluluğa karşı kazanma oranı |

IP başına dakikada **60 istekle** sınırlandırılmıştır. Geri bildirim ve rehber gönderimi IP başına dakikada **3-5 istekle** sınırlandırılmıştır. Etkileşimli belgeler `/docs` (Swagger UI) adresindedir.

### Yerelleştirme

Tüm oyun verileri, Slay the Spire 2'nin kendi yerelleştirme dosyaları kullanılarak 15 dilde sunulur. Herhangi bir veri uç noktasına `?lang=` iletin. Etkin genel beta verileri için `?channel=beta`, arşivlenmiş beta görsel kümeleri için `?version=` kullanın.

| Kod | Dil | Kod | Dil |
|------|----------|------|----------|
| `eng` | İngilizce | `kor` | 한국어 |
| `deu` | Almanca | `pol` | Lehçe |
| `esp` | İspanyolca (ES) | `ptb` | Portekizce (BR) |
| `fra` | Fransızca | `rus` | Rusça |
| `ita` | İtalyanca | `spa` | İspanyolca (LA) |
| `jpn` | Japonca | `tha` | Tayca |
| `tur` | Türkçe | `zhs` | Basitleştirilmiş Çince |
| `zht` | Geleneksel Çince | | |

**Yerelleştirilenler**: Oyun kaynaklı varlık adları ve açıklamaları, kart türleri, nadirlikler, anahtar sözcükler, güçler, karşılaşmalar, karakter adları, bölüm başlıkları, yerelleştirilmiş rotalar ve paylaşılan kullanıcı arayüzü etiketlerinin çoğu.

**İngilizce kalanlar**: API tanımlayıcıları ve `room_type`, güç `type`/`stack_type` ve `pool` gibi yapısal filtre değerlerinin yanı sıra ürün markaları ve bazı editoryal ya da topluluk tarafından yazılmış içerikler.

Filtre parametreleri (`type=Attack`, `rarity=Rare`, `keyword=Exhaust`), dilden bağımsız olarak her zaman İngilizce değerler kullanır; arka uç bunları eşleştirmeden önce yerelleştirilmiş karşılıklarına çevirir.

Örnek: `GET /api/cards?lang=kor&type=Attack`, parametre İngilizce olsa bile türü "공격" olan Korece kart verilerini doğru biçimde filtreleyerek döndürür.

### Zengin Metin Biçimlendirmesi

Metin alanları (`description`, `loss_text`, `flavor`, diyalog `text`, seçenek `title`/`description`), oyunun yerelleştirme verilerinden korunan Godot BBCode tarzı etiketler içerebilir:

| Etiket | Tür | Örnek | İşlenme biçimi |
|---|---|---|---|
| `[gold]...[/gold]` | Renk | `[gold]Enchant[/gold]` | Altın renkli metin |
| `[red]...[/red]` | Renk | `[red]blood[/red]` | Kırmızı renkli metin |
| `[blue]...[/blue]` | Renk | `[blue]2[/blue]` | Mavi renkli metin |
| `[green]...[/green]` | Renk | `[green]healed[/green]` | Yeşil renkli metin |
| `[purple]...[/purple]` | Renk | `[purple]Sharp[/purple]` | Mor renkli metin |
| `[orange]...[/orange]` | Renk | `[orange]hulking figure[/orange]` | Turuncu renkli metin |
| `[pink]...[/pink]` | Renk | - | Pembe renkli metin |
| `[aqua]...[/aqua]` | Renk | `[aqua]Ascending Spirit[/aqua]` | Camgöbeği renkli metin |
| `[sine]...[/sine]` | Efekt | `[sine]swirling vortex[/sine]` | Dalgalı animasyonlu metin |
| `[jitter]...[/jitter]` | Efekt | `[jitter]CLANG![/jitter]` | Titreyen animasyonlu metin |
| `[b]...[/b]` | Efekt | `[b]bold text[/b]` | Kalın metin |
| `[i]...[/i]` | Efekt | `[i]whispers[/i]` | İtalik metin |
| `[energy:N]` | Simge | `[energy:2]` | Enerji simgesi/simgeleri |
| `[star:N]` | Simge | `[star:1]` | Yıldız simgesi/simgeleri |
| `[Card]`, `[Relic]` | Yer tutucu | `[Card]` | Çalışma zamanında dinamik (italik) |

Etiketler iç içe yerleştirilebilir: `[b][jitter]CLANG![/jitter][/b]`, `[gold][sine]swirling vortex[/sine][/gold]`.

API'yi doğrudan kullanıyorsanız bunları `\[/?[a-z]+(?::\d+)?\]` gibi bir düzenli ifadeyle kaldırabilir veya kendi ön yüzünüzde işleyebilirsiniz. `description_raw` alanı (varsa), çözümlenmemiş SmartFormat şablonunu içerir.

## Yerel Olarak Çalıştırma

### Ön Koşullar

- Python 3.10+
- Node.js 20+

### Arka Uç

```bash
python -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r backend/requirements.txt

cd backend
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Arka uç **http://localhost:8000** adresinde çalışır.

### Ön Yüz

```bash
cd frontend
npm install
NEXT_PUBLIC_API_URL=http://localhost:8000 npm run dev
```

Ön yüz **http://localhost:3000** adresinde çalışır.

### Docker

```bash
docker compose up --build
```

Her iki hizmeti de başlatır (arka uç 8000, ön yüz 3000 bağlantı noktasında).

### Ortam değişkenleri

Temel salt okunur API herhangi bir yapılandırma gerektirmez. Aşağıdaki isteğe bağlı özellikler ortam değişkenleriyle etkinleştirilir (arka ucun ortamında veya compose dosyasında ayarlanır):

| Değişken | Kullanan | Notlar |
|---|---|---|
| `MONGO_URL` | Arka uç | Koşu veritabanı (topluluk istatistikleri, liderlik tabloları, hesaplar). Ayarlanmadığında arka uç eski SQLite yoluna (`data/runs.db`) geri döner. |
| `JWT_SECRET` | Arka uç | Kullanıcı hesabı oturum belirteçlerini imzalar. |
| `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` | Arka uç | Discord OAuth ile oturum açma. |
| `FRONTEND_URL`, `SPIRE_CODEX_PUBLIC_BASE` | Arka uç | OAuth yönlendirme / dönüş URL'leri. |
| `ENVIRONMENT` | Arka uç | `production`, güvenli çerez davranışını etkinleştirir. |
| `NEXT_PUBLIC_API_URL` | Ön yüz (derleme) | API tabanı; görsellerin/verilerin aynı kaynaktan çözümlenmesi için üretimde boştur. |
| `NEXT_PUBLIC_CDN_URL` | Ön yüz (derleme) | Ayarlandığında (ör. `https://cdn.spire-codex.com`) görseller `/static` yerine CDN'den yüklenir. |
| `NEXT_PUBLIC_SITE_URL` | Ön yüz (derleme) | Meta veriler için standart site URL'si. |

Kullanıcı hesapları ve CDN varsayılan olarak kapalıdır; dolayısıyla proje bunların hiçbiri olmadan uçtan uca çalışır.

## Güncelleme İşlem Hattı

Platformlar arası bir Python betiği, yeni bir oyun sürümü yayımlandığında tüm güncelleme iş akışını yönetir:

```bash
# Tam işlem hattı - oyun dosyalarını çıkar, verileri ayrıştır, görselleri işle ve kopyala:
python3 tools/update.py

# Oyun kurulum yolunu elle belirt:
python3 tools/update.py --game-dir "/path/to/Slay the Spire 2"

# Çıkarma işlemini atla (zaten güncel bir extraction/ dizini var):
python3 tools/update.py --skip-extract

# Yalnızca verileri yeniden ayrıştır (çıkarma veya işleme yok):
python3 tools/update.py --parse-only

# Yalnızca Spine görsellerini yeniden işle:
python3 tools/update.py --render-only

# Güncellemeden sonra bir değişiklik günlüğü oluştur:
python3 tools/update.py --changelog --game-version "0.98.2" --build-id "22238966"
```

Betik işletim sisteminizi otomatik olarak algılar ve Steam kurulum dizinini bulur. Adım başına gereksinimler:

| Adım | Araç | Kurulum |
|---|---|---|
| PCK çıkarma | `gdre_tools` | [GDRE Tools sürümleri](https://github.com/bruvzg/gdsdecomp/releases) |
| DLL tersine derleme | `ilspycmd` | `dotnet tool install ilspycmd -g` |
| Veri ayrıştırma | Python 3.10+ | Yerleşik |
| Görsel kopyalama | Python 3.10+ | Yerleşik |
| Spine işleme | Node.js 20+ | [nodejs.org](https://nodejs.org) |

### Elle Uygulanan Adımlar

Adımları ayrı ayrı çalıştırmayı tercih ederseniz:

```bash
# Tüm verileri ayrıştır (15 dilin tamamı)
cd backend/app/parsers && python3 parse_all.py

# Tek bir dili ayrıştır
cd backend/app/parsers && python3 parse_all.py --lang eng

# Görselleri çıkarma dizininden static dizinine kopyala (aynı kaynaktan PNG + WebP -
# mevcut bir arka uç WebP'si üzerinden kayıplı zincir yok). WebP quality=95, method=6.
python3 backend/scripts/copy_images.py

# Spine görsellerini işle (WebGL - üçgen birleşme izi yapıları yok)
cd tools/spine-renderer && npm install
npx playwright install chromium           # Yalnızca ilk seferde
node render_all_webgl.mjs                 # Başsız Chrome aracılığıyla 138 iskeletin tamamı
node render_webgl.mjs <skel_dir> <out> [size] [--skin=a,b] [--anim=name] [--anim-time=N]

# Canavar başına yaygın geçersiz kılmalar:
#   --skin=moss1,diamondeye   varyant dış görünümlerini varsayılanla birleştirir (cubex_construct)
#   --skin=skin1              varsayılanı bir varyantla değiştirir (scroll_of_biting)
#   --anim-time=0.5           anlık görüntüden önce animasyonu N saniye ilerletir
#   --anim=attack             otomatik seçilen boşta durma animasyonunu geçersiz kılar
#
# Duman yer tutucusu değiştirme: gas_bomb_2.png, the_forgotten_2.png ve
# living_smog_2.png, kaynakta eflatun "Smoke Placeholder" panoları olarak gelir.
# render_webgl.mjs, GL yüklemesinden önce bunları aynı boyutlarda yöntemsel olarak
# oluşturulan koyu erik rengi bir bulutla değiştirir, ardından değiştirilen yuvalarda
# slot.color.a = 1.0 değerini zorlar (sanatçılar gölgelendirici beklentisiyle düşük alfa ayarlamıştır).

# Yetersiz boyuttaki canavar görsellerini yeniden çerçevele (son işlem - gerçek alfa
# sınırlayıcı kutusuna kırpar, 512x512 çerçevenin yaklaşık %92'sini dolduracak şekilde ölçeklendirir):
python3 tools/rescale_bestiary.py fuzzy_wurm_crawler thieving_hopper terror_eel

# Eski canvas işleyicisi (üçgen birleşme izi yapıları var - kaçının)
# node render_all.mjs / node render.mjs
```

## Değişiklik Günlüğü Sistemi

Tüm varlık kategorilerindeki alan düzeyindeki farklarla oyun güncellemeleri arasında nelerin değiştiğini izleyin.

### Değişiklik Günlüğü Oluşturma

```bash
# Mevcut verileri bir git başvurusuyla karşılaştır:
python3 tools/diff_data.py HEAD~1 --format json \
    --game-version "0.98.2" --build-id "22238966" \
    --title "March Update"

# Metin veya Markdown olarak önizle:
python3 tools/diff_data.py HEAD~1 --format text
python3 tools/diff_data.py HEAD~1 --format md
```

### Değişiklik Günlüğü Şeması

Her değişiklik günlüğü JSON dosyası şunları içerir:

| Alan | Açıklama |
|---|---|
| `app_id` | Steam Uygulama Kimliği (2868840) |
| `game_version` | Steam oyun sürümü (ör. `"0.98.2"`) |
| `build_id` | Steam derleme kimliği |
| `tag` | Benzersiz sürüm anahtarı (ör. `"1.0.3"`) |
| `date` | Güncelleme tarihi |
| `title` | İnsanlar tarafından okunabilir başlık |
| `summary` | Sayılar: `{ added, removed, changed }` |
| `features` / `fixes` / `api_changes` | Elle düzenlenmiş sürüm notları. Mevcut bir etiket için `diff_data.py` ile yeniden oluşturma sırasında korunur; veri farkının üzerine yazılır ancak bu diziler birleştirilir. |
| `categories` | Eklenen/kaldırılan/değiştirilen varlıklarla kategori başına farklar. Alan değişiklikleri, iç içe sözlüklerde/listelerde yinelemeli olarak ilerler; böylece her yaprak, anlaşılmaz `vars: 2 fields → 2 fields` yerine kendi satırında yer alır (ör. `vars.DamageVar: 8 → 10`). |

### Bir kez yazma ilkesiyle saklama

`data/changelogs/` altındaki dosyalar, bir kez yazılan tarihsel kayıtlardır. `.github/workflows/changelog-guard.yml`, mevcut bir değişiklik günlüğünü **değiştiren veya silen** tüm PR'ları engeller. Yeni dosyalara (`A`) her zaman izin verilir; değişiklikler için PR'da `changelog-edit-approved` etiketi gerekir. İlke ve geçersiz kılma iş akışı için `CONTRIBUTING.md → Changelog Retention` bölümüne bakın.

### Varlık başına geçmiş

`GET /api/history/{entity_type}/{entity_id}`, her değişiklik günlüğünü tarar ve istenen varlığa dokunan girdileri en yenisi önce olacak şekilde döndürür. Her ayrıntı sayfasındaki (`/cards/{id}`, `/monsters/{id}` vb.) Sürüm Geçmişi bölümü bu uç nokta tarafından desteklenir.

## Dağıtım

### CI/CD (GitHub Actions)

`main` dalına gönderimler, kendi sunucumuzda barındırılan Kubernetes çalıştırıcısında `.github/workflows/ci.yml` dosyasını tetikler. İş akışı; gizli bilgi taraması, ESLint ve TypeScript denetimleri, ruff lint ve biçimlendirme denetimlerini çalıştırır, ardından kararlı görselleri `:latest` etiketiyle derleyip gönderir. Ayrıca `docker-compose.beta.yml` için bağımsız beta görsellerini `:beta` etiketiyle oluşturmaya devam eder; bu görseller operasyonel olarak korunur ancak genel beta sayfaları ana dağıtım tarafından `/beta` altında sunulur.

Kararlı ön yüz `UMAMI_WEBSITE_ID` değerini alır. Bağımsız beta görseli `UMAMI_BETA_WEBSITE_ID` değerini alır; ancak genel `/beta` trafiği kararlı ön yüzü ve onun analiz özelliğini kullanır.

CI dağıtım **yapmaz**. Dağıtımı DigitalOcean sunucusundaki saatlik otomatik dağıtım görevi gerçekleştirir.

> **Not:** `.forgejo/workflows/build.yml`, etkin olmayan buildah tabanlı bir geri dönüş olarak korunur.

### Yerel Derleme + Gönderme

CI'ı atlayıp doğrudan kendi makinenizden gönderin:

```bash
# Her iki görseli de derle ve gönder:
python3 tools/deploy.py

# Yalnızca ön yüz:
python3 tools/deploy.py --frontend

# Yalnızca arka uç:
python3 tools/deploy.py --backend

# Göndermeden derlemeyi test et:
python3 tools/deploy.py --no-push

# Bir sürümü etiketle:
python3 tools/deploy.py --tag v0.98.2

# Beta görsellerini derle ve gönder (:beta etiketi, IndexNow atlanır):
python3 tools/deploy.py --beta
```

Apple Silicon'ı otomatik algılar ve `docker buildx` aracılığıyla `linux/amd64` için çapraz derleme yapar. Önce `docker login` çalıştırılması gerekir.

### Üretim

Genel uygulama ve korunan bağımsız beta yığını aynı DigitalOcean sunucusunda çalışır. Genel trafik `spire-codex.com` adresini kullanır; ikincil Lightsail sunucusu MongoDB'yi çalıştırır.

**Otomatik dağıtım** - DigitalOcean sunucusundaki saatlik cron, `/usr/local/bin/spire-codex-autodeploy` komutunu saatin :03 dakikasında çalıştırır. Kullanıma alınmış commit ilerlediğinde, yalnızca `data/news/*` ile sınırlı güncellemeler dışında hem `docker-compose.prod.yml` hem de `docker-compose.beta.yml` dosyalarını çeker ve yeniden oluşturur. Ardından Cloudflare önbelleğini temizler. Günlükler `/var/log/spire-codex-autodeploy.log` dosyasına yazılır. Kurulum ve işletim için [`infrastructure/ansible/README.md`](infrastructure/ansible/README.md) dosyasına bakın.

**Elle dağıtım**:

```bash
cd infrastructure/ansible
./bin/do-ansible playbooks/deploy.yml

# Korunan bağımsız beta yığını
./bin/do-ansible playbooks/deploy.yml -e compose_file=docker-compose.beta.yml
```

Üretim verileri bağlama yoluyla bağlanır (ön yüz için `./data:/data:ro`, arka uç için okuma-yazma). Haberler ve koşu durumu, istek sırasında bağlanan verilerden okunur; bu nedenle `data/news/*.json` güncellemeleri kapsayıcının yeniden başlatılmasını gerektirmez.

### Beta Kanalı (spire-codex.com/beta)

Genel uygulama, kararlı verileri ve Steam `public-beta` verilerini iki içerik kanalı olarak sunar. Beta sayfaları [`spire-codex.com/beta`](https://spire-codex.com/beta) adresinde, yerelleştirilmiş rotalar ise `/{lang}/beta/...` altında bulunur. Ana `/images` sayfası, arşivlenmiş beta varlık sürümlerini de sunar.

`beta.spire-codex.com` genel kullanımdan kaldırılmıştır. Cloudflare şu anda yolu koruyan bir `302` ile ana etki alanına yönlendirir ancak `/beta` veya `channel=beta` eklemez. Bu nedenle eski sayfa bağlantıları eşleşen kararlı sayfaya ulaşır ve eski API istekleri yönlendirmeyi izledikten sonra kararlı verileri alır. Yeni API istemcilerinin ana API'yi açık bir kanalla kullanması gerekir; örneğin `https://spire-codex.com/api/cards?channel=beta`.

**Mimari**: `get_channel`, `?channel=beta|stable` değerini bir Python `ContextVar` nesnesine çözümler; doğrudan kaynak trafiği için `beta.*` sunucu başlığını da anlar. `data_service.py`, beta isteklerini `data-beta/<latest>/` konumundan yükler ve dosya başına kararlı sürüme geri döner. `GET /api/beta/diff` ve `GET /api/beta/version`, etkin betayı açıklar; ön yüz seçilen kanalı `/beta` altında işler.

Ayrı `docker-compose.beta.yml` yığını ve `:beta` görselleri, dağıtım otomasyonu tarafından hâlâ derlenip yeniden oluşturulur. Cloudflare yönlendirmesi etkinken bunlar genel beta sitesi değildir.

**Veri düzeni**: Arşivlenmiş her derleme `data-beta/<version>/` altında bulunur ve etkin derlemeyi `latest` işaretçisi seçer. Her sürümün kendi `changelogs/` dizini vardır. Beta görsel arşivleri bu düzeni `backend/static/images/beta/<version>/{cards,monsters,misc,ui,vfx}/` konumunda yansıtır.

**Otomatik içe aktarma** - `tools/beta-watch/`, geliştirme Mac'inde perşembe günleri 15:00 ile 22:45 arasında her 15 dakikada bir launchd görevi olarak çalışır. SteamCMD yeni bir `public-beta` derleme kimliği bildirdiğinde oyunu çıkarır ve tersine derler, her dili ayrıştırır, farkı oluşturur, sürümlü görselleri eşitler ve bir `auto/beta-<version>` PR'ı açar. Kurulum ve işletim için [`tools/beta-watch/README.md`](tools/beta-watch/README.md) dosyasına bakın.

**Elle içe aktarma**:

```bash
VERSION=vX.Y.Z
PREVIOUS=vA.B.C

# Önce beta oyun dosyalarını çıkarıp tersine derleyin, ardından depo kökünden ayrıştırın.
(cd backend/app/parsers && \
  EXTRACTION_DIR=../../../extraction/beta \
  DATA_DIR="../../../data-beta/$VERSION" \
  python3 parse_all.py)

VERSION="$VERSION" tools/beta-watch/sync-images.sh

python3 tools/diff_data.py "data-beta/$PREVIOUS/eng" "data-beta/$VERSION/eng" \
  --format json --output-dir "data-beta/$VERSION/changelogs" \
  --game-version "${VERSION#v}" --title "Beta ${VERSION#v}"
```

`sync-images.sh`, `latest` görsel sembolik bağlantısını günceller. İçe aktarma PR'ı sürümlü veri ve görsel değişikliklerini taşır; birleştirmeden sonra otomatik dağıtım, korunan iki yığını da yeniler.

## Spine işleyicisi

StS2'deki canavar görselleri, tek bir görsel değil [Spine](http://esotericsoftware.com/) iskelet animasyonlarıdır; her canavar bir `.skel` (ikili iskelet) + `.atlas` + `.png` görsel sayfasından oluşur. İşleyici bunları statik portre PNG'leri hâlinde birleştirir.

### WebGL İşleyicisi (Güncel)

WebGL işleyicisi (`render_webgl.mjs`, `render_all_webgl.mjs`), iskeletleri başsız Chrome'un GPU'su aracılığıyla işlemek için **Playwright + spine-webgl** kullanır. Böylece **üçgen birleşme izi yapıları olmadan** temiz işlemeler üretilir.

**Çalışma şekli:**
1. WebGL etkin şekilde Playwright aracılığıyla başsız Chrome'u başlatır
2. İskelet verilerini + atlası + dokuları base64 olarak tarayıcı sayfasına yükler
3. Bir WebGL canvas'ı oluşturur, spine-webgl gölgelendiricisini + çokgen toplu işleyicisini ayarlar
4. Boşta durma animasyonunu uygular, sınırları hesaplar (gölge/zemin yuvaları hariç)
5. GPU üçgen rasterleştirmesi aracılığıyla işler - canvas kırpma yolları veya birleşme izleri yoktur
6. Ham pikselleri `gl.readPixels` aracılığıyla okur, dikey olarak çevirir (WebGL aşağıdan yukarıdır)
7. Saydamlığı korumak için node-canvas aracılığıyla PNG yazar

**Tek iskelet:**
```bash
node render_webgl.mjs <skel_dir> <output_path> [size]
node render_webgl.mjs ../../extraction/raw/animations/backgrounds/neow_room ../../backend/static/images/misc/neow.png 2048
```

**Tüm iskeletleri toplu işleme:**
```bash
node render_all_webgl.mjs  # 138 iskeleti backend/static/images/renders/ dizinine işler
```

### İşleme kapsamı

| Kategori | İşlenen | Toplam | Notlar |
|---|---|---|---|
| Canavarlar | 99 | 103 dizin | 111 oyun canavarının tamamının görseli vardır (99 işlenmiş + diğer adlar/statik görseller) |
| Karakterler | 16 | 16 | Savaş, dinlenme alanı ve seçme pozları |
| Arka Planlar/NPC'ler | 14 | 17 | Neow, Tezcatara, tüccar odaları, ana menü |
| VFX/UI | 9 | 22 | Çoğu VFX belirli animasyon kareleri gerektirir |
| **Toplam** | **138** | **158** | 20 tanesi atlandı (atlas yok, yalnızca VFX, boş) |

### Animasyon İşleyicisi

Animasyon işleyicisi (`render_gif.mjs`), Spine boşta durma/saldırı animasyonlarını hareketli WebP, GIF veya APNG olarak işler. Dış görünüm varyantlarını, animasyon seçimini ve büyük animasyonlar için kareleri diske akıtmayı destekler.

**Desteklenen çıktı biçimleri:**
- **`.webp`** (önerilir) - tam alfa içeren kayıpsız hareketli WebP, APNG'den yaklaşık %33 daha küçüktür. Bellek yetersizliğini önlemek için kareler diske akıtılır.
- **`.gif`** - 256 renk, ikili saydamlık. En küçük dosyaları ancak en düşük kaliteyi sunar.
- **`.apng`** - WebP gibi tam alfa içerir ancak dosyaları daha büyüktür.

```bash
# Kayıpsız hareketli WebP işle (önerilir)
NODE_OPTIONS="--max-old-space-size=8192" node render_gif.mjs <skel_dir> <output.webp> [size] [--fps=N]

# Dış görünüm varyantıyla (bowlbug, cultists, cubex vb. için)
node render_gif.mjs <skel_dir> output.webp 256 --fps=10 --skin=rock

# Belirli animasyon (varsayılan: boşta durma döngüsü)
node render_gif.mjs <skel_dir> output.webp 256 --fps=12 --anim=attack

# Beyaz silüet modu (boss harita düğümü simgeleri için)
node render_gif.mjs <skel_dir> output.webp 256 --white
```

**Animasyon kitaplığı:** 209 kayıpsız hareketli WebP:
- 512×512 boyutunda 15 karakter animasyonu (5 karakter × savaş/seçme/dinlenme)
- 256×256 boyutunda 103 canavar boşta durma animasyonu
- 256×256 boyutunda 91 canavar saldırı animasyonu

**Dış görünüm varyantları:** 13 canavarın dış görünüm varyantları vardır (bowlbug, cubex_construct, cultists vb.). Seçmek için `--skin=` kullanın. Varsayılan dış görünüm çoğu zaman yalnızca gövdesiz temel iskeleti gösterir.

**Boss harita düğümü gölgelendiricisi:** Oyun, RGB kanallarını maske olarak ele alan `boss_map_point.gdshader` dosyasını kullanır:
- **Kırmızı kanal** × `map_color` (varsayılan: bej `0.671, 0.58, 0.478`) → dolgu rengi
- **Mavi kanal** × `black_layer_color` (varsayılan: siyah `0, 0, 0`) → dış hat rengi
- **Yeşil kanal** × beyaz `1, 1, 1` → vurgular

### Eski Canvas İşleyicisi

Canvas işleyicisi (`render.mjs`, `render_all.mjs`), `triangleRendering = true` ile `spine-canvas` kullanır. Bu, bitişik üçgenler arasındaki canvas `clip()` yolu kenar yumuşatması nedeniyle **görünür tel kafes örgü yapıları** üretir. Bunun yerine WebGL işleyicisini kullanın.

### Bağımlılıklar

- `@esotericsoftware/spine-webgl` ^4.2.107 - WebGL için Spine çalışma zamanı (güncel)
- `playwright` - WebGL işleme için başsız Chrome
- `gif-encoder-2` - Animasyon işleyicisi için GIF kodlama
- `canvas` ^3.1.0 - Node.js Canvas uygulaması (animasyon işleyicisi için kare arabelleği)
- `Pillow` (Python) - İşlenmiş PNG karelerinden WebP/APNG oluşturur
- `@esotericsoftware/spine-canvas` ^4.2.106 - Canvas için Spine çalışma zamanı (eski)

## Oyun Dosyalarını Çıkarma

Sıfırdan çıkarmanız gerekiyorsa:

```bash
# PCK'yi çıkar (GDRE Tools)
/path/to/gdre_tools --headless --recover="/path/to/sts2.pck" --output-dir=extraction/raw

# DLL'yi tersine derle (ILSpy CLI)
ilspycmd -p -o extraction/decompiled "/path/to/sts2.dll"
```

Steam kurulum konumları:
- **Windows**: `C:\Program Files (x86)\Steam\steamapps\common\Slay the Spire 2\`
- **macOS**: `~/Library/Application Support/Steam/steamapps/common/Slay the Spire 2/`
- **Linux**: `~/.local/share/Steam/steamapps/common/Slay the Spire 2/`

## Sürümleme

Spire Codex, **`1.X.Y`** anlamsal sürümlemesini kullanır:

| Bölüm | Anlam |
|---------|---------|
| **1** | Spire Codex ana sürümü (tamamen yeniden yazılmadıkça aynı kalır) |
| **X** | Mega Crit bir oyun yaması yayımladığında artar |
| **Y** | Kendi ayrıştırıcı/ön yüz düzeltme ve iyileştirmelerimiz için artar |

Örnekler: `v1.0.0` = ilk sürüm, `v1.0.1` = hata düzeltmelerimiz, `v1.1.0` = dâhil edilen ilk Mega Crit yaması.

## SEO

- **Yapılandırılmış veriler (JSON-LD)**: WebSite + VideoGame (ana sayfa), CollectionPage + ItemList (liste sayfaları), Article + BreadcrumbList + FAQPage (ayrıntı sayfaları), SoftwareApplication (geliştiriciler), NewsArticle (news/[gid])
- **Başlık biçimi**: `"Slay the Spire 2 (sts2) {Page Title} | Spire Codex"` - tüm sayfalarda standartlaştırılmıştır. Koşular `"{username} - {char} - Ascension {N} {win/loss} - Slay the Spire 2 (sts2) | Spire Codex"` biçimini kullanır. Diller arası `sts2 tier list` / `sts2 card list` sorgularının eşleşmesi için "(sts2)" satır içinde yer alır.
- **Site haritası**: `/sitemap.xml` adresinde `force-dynamic` kullanan düz XML (derleme zamanında değil, sunucu tarafında işlenir). Varlık ayrıntı sayfaları, göz atma matrisi sayfaları, kademe listesi sayfaları, puanlama metodolojisi, runs/[hash] ayrıntıları ve tüm varlık türleri için i18n yansımaları dâhil yaklaşık 20.000+ URL
- **Uluslararası SEO**: İngilizce dışındaki 14 dil için, **çift yönlü** hreflang alternatiflerine sahip `/{lang}/` rotaları - İngilizce kök sayfalar da `lib/seo.ts` içindeki `buildLanguageAlternates(path)` aracılığıyla her yerel ayar + `x-default` için alternatifler yayımlar (Google'ın yerelleştirilmiş sayfaları geri başvurular olmadan yinelenen sayfalar olarak değerlendirdiği GSC "Crawled - not indexed" yinelenen içerik kümesini düzeltir)
- **Programatik SEO**: `/cards/browse/` altında 41 kart tarama sayfası (rare-attacks, ironclad-skills vb.) + 3 kademe listesi sayfası (`/tier-list/{cards,relics,potions}`)
- **Yerel ayara duyarlı EntityProse**: Ayrıntı sayfaları, her yerel ayarda aynı İngilizce gövde yerine yerel ayara özgü kısa bir paragraf işler
- **Dâhilî bağlantılar**: Güçler ↔ kartlar, karşılaşmalar → canavarlar, kart anahtar sözcükleri → anahtar sözcük merkezi sayfaları, canavar hamleleri → güç sayfaları (araç ipuçlarıyla), perde sayfaları → karşılaşmalar/etkinlikler, kademe listesi satırları → varlık ayrıntısı İstatistikler sekmesi
- **Open Graph ve Twitter Kartları**: Varlık başına OG görselleri, `summary_large_image` Twitter kartları
- **Standart URL'ler**: Her sayfa standart bir URL bildirir

## Gömülebilir Widget'lar

### Araç İpucu Widget'ı
Herhangi bir web sitesine 13 varlık türünün tamamı için üzerine gelindiğinde görünen araç ipuçları ekleyin:
```html
<script src="https://spire-codex.com/widget/spire-codex-tooltip.js"></script>
<p>Start with [[Bash]] and [[relic:Burning Blood]].</p>
```

### Değişiklik Günlüğü Widget'ı
Etkileşimli bir değişiklik günlüğü görüntüleyicisi gömün:
```html
<div id="scx-changelog"></div>
<script src="https://spire-codex.com/widget/spire-codex-changelog.js"></script>
```

Tüm belgeler: [spire-codex.com/developers](https://spire-codex.com/developers)

## Yol Haritası

- ~~Ayrı ayrıntı sayfaları~~ ✅
- ~~Genel arama~~ ✅
- ~~Çoklu dil desteği (15 dil)~~ ✅
- ~~SEO (JSON-LD, OG/Twitter, site haritası, hreflang)~~ ✅
- ~~Araç ipucu widget'ı (13 varlık türünün tamamı)~~ ✅
- ~~Karakter karşılaştırma sayfaları (10 çift)~~ ✅
- ~~Anahtar sözcük merkezi sayfaları~~ ✅
- ~~Tüccar rehberi (tersine derlenmiş C# kaynaklı fiyatlandırma)~~ ✅
- ~~Geliştirici belgeleri + veri dışa aktarımları~~ ✅
- ~~Uluslararası SEO (13 dilde açılış sayfası)~~ ✅
- ~~Kart tarama matrisi (41 programatik SEO sayfası)~~ ✅
- ~~Topluluk rehberleri~~ ✅ - YAML ön bilgili Markdown, gönderim formu, araç ipucu widget'ı, yazarın sosyal medya bağlantıları
- ~~Oyun mekanikleri sayfası~~ ✅ - 27 ayrı SEO sayfası: düşme oranları, savaş, harita, boss'lar, sırlar ve ilginç bilgiler
- ~~Topluluk koşuları~~ ✅ - Koşu gönderimi, tarayıcı, paylaşılan koşular, canlı istatistikler
- ~~Kart yükseltme açıklamaları~~ ✅ - yükseltilebilen 403 kartın tamamı için upgrade_description
- ~~Canavar doğuştan güçleri~~ ✅ - AfterAddedToRoom kaynaklı güçlere sahip 42 canavar
- ~~Başarım kilidi açma koşulları~~ ✅ - C# kaynağından kategori, karakter, eşik
- ~~Canavar saldırı kalıpları~~ ✅ - C# durum makinelerinden döngüsel/rastgele/koşullu/karma yapay zekâya sahip 112 canavar
- ~~Etkinlik ön koşulları~~ ✅ - C# kaynağından ayrıştırılan IsAllowed() koşullarına sahip 25 etkinlik
- ~~Beta arşivi saklama~~ ✅ - Sürümlü beta verileri ve görselleri korunur; `/beta` etkin derlemeyi sunar ve `/images` arşivlenmiş varlıklarda gezinmeyi sağlar
- ~~Discord botu~~ ✅ - [Knowledge Demon](https://bot.spire-codex.com): her varlık için eğik çizgi komutları (`/card`, `/relic`, `/monster`, `/potion`, `/character`, `/event`, `/power`, `/enchantment`, `/lookup`, `/meta`), Steam haberleri RSS'si ve [Kernel](https://github.com/ptrlrd/kernel) çatallanarak oluşturulan tam moderasyon araç seti
- ~~Codex Score ve Kademe Listesi~~ ✅ - Topluluk koşularından **Bayesçi daraltma** kullanılarak hesaplanan varlık başına derece: `shrunk = (wins + PRIOR_WEIGHT × baseline) / (n + PRIOR_WEIGHT)`, ardından 0–100 aralığına ölçeklenip S/A/B/C/D/F ile eşlenir. Küçük örneklem gürültüsünü önler (tek oyunda 1/1 yapan bir kart S almaz; önsele doğru geriler). Arka uç başlatılırken önceden ısıtılır. Ayrıntı sayfasındaki İstatistikler sekmesinde `ScoreBadge`, özel kademe listesi sayfaları ve `/leaderboards/scoring` adresindeki metodoloji sayfası olarak sunulur.
- ~~Ayrıntı sayfası İstatistikler sekmesi~~ ✅ - Puan kahraman rozeti + düzyazı özet + `EntityRunStats` aracılığıyla son koşuların bağlantıları.
- **Deste oluşturucu** - Etkileşimli deste kuramı geliştirme
- **Veritabanı arka ucu** - Dil başına JSON yüklemeyi PostgreSQL JSONB (veya alternatif) ile değiştirin. Koşu gönderimi depolaması zaten SQLite'tan MongoDB'ye taşındı (Mayıs 2026).

## Teşekkürler

Kalite güvencesi testleri, hata bildirimleri ve katkıları için **vesper-arch**, **terracubist**, **U77654**, **Purple Aspired Dreaming**, **Kobaru** ve **Severi**'ye teşekkürler. Işıkların yanmasını sağlayan Ko-fi bağışçıları da dâhil olmak üzere tam destekçi listesi [spire-codex.com/thank-you](https://spire-codex.com/thank-you) adresindedir.

## Teknoloji Yığını

- **Arka uç**: Python, FastAPI, Pydantic, slowapi, GZip sıkıştırması
- **Koşu veritabanı**: MongoDB (topluluk istatistikleri, liderlik tabloları, kullanıcı hesapları), somutlaştırılmış `stats_summary` koleksiyonu ve lider seçilen arka plan yenileyicisiyle. Eski SQLite yolu çevrimdışı geri dönüş olarak korunur.
- **Hesaplar**: Steam OpenID + Discord OAuth, JWT oturum çerezleri
- **Ön yüz**: Next.js 16 (App Router), TypeScript, Tailwind CSS, 15 dil desteği
- **Görseller/CDN**: `cdn.spire-codex.com` üzerinden sunulan Cloudflare R2 (webp)
- **Analiz ve gözlemlenebilirlik**: Kendi sunucumuzda barındırılan Umami, Prometheus + node-exporter
- **Spine İşleyicisi**: Node.js, Playwright, @esotericsoftware/spine-webgl (başsız Chrome aracılığıyla WebGL)
- **Altyapı**: Docker, kayıt defteri destekli BuildKit önbelleğine sahip GitHub Actions CI (kendi sunucumuzda barındırılan çalıştırıcı), Ansible/SSH dağıtımı
- **Araçlar**: Python (güncelleme işlem hattı, değişiklik günlüğü farklarını bulma, görsel kopyalama)

## Lisans

- **Kaynak kodu**: [PolyForm Noncommercial 1.0.0](LICENSE.md) - ticari olmayan amaçlarla kullanmak, değiştirmek ve yeniden dağıtmak ücretsizdir. Yazılımın satılmasına izin verilmez.
- **Barındırılan API**: [API_TERMS.md](API_TERMS.md) - yayımlanan hız sınırları dâhilinde her türlü kullanım için ücretsizdir; daha fazlasına ihtiyacınız varsa Discord üzerinden veya bir issue açarak iletişime geçin.
- **Oyun verileri** (kartlar, kalıntılar, canavarlar vb.): © Mega Crit Games. Burada adil kullanım / eğitim koşulları kapsamında bir topluluk başvuru kaynağı olarak sunulur. Bu verileri oyunu yeniden derlemek, yeniden paketlemek veya yeniden dağıtmak için kullanmayın.

Katkılar aynı PolyForm Noncommercial 1.0.0 koşulları altında kabul edilir - bkz. [CONTRIBUTING.md](CONTRIBUTING.md#license).
