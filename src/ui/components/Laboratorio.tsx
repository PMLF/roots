"use client";
import { useEffect, useMemo, useState } from "react";
import type { SummaryClub, SummaryCompetition, LabMatch, LabLeague } from "@/engine/api/contratos";
import { FORMATION_IDS, STYLES } from "@/engine/jogo/formacoes";
import type { Style, FormationId, Side } from "@/engine/jogo/tipos";
import type { Key } from "@/ui/i18n";
import { useT } from "@/ui/i18n/LocaleProvider";
import { abbreviationPosition } from "@/ui/i18n/posicao";
import type { ClientEngine } from "@/ui/engineClient";
import { momentInText } from "@/ui/jogo/momentos";
import { EntityLink } from "@/ui/components/Ligacao";

const newSeed = () => Math.random().toString(36).slice(2, 10);
const um = (x: number) => x.toFixed(1);
const two = (x: number) => x.toFixed(2);

type Tab = "match" | "league";

/** Sandbox para dar feedback (RZ-139): simula sem gravar nada no save. */
export function Lab({ engine }: { engine: ClientEngine }) {
  const { t } = useT();
  const [sep, setSep] = useState<Tab>("match");
  const [competitions, setCompetitions] = useState<SummaryCompetition[] | null>(null);
  const [clubs, setClubs] = useState<SummaryClub[]>([]);
  const [withoutWorld, setWithoutWorld] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      const world = await engine.call("worldState", null);
      if (!live) return;
      if (!world) return setWithoutWorld(true);
      const [c, l] = await Promise.all([engine.call("competitions", null), engine.call("clubs", null)]);
      if (live) { setCompetitions(c); setClubs(l); }
    })().catch(() => live && setWithoutWorld(true));
    return () => { live = false; };
  }, [engine]);

  return (
    <section>
      <h1>{t("lab.titulo")}</h1>
      <p className="suave">{t("lab.intro")}</p>
      {withoutWorld && <p data-testid="lab-sem-mundo">{t("lab.semMundo")}</p>}
      {competitions && (
        <>
          <div className="separadores" role="tablist">
            {(["match", "league"] as const).map((s) => (
              <button key={s} type="button" role="tab" aria-selected={sep === s} onClick={() => setSep(s)}>{t(`lab.sep.${s}` as Key)}</button>
            ))}
          </div>
          {sep === "match" ? <MatchUm engine={engine} competitions={competitions} clubs={clubs} /> : <LeagueUma engine={engine} competitions={competitions} />}
        </>
      )}
    </section>
  );
}

function CompetitionSelector({ competitions, value, onChange }: { competitions: SummaryCompetition[]; value: string; onChange: (v: string) => void }) {
  const { t } = useT();
  return (
    <label>
      {t("lab.competicao")}{" "}
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {competitions.map((c) => <option key={c.league} value={c.league}>{c.league} ({t("lab.clubesN", { n: c.clubs })})</option>)}
      </select>
    </label>
  );
}

type CfgSide = { league: string; club: string; formation: FormationId; style: Style };

