"use client";
import { useState } from "react";
import type { CupView } from "@/engine/api/contracts";
import { ClubSwatch } from "@/ui/components/ClubSwatch";
import { EntityLink } from "@/ui/components/Link";
import type { Key } from "@/ui/i18n";
import { useT } from "@/ui/i18n/LocaleProvider";

const TIER_SHORT: Record<string, Key> = { firstLeague: "tier.short.firstLeague", secondLeague: "tier.short.secondLeague", thirdLeague: "tier.short.thirdLeague", cp: "tier.short.cp", district: "tier.short.district" };

/** Nome de uma ronda da taça ("Final", "Meias-finais · 1.ª mão", "Ronda 3"…). */
export function useRoundName() {
  const { t } = useT();
  return (r: { key: string; n: number; leg?: 1 | 2 }) => {
    const base = r.key === "round" ? t("cup.round.round", { n: r.n }) : t(`cup.round.${r.key}` as Key);
    return r.leg ? `${base} · ${t("cup.leg", { n: r.leg })}` : base;
  };
}

/** Rondas de uma taça: todas as linhas com cores dos clubes e divisão de cada equipa nas pontas (como nos resultados do dia). */
export function CupRounds({ cup, compact = false }: { cup: CupView; compact?: boolean }) {
  const { t } = useT();
  const name = useRoundName();
  const last = cup.rounds.findIndex((r) => r.matches.some((m) => m.homeGoals === undefined));
  const [open, setOpen] = useState<number | null>(null);
  const shown = open ?? (last === -1 ? cup.rounds.length - 1 : last);
  const tag = (tier?: string) => {
    const k = tier ? TIER_SHORT[tier] : undefined;
    return k ? <small className="escalao-etiqueta" title={t(`tier.${tier}` as Key)}>{t(k)}</small> : <span />;
  };
  if (cup.rounds.length === 0) return <p className="vazio">{t("cup.noDraw")}</p>;
  const visible = compact ? [cup.rounds[shown]!] : cup.rounds;
  return (
    <div className="taca-rondas">
      {compact && (
        <div className="taca-nav">
          <button type="button" disabled={shown === 0} onClick={() => setOpen(shown - 1)} aria-label={t("cup.prev")}>‹</button>
          <b>{name(cup.rounds[shown]!)}</b>
          <button type="button" disabled={shown >= cup.rounds.length - 1} onClick={() => setOpen(shown + 1)} aria-label={t("cup.next")}>›</button>
        </div>
      )}
      {visible.map((r) => (
        <div key={`${r.n}-${r.leg ?? 0}`}>
          {!compact && <h3 className="taca-ronda">{name(r)} <small className="suave">{r.date}</small></h3>}
          <ul className="outros-jogos">
            {r.matches.map((m) => (
              <li key={m.id} className="com-escalao">
                {tag(m.homeTier)}
                <span className="nome-clube nome-casa"><EntityLink k="club" id={m.home} withoutSwatch>{m.homeName}</EntityLink><ClubSwatch id={m.home} className="amostra-dir" /></span>
                <b className="marcador-pequeno">
                  {m.homeGoals === undefined ? "–" : `${m.homeGoals}–${m.awayGoals}`}
                  {m.shootout ? <small className="marcador-nota">{t("results.pens", { a: m.shootout.home, b: m.shootout.away })}</small> : m.extraTime ? <small className="marcador-nota">{t("results.afterExtra")}</small> : null}
                </b>
                <span className="nome-clube nome-fora"><ClubSwatch id={m.away} className="amostra-esq" /><EntityLink k="club" id={m.away} withoutSwatch>{m.awayName}</EntityLink></span>
                {tag(m.awayTier)}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
