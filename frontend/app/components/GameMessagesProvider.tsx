"use client";

import {
  NextIntlClientProvider,
  useLocale,
  useMessages,
  type AbstractIntlMessages,
} from "next-intl";
import { useMemo, type ReactNode } from "react";
import { useGameTables } from "@/lib/game-i18n";
import { GAME_ROOT, type GameMessages } from "@/lib/game-messages.common";

/** Adds a page's game strings under the "game" namespace next to the UI
 * catalog the layout already provides. */
export default function GameMessagesProvider({
  messages,
  children,
}: {
  messages: GameMessages;
  children: ReactNode;
}) {
  const locale = useLocale();
  const base = useMessages();
  const merged = useMemo(
    () => ({ ...base, [GAME_ROOT]: messages }) as AbstractIntlMessages,
    [base, messages],
  );
  return (
    <NextIntlClientProvider locale={locale} messages={merged}>
      {children}
    </NextIntlClientProvider>
  );
}

/** Same provider for client-only pages: fetches whole tables for the current
 * locale and channel and serves {} until they arrive. */
export function GameTablesProvider({
  tables,
  beta,
  children,
}: {
  tables: string[];
  beta?: boolean;
  children: ReactNode;
}) {
  const messages = useGameTables(tables, beta);
  return (
    <GameMessagesProvider messages={messages}>{children}</GameMessagesProvider>
  );
}
