"use client";
import { useEffect, useRef, useState } from "react";
import type { CompetitionPage, CupView, EuropeView, SummaryCompetition } from "@/engine/api/contracts";
import { Card } from "@/ui/components/Card";
import { CupRounds } from "@/ui/components/competition/CupRounds";
import { EuropeTable } from "@/ui/components/competition/EuropeTable";
import { LeagueTable } from "@/ui/components/competition/LeagueTable";
import { EntityLink } from "@/ui/components/Link";
import { save, read } from "@/ui/storage";
import type { Key } from "@/ui/i18n";
import { useT } from "@/ui/i18n/LocaleProvider";
import { useEngine } from "@/ui/EngineProvider";

const GROUPS: { rowKey: Key; tiers: readonly string[]; columns?: true }[] = [
  { rowKey: "competitions.professionals", tiers: ["firstLeague", "secondLeague", "thirdLeague"] },
  { rowKey: "tier.cp", tiers: ["cp"], columns: true },
  { rowKey: "tier.district", tiers: ["district"], columns: true },
];
const KEY = "raizes.competitions.selected";
const DEFAULT = ["Primeira Liga", "Segunda Liga", "Terceira Liga"];
const MIN = 3;
const isList = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");

function Highlights({ p }: { p: CompetitionPage }) {
  const { t } = useT();
  const h = p.highlights;
  const line = (label: string, value: React.ReactNode) => (
    <li><span className="suave">{label}</span><span>{value}</span></li>
  );
  const player = (x: CompetitionPage["highlights"]["topScorers"][number] | undefined, fmt?: (v: number) => string) =>
    x ? <><EntityLink k="person" id={x.player}>{x.name}</EntityLink> <b>{fmt ? fmt(x.value) : x.value}</b></> : "—";
  const club = (x: { club: string; name: string; value: number } | undefined) => (x ? <><EntityLink k="club" id={x.club}>{x.name}</EntityLink> <b>{x.value}</b></> : "—");
  return (
    <ul className="destaques-mini">
      {line(t("competitions.bestScorer"), player(h.topScorers[0]))}
      {line(t("competitions.bestPlayer"), player(h.bestRated[0], (v) => v.toFixed(2)))}
      {line(t("competitions.bestAttack"), club(h.bestAttack))}
      {line(t("competitions.bestDefence"), club(h.bestDefence))}
    </ul>
  );
}

