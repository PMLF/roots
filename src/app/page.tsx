"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { CompetitionPage, ClubProfileData, CreatedWorldSummary } from "@/engine/api/contratos";
import type { NewsItem } from "@/engine/noticias/noticias";
import { ResignButton, ChooseInitialClub } from "@/ui/components/ComClube";
import { ResultsFita } from "@/ui/components/FitaResultados";
import { NewsItemView } from "@/ui/components/ItemNoticia";
import { ClubSwatch } from "@/ui/components/AmostraClube";
import { EntityLink } from "@/ui/components/Ligacao";
import { useRecentInbox } from "@/ui/useCaixa";
import { useDevMode } from "@/ui/dev";
import { useT } from "@/ui/i18n/LocaleProvider";
import { clubMatches } from "@/ui/jogosClube";
import { useOwnClub } from "@/ui/meuClube";
import { useEngine } from "@/ui/MotorProvider";
import { useTime } from "@/ui/useTempo";

const Day = 86_400_000;
const betweenDays = (de: string, until: string) => Math.round((Date.parse(`${until}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / Day);

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
  const when = days === undefined ? "" : days <= 0 ? t("inicio.hoje") : days === 1 ? t("inicio.amanha") : t("inicio.emDias", { n: days });
  const longDate = (d: string) => new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));
  const fita = (time.last?.days ?? []).flatMap((d) => d.matches).filter((j) => (club ? j.competition === club.profile.league : mine ? j.home === mine || j.away === mine : false)).slice(-40);
  const summary = time.last?.seasonSummary;

  if (world === null) {
    return (
      <section className="inicio">
        <h1>{t("hoje.titulo")}</h1>
        <p data-testid="hoje-sem-mundo">{t("hoje.semMundo")} <Link href="/world/">{t("hoje.criarMundo")}</Link></p>
      </section>
    );
  }

  const homeAway = next && club ? (next.home ? [club.profile.name, next.opponentName] : [next.opponentName, club.profile.name]) : [];
  const decisions = (time.pause ? 1 : 0) + (world && !mine ? 1 : 0);

  return (
    <section className="inicio">
      <header className="inicio-cabecalho">
        <h1>{t("hoje.titulo")}</h1>
        {club && (
          <p className="inicio-clube">
            <EntityLink k="club" id={club.profile.id}>{club.profile.name}</EntityLink>
            <span className="suave"> · <EntityLink k="competition" id={club.profile.league}>{club.profile.league}</EntityLink></span>
          </p>
        )}
        <span className="espaco" />
        {dev && world && <span className="suave" data-testid="hoje-mundo">{t("hoje.mundo", { seed: world.seed, people: world.people })}</span>}
        {club && <ResignButton />}
      </header>

      <section className="painel inicio-seguir" aria-labelledby="i-seguir">
        <h2 id="i-seguir">{t("inicio.seguir")}</h2>
        {next && club ? (
          <>
            <div className="inicio-jogo">
              <p className="inicio-confronto">{next.home ? <><ClubSwatch id={club.profile.id} /><EntityLink k="club" id={club.profile.id} withoutSwatch>{homeAway[0]}</EntityLink></> : <><ClubSwatch id={pj?.opponentId} />{pj?.opponentId ? <EntityLink k="club" id={pj.opponentId} withoutSwatch>{homeAway[0]}</EntityLink> : homeAway[0]}</>} <span className="suave">{t("inicio.vs")}</span> {next.home ? <><ClubSwatch id={pj?.opponentId} />{pj?.opponentId ? <EntityLink k="club" id={pj.opponentId} withoutSwatch>{homeAway[1]}</EntityLink> : homeAway[1]}</> : <><ClubSwatch id={club.profile.id} /><EntityLink k="club" id={club.profile.id} withoutSwatch>{homeAway[1]}</EntityLink></>}</p>
              <p className="suave">{t(next.home ? "inicio.emCasa" : "inicio.fora")} · {club.profile.league} {next.round > 0 && <>· {t("inicio.jornada", { n: next.round })}</>}</p>
            </div>
            <dl className="inicio-factos">
              <div><dt>{t("inicio.quando")}</dt><dd>{when} <span className="suave">· {longDate(next.date)}</span></dd></div>
              {line && <div><dt>{t("inicio.classificacao")}</dt><dd>{t("hoje.posicao", { pos: line.position, league: club.profile.league })}</dd></div>}
            </dl>
          </>
        ) : (
          <p className="vazio">{!mine ? t("inicio.semClube") : club ? t("hoje.seguirVazio") : t("ficha.aCarregar")}</p>
        )}
      </section>

      {summary && (
        <section className="painel resumo-epoca" aria-label={t("hoje.epocaAcabou", { season: summary.season })}>
          <p><b>{t("hoje.epocaAcabou", { season: summary.season })}</b></p>
          <p className="suave">{t("hoje.campeoes")}: {summary.champions.map((c, i) => <span key={c.club}>{i > 0 && " · "}<EntityLink k="club" id={c.club} withoutSwatch>{c.name}</EntityLink> (<EntityLink k="competition" id={c.league}>{c.league}</EntityLink>)</span>)}</p>
          {mine && summary.movements.filter((m) => m.club === mine).map((m) => <p key={m.club}>{t(m.reason === "relegation" ? "hoje.desceste" : "hoje.subiste")}</p>)}
          <p className="suave">{t("hoje.movimentos", { n: summary.movements.length })}</p>
        </section>
      )}

      <div className="inicio-colunas">
        <section className="painel" aria-labelledby="i-decisao">
          <h2 id="i-decisao">{t("hoje.decisao")}{decisions > 0 && <span className="distintivo" aria-label={t("inicio.pendentes", { n: decisions })}>{decisions}</span>}</h2>
          {time.pause && (
            <div className="decisao">
              <p><b>{t(time.pause.ongoing ? "hoje.jogoEmCurso" : "hoje.jogoHoje", { match: `${time.pause.atHome ? "" : "@ "}${time.pause.opponent}` })}</b></p>
              <p className="acoes">
                <button id="confirmar-jogo" type="button" className="primario" disabled={time.advancing} onClick={() => router.push(time.pause?.ongoing ? "/match/" : "/prematch/")}>{t(time.pause.ongoing ? "hoje.continuarJogo" : "hoje.confirmarJogar")}</button>
                <Link href="/tactics/">{t("hoje.verTatica")}</Link>
              </p>
            </div>
          )}
          {world && !mine && <ChooseInitialClub />}
          {decisions === 0 && <p className="vazio">{t("hoje.decisaoVazio")}</p>}
        </section>

        <section className="painel" aria-labelledby="i-caixa">
          <h2 id="i-caixa">{t("menu.caixa")}{inbox.unread > 0 && <span className="distintivo" aria-label={t("caixa.naoLidas", { n: inbox.unread })}>{inbox.unread > 99 ? "99+" : inbox.unread}</span>}</h2>
          {inbox.messages.length === 0 ? <p className="vazio">{t("caixa.vazio")}</p> : (
            <ul className="lista-compacta">
              {inbox.messages.map((m) => <li key={m.id}><NewsItemView n={m} unread={!m.isRead} compact onToggleIsRead={() => { void engine?.call("markMessage", { id: m.id, isRead: !m.isRead }).then(() => window.dispatchEvent(new Event("raizes:caixa"))); }} /></li>)}
            </ul>
          )}
          <p className="painel-rodape"><Link href="/inbox/">{t("inicio.verCaixa")}</Link>{inbox.unread > 0 && <button type="button" className="ligacao-botao" onClick={() => { void engine?.call("markInboxRead", null).then(() => window.dispatchEvent(new Event("raizes:caixa"))); }}>{t("caixa.marcarLidas")}</button>}</p>
        </section>

        <section className="painel" aria-labelledby="i-noticias">
          <h2 id="i-noticias">{t("menu.noticias")}</h2>
          {news.length === 0 ? <p className="vazio">{t("noticias.vazio")}</p> : (
            <ul className="lista-compacta">
              {news.map((n) => <li key={n.id}><NewsItemView n={n} compact /></li>)}
            </ul>
          )}
          <p className="painel-rodape"><Link href="/news/">{t("noticias.verTodas")}</Link></p>
        </section>
      </div>

      <ResultsFita matches={fita} />
    </section>
  );
}
