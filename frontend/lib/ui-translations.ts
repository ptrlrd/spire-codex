/**
 * UI string translations for non-game-data text across the site.
 * Every key MUST have an "eng" entry — that's the fallback.
 */

const UI: Record<string, Record<string, string>> = {
  // Tabs
  "Overview":        { eng: "Overview", deu: "Übersicht", esp: "Resumen", fra: "Aperçu", ita: "Panoramica", jpn: "概要", kor: "개요", pol: "Przegląd", ptb: "Visão geral", rus: "Обзор", spa: "Resumen", tha: "ภาพรวม", tur: "Genel Bakış", zhs: "概览" },
  "Details":         { eng: "Details", deu: "Details", esp: "Detalles", fra: "Détails", ita: "Dettagli", jpn: "詳細", kor: "상세", pol: "Szczegóły", ptb: "Detalhes", rus: "Детали", spa: "Detalles", tha: "รายละเอียด", tur: "Detaylar", zhs: "详情" },
  "Info":            { eng: "Info", deu: "Info", esp: "Info", fra: "Info", ita: "Info", jpn: "情報", kor: "정보", pol: "Info", ptb: "Info", rus: "Инфо", spa: "Info", tha: "ข้อมูล", tur: "Bilgi", zhs: "信息" },

  // Navigation
  "Back to":         { eng: "Back to", deu: "Zurück zu", esp: "Volver a", fra: "Retour à", ita: "Torna a", jpn: "戻る：", kor: "돌아가기:", pol: "Powrót do", ptb: "Voltar para", rus: "Назад к", spa: "Volver a", tha: "กลับไป", tur: "Geri dön:", zhs: "返回" },
  "Home":            { eng: "Home", deu: "Startseite", esp: "Inicio", fra: "Accueil", ita: "Home", jpn: "ホーム", kor: "홈", pol: "Strona główna", ptb: "Início", rus: "Главная", spa: "Inicio", tha: "หน้าแรก", tur: "Ana Sayfa", zhs: "首页" },

  // Search & filters
  "Search...":       { eng: "Search...", deu: "Suchen...", esp: "Buscar...", fra: "Rechercher...", ita: "Cerca...", jpn: "検索...", kor: "검색...", pol: "Szukaj...", ptb: "Pesquisar...", rus: "Поиск...", spa: "Buscar...", tha: "ค้นหา...", tur: "Ara...", zhs: "搜索..." },
  "All Colors":      { eng: "All Colors", deu: "Alle Farben", esp: "Todos los colores", fra: "Toutes les couleurs", ita: "Tutti i colori", jpn: "すべての色", kor: "모든 색상", pol: "Wszystkie kolory", ptb: "Todas as cores", rus: "Все цвета", spa: "Todos los colores", tha: "ทุกสี", tur: "Tüm Renkler", zhs: "所有颜色" },
  "All Types":       { eng: "All Types", deu: "Alle Typen", esp: "Todos los tipos", fra: "Tous les types", ita: "Tutti i tipi", jpn: "すべてのタイプ", kor: "모든 유형", pol: "Wszystkie typy", ptb: "Todos os tipos", rus: "Все типы", spa: "Todos los tipos", tha: "ทุกประเภท", tur: "Tüm Türler", zhs: "所有类型" },
  "All Rarities":    { eng: "All Rarities", deu: "Alle Seltenheiten", esp: "Todas las rarezas", fra: "Toutes les raretés", ita: "Tutte le rarità", jpn: "すべてのレアリティ", kor: "모든 희귀도", pol: "Wszystkie rzadkości", ptb: "Todas as raridades", rus: "Все редкости", spa: "Todas las rarezas", tha: "ทุกความหายาก", tur: "Tüm Nadirlikler", zhs: "所有稀有度" },
  "All Keywords":    { eng: "All Keywords", deu: "Alle Schlüsselwörter", esp: "Todas las palabras clave", fra: "Tous les mots-clés", ita: "Tutte le parole chiave", jpn: "すべてのキーワード", kor: "모든 키워드", pol: "Wszystkie słowa kluczowe", ptb: "Todas as palavras-chave", rus: "Все ключевые слова", spa: "Todas las palabras clave", tha: "คีย์เวิร์ดทั้งหมด", tur: "Tüm Anahtar Kelimeler", zhs: "所有关键词" },
  "All Pools":       { eng: "All Pools", deu: "Alle Pools", esp: "Todos los grupos", fra: "Tous les groupes", ita: "Tutti i gruppi", jpn: "すべてのプール", kor: "모든 풀", pol: "Wszystkie pule", ptb: "Todos os grupos", rus: "Все группы", spa: "Todos los grupos", tha: "ทุกกลุ่ม", tur: "Tüm Havuzlar", zhs: "所有池" },
  "All Characters":  { eng: "All Characters", deu: "Alle Charaktere", esp: "Todos los personajes", fra: "Tous les personnages", ita: "Tutti i personaggi", jpn: "すべてのキャラクター", kor: "모든 캐릭터", pol: "Wszystkie postacie", ptb: "Todos os personagens", rus: "Все персонажи", spa: "Todos los personajes", tha: "ตัวละครทั้งหมด", tur: "Tüm Karakterler", zhs: "所有角色" },
  "results":         { eng: "results", deu: "Ergebnisse", esp: "resultados", fra: "résultats", ita: "risultati", jpn: "件", kor: "결과", pol: "wyników", ptb: "resultados", rus: "результатов", spa: "resultados", tha: "ผลลัพธ์", tur: "sonuç", zhs: "结果" },

  // Detail page sections
  "Merchant Price":  { eng: "Merchant Price", deu: "Händlerpreis", esp: "Precio del mercader", fra: "Prix du marchand", ita: "Prezzo del mercante", jpn: "商人の価格", kor: "상인 가격", pol: "Cena kupca", ptb: "Preço do mercador", rus: "Цена торговца", spa: "Precio del mercader", tha: "ราคาพ่อค้า", tur: "Tüccar Fiyatı", zhs: "商人价格" },
  "Powers Applied":  { eng: "Powers Applied", deu: "Angewandte Kräfte", esp: "Poderes aplicados", fra: "Pouvoirs appliqués", ita: "Poteri applicati", jpn: "適用パワー", kor: "적용 파워", pol: "Zastosowane moce", ptb: "Poderes aplicados", rus: "Применяемые силы", spa: "Poderes aplicados", tha: "พลังที่ใช้", tur: "Uygulanan Güçler", zhs: "应用能力" },
  "Related Cards":   { eng: "Related Cards", deu: "Verwandte Karten", esp: "Cartas relacionadas", fra: "Cartes liées", ita: "Carte correlate", jpn: "関連カード", kor: "관련 카드", pol: "Powiązane karty", ptb: "Cartas relacionadas", rus: "Связанные карты", spa: "Cartas relacionadas", tha: "การ์ดที่เกี่ยวข้อง", tur: "İlgili Kartlar", zhs: "相关卡牌" },
  "Other languages": { eng: "Other languages", deu: "Andere Sprachen", esp: "Otros idiomas", fra: "Autres langues", ita: "Altre lingue", jpn: "他の言語", kor: "다른 언어", pol: "Inne języki", ptb: "Outros idiomas", rus: "Другие языки", spa: "Otros idiomas", tha: "ภาษาอื่น", tur: "Diğer Diller", zhs: "其他语言" },
  "Version History": { eng: "Version History", deu: "Versionsgeschichte", esp: "Historial de versiones", fra: "Historique des versions", ita: "Cronologia versioni", jpn: "バージョン履歴", kor: "버전 기록", pol: "Historia wersji", ptb: "Histórico de versões", rus: "История версий", spa: "Historial de versiones", tha: "ประวัติเวอร์ชัน", tur: "Sürüm Geçmişi", zhs: "版本历史" },
  "Gold":            { eng: "Gold", deu: "Gold", esp: "Oro", fra: "Or", ita: "Oro", jpn: "ゴールド", kor: "골드", pol: "Złoto", ptb: "Ouro", rus: "Золото", spa: "Oro", tha: "ทอง", tur: "Altın", zhs: "金币" },
  "Cards":           { eng: "Cards", deu: "Karten", esp: "Cartas", fra: "Cartes", ita: "Carte", jpn: "カード", kor: "카드", pol: "Karty", ptb: "Cartas", rus: "Карты", spa: "Cartas", tha: "การ์ด", tur: "Kartlar", zhs: "卡牌" },
  "Relics":          { eng: "Relics", deu: "Relikte", esp: "Reliquias", fra: "Reliques", ita: "Reliquie", jpn: "レリック", kor: "유물", pol: "Relikty", ptb: "Relíquias", rus: "Реликвии", spa: "Reliquias", tha: "เรลิก", tur: "Kalıntılar", zhs: "遗物" },
  "Potions":         { eng: "Potions", deu: "Tränke", esp: "Pociones", fra: "Potions", ita: "Pozioni", jpn: "ポーション", kor: "물약", pol: "Mikstury", ptb: "Poções", rus: "Зелья", spa: "Pociones", tha: "ยา", tur: "İksirler", zhs: "药水" },
  "Monsters":        { eng: "Monsters", deu: "Monster", esp: "Monstruos", fra: "Monstres", ita: "Mostri", jpn: "モンスター", kor: "몬스터", pol: "Potwory", ptb: "Monstros", rus: "Монстры", spa: "Monstruos", tha: "มอนสเตอร์", tur: "Canavarlar", zhs: "怪物" },
  "Powers":          { eng: "Powers", deu: "Kräfte", esp: "Poderes", fra: "Pouvoirs", ita: "Poteri", jpn: "パワー", kor: "파워", pol: "Moce", ptb: "Poderes", rus: "Силы", spa: "Poderes", tha: "พลัง", tur: "Güçler", zhs: "能力" },
  "Events":          { eng: "Events", deu: "Ereignisse", esp: "Eventos", fra: "Événements", ita: "Eventi", jpn: "イベント", kor: "이벤트", pol: "Wydarzenia", ptb: "Eventos", rus: "События", spa: "Eventos", tha: "อีเวนต์", tur: "Etkinlikler", zhs: "事件" },
  "Characters":      { eng: "Characters", deu: "Charaktere", esp: "Personajes", fra: "Personnages", ita: "Personaggi", jpn: "キャラクター", kor: "캐릭터", pol: "Postacie", ptb: "Personagens", rus: "Персонажи", spa: "Personajes", tha: "ตัวละคร", tur: "Karakterler", zhs: "角色" },
  "Encounters":      { eng: "Encounters", deu: "Begegnungen", esp: "Encuentros", fra: "Rencontres", ita: "Incontri", jpn: "エンカウンター", kor: "조우", pol: "Spotkania", ptb: "Encontros", rus: "Встречи", spa: "Encuentros", tha: "การเผชิญหน้า", tur: "Karşılaşmalar", zhs: "遭遇" },
  "Enchantments":    { eng: "Enchantments", deu: "Verzauberungen", esp: "Encantamientos", fra: "Enchantements", ita: "Incantesimi", jpn: "エンチャント", kor: "인챈트", pol: "Zaklęcia", ptb: "Encantamentos", rus: "Зачарования", spa: "Encantamientos", tha: "มนตร์", tur: "Büyüler", zhs: "附魔" },

  // Sort
  "Compendium":      { eng: "Compendium", deu: "Kompendium", esp: "Compendio", fra: "Compendium", ita: "Compendio", jpn: "図鑑順", kor: "도감", pol: "Kompendium", ptb: "Compêndio", rus: "Компендиум", spa: "Compendio", tha: "สารานุกรม", tur: "Ansiklopedi", zhs: "图鉴" },

  // Nav groups
  "Database":        { eng: "Database", deu: "Datenbank", esp: "Base de datos", fra: "Base de données", ita: "Database", jpn: "データベース", kor: "데이터베이스", pol: "Baza danych", ptb: "Banco de dados", rus: "База данных", spa: "Base de datos", tha: "ฐานข้อมูล", tur: "Veritabanı", zhs: "数据库" },
  "Game Info":       { eng: "Game Info", deu: "Spielinfo", esp: "Info del juego", fra: "Info du jeu", ita: "Info gioco", jpn: "ゲーム情報", kor: "게임 정보", pol: "Info o grze", ptb: "Info do jogo", rus: "Инфо об игре", spa: "Info del juego", tha: "ข้อมูลเกม", tur: "Oyun Bilgisi", zhs: "游戏信息" },
  "About the Site":  { eng: "About the Site", deu: "Über die Seite", esp: "Sobre el sitio", fra: "À propos du site", ita: "Info sul sito", jpn: "サイトについて", kor: "사이트 정보", pol: "O stronie", ptb: "Sobre o site", rus: "О сайте", spa: "Sobre el sitio", tha: "เกี่ยวกับเว็บ", tur: "Site Hakkında", zhs: "关于本站" },

  // Misc
  "Share":           { eng: "Share", deu: "Teilen", esp: "Compartir", fra: "Partager", ita: "Condividi", jpn: "共有", kor: "공유", pol: "Udostępnij", ptb: "Compartilhar", rus: "Поделиться", spa: "Compartir", tha: "แชร์", tur: "Paylaş", zhs: "分享" },
  "Loading...":      { eng: "Loading...", deu: "Laden...", esp: "Cargando...", fra: "Chargement...", ita: "Caricamento...", jpn: "読み込み中...", kor: "로딩...", pol: "Ładowanie...", ptb: "Carregando...", rus: "Загрузка...", spa: "Cargando...", tha: "กำลังโหลด...", tur: "Yükleniyor...", zhs: "加载中..." },
  "Not Found":       { eng: "Not Found", deu: "Nicht gefunden", esp: "No encontrado", fra: "Non trouvé", ita: "Non trovato", jpn: "見つかりません", kor: "찾을 수 없음", pol: "Nie znaleziono", ptb: "Não encontrado", rus: "Не найдено", spa: "No encontrado", tha: "ไม่พบ", tur: "Bulunamadı", zhs: "未找到" },
  "Damage Values":   { eng: "Damage Values", deu: "Schadenswerte", esp: "Valores de daño", fra: "Valeurs de dégâts", ita: "Valori di danno", jpn: "ダメージ値", kor: "데미지 수치", pol: "Wartości obrażeń", ptb: "Valores de dano", rus: "Значения урона", spa: "Valores de daño", tha: "ค่าความเสียหาย", tur: "Hasar Değerleri", zhs: "伤害值" },
  "Block Values":    { eng: "Block Values", deu: "Blockwerte", esp: "Valores de bloqueo", fra: "Valeurs de blocage", ita: "Valori di blocco", jpn: "ブロック値", kor: "방어 수치", pol: "Wartości bloku", ptb: "Valores de bloqueio", rus: "Значения блока", spa: "Valores de bloqueo", tha: "ค่าป้องกัน", tur: "Blok Değerleri", zhs: "格挡值" },
  "Moves":           { eng: "Moves", deu: "Züge", esp: "Movimientos", fra: "Coups", ita: "Mosse", jpn: "ムーブ", kor: "행동", pol: "Ruchy", ptb: "Movimentos", rus: "Ходы", spa: "Movimientos", tha: "การเคลื่อนไหว", tur: "Hamleler", zhs: "招式" },
};

/**
 * Get a translated UI string.
 * Keys are the English display text (e.g., "Back to", "Overview").
 */
export function t(key: string, lang: string): string {
  const entry = UI[key];
  if (!entry) return key;
  return entry[lang] || entry.eng || key;
}