/** Competições (RZ-145): as classificações das ligas escolhidas, cada uma com os seus destaques. */
export default function CompetitionsPage() {
  const { t } = useT();
  const engine = useEngine();
  const [list, setList] = useState<SummaryCompetition[] | null | undefined>(undefined);
  const [chosen, setChosen] = useState<string[]>(DEFAULT);
  const [isOpen, setIsOpen] = useState(false);
  const selector = useRef<HTMLDivElement>(null);
  const [cups, setCups] = useState<CupView[]>([]);
  const [europe, setEurope] = useState<EuropeView[]>([]);
  const [pages, setPages] = useState<Record<string, CompetitionPage>>({});
  /** Época escolhida; sem escolha mostra-se a época atual (o momento de agora). */
  const [season, setSeason] = useState<number | undefined>(undefined);
  const pageKey = (league: string) => `${league}|${season ?? "current"}`;

  useEffect(() => {
    const saved = read(KEY, isList);
    setChosen(saved && saved.length >= MIN ? saved : DEFAULT);
  }, []);
  useEffect(() => {
    if (!isOpen) return;
    const away = (e: MouseEvent) => { if (!selector.current?.contains(e.target as Node)) setIsOpen(false); };
    const tier = (e: KeyboardEvent) => { if (e.key === "Escape") setIsOpen(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", tier);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", tier); };
  }, [isOpen]);
  useEffect(() => {
    if (!engine) return;
    let live = true;
    engine.call("worldState", null).then((m) => (m ? engine.call("competitions", null) : null)).then((c) => live && setList(c)).catch(() => live && setList(null));
    return () => { live = false; };
  }, [engine]);
  useEffect(() => {
    if (!engine || !list) return;
    let live = true;
    engine.call("nationalCups", null).then((c) => live && setCups(c)).catch(() => undefined);
    engine.call("europeCups", null).then((c) => live && setEurope(c)).catch(() => undefined);
    return () => { live = false; };
  }, [engine, list]);
  useEffect(() => {
    if (!engine || !list) return;
    let live = true;
    (async () => {
      for (const league of chosen) {
        if (pages[pageKey(league)] || !list.some((c) => c.league === league)) continue;
        const p = await engine.call("competitionPage", season ? { league: league, season: season } : { league: league });
        if (live && p) setPages((before) => ({ ...before, [pageKey(league)]: p }));
      }
    })().catch(() => undefined);
    return () => { live = false; };
    // as páginas já carregadas não voltam a pedir-se
  }, [engine, list, chosen, season]);

  const set = (fresh: string[]) => {
    setChosen(fresh);
    save(KEY, fresh);
  };
  const toggle = (league: string) => {
    if (chosen.includes(league)) {
      if (chosen.length > MIN) set(chosen.filter((x) => x !== league));
    } else set([...chosen, league]);
  };
  const seasons = Object.values(pages)[0]?.seasons ?? [];
  const visible = list ? list.filter((c) => chosen.includes(c.league)) : [];

  return (
    <section>
      <h1>{t("competitions.title")}</h1>
      {list === null && <p className="vazio">{t("today.noWorld")}</p>}
      {list && (
        <>
          {seasons.length > 1 && (
            <label className="seletor-epoca">
              <span className="suave">{t("competitions.season")}</span>{" "}
              <select value={season ?? seasons[seasons.length - 1]!.season} onChange={(e) => { const v = Number(e.target.value); setSeason(v === seasons[seasons.length - 1]!.season ? undefined : v); }}>
                {[...seasons].reverse().map((x, i) => <option key={x.season} value={x.season}>{i === 0 ? t("competitions.currentSeason", { season: x.label }) : x.label}</option>)}
              </select>
            </label>
          )}
          <div className="seletor-ligas" ref={selector}>
            <button type="button" aria-expanded={isOpen} aria-haspopup="true" onClick={() => setIsOpen((v) => !v)}>
              {t("competitions.choose")} ({chosen.length}/{list.length}) <span aria-hidden="true">▾</span>
            </button>
            {isOpen && (
              <div className="seletor-painel" role="group" aria-label={t("competitions.choose")}>
                <div className="seletor-acoes">
                  <button type="button" onClick={() => set(list.map((c) => c.league))}>{t("competitions.all")}</button>
                  <button type="button" onClick={() => set(DEFAULT)}>{t("competitions.fallback")}</button>
                  <span className="suave">{t("competitions.min", { n: MIN })}</span>
                </div>
                {GROUPS.map((g) => {
                  const leagues = list.filter((c) => (g.tiers as readonly string[]).includes(c.tier));
                  return leagues.length === 0 ? null : (
                    <fieldset key={g.rowKey} className={g.columns ? "seletor-colunas" : undefined}>
                      <legend>{t(g.rowKey)}</legend>
                      {leagues.map((c) => {
                        const scheduled = chosen.includes(c.league);
                        return (
                          <label key={c.league}>
                            <input type="checkbox" checked={scheduled} disabled={scheduled && chosen.length <= MIN} onChange={() => toggle(c.league)} />
                            <span>{c.league}</span>
                          </label>
                        );
                      })}
                    </fieldset>
                  );
                })}
              </div>
            )}
          </div>
          {visible.length === 0 && <p className="vazio">{t("competitions.noSelection")}</p>}
          <div className="ligas-grelha">
            {cups.map((c) => (
              <Card key={c.competition} title={<EntityLink k="competition" id={c.competition}>{c.competition}</EntityLink>}>
                <p className="suave cartao-sub">{c.done && c.winner ? t("cup.wonBy", { club: c.winner.name }) : c.seasonLabel}</p>
                <CupRounds cup={c} compact />
              </Card>
            ))}
            {europe.map((c) => (
              <Card key={c.competition} title={<EntityLink k="competition" id={c.competition}>{c.competition}</EntityLink>}>
                <p className="suave cartao-sub">{c.done && c.winner ? t("cup.wonBy", { club: c.winner.name }) : c.seasonLabel}</p>
                {c.rounds.length > 0 ? <CupRounds cup={c as CupView} compact /> : <EuropeTable view={c} compact />}
              </Card>
            ))}
            {visible.map((c) => {
              const p = pages[pageKey(c.league)];
              return (
                <Card key={c.league} title={<EntityLink k="competition" id={c.league}>{c.league}</EntityLink>}>
                  <p className="suave cartao-sub">{t("competitions.clubs", { n: c.clubs })}</p>
                  {p ? (
                    <>
                      <Highlights p={p} />
                      <LeagueTable page={p} compact />
                    </>
                  ) : (
                    <p className="vazio">{t("profile.loading")}</p>
                  )}
                </Card>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