function MatchUm({ engine, competitions, clubs }: { engine: ClientEngine; competitions: SummaryCompetition[]; clubs: SummaryClub[] }) {
  const { t, locale } = useT();
  const initial = (i: number): CfgSide => {
    const league = competitions[0]?.league ?? "";
    return { league, club: clubs.filter((c) => c.league === league)[i]?.id ?? "", formation: "4-3-3", style: "balanced" };
  };
  const [home, setHome] = useState<CfgSide>(() => initial(0));
  const [away, setAway] = useState<CfgSide>(() => initial(1));
  const [seed, setSeed] = useState(newSeed);
  const [r, setR] = useState<LabMatch | null>(null);
  const [error, setError] = useState<string>();
  const [running, setRunning] = useState(false);

  const simulate = async (seedValue = seed) => {
    setRunning(true); setError(undefined);
    try {
      setR(await engine.call("matchLab", {
        home: home.club, away: away.club, seed: seedValue,
        homeTactic: { formation: home.formation, style: home.style }, awayTactic: { formation: away.formation, style: away.style },
      }));
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setRunning(false); }
  };

  return (
    <div>
      <div className="lab-lados">
        {([["home", home, setHome], ["away", away, setAway]] as const).map(([side, cfg, set]) => (
          <fieldset key={side} className="painel">
            <legend>{t(`lab.${side}` as Key)}</legend>
            <p><CompetitionSelector competitions={competitions} value={cfg.league} onChange={(league) => set({ ...cfg, league, club: clubs.find((c) => c.league === league)?.id ?? "" })} /></p>
            <p>
              <select aria-label={t(`lab.${side}` as Key)} value={cfg.club} onChange={(e) => set({ ...cfg, club: e.target.value })} data-testid={`lab-${side}`}>
                {clubs.filter((c) => c.league === cfg.league).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </p>
            <p>
              <label>{t("lab.formacao")}{" "}
                <select value={cfg.formation} onChange={(e) => set({ ...cfg, formation: e.target.value as FormationId })}>{FORMATION_IDS.map((f) => <option key={f}>{f}</option>)}</select>
              </label>{" "}
              <label>{t("lab.estilo")}{" "}
                <select value={cfg.style} onChange={(e) => set({ ...cfg, style: e.target.value as Style })}>{STYLES.map((s) => <option key={s} value={s}>{t(`lab.estilo.${s}` as Key)}</option>)}</select>
              </label>
            </p>
          </fieldset>
        ))}
      </div>
      <p className="tabela-barra">
        <label>{t("lab.seed")} <input value={seed} onChange={(e) => setSeed(e.target.value)} /></label>
        <button type="button" onClick={() => setSeed(newSeed())}>{t("lab.novaSeed")}</button>
        <button type="button" onClick={() => simulate()} disabled={running || !home.club || !away.club || home.club === away.club} data-testid="lab-simular-jogo">{running ? t("lab.aSimular") : t("lab.simular")}</button>
      </p>
      {error && <p className="erro">{t("lab.erro", { error })}</p>}
      {r && <MatchResult r={r} locale={locale} />}
    </div>
  );
}

function MatchResult({ r, locale }: { r: LabMatch; locale: "pt-PT" | "en" }) {
  const { t } = useT();
  const report = r.report;
  const name = (id: string) => r.names[id] ?? id;
  const names = { player: name, club: { home: r.home.name, away: r.away.name } };
  const stat = (k: keyof typeof report.home, f: (x: number) => string = String): [string, string, string] => [t(`lab.stat.${String(k)}` as Key), f(report.home[k] as number), f(report.away[k] as number)];
  const lines: [string, string, string][] = [
    [t("lab.posse"), `${Math.round(report.homePossession * 100)}%`, `${Math.round((1 - report.homePossession) * 100)}%`],
    stat("chances"), stat("shots"), stat("onTarget"), stat("xg", two), stat("corners"), stat("fouls"), stat("yellows"), stat("reds"), stat("injuries"),
  ];
  const best = report.players.find((j) => j.id === report.matchMan);
  const bySide = (side: Side) => report.players.filter((j) => j.side === side);
  const posDe = (side: Side, id: string) => r.lineups[side].find((j) => j.id === id)?.position;
  return (
    <div data-testid="lab-jogo-resultado">
      <h2 className="lab-marcador">{r.home.name} {report.homeGoals}–{report.awayGoals} {r.away.name}</h2>
      <p className="suave">{t("lab.intervalo", { home: report.halfTime.home, away: report.halfTime.away })}{best ? ` · ${t("lab.homemDoJogo", { name: name(best.id), rating: um(best.rating) })}` : ""}</p>
      <table className="tabela">
        <tbody>{lines.map(([k, a, b]) => <tr key={k}><td>{a}</td><th scope="row">{k}</th><td>{b}</td></tr>)}</tbody>
      </table>
      <h3>{t("lab.momentos")}</h3>
      {report.moments.length === 0 ? <p className="vazio">{t("lab.semGolos")}</p> : <ul>{report.moments.map((m, i) => <li key={i}>{momentInText(locale, m, names)}</li>)}</ul>}
      <h3>{t("lab.historias")}</h3>
      {r.stories.length === 0 ? <p className="vazio">{t("lab.semHistorias")}</p> : <p>{r.stories.map((h) => t(`lab.historia.${h}` as Key)).join(" · ")}</p>}
      <h3>{t("lab.onzes")}</h3>
      <div className="lab-lados">
        {(["home", "away"] as const).map((side) => (
          <table key={side} className="tabela">
            <caption>{r[side].name} ({r[side].tactic.formation})</caption>
            <thead><tr><th>{t("lab.col.jogador")}</th><th>{t("lab.col.min")}</th><th>{t("lab.col.golos")}</th><th>{t("lab.col.assist")}</th><th>{t("lab.col.nota")}</th></tr></thead>
            <tbody>
              {bySide(side).map((j) => (
                <tr key={j.id}><td>{abbreviationPosition(t, posDe(side, j.id) ?? j.position)} {name(j.id)}</td><td>{j.minutes}</td><td>{j.goals}</td><td>{j.assists}</td><td>{um(j.rating)}</td></tr>
              ))}
            </tbody>
          </table>
        ))}
      </div>
    </div>
  );
}

function LeagueUma({ engine, competitions }: { engine: ClientEngine; competitions: SummaryCompetition[] }) {
  const { t } = useT();
  const [league, setLeague] = useState(competitions[0]?.league ?? "");
  const [formation, setFormation] = useState<FormationId>("4-3-3");
  const [seed, setSeed] = useState(newSeed);
  const [r, setR] = useState<LabLeague | null>(null);
  const [error, setError] = useState<string>();
  const [running, setRunning] = useState(false);

  const simulate = async () => {
    setRunning(true); setError(undefined);
    try { setR(await engine.call("leagueLab", { league, seed, formation })); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setRunning(false); }
  };
  const total = useMemo(() => r && ([
    ["lab.total.golos", two(r.totals.goalsPerMatch)], ["lab.total.amarelos", two(r.totals.yellowsPerMatch)], ["lab.total.vermelhos", two(r.totals.redsPerMatch)],
    ["lab.total.lesoes", two(r.totals.injuriesPerMatch)], ["lab.total.goleadas", String(r.totals.routs)], ["lab.total.hatTricks", String(r.totals.hatTricks)],
  ] as const), [r]);

  return (
    <div>
      <p className="tabela-barra">
        <CompetitionSelector competitions={competitions} value={league} onChange={setLeague} />
        <label>{t("lab.todosFormacao")} <select value={formation} onChange={(e) => setFormation(e.target.value as FormationId)}>{FORMATION_IDS.map((f) => <option key={f}>{f}</option>)}</select></label>
        <label>{t("lab.seed")} <input value={seed} onChange={(e) => setSeed(e.target.value)} /></label>
        <button type="button" onClick={() => setSeed(newSeed())}>{t("lab.novaSeed")}</button>
        <button type="button" onClick={simulate} disabled={running} data-testid="lab-simular-liga">{running ? t("lab.aSimular") : t("lab.simular")}</button>
      </p>
      {error && <p className="erro">{t("lab.erro", { error })}</p>}
      {r && (
        <div data-testid="lab-liga-resultado">
          <p className="suave">{t("lab.resumoLiga", { matches: r.matches, rounds: r.rounds, ms: r.totals.ms })}</p>
          <table className="tabela">
            <thead><tr>{(["pos", "club", "matches", "v", "e", "d", "gm", "gs", "diff", "pts", "tiebreak", "rep"] as const).map((c) => <th key={c}>{t(`lab.col.${c}` as Key)}</th>)}</tr></thead>
            <tbody>
              {r.table.map((l) => (
                <tr key={l.club}>
                  <td>{l.position}</td><td><EntityLink k="club" id={l.club}>{l.name}</EntityLink></td><td>{l.matches}</td><td>{l.wins}</td><td>{l.draws}</td><td>{l.losses}</td>
                  <td>{l.scoredGoals}</td><td>{l.concededGoals}</td><td>{l.difference}</td><td><strong>{l.points}</strong></td>
                  <td>{l.tiebreakPer ? t(`lab.desempate.${l.tiebreakPer}` as Key) : ""}</td><td>{l.reputation}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="lab-lados">
            <div>
              <h3>{t("lab.artilheiros")}</h3>
              <table className="tabela">
                <tbody>{r.topScorers.map((a) => <tr key={a.player}><td><EntityLink k="person" id={a.player}>{a.name}</EntityLink></td><td>{a.club}</td><td>{a.goals}</td></tr>)}</tbody>
              </table>
            </div>
            <div>
              <h3>{t("lab.totais")}</h3>
              <table className="tabela"><tbody>{total?.map(([k, v]) => <tr key={k}><th scope="row">{t(k)}</th><td>{v}</td></tr>)}</tbody></table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
