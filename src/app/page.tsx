"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { BidView, CompetitionPage, ClubProfileData, CreatedWorldSummary } from "@/engine/api/contracts";
import type { NewsItem } from "@/engine/news/news";
import { BidDialog } from "@/ui/components/BidDialog";
import { ResignButton, ChooseInitialClub } from "@/ui/components/WithClub";
import { ResultsFita } from "@/ui/components/ResultsStrip";
import { NewsItemView } from "@/ui/components/NewsItem";
import { ClubSwatch } from "@/ui/components/ClubSwatch";
import { EntityLink } from "@/ui/components/Link";
import { useRecentInbox } from "@/ui/useCash";
import { useDevMode } from "@/ui/dev";
import { useT } from "@/ui/i18n/LocaleProvider";
import { clubMatches } from "@/ui/clubMatches";
import { useOwnClub } from "@/ui/myClub";
import { useEngine } from "@/ui/EngineProvider";
import { useTime } from "@/ui/useTime";

const DAY_MS = 86_400_000;
const betweenDays = (from: string, until: string) => Math.round((Date.parse(`${until}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

/**
 * Página inicial (TOM_E_UX §3.8, RZ-166), por hierarquia: o que vem a seguir em cima, num cartão baixo; por baixo, lado a lado,
 * o que exige decisão, a caixa de entrada e as notícias; no rodapé, a fita com os resultados e os marcadores.
 */
export default function Start() {
  const { t, locale } = useT();
  const engine = useEngine();
  const router = useRouter();
  const dev = useDevMode();
  const [world, setWorld] = useState<CreatedWorldSummary | null | undefined>(undefined);
  const [mine] = useOwnClub();
  const time = useTime();
  const inbox = useRecentInbox(5);

  useEffect(() => {
    if (!engine) return;
    let live = true;
    engine.call("worldState", null).then((m) => live && setWorld(m)).catch(() => live && setWorld(null));
    return () => { live = false; };
  }, [engine]);

  const [club, setClub] = useState<{ profile: ClubProfileData; league: CompetitionPage } | undefined>(undefined);
  useEffect(() => {
    if (!engine || !mine || !world) { setClub(undefined); return; }
    let live = true;
    (async () => {
      const profile = await engine.call("clubProfile", { id: mine });
      const league = profile ? await engine.call("competitionPage", { league: profile.league }) : null;
      if (live) setClub(profile && league ? { profile, league } : undefined);
    })().catch(() => live && setClub(undefined));
    return () => { live = false; };
  }, [engine, mine, world, time.state?.today]);

  // negociações do gamer por jogadores (RZ-231): em curso exigem decisão; acordos à espera da janela só informam
  const [openBids, setOpenBids] = useState<BidView[]>([]);
  const [resuming, setResuming] = useState<BidView | undefined>(undefined);
  const loadBids = () => { engine?.call("bids", null).then(setOpenBids).catch(() => undefined); };
  useEffect(loadBids, [engine, world, time.state?.today]);
  const pendingBids = openBids.filter((b) => b.stage === "club" || b.stage === "agent");
  const agreedBids = openBids.filter((b) => b.stage === "agreed" && b.moving);

  const [news, setNews] = useState<NewsItem[]>([]);
  useEffect(() => {
    if (!engine || !world) return;
    let live = true;
    engine.call("news", { scope: mine ? "league" : "world", limit: 5 }).then((l) => live && setNews(l)).catch(() => undefined);
    return () => { live = false; };
  }, [engine, world, mine, time.state?.today]);

  // o próximo jogo vem do plano (data real do jogo); a jornada, do calendário da liga
  const pj = time.nextMatch;
  const row = pj && club ? clubMatches(club.league, club.profile.id).find((j) => j.id === pj.id) : undefined;
  const next = pj && club ? { home: pj.atHome, opponentName: pj.opponent, date: pj.date, round: row?.round ?? 0 } : undefined;
  const line = club?.league.table.find((r) => r.club === club.profile.id);
  const today = time.state?.today;
  const days = next && today ? betweenDays(today, next.date) : undefined;
  const when = days === undefined ? "" : days <= 0 ? t("start.today") : days === 1 ? t("start.tomorrow") : t("start.inDays", { n: days });
  const longDate = (d: string) => new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));
  const fita = (time.last?.days ?? []).flatMap((d) => d.matches).filter((j) => (club ? j.competition === club.profile.league : mine ? j.home === mine || j.away === mine : false)).slice(-40);
  const summary = time.last?.seasonSummary;

  if (world === null) {
    return (
      <section className="inicio">
        <h1>{t("today.title")}</h1>
        <p data-testid="hoje-sem-mundo">{t("today.noWorld")} <Link href="/world/">{t("today.createWorld")}</Link></p>
      </section>
    );
  }

  const homeAway = next && club ? (next.home ? [club.profile.name, next.opponentName] : [next.opponentName, club.profile.name]) : [];
  const decisions = (time.pause ? 1 : 0) + (world && !mine ? 1 : 0) + pendingBids.length;

  return (
    <section className="inicio">
      <header className="inicio-cabecalho">
        <h1>{t("today.title")}</h1>
        {club && (
          <p className="inicio-clube">
            <EntityLink k="club" id={club.profile.id}>{club.profile.name}</EntityLink>
            <span className="suave"> · <EntityLink k="competition" id={club.profile.league}>{club.profile.league}</EntityLink></span>
          </p>
        )}
        <span className="espaco" />
        {dev && world && <span className="suave" data-testid="hoje-mundo">{t("today.world", { seed: world.seed, people: world.people })}</span>}
        {club && <ResignButton />}
      </header>

      <section className="painel inicio-seguir" aria-labelledby="i-seguir">
        <h2 id="i-seguir">{t("start.follow")}</h2>
        {next && club ? (
          <>
            <div className="inicio-jogo">
              <p className="inicio-confronto">{next.home ? <><ClubSwatch id={club.profile.id} /><EntityLink k="club" id={club.profile.id} withoutSwatch>{homeAway[0]}</EntityLink></> : <><ClubSwatch id={pj?.opponentId} />{pj?.opponentId ? <EntityLink k="club" id={pj.opponentId} withoutSwatch>{homeAway[0]}</EntityLink> : homeAway[0]}</>} <span className="suave">{t("start.vs")}</span> {next.home ? <><ClubSwatch id={pj?.opponentId} />{pj?.opponentId ? <EntityLink k="club" id={pj.opponentId} withoutSwatch>{homeAway[1]}</EntityLink> : homeAway[1]}</> : <><ClubSwatch id={club.profile.id} /><EntityLink k="club" id={club.profile.id} withoutSwatch>{homeAway[1]}</EntityLink></>}</p>
              <p className="suave">{t(next.home ? "start.atHome" : "start.away")} · {club.profile.league} {next.round > 0 && <>· {t("start.round", { n: next.round })}</>}</p>
            </div>
            <dl className="inicio-factos">
              <div><dt>{t("start.when")}</dt><dd>{when} <span className="suave">· {longDate(next.date)}</span></dd></div>
              {line && <div><dt>{t("start.standings")}</dt><dd>{t("today.position", { pos: line.position, league: club.profile.league })}</dd></div>}
            </dl>
          </>
        ) : (
          <p className="vazio">{!mine ? t("start.noClub") : club ? t("today.followEmpty") : t("profile.loading")}</p>
        )}
      </section>

      {summary && (
        <section className="painel resumo-epoca" aria-label={t("today.seasonEnded", { season: summary.season })}>
          <p><b>{t("today.seasonEnded", { season: summary.season })}</b></p>
          <p className="suave">{t("today.champions")}: {summary.champions.map((c, i) => <span key={c.club}>{i > 0 && " · "}<EntityLink k="club" id={c.club} withoutSwatch>{c.name}</EntityLink> (<EntityLink k="competition" id={c.league}>{c.league}</EntityLink>)</span>)}</p>
          {mine && summary.movements.filter((m) => m.club === mine).map((m) => <p key={m.club}>{t(m.reason === "relegation" ? "today.youRelegated" : "today.youPromoted")}</p>)}
          <p className="suave">{t("today.movements", { n: summary.movements.length })}</p>
        </section>
      )}

      <div className="inicio-colunas">
        <section className="painel" aria-labelledby="i-decisao">
          <h2 id="i-decisao">{t("today.decisions")}{decisions > 0 && <span className="distintivo" aria-label={t("start.pending", { n: decisions })}>{decisions}</span>}</h2>
          {time.pause && (
            <div className="decisao">
              <p><b>{t(time.pause.ongoing ? "today.matchInProgress" : "today.matchToday", { match: `${time.pause.atHome ? "" : "@ "}${time.pause.opponent}` })}</b></p>
              <p className="acoes">
                <button id="confirmar-jogo" type="button" className="primario" disabled={time.advancing} onClick={() => router.push(time.pause?.ongoing ? "/match/" : "/prematch/")}>{t(time.pause.ongoing ? "today.continueMatch" : "today.confirmPlay")}</button>
                <Link href="/tactics/">{t("today.seeTactic")}</Link>
              </p>
            </div>
          )}
          {pendingBids.map((b) => (
            <div className="decisao" key={b.person}>
              <p><b>{t("bid.today", { name: b.name })}</b></p>
              <p className="acoes"><button type="button" className="primario" onClick={() => setResuming(b)}>{t("bid.continue")}</button></p>
            </div>
          ))}
          {agreedBids.map((b) => <p className="suave" key={b.person}>{t("bid.todayAgreed", { name: b.name, date: b.moving?.date ?? "" })}</p>)}
          {resuming && <BidDialog person={resuming.person} name={resuming.name} onClose={() => { setResuming(undefined); loadBids(); }} />}
          {world && !mine && <ChooseInitialClub />}
          {decisions === 0 && agreedBids.length === 0 && <p className="vazio">{t("today.emptyDecision")}</p>}
        </section>

        <section className="painel" aria-labelledby="i-caixa">
          <h2 id="i-caixa">{t("menu.inbox")}{inbox.unread > 0 && <span className="distintivo" aria-label={t("inbox.unread", { n: inbox.unread })}>{inbox.unread > 99 ? "99+" : inbox.unread}</span>}</h2>
          {inbox.messages.length === 0 ? <p className="vazio">{t("inbox.empty")}</p> : (
            <ul className="lista-compacta">
              {inbox.messages.map((m) => <li key={m.id}><NewsItemView n={m} unread={!m.isRead} compact onToggleIsRead={() => { void engine?.call("markMessage", { id: m.id, isRead: !m.isRead }).then(() => window.dispatchEvent(new Event("raizes:caixa"))); }} /></li>)}
            </ul>
          )}
          <p className="painel-rodape"><Link href="/inbox/">{t("start.seeInbox")}</Link>{inbox.unread > 0 && <button type="button" className="ligacao-botao" onClick={() => { void engine?.call("markInboxRead", null).then(() => window.dispatchEvent(new Event("raizes:caixa"))); }}>{t("inbox.markAllRead")}</button>}</p>
        </section>

        <section className="painel" aria-labelledby="i-noticias">
          <h2 id="i-noticias">{t("menu.news")}</h2>
          {news.length === 0 ? <p className="vazio">{t("news.empty")}</p> : (
            <ul className="lista-compacta">
              {news.map((n) => <li key={n.id}><NewsItemView n={n} compact /></li>)}
            </ul>
          )}
        </section>
      </div>

      <ResultsFita matches={fita} />
    </section>
  );
}
