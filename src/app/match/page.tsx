"use client";
import type { Position } from "@/engine/world/types";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import type { LiveMatch } from "@/engine/season/liveMatch";
import type { Tactic } from "@/engine/match/types";
import { Icon } from "@/ui/components/Icon";
import { EntityLink } from "@/ui/components/Link";
import { ClubSwatch } from "@/ui/components/ClubSwatch";
import { TeamCard, Meetings, Statistics, HistoryEvents, XgChart, HeaderInfo, HalfTime, OthersMatches, LiveTable } from "@/ui/components/match/MatchPanel";
import { liveTable } from "@/ui/match/matchView";
import { alertOf, lineKey, type MatchAlert } from "@/ui/match/alerts";
import { TacticInMatch } from "@/ui/components/match/LiveTactic";
import { SubsCounters } from "@/ui/components/match/Substitutions";
import { save, read } from "@/ui/storage";
import { useDevMode } from "@/ui/dev";
import type { Key } from "@/ui/i18n";
import { useT } from "@/ui/i18n/LocaleProvider";
import { useOwnClub } from "@/ui/myClub";
import { useEngine } from "@/ui/EngineProvider";

/** Segundos de relógio por minuto de jogo em cada velocidade. */
const SPEEDS = [{ label: "1×", sec: 0.5 }, { label: "2×", sec: 0.25 }, { label: "4×", sec: 0.1 }] as const;
const TABS = ["match", "statistics"] as const;
type Tab = (typeof TABS)[number];
const isTab = (v: unknown): v is Tab => TABS.includes(v as Tab);
const isSpeed = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) < SPEEDS.length;

