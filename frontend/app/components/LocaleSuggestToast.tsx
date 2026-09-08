"use client";

import { useEffect, useState } from "react";
import { Link, usePathname } from "@/i18n/navigation";
import { useGameLocale } from "@/lib/i18n";
import { ENGLISH_ONLY_PATHS, ENGLISH_ONLY_SECTIONS, LANG_NAMES, langFromBrowser } from "@/lib/languages";
import type { Locale } from "@/i18n/routing";

const COPY: Record<Locale, { text: string; open: string; dismiss: string }> = {
  eng: { text: "This page is also available in English.", open: "Switch to English", dismiss: "Dismiss" },
  deu: { text: "Diese Seite gibt es auch auf Deutsch.", open: "Auf Deutsch anzeigen", dismiss: "Schließen" },
  esp: { text: "Esta página también está disponible en español.", open: "Ver en español", dismiss: "Cerrar" },
  fra: { text: "Cette page est aussi disponible en français.", open: "Voir en français", dismiss: "Fermer" },
  ita: { text: "Questa pagina è disponibile anche in italiano.", open: "Vedi in italiano", dismiss: "Chiudi" },
  jpn: { text: "このページは日本語でも閲覧できます。", open: "日本語で表示", dismiss: "閉じる" },
  kor: { text: "이 페이지는 한국어로도 볼 수 있습니다.", open: "한국어로 보기", dismiss: "닫기" },
  pol: { text: "Ta strona jest dostępna także po polsku.", open: "Pokaż po polsku", dismiss: "Zamknij" },
  ptb: { text: "Esta página também está disponível em português.", open: "Ver em português", dismiss: "Fechar" },
  rus: { text: "Эта страница доступна и на русском языке.", open: "Открыть на русском", dismiss: "Закрыть" },
  spa: { text: "Esta página también está disponible en español.", open: "Ver en español", dismiss: "Cerrar" },
  tha: { text: "หน้านี้มีเวอร์ชันภาษาไทยด้วย", open: "ดูเป็นภาษาไทย", dismiss: "ปิด" },
  tur: { text: "Bu sayfa Türkçe olarak da mevcut.", open: "Türkçe görüntüle", dismiss: "Kapat" },
  zhs: { text: "此页面也提供简体中文版本。", open: "切换到简体中文", dismiss: "关闭" },
  zht: { text: "此頁面也提供繁體中文版本。", open: "切換到繁體中文", dismiss: "關閉" },
};

const STORAGE_KEY = "locale-suggest-dismissed";

function englishOnly(pathname: string): boolean {
  const parts = pathname.split("/");
  return ENGLISH_ONLY_SECTIONS.has(parts[1]) || ENGLISH_ONLY_PATHS.has(`${parts[1]}/${parts[2]}`) || (parts[1] === "timeline" && parts.length > 2);
}

export default function LocaleSuggestToast() {
  const current = useGameLocale();
  const pathname = usePathname();
  const [suggested, setSuggested] = useState<Locale | null>(null);

  useEffect(() => {
    let dismissed = "";
    try {
      dismissed = localStorage.getItem(STORAGE_KEY) ?? "";
    } catch {}
    const tags = navigator.languages?.length ? navigator.languages : [navigator.language];
    for (const tag of tags) {
      const hit = langFromBrowser(tag);
      if (!hit) continue;
      if (hit !== current && hit !== dismissed) setSuggested(hit);
      return;
    }
  }, [current]);

  if (!suggested || (suggested !== "eng" && englishOnly(pathname))) return null;
  const copy = COPY[suggested];
  const dismiss = () => {
    try {
      localStorage.setItem(STORAGE_KEY, suggested);
    } catch {}
    setSuggested(null);
  };
  return (
    <div
      role="status"
      className="fixed bottom-4 right-4 z-50 max-w-xs rounded-lg border border-[var(--accent-gold)] bg-[var(--bg-secondary)] p-3 pr-8 text-sm text-[var(--text-primary)] shadow-lg"
    >
      <p className="mb-2">{copy.text}</p>
      <Link href={pathname} locale={suggested} className="font-semibold underline text-[var(--accent-gold-light)]" onClick={dismiss}>
        {copy.open} ({suggested === "eng" ? "English" : LANG_NAMES[suggested]})
      </Link>
      <button type="button" onClick={dismiss} className="absolute right-2 top-2 text-[var(--text-muted)] hover:text-[var(--text-primary)]" aria-label={copy.dismiss}>
        ✕
      </button>
    </div>
  );
}
