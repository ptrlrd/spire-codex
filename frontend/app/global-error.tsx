"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { LANG_HREFLANG, type LangCode } from "@/lib/languages";

const COPY: Record<string, [string, string, string]> = {
  eng: ["Something went wrong", "An unexpected error occurred.", "Try again"],
  deu: [
    "Etwas ist schiefgelaufen",
    "Ein unerwarteter Fehler ist aufgetreten.",
    "Erneut versuchen",
  ],
  esp: ["Algo salió mal", "Se produjo un error inesperado.", "Reintentar"],
  fra: [
    "Une erreur s'est produite",
    "Une erreur inattendue s'est produite.",
    "Réessayer",
  ],
  ita: [
    "Qualcosa è andato storto",
    "Si è verificato un errore imprevisto.",
    "Riprova",
  ],
  ara: ["حدث خطأ ما", "حدث خطأ غير متوقع.", "إعادة المحاولة"],
  ind: ["Terjadi kesalahan", "Terjadi kesalahan tak terduga.", "Coba lagi"],
  jpn: ["問題が発生しました", "予期しないエラーが発生しました。", "再試行"],
  kor: ["문제가 발생했습니다", "예기치 않은 오류가 발생했습니다.", "다시 시도"],
  pol: [
    "Coś poszło nie tak",
    "Wystąpił nieoczekiwany błąd.",
    "Spróbuj ponownie",
  ],
  ptb: ["Algo deu errado", "Ocorreu um erro inesperado.", "Tentar novamente"],
  rus: ["Что-то пошло не так", "Произошла непредвиденная ошибка.", "Повторить"],
  spa: ["Algo salió mal", "Se produjo un error inesperado.", "Reintentar"],
  tha: ["เกิดข้อผิดพลาด", "เกิดข้อผิดพลาดที่ไม่คาดคิด", "ลองอีกครั้ง"],
  tur: ["Bir şeyler ters gitti", "Beklenmeyen bir hata oluştu.", "Tekrar dene"],
  zhs: ["出了点问题", "发生了意外错误。", "重试"],
  zht: ["出了點問題", "發生了意外錯誤。", "重試"],
};

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);
  const code = (usePathname() ?? "").split("/")[1] ?? "";
  const [title, fallback, retry] = COPY[code] ?? COPY.eng;
  return (
    <html lang={LANG_HREFLANG[code as LangCode] ?? "en"}>
      <body
        style={{
          backgroundColor: "#0a1118",
          color: "#e0ddd8",
          fontFamily: "system-ui",
        }}
      >
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
          }}
        >
          <div style={{ textAlign: "center", maxWidth: "400px" }}>
            <h2
              style={{
                fontSize: "1.5rem",
                fontWeight: "bold",
                marginBottom: "0.5rem",
              }}
            >
              {title}
            </h2>
            <p
              style={{
                fontSize: "0.875rem",
                color: "#506570",
                marginBottom: "1.5rem",
              }}
            >
              {error.message || fallback}
            </p>
            <button
              onClick={reset}
              style={{
                padding: "0.5rem 1.25rem",
                borderRadius: "0.5rem",
                fontSize: "0.875rem",
                fontWeight: 500,
                backgroundColor: "#e8b830",
                color: "#0a1118",
                border: "none",
                cursor: "pointer",
              }}
            >
              {retry}
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
