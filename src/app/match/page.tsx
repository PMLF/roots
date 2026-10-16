"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import type { LiveMatch } from "@/engine/epoca/jogoAoVivo";
import type { Tactic } from "@/engine/jogo/tipos";
import { Icon } from "@/ui/components/Icone";
import { EventIcon } from "@/ui/components/IconeEvento";
import { EntityLink } from "@/ui/components/Ligacao";
import { ClubSwatch } from "@/ui/components/AmostraClube";
import { TeamCard, Meetings, Statistics, HistoryEvents, XgChart, HeaderInfo, HalfTime, OthersMatches, LiveTable, TacticInMatch } from "@/ui/components/jogo/PainelJogo";
import { SubstitutionsInMatch, SubsCounters, withoutSubstitutions } from "@/ui/components/jogo/Substituicoes";
import { save, read } from "@/ui/armazenamento";
import { useDevMode } from "@/ui/dev";
import type { Key } from "@/ui/i18n";
import { useT } from "@/ui/i18n/LocaleProvider";
import { useOwnClub } from "@/ui/meuClube";
import { useEngine } from "@/ui/MotorProvider";

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
  const [subsOpen, setIsOpenSubs] = useState(false);
  const [subsError, setSubsError] = useState<string | undefined>(undefined);
  const seenHalfTime = useRef<string | undefined>(undefined);
  const ofHalfTimePause = useRef(false);

  useEffect(() => { setTab(read("raizes.separadorJogo", isTab) ?? "match"); }, []);
  useEffect(() => { setSpeed(read("raizes.velocidadeJogo", isSpeed) ?? 0); }, []);
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
      if (!j.ongoing) { setRunning(false); ended(); }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRunning(false);
    }
  }, [engine, ended]);

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
    setIsOpenTactic(true);
  };
  const closeTactic = useCallback(() => {
    setIsOpenTactic((isOpen) => { if (isOpen) setRunning(beforeRan.current); return false; });
    if (ofHalfTimePause.current) { ofHalfTimePause.current = false; setHalfTime(true); }
  }, []);
  const openSubs = () => {
    beforeRan.current = running;
    setRunning(false);
    setSubsError(undefined);
    setIsOpenSubs(true);
  };
  const closeSubs = useCallback(() => {
    setIsOpenSubs((isOpen) => { if (isOpen) setRunning(beforeRan.current); return false; });
    if (ofHalfTimePause.current) { ofHalfTimePause.current = false; setHalfTime(true); }
  }, []);
  const confirmSubs = async (substitutions: { playerOut: string; playerIn: string }[]) => {
    if (!engine) return;
    setChanging(true);
    try { setMatch(await engine.call("substitutionsInMatch", { substitutions })); closeSubs(); } catch (e) { setSubsError(e instanceof Error ? e.message : String(e)); } finally { setChanging(false); }
  };
  const halfTimeSubs = () => { ofHalfTimePause.current = true; setHalfTime(false); openSubs(); };
  const halfTimeTactic = () => { ofHalfTimePause.current = true; setHalfTime(false); openTactic(); };
  const secondHalf = () => { setHalfTime(false); setRunning(true); };
  const changeTactic = async (tactic: Tactic) => {
    if (!engine) return;
    setChanging(true);
    try { setMatch(await engine.call("tacticInMatch", { tactic })); setError(undefined); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setChanging(false); }
  };

  if (match === undefined) return <p>{t("ficha.aCarregar")}</p>;
  if (match === null) return <p className="vazio">{t("jogo.semJogo")} <Link href="/">{t("jogo.voltar")}</Link></p>;
  const minute = match.minute ?? match.duration;
  const last = match.lines.filter((l) => l.minute <= minute).at(-1);
  const gc = last?.homeGoals ?? 0;
  const gf = last?.awayGoals ?? 0;
  return (
    <section className="pagina-jogo">
      <p className="suave jogo-contexto"><EntityLink k="competition" id={match.competition}>{match.competition}</EntityLink> · {t("jogo.jornada", { n: match.round })} · {match.date}</p>
      <HeaderInfo match={match} />
      <div className="placar" aria-live="polite">
        <span className="placar-equipa placar-casa"><ClubSwatch colours={match.colours?.[match.home.id]} /><EntityLink k="club" id={match.home.id} withoutSwatch>{match.home.name}</EntityLink></span>
        <b className="placar-golos">{gc}–{gf}</b>
        <span className="placar-equipa placar-fora"><EntityLink k="club" id={match.away.id} withoutSwatch>{match.away.name}</EntityLink><ClubSwatch colours={match.colours?.[match.away.id]} /></span>
      </div>
      <p className="relogio">{ongoing ? `${Math.floor(minute)}'` : t("jogo.terminado")}</p>
      {ongoing && match.subs && <p className="subs-resumo"><SubsCounters subs={match.subs} /></p>}
      {ongoing ? (
        <>
          <div className="controlos-fixos" role="group" aria-label={t("jogo.controlos")}>
            <button type="button" className="primario controlo-principal" onClick={() => setRunning((v) => !v)} disabled={tacticOpen || subsOpen} aria-label={running ? t("jogo.pausa") : minute === 0 ? t("jogo.comecar") : t("jogo.continuar")}>
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d={running ? "M7 5h3.500v14H7zM13.500 5H17v14h-3.500z" : "M8 5v14l11-7z"} fill="currentColor" /></svg>
              <span>{running ? t("jogo.pausa") : minute === 0 ? t("jogo.comecar") : t("jogo.continuar")}</span>
            </button>
            <span className="velocidade-seg" role="radiogroup" aria-label={t("jogo.velocidade")}>
              {SPEEDS.map((v, i) => (
                <button key={v.label} type="button" role="radio" aria-checked={speed === i} onClick={() => { setSpeed(i); save("raizes.velocidadeJogo", i); }}>{v.label}</button>
              ))}
            </span>
            {dev && (
              <button type="button" className="controlo-saltar" title={t("jogo.saltar")} aria-label={t("jogo.saltar")} onClick={() => { setRunning(false); void step(500); }}>
                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M5 5v14l9-7zM16.500 5H19v14h-2.500z" fill="currentColor" /></svg>
              </button>
            )}
          </div>
          <div className="acoes controlos-jogo">
            <button type="button" onClick={openTactic}><Icon name="tactic" />{t("jogo.taticaBotao")}</button>
            <button type="button" onClick={openSubs} disabled={minute < 1 || withoutSubstitutions(match.subs, minute === halfTimeMinute)} title={withoutSubstitutions(match.subs, minute === halfTimeMinute) ? t("jogo.subs.semMais") : undefined}><EventIcon rowKey="substitution" />{t("jogo.subs.botao")}</button>
            <label><input type="checkbox" checked={importantOnly} onChange={(e) => setImportantOnly(e.target.checked)} /> {t("jogo.soImportante")}</label>
          </div>
        </>
      ) : null}
      {error && <p className="erro" role="alert">{error}</p>}
      {halfTime && ongoing && <HalfTime match={match} onTactic={halfTimeTactic} aoSubs={halfTimeSubs} onContinue={secondHalf} />}
      {subsOpen && ongoing && <SubstitutionsInMatch match={match} busy={changing} {...(subsError ? { error: subsError } : {})} onConfirm={(x) => void confirmSubs(x)} onClose={closeSubs} />}
      {tacticOpen && ongoing && match.tactic && <TacticInMatch tactic={match.tactic} onChange={(x) => void changeTactic(x)} onClose={closeTactic} busy={changing} />}
      <div className="separadores" role="tablist" aria-label={t("jogo.separadores")}>
        {TABS.map((x) => (
          <button key={x} type="button" role="tab" id={`sep-${x}`} aria-selected={tab === x} aria-controls={`pn-${x}`} onClick={() => { setTab(x); save("raizes.separadorJogo", x); }}>{t(`jogo.tab.${x}` as Key)}</button>
        ))}
      </div>
      <div role="tabpanel" id={`pn-${tab}`} aria-labelledby={`sep-${tab}`}>
        {tab === "match" && (
          <>
            <section className="painel painel-eventos" aria-label={t("jogo.eventos")}>
              <h2>{t("jogo.eventos")}</h2>
              <HistoryEvents match={match} importantOnly={importantOnly} />
            </section>
            <div className="jogo-grelha">
              <div className="jogo-coluna"><TeamCard match={match} side="home" /></div>
              <div className="jogo-coluna"><TeamCard match={match} side="away" /></div>
              <div className="jogo-coluna"><OthersMatches match={match} mine={mine ?? undefined} /><LiveTable match={match} mine={mine ?? undefined} /></div>
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
