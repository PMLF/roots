"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { MouseEvent } from "react";
import type { CompetitionPage } from "@/engine/api/contracts";
import { EntityLink } from "@/ui/components/Link";
import { useT } from "@/ui/i18n/LocaleProvider";
import { TAB_URL } from "@/ui/links";

type H = CompetitionPage["highlights"];
type Player = H["topScorers"][number];
type Team = { club: string; name: string; value: number };

const rating = (v: number) => v.toFixed(2);

function Mosaic({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="destaque-mosaico">
      <span className="suave">{label}</span>
      <span className="destaque-valor">{children}</span>
    </div>
  );
}

const player = (p: Player | undefined, fmt?: (v: number) => string) =>
  p ? <><EntityLink k="person" id={p.player}>{p.name}</EntityLink> <b>{fmt ? fmt(p.value) : p.value}</b></> : <span className="suave">—</span>;
const team = (c: Team | undefined) => (c ? <><EntityLink k="club" id={c.club}>{c.name}</EntityLink> <b>{c.value}</b></> : <span className="suave">—</span>);

export function PlayersList({ title, items, fmt }: { title: string; items: Player[]; fmt?: (v: number) => string }) {
  const { t } = useT();
  return (
    <section className="bloco-lista">
      <h3>{title}</h3>
      {items.length === 0 ? (
        <p className="vazio">{t("highlights.noData")}</p>
      ) : (
        <ol className="destaque-lista">
          {items.map((p) => (
            <li key={p.player}>
              <span><EntityLink k="person" id={p.player}>{p.name}</EntityLink> <span className="suave">· <EntityLink k="club" id={p.club}>{p.clubName}</EntityLink></span></span>
              <b>{fmt ? fmt(p.value) : p.value}</b>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function TeamsList({ title, items }: { title: string; items: Team[] }) {
  const { t } = useT();
  return (
    <section className="bloco-lista">
      <h3>{title}</h3>
      {items.length === 0 ? (
        <p className="vazio">{t("highlights.noData")}</p>
      ) : (
        <ol className="destaque-lista">
          {items.map((c) => (
            <li key={c.club}><span><EntityLink k="club" id={c.club}>{c.name}</EntityLink></span><b>{c.value}</b></li>
          ))}
        </ol>
      )}
    </section>
  );
}

/**
 * Cartão horizontal e baixo, sem título, com o primeiro de cada estatística. Carregar nele (ou em «Ver mais») leva ao
 * separador Estatísticas da mesma página, onde há espaço para as listas completas.
 */
export function HighlightsPanel({ h }: { h: H }) {
  const { t } = useT();
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const open = () => {
    const fresh = new URLSearchParams(params.toString());
    fresh.set("tab", TAB_URL["statistics"] ?? "stats");
    fresh.delete("sort");
    router.push(`${path}?${fresh.toString()}`, { scroll: false });
  };
  const onLoad = (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest("a, button")) return; // as ligações dentro do cartão não o abrem
    open();
  };
  return (
    <section className="cartao cartao-destaques larga" onClick={onLoad}>
      <div className="destaque-mosaicos">
        <Mosaic label={t("highlights.bestScorer")}>{player(h.topScorers[0])}</Mosaic>
        <Mosaic label={t("highlights.bestAssistant")}>{player(h.topAssists[0])}</Mosaic>
        <Mosaic label={t("highlights.bestPlayer")}>{player(h.bestRated[0], rating)}</Mosaic>
        <Mosaic label={t("highlights.mostYellows")}>{player(h.mostYellow[0])}</Mosaic>
        <Mosaic label={t("highlights.mostReds")}>{player(h.mostRed[0])}</Mosaic>
        <Mosaic label={t("competitions.bestAttack")}>{team(h.bestAttack)}</Mosaic>
        <Mosaic label={t("competitions.bestDefence")}>{team(h.bestDefence)}</Mosaic>
      </div>
      <button type="button" className="cartao-destaques-mais" onClick={open}>{t("highlights.seeMore")} ›</button>
    </section>
  );
}
