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
const CUPS_KEY = "raizes.competitions.cups";
const DEFAULT = ["Primeira Liga", "Segunda Liga", "Terceira Liga"];
const MIN = 3;
const isChoices = (v: unknown): v is Record<string, boolean> => typeof v === "object" && v !== null && !Array.isArray(v) && Object.values(v).every((x) => typeof x === "boolean");
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

/** Botão com painel flutuante (fecha ao clicar fora ou com Escape). */
function Picker({ label, children }: { label: string; children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isOpen) return;
    const away = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setIsOpen(false); };
    const tier = (e: KeyboardEvent) => { if (e.key === "Escape") setIsOpen(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", tier);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", tier); };
  }, [isOpen]);
  return (
    <div className="seletor-ligas" ref={ref}>
      <button type="button" aria-expanded={isOpen} aria-haspopup="true" onClick={() => setIsOpen((v) => !v)}>{label} <span aria-hidden="true">▾</span></button>
      {isOpen && <div className="seletor-painel" role="group" aria-label={label}>{children}</div>}
    </div>
  );
}

/** Competições (RZ-145): as classificações das ligas escolhidas, cada uma com os seus destaques. */
export default function CompetitionsPage() {
  const { t } = useT();
  const engine = useEngine();
  const [list, setList] = useState<SummaryCompetition[] | null | undefined>(undefined);
  const [chosen, setChosen] = useState<string[]>(DEFAULT);
  /** Escolhas do gamer para taças e europeias: nome → mostrar. Sem escolha, mostram-se as nacionais e europeias e escondem-se as distritais. */
  const [choices, setChoices] = useState<Record<string, boolean>>({});
  const [districts, setDistricts] = useState<CupView[]>([]);
  const [cups, setCups] = useState<CupView[]>([]);
  const [europe, setEurope] = useState<EuropeView[]>([]);
  const [pages, setPages] = useState<Record<string, CompetitionPage>>({});
  /** Época escolhida; sem escolha mostra-se a época atual (o momento de agora). */
  const [season, setSeason] = useState<number | undefined>(undefined);
  const pageKey = (league: string) => `${league}|${season ?? "current"}`;

  useEffect(() => {
    const saved = read(KEY, isList);
    setChosen(saved && saved.length >= MIN ? saved : DEFAULT);
    setChoices(read(CUPS_KEY, isChoices) ?? {});
  }, []);
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
    engine.call("districtCups", null).then((c) => live && setDistricts(c)).catch(() => undefined);
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
  const defaultShown = (name: string) => !districts.some((d) => d.competition === name);
  const shown = (name: string) => choices[name] ?? defaultShown(name);
  const toggleCup = (name: string) => {
    const fresh = { ...choices, [name]: !shown(name) };
    setChoices(fresh);
    save(CUPS_KEY, fresh);
  };
  const setMany = (names: string[], on: boolean) => {
    const fresh = { ...choices, ...Object.fromEntries(names.map((n) => [n, on])) };
    setChoices(fresh);
    save(CUPS_KEY, fresh);
  };
  const nationalNames = cups.map((c) => c.competition);
  const europeNames = europe.map((c) => c.competition);
  const districtNames = districts.map((c) => c.competition);
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
          <div className="seletores">
            <Picker label={`${t("competitions.choose")} (${chosen.length}/${list.length})`}>
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
            </Picker>
            {europeNames.length > 0 && (
              <Picker label={`${t("competitions.europe")} (${europeNames.filter(shown).length}/${europeNames.length})`}>
                <div className="seletor-acoes">
                  <button type="button" onClick={() => setMany(europeNames, true)}>{t("competitions.all")}</button>
                  <button type="button" onClick={() => setMany(europeNames, false)}>{t("competitions.none")}</button>
                </div>
                <fieldset>
                  {europeNames.map((name) => (
                    <label key={name}><input type="checkbox" checked={shown(name)} onChange={() => toggleCup(name)} /><span>{name}</span></label>
                  ))}
                </fieldset>
              </Picker>
            )}
            {nationalNames.length + districtNames.length > 0 && (
              <Picker label={`${t("competitions.cups")} (${[...nationalNames, ...districtNames].filter(shown).length}/${nationalNames.length + districtNames.length})`}>
                <div className="seletor-acoes">
                  <button type="button" onClick={() => setMany(nationalNames, true)}>{t("competitions.nationalCups")}</button>
                  <button type="button" onClick={() => setMany([...nationalNames, ...districtNames], false)}>{t("competitions.none")}</button>
                </div>
                <fieldset>
                  <legend>{t("competitions.nationalCupsTitle")}</legend>
                  {nationalNames.map((name) => (
                    <label key={name}><input type="checkbox" checked={shown(name)} onChange={() => toggleCup(name)} /><span>{name}</span></label>
                  ))}
                </fieldset>
                {districtNames.length > 0 && (
                  <fieldset className="seletor-colunas">
                    <legend>{t("competitions.districtCupsTitle")}</legend>
                    {districtNames.map((name) => (
                      <label key={name}><input type="checkbox" checked={shown(name)} onChange={() => toggleCup(name)} /><span>{name}</span></label>
                    ))}
                  </fieldset>
                )}
              </Picker>
            )}
          </div>
          {visible.length === 0 && [...nationalNames, ...europeNames, ...districtNames].every((n) => !shown(n)) && <p className="vazio">{t("competitions.noSelection")}</p>}
          <div className="ligas-grelha">
            {[...cups, ...districts].filter((c) => shown(c.competition)).map((c) => (
              <Card key={c.competition} title={<EntityLink k="competition" id={c.competition}>{c.competition}</EntityLink>}>
                <p className="suave cartao-sub">{c.done && c.winner ? t("cup.wonBy", { club: c.winner.name }) : c.seasonLabel}</p>
                <CupRounds cup={c} compact />
              </Card>
            ))}
            {europe.filter((c) => shown(c.competition)).map((c) => (
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
