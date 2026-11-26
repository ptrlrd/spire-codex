"use client";

import type { Card } from "@/lib/api/types";
import { useGameTables } from "@/lib/game-i18n";
import { useGameLocale } from "@/lib/i18n";
import type { CardEnchantment } from "./CardRender";
import CardRenderSlot from "./CardRenderSlot";
import {
  ENCHANTMENT_RULES,
  enchantmentExtraText,
  enchantmentReplayText,
} from "./card-render/Attachments";

const TABLES = ["enchantments", "static_hover_tips", "card_keywords"];

type Table = Record<string, Record<string, string> | undefined> | undefined;

function keywordKey(id: string): string {
  return id.charAt(0) + id.slice(1).toLowerCase();
}

export function useCardEnchantment(
  id: string | null | undefined,
  card: { target?: string | null } | null | undefined,
  amount = 1,
): { enchantment?: CardEnchantment; keywordNames?: Record<string, string> } {
  const lang = useGameLocale();
  const messages = useGameTables(id ? TABLES : []);
  if (!id) return {};
  const key = id.toUpperCase();
  const keywords = messages.card_keywords as Table;
  const names: Record<string, string> = {};
  for (const [k, v] of Object.entries(keywords ?? {})) {
    if (v?.title) names[keywordKey(k)] = v.title;
  }
  const added: Record<string, string> = {};
  for (const k of ENCHANTMENT_RULES[key]?.add ?? []) {
    const title = keywords?.[k.toUpperCase()]?.title;
    if (title) added[k] = title;
  }
  return {
    enchantment: {
      id: key,
      amount,
      extraText: enchantmentExtraText(
        (messages.enchantments as Table)?.[key]?.extraCardText,
        key,
        amount,
        card?.target,
        lang,
      ),
      replayText: enchantmentReplayText(
        (messages.static_hover_tips as Table)?.REPLAY?.extraText,
        key,
        lang,
      ),
      keywordNames: added,
    },
    keywordNames: keywords ? names : undefined,
  };
}

export default function EnchantedCard({
  card,
  enchantment,
  amount,
  upgraded = false,
  label = "",
  className,
}: {
  card: Card;
  enchantment: string;
  amount?: number | null;
  upgraded?: boolean;
  label?: string;
  className?: string;
}) {
  const lang = useGameLocale();
  const built = useCardEnchantment(enchantment, card, amount || 1);
  return (
    <CardRenderSlot
      card={card}
      upgraded={upgraded}
      lang={lang}
      label={label}
      keywordNames={built.keywordNames}
      enchantment={built.enchantment}
      className={className}
    />
  );
}