function Content() {
  const { t } = useT();
  const engine = useEngine();
  const dev = useDevMode();
  const [mine] = useOwnClub();
  const router = useRouter();
  const params = useSearchParams();
  const id = params.get("id") ?? undefined;
  const launch = params.get("launch") === "1";
  const [match, setMatch] = useState<LiveMatch | null | undefined>(undefined);
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(0);
  const [tab, setTab] = useState<Tab>("match");
  const [importantOnly, setImportantOnly] = useState(false);
  const [tacticOpen, setIsOpenTactic] = useState(false);
  const [changing, setChanging] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const beforeRan = useRef(false);
  const [halfTime, setHalfTime] = useState(false);
  const [subsError, setSubsError] = useState<string | undefined>(undefined);
  const seenHalfTime = useRef<string | undefined>(undefined);
  const seenInjury = useRef<string | undefined>(undefined);
  const ofHalfTimePause = useRef(false);
  const [alert, setAlert] = useState<MatchAlert | undefined>(undefined);
  const alertState = useRef({ matchId: "", count: 0, wasRunning: false, mine: false, tactic: false });

  useEffect(() => { setTab(read("raizes.matchTab", isTab) ?? "match"); }, []);
  useEffect(() => { setSpeed(read("raizes.matchSpeed", isSpeed) ?? 0); }, []);
  useEffect(() => {
    if (!engine) return;
    let live = true;
    engine.call("liveMatch", id ? { id } : {}).then((j) => { if (live) { setMatch(j); setRunning(!!j?.ongoing && launch); } }).catch(() => live && setMatch(null));
    return () => { live = false; };
  }, [engine, id, launch]);

  const ended = useCallback(() => {
    for (const e of ["raizes:tempo", "raizes:caixa", "raizes:meuClube"]) window.dispatchEvent(new Event(e));
  }, []);

  const step = useCallback(async (minutes: number) => {
    if (!engine) return;
    try {
      const j = await engine.call("matchStep", { minutes });
      setMatch(j);
      if (!j.ongoing) { setRunning(false); ended(); router.push(`/results/?id=${encodeURIComponent(j.id)}`); }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRunning(false);
    }
  }, [engine, ended, router]);

  // o relógio: cada tique pede ao motor mais um minuto, com a tática em vigor nesse momento
  const ongoing = !!match?.ongoing;
  useEffect(() => {
    if (!match || !ongoing || !running) return;
    const timer = window.setTimeout(() => { void step(1); }, (SPEEDS[speed] as { sec: number }).sec * 1000);
    return () => window.clearTimeout(timer);
  }, [match, ongoing, running, speed, step]);

  // a barra de progresso do rodapé segue o jogo do gamer enquanto decorre
  const matchDuration = match?.duration;
  const matchMinute = match?.minute;
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("raizes:jogoEmCurso", { detail: ongoing && matchDuration ? { minute: matchMinute ?? 0, duration: matchDuration } : null }));
  }, [ongoing, matchMinute, matchDuration]);

  // ao intervalo o jogo pára e abre-se o popup (uma vez por jogo; ao reabrir a página no intervalo volta a abrir)
  const halfTimeMinute = match?.lines.find((l) => l.type === "halfTime")?.minute;
  const matchId = match?.id;
  useEffect(() => {
    if (!ongoing || halfTimeMinute === undefined || matchMinute !== halfTimeMinute || seenHalfTime.current === matchId) return;
    seenHalfTime.current = matchId;
    setRunning(false);
    setHalfTime(true);
  }, [ongoing, halfTimeMinute, matchMinute, matchId]);

  // lesão na equipa do gamer: o jogo pára e abre-se a janela «Tática e substituições» para ele resolver (uma vez por lesão)
  const pendingKey = match?.pendingInjury?.join(",");
  useEffect(() => {
    if (!ongoing || alert || !pendingKey || seenInjury.current === `${matchId}/${matchMinute}/${pendingKey}`) return;
    seenInjury.current = `${matchId}/${matchMinute}/${pendingKey}`;
    beforeRan.current = true;
    setRunning(false);
    setSubsError(undefined);
    setIsOpenTactic(true);
  }, [ongoing, alert, pendingKey, matchId, matchMinute]);

  // golo, vermelho ou lesão: o tempo pára 3 segundos com o lance a piscar no feed; depois o jogo continua (golo) ou abre-se «Tática e substituições» (vermelho/lesão na equipa do gamer)
  const lineCount = match?.lines.length ?? 0;
  alertState.current.tactic = tacticOpen;
  useEffect(() => {
    if (!match || !ongoing) return;
    const st = alertState.current;
    if (st.matchId !== match.id) { st.matchId = match.id; st.count = match.lines.length; return; }
    const fresh = match.lines.slice(st.count);
    st.count = match.lines.length;
    const line = [...fresh].reverse().find((l) => alertOf(l) !== undefined);
    if (!line) return;
    st.wasRunning = running;
    st.mine = line.side !== undefined && line.side === match.gamerSide;
    setRunning(false);
    setAlert({ key: lineKey(line), kind: alertOf(line) as MatchAlert["kind"] });
  }, [lineCount, match?.id]);
  useEffect(() => {
    if (!alert) return;
    const timer = window.setTimeout(() => {
      const st = alertState.current;
      setAlert(undefined);
      if (st.tactic) return;
      if (alert.kind !== "goal" && st.mine) { beforeRan.current = st.wasRunning; setSubsError(undefined); setIsOpenTactic(true); return; }
      if (st.wasRunning) setRunning(true);
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [alert]);

  // espaço: pausa e continua (a barra global não avança o tempo nesta página)
  useEffect(() => {
    if (!ongoing) return;
    const hotkey = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target instanceof Element && e.target.closest("input, textarea, select, button, a, [contenteditable]")) return;
      e.preventDefault();
      setRunning((v) => !v);
    };
    window.addEventListener("keydown", hotkey);
    return () => window.removeEventListener("keydown", hotkey);
  }, [ongoing]);

  const openTactic = () => {
    beforeRan.current = running;
    setRunning(false);
    setSubsError(undefined);
    setIsOpenTactic(true);
  };
  const closeTactic = useCallback(() => {
    setIsOpenTactic((isOpen) => { if (isOpen) setRunning(beforeRan.current); return false; });
    if (ofHalfTimePause.current) { ofHalfTimePause.current = false; setHalfTime(true); }
  }, []);
  const confirmSubs = async (substitutions: { playerOut: string; playerIn: string }[], positions: { player: string; position: Position }[] = []): Promise<boolean> => {
    if (!engine) return false;
    setChanging(true);
    setSubsError(undefined);
    try { setMatch(await engine.call("substitutionsInMatch", { substitutions, ...(positions.length > 0 ? { positions } : {}) })); return true; } catch (e) { setSubsError(e instanceof Error ? e.message : String(e)); return false; } finally { setChanging(false); }
  };
  const halfTimeTactic = () => { ofHalfTimePause.current = true; setHalfTime(false); openTactic(); };
  const secondHalf = () => { setHalfTime(false); setRunning(true); };
  const changeTactic = async (tactic: Tactic) => {
    if (!engine) return;
    setChanging(true);
    try { setMatch(await engine.call("tacticInMatch", { tactic })); setError(undefined); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setChanging(false); }
  };

  if (match === undefined) return <p>{t("profile.loading")}</p>;
  if (match === null) return <p className="vazio">{t("match.noMatch")} <Link href="/">{t("match.back")}</Link></p>;
  const minute = match.minute ?? match.duration;
  const last = match.lines.filter((l) => l.minute <= minute).at(-1);
  const hasTable = liveTable(match, minute).length > 0;
  const gc = last?.homeGoals ?? 0;
  const gf = last?.awayGoals ?? 0;
  return (
    <section className="pagina-jogo">
      <p className="suave jogo-contexto"><EntityLink k="competition" id={match.competition}>{match.competition}</EntityLink> · {t("match.round", { n: match.round })} · {match.date}</p>
      <HeaderInfo match={match} />
      <div className="placar" aria-live="polite">
        <span className="placar-equipa placar-casa"><ClubSwatch colours={match.colours?.[match.home.id]} /><EntityLink k="club" id={match.home.id} withoutSwatch>{match.home.name}</EntityLink></span>
        <b className="placar-golos">{gc}–{gf}</b>
        <span className="placar-equipa placar-fora"><EntityLink k="club" id={match.away.id} withoutSwatch>{match.away.name}</EntityLink><ClubSwatch colours={match.colours?.[match.away.id]} /></span>
      </div>
      <div className="jogo-estado">
        <p className="relogio">{ongoing ? `${Math.floor(minute)}'` : t("match.finished")}</p>
        {ongoing && match.subs && <SubsCounters subs={match.subs} />}
        {ongoing && (
          <span className="controlos-jogo">
            <button type="button" onClick={openTactic}><Icon name="tactic" />{t("match.tacticButton")}</button>
            <label><input type="checkbox" checked={importantOnly} onChange={(e) => setImportantOnly(e.target.checked)} /> {t("match.importantOnly")}</label>
          </span>
        )}
      </div>
      {ongoing ? (
        <>
          <div className="controlos-fixos" role="group" aria-label={t("match.controls")}>
            <button type="button" className="primario controlo-principal" onClick={() => setRunning((v) => !v)} disabled={tacticOpen} aria-label={running ? t("match.pause") : minute === 0 ? t("match.start") : t("match.continue")}>
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d={running ? "M7 5h3.500v14H7zM13.500 5H17v14h-3.500z" : "M8 5v14l11-7z"} fill="currentColor" /></svg>
              <span>{running ? t("match.pause") : minute === 0 ? t("match.start") : t("match.continue")}</span>
            </button>
            <span className="velocidade-seg" role="radiogroup" aria-label={t("match.speed")}>
              {SPEEDS.map((v, i) => (
                <button key={v.label} type="button" role="radio" aria-checked={speed === i} onClick={() => { setSpeed(i); save("raizes.matchSpeed", i); }}>{v.label}</button>
              ))}
            </span>
            {dev && (
              <button type="button" className="controlo-saltar" title={t("match.skip")} aria-label={t("match.skip")} onClick={() => { setRunning(false); void step(500); }}>
                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M5 5v14l9-7zM16.500 5H19v14h-2.500z" fill="currentColor" /></svg>
              </button>
            )}
          </div>
        </>
      ) : null}
      {error && <p className="erro" role="alert">{error}</p>}
      {halfTime && ongoing && <HalfTime match={match} onTactic={halfTimeTactic} onContinue={secondHalf} />}
      {tacticOpen && ongoing && match.tactic && <TacticInMatch match={match} tactic={match.tactic} onChange={(x) => void changeTactic(x)} onClose={closeTactic} busy={changing} {...(subsError ? { subsError } : {})} onConfirmSubs={confirmSubs} />}
      <div className="separadores" role="tablist" aria-label={t("match.tabs")}>
        {TABS.map((x) => (
          <button key={x} type="button" role="tab" id={`sep-${x}`} aria-selected={tab === x} aria-controls={`pn-${x}`} onClick={() => { setTab(x); save("raizes.matchTab", x); }}>{t(`match.tab.${x}` as Key)}</button>
        ))}
      </div>
      <div role="tabpanel" id={`pn-${tab}`} aria-labelledby={`sep-${tab}`}>
        {tab === "match" && (
          <>
            <section className="painel painel-eventos" aria-label={t("match.events")}>
              <h2>{t("match.events")}</h2>
              <HistoryEvents match={match} importantOnly={importantOnly} alert={alert} />
            </section>
            <div className={`jogo-grelha${hasTable ? " jogo-grelha-4" : ""}`}>
              <div className="jogo-coluna"><TeamCard match={match} side="home" /></div>
              <div className="jogo-coluna"><TeamCard match={match} side="away" /></div>
              <div className="jogo-coluna"><OthersMatches match={match} mine={mine ?? undefined} /></div>
              {hasTable && <div className="jogo-coluna"><LiveTable match={match} mine={mine ?? undefined} /></div>}
            </div>
          </>
        )}
        {tab === "statistics" && (
          <div className="jogo-grelha">
            <div className="jogo-coluna"><Statistics match={match} /></div>
            <div className="jogo-coluna"><XgChart match={match} /></div>
            <div className="jogo-coluna"><Meetings match={match} /></div>
          </div>
        )}
      </div>
    </section>
  );
}

/** Jogo (RZ-130/170): ao vivo, minuto a minuto, enquanto decorre; depois de jogado, só o resultado e os eventos. */
export default function MatchPage() {
  return <Suspense fallback={null}><Content /></Suspense>;
}
