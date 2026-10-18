"use client";
import type { LivePlayer, LiveMatch, LiveLine } from "@/engine/season/liveMatch";
import { useEffect, useRef, useState } from "react";
import { predominantColour } from "@/ui/colours";
import type { Style, Level, Tactic } from "@/engine/match/types";
import type { ReactNode } from "react";
import { ClubSwatch } from "@/ui/components/ClubSwatch";
import { Icon } from "@/ui/components/Icon";
import { CloseButton } from "@/ui/components/CloseButton";
import { EventIcon, iconKey } from "@/ui/components/EventIcon";
import { SubsCounters, withoutSubstitutions } from "@/ui/components/match/Substitutions";
import { EntityLink } from "@/ui/components/Link";
import type { Key } from "@/ui/i18n";
import { abbreviationPosition } from "@/ui/i18n/position";
import { useT } from "@/ui/i18n/LocaleProvider";
import { matchStatistics, scorerAt, liveTable, positionZone } from "@/ui/match/matchView";

type T = (c: Key, v?: Record<string, string | number>) => string;
const VARIANTS: Record<string, number> = { "match.goal.opens": 2, "match.goal.equalises": 2, "match.goal.turns": 2, "match.goal.rises": 2, "match.goal.drops": 2, "match.shot.saved": 3, "match.shot.away": 3, "match.shot.blocked": 3, "match.shot.goal": 3, "match.corner": 2, "match.penalty": 2, "match.yellow": 2, "match.red": 2, "match.injury": 2 };

/** Frase do comentário: várias por tipo de lance, escolhida de forma estável pelo minuto e pelo nome (RZ-131). */
function phrase(base: string, l: LiveLine, t: T): string {
  const n = VARIANTS[base] ?? 1;
  const h = Math.abs(Math.floor(l.minute * 7) + (l.name ?? "").length * 13);
  return t((n === 1 ? base : `${base}.${(h % n) + 1}`) as Key, { name: MARK.name });
}

/** O texto do comentário leva marcas no lugar dos nomes; `comLigacoes` troca-as por ligações às fichas. */
const MARK = { name: "\uE000n\uE000", assistant: "\uE000a\uE000", playerIn: "\uE000e\uE000" };
function withLinks(text: string, l: LiveLine): ReactNode[] {
  const target = (c: string) => (c === "n" ? { id: l.player, name: l.name } : c === "a" ? { id: l.assistantId, name: l.assistant } : { id: l.inId, name: l.playerIn });
  return text.split(/\uE000([nae])\uE000/).map((part, i) => {
    if (i % 2 === 0) return part;
    const a = target(part);
    return a.id ? <EntityLink key={i} k="person" id={a.id}>{a.name}</EntityLink> : (a.name ?? "");
  });
}

function lineText(l: LiveLine, t: T): string {
  switch (l.type) {
    case "start": return t("match.start");
    case "goal": return phrase(`match.goal.${l.situation ?? "opens"}`, l, t);
    case "shot": return phrase(`match.shot.${l.outcome ?? "away"}`, l, t);
    case "corner": return phrase("match.corner", l, t);
    case "penalty": return phrase("match.penalty", l, t);
    case "card": return l.colour === "red" && l.secondYellow ? phrase("match.secondYellow", l, t) : phrase(l.colour === "red" ? "match.red" : "match.yellow", l, t);
    case "injury": return phrase("match.injury", l, t);
    case "substitution": return t("match.substitution", { playerOut: MARK.name, playerIn: MARK.playerIn });
    case "halfTime": return t("match.halfTime");
    case "end": return t("match.end");
  }
}

/** O feed do jogo, do lance mais recente para o mais antigo. Só os lances do próprio jogo: os outros jogos têm cartão à parte. */
export function HistoryEvents({ match, importantOnly }: { match: LiveMatch; importantOnly: boolean }) {
  const { t } = useT();
  const minute = match.minute ?? match.duration;
  const lines = match.lines.filter((l) => l.minute <= minute && (!importantOnly || l.important || l.type === "end" || l.type === "halfTime" || l.type === "start"));
  const nameOf = (side: "home" | "away" | undefined) => (side === "home" ? match.home.name : side === "away" ? match.away.name : "");
  return (
    <ol className="feed" reversed aria-label={t("match.events")}>
      {[...lines].reverse().map((l, i) => (
        <li key={`${l.minute}-${l.type}-${lines.length - i}`} className={`feed-${l.type}${l.type === "card" && l.colour ? ` feed-cartao-${l.colour}` : ""}${l.important ? " importante" : ""}`}>
          <span className="feed-cab"><EventIcon rowKey={iconKey(l)} {...(l.type === "card" && l.colour ? { colour: l.colour } : {})} /><b>{Math.floor(l.minute)}'</b>{l.side && <span className="feed-clube"><EntityLink k="club" id={l.side === "home" ? match.home.id : match.away.id} withoutSwatch>{nameOf(l.side)}</EntityLink></span>}{l.type === "goal" && <b className="feed-marcador">{l.homeGoals}–{l.awayGoals}</b>}</span>
          <span className="feed-texto">{withLinks(lineText(l, t), l)}</span>
          {l.type === "goal" && l.assistant && <span className="feed-assist">{withLinks(t("match.attendance", { name: MARK.assistant }), l)}</span>}
        </li>
      ))}
      {lines.length === 0 && <li className="vazio">{t("match.kickoff")}</li>}
    </ol>
  );
}

/** A tabela da competição, com os resultados em curso somados. */
export function LiveTable({ match, mine }: { match: LiveMatch; mine?: string }) {
  const { t } = useT();
  const minute = match.minute ?? match.duration;
  const table = liveTable(match, minute);
  const inMatch = new Set([match.home.id, match.away.id]);
  return (
    <section className="painel" aria-labelledby="h-tabela">
      <h2 id="h-tabela">{t("match.table")}</h2>
      <table className="tabela-viva tabela">
        <thead><tr><th>{t("match.col.pos")}</th><th>{t("match.col.club")}</th><th>{t("match.col.j")}</th><th>{t("match.col.dg")}</th><th>{t("match.col.p")}</th></tr></thead>
        <tbody>
          {table.map((l) => (
            <tr key={l.club} className={[positionZone(l.pos, table.length, match.zones) ? `zona zona-${positionZone(l.pos, table.length, match.zones)}` : "", l.club === mine ? "meu-clube" : inMatch.has(l.club) ? "destaque" : l.playing ? "a-jogar" : ""].filter(Boolean).join(" ") || undefined}>
              <td>{l.pos}{l.pos < l.before ? <span className="sobe" aria-label="▲"> ▲</span> : l.pos > l.before ? <span className="desce" aria-label="▼"> ▼</span> : null}</td>
              <td className="nome-clube"><ClubSwatch colours={match.colours?.[l.club]} /><EntityLink k="club" id={l.club} withoutSwatch>{l.name}</EntityLink></td><td>{l.matches}</td><td>{l.dg > 0 ? `+${l.dg}` : l.dg}</td><td><b>{l.points}</b></td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/** Os outros jogos da mesma competição, no mesmo dia, com o marcador ao minuto. */
export function OthersMatches({ match, mine }: { match: LiveMatch; mine?: string }) {
  const { t } = useT();
  const minute = match.minute ?? match.duration;
  if (match.others.length === 0) return null;
  return (
    <section className="painel" aria-labelledby="h-outros">
      <h2 id="h-outros">{t("match.otherMatches")}</h2>
      <ul className="outros-jogos">
        {match.others.map((o) => {
          const [a, b] = scorerAt(o.goals, minute);
          return (
            <li key={o.id} className={o.home.id === mine || o.away.id === mine ? "meu-jogo" : undefined}>
              <ClubSwatch colours={match.colours?.[o.home.id]} className="amostra-esq" />
              <span className={`nome-clube nome-casa${o.home.id === mine ? " meu-clube" : ""}`}><EntityLink k="club" id={o.home.id} withoutSwatch>{o.home.name}</EntityLink></span>
              <b className="marcador-pequeno">{a}–{b}</b>
              <span className={`nome-clube nome-fora${o.away.id === mine ? " meu-clube" : ""}`}><EntityLink k="club" id={o.away.id} withoutSwatch>{o.away.name}</EntityLink></span>
              <ClubSwatch colours={match.colours?.[o.away.id]} className="amostra-dir" />
              {minute >= o.duration && <span className="suave fim-jogo">{t("match.matchEnd")}</span>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const fmt = (v: number, format: "integer" | "decimal" | "percentagem") => (format === "integer" ? String(Math.round(v)) : format === "decimal" ? v.toFixed(2) : `${Math.round(v * 100)}%`);

/** Estatísticas lado a lado; a barra mostra a parte de cada equipa. */
export function Statistics({ match, withoutPanel = false }: { match: LiveMatch; withoutPanel?: boolean }) {
  const { t } = useT();
  if (!match.summary) return null;
  const lines = matchStatistics(match.summary);
  const list = (
    <ul className="estatisticas">
      {lines.map((l) => {
        const total = l.home + l.away;
        const pc = total > 0 ? (l.home / total) * 100 : 50;
        return (
          <li key={l.rowKey}>
            <span className="estat-valor estat-casa">{fmt(l.home, l.format)}</span>
            <span className="estat-nome">{t(`match.stat.${l.rowKey}` as Key)}</span>
            <span className="estat-valor estat-fora">{fmt(l.away, l.format)}</span>
            <span className="estat-barra" aria-hidden="true"><i style={{ width: `${pc}%` }} /></span>
          </li>
        );
      })}
    </ul>
  );
  if (withoutPanel) return list;
  return (
    <section className="painel" aria-labelledby="h-estat">
      <h2 id="h-estat">{t("match.statistics")}</h2>
      {list}
    </section>
  );
}

const STYLES: Style[] = ["beautiful", "balanced", "direct", "counterAttack"];
const FIELDS_LEVEL = ["intensity", "line", "tempo", "fairPlay"] as const;

/** Mudanças de tática durante o jogo, num popup: contam a partir do minuto seguinte. A formação e o onze ficam como estavam. */
export function TacticInMatch({ tactic, onChange, onClose, busy }: { tactic: Tactic; onChange: (t: Tactic) => void; onClose: () => void; busy: boolean }) {
  const { t } = useT();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  return (
    <dialog ref={ref} className="popup tatica-jogo" aria-labelledby="h-tatica-jogo" onClose={onClose} onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}>
      <CloseButton onClose={() => ref.current?.close()} />
      <h2 id="h-tatica-jogo">{t("match.tacticTitle")}</h2>
      <div className="formulario">
        <p className="suave">{t("lab.formation")}: <b>{tactic.formation}</b></p>
        <label>{t("lab.style")}{" "}
          <select value={tactic.style} disabled={busy} onChange={(e) => onChange({ ...tactic, style: e.target.value as Style })}>
            {STYLES.map((s) => <option key={s} value={s}>{t(`lab.style.${s}` as Key)}</option>)}
          </select>
        </label>
        {FIELDS_LEVEL.map((k) => (
          <label key={k}>{t(`tactic.${k}` as Key)}{" "}
            <select value={tactic[k]} disabled={busy} onChange={(e) => onChange({ ...tactic, [k]: Number(e.target.value) as Level })}>
              {([1, 2, 3, 4, 5] as const).map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        ))}
      </div>
      <p className="suave">{t("match.tacticWarning")}</p>
    </dialog>
  );
}

/** Popup do intervalo: o jogo está parado; resumo da primeira parte e as decisões possíveis (tática; substituições no RZ-215). */
export function HalfTime({ match, onTactic, aoSubs, onContinue }: { match: LiveMatch; onTactic: () => void; aoSubs: () => void; onContinue: () => void }) {
  const { t } = useT();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  const KEYS = ["possession", "xg", "shots", "onTarget", "chances", "corners", "fouls", "yellows"];
  const lines = match.summary ? matchStatistics(match.summary).filter((l) => KEYS.includes(l.rowKey)).sort((x, y) => KEYS.indexOf(x.rowKey) - KEYS.indexOf(y.rowKey)) : [];
  return (
    <dialog ref={ref} className="popup intervalo-jogo" aria-labelledby="h-intervalo" onCancel={(e) => { e.preventDefault(); onContinue(); }}>
      <h2 id="h-intervalo">{t("match.halfTimeTitle")}</h2>
      <div className="intervalo-corpo">
        {lines.length > 0 && (
          <ul className="estatisticas">
            {lines.map((l) => {
              const total = l.home + l.away;
              const pc = total > 0 ? (l.home / total) * 100 : 50;
              return (
                <li key={l.rowKey}>
                  <span className="estat-valor estat-casa">{fmt(l.home, l.format)}</span>
                  <span className="estat-nome">{t(`match.stat.${l.rowKey}` as Key)}</span>
                  <span className="estat-valor estat-fora">{fmt(l.away, l.format)}</span>
                  <span className="estat-barra" aria-hidden="true"><i style={{ width: `${pc}%` }} /></span>
                </li>
              );
            })}
          </ul>
        )}
        <div className="intervalo-xg"><XgChart match={match} withoutPanel fill /></div>
      </div>
      {match.subs && <p className="subs-resumo"><SubsCounters subs={match.subs} /></p>}
      <p className="acoes">
        <button type="button" onClick={onTactic}><Icon name="tactic" />{t("match.halfTimeTactic")}</button>
        <button type="button" onClick={aoSubs} disabled={withoutSubstitutions(match.subs, true)}><EventIcon rowKey="substitution" />{t("match.subs.button")}</button>
        <button type="button" className="primario" onClick={onContinue} autoFocus>{t("match.secondHalf")}</button>
      </p>
    </dialog>
  );
}

const classRating = (n: number) => (n >= 7.5 ? "nota-alta" : n >= 6.5 ? "nota-boa" : n >= 5.5 ? "nota-media" : "nota-baixa");

function PlayerLine({ j }: { j: LivePlayer }) {
  const { t } = useT();
  const marks = (n: number, glyph: ReactNode, rowKey: Key) => (n > 0 ? <span className="ind" title={t(rowKey)} aria-label={`${n} ${t(rowKey)}`}>{glyph}{n > 1 ? `×${n}` : ""}</span> : null);
  return (
    <li className={`jogador-vivo jv-${j.state}`}>
      <b className={`nota ${j.rating !== undefined ? classRating(j.rating) : "nota-vazia"}`} title={t("match.rating")}>{j.rating !== undefined ? j.rating.toFixed(1) : "–"}</b>
      <span className="pos">{abbreviationPosition(t, j.position)}</span>
      <span className="jv-nome"><EntityLink k="person" id={j.id}>{j.name}</EntityLink></span>
      <span className="inds">
        {marks(j.goals, <EventIcon rowKey="goal" />, "match.ind.goal")}
        {marks(j.assists, <b className="ind-assist">A</b>, "match.ind.attendance")}
        {marks(j.yellows, <EventIcon rowKey="card" colour="yellow" />, "match.ind.yellow")}
        {j.red && <span className="ind" title={t("match.ind.red")} aria-label={t("match.ind.red")}><EventIcon rowKey="card" colour="red" /></span>}
        {j.injured && <span className="ind" title={t("match.ind.injury")} aria-label={t("match.ind.injury")}><EventIcon rowKey="injury" /></span>}
        {j.cameOn !== undefined && <span className="ind sub-entra" title={t("match.ind.cameOn", { min: Math.floor(j.cameOn) })}>▲ {Math.floor(j.cameOn)}'</span>}
        {j.left !== undefined && j.state !== "sentOff" && <span className="ind sub-sai" title={t("match.ind.left", { min: Math.floor(j.left) })}>▼ {Math.floor(j.left)}'</span>}
        {j.state === "sentOff" && j.left !== undefined && <span className="ind sub-sai">{Math.floor(j.left)}'</span>}
      </span>
    </li>
  );
}

/**
 * O onze tal como está agora: quem entrou ocupa o lugar de quem saiu (com a seta verde e o minuto). Por baixo, o banco que
 * resta e os que já saíram.
 */
function Lineup({ match, side, withBench }: { match: LiveMatch; side: "home" | "away"; withBench: boolean }) {
  const { t } = useT();
  const all = match.teams?.[side] ?? [];
  const porId = new Map(all.map((j) => [j.id, j] as const));
  const initial = all.filter((j) => j.cameOn === undefined && j.state !== "bench");
  const occupant = (j: LivePlayer): LivePlayer => {
    let current = j;
    const seen = new Set<string>();
    while (current.state === "left" && current.substitutionWith && !seen.has(current.id)) {
      seen.add(current.id);
      const next = porId.get(current.substitutionWith.id);
      if (!next || next.cameOn === undefined) break;
      current = next;
    }
    return current;
  };
  const pitch = initial.map(occupant);
  const bench = all.filter((j) => j.state === "bench");
  const left = all.filter((j) => j.state === "left");
  // O banco sobrepõe-se ao onze na mesma caixa, por isso o cartão mantém sempre a altura do onze.
  return (
    <div className="equipa-vivo">
      <ul className="onze-campo" aria-hidden={withBench} style={withBench ? { visibility: "hidden" } : undefined}>{pitch.map((j) => <PlayerLine key={j.id} j={j} />)}</ul>
      {withBench && (
        <div className="onze-banco">
          {bench.length > 0 && <><h4>{t("match.bench")}</h4><ul>{bench.map((j) => <PlayerLine key={j.id} j={j} />)}</ul></>}
          {left.length > 0 && <><h4>{t("match.leftList")}</h4><ul>{left.map((j) => <PlayerLine key={j.id} j={j} />)}</ul></>}
        </div>
      )}
    </div>
  );
}

/** Cartão de uma equipa: o onze com notas e indicadores, os que entraram e o banco (recolhido). */
export function TeamCard({ match, side }: { match: LiveMatch; side: "home" | "away" }) {
  const { t } = useT();
  const [withBench, setWithBench] = useState(false);
  if (!match.teams) return null;
  return (
    <section className="painel cartao-equipa" aria-label={match[side].name}>
      <div className="cartao-equipa-topo">
        <h2><ClubSwatch colours={match.colours?.[match[side].id]} /> <EntityLink k="club" id={match[side].id} withoutSwatch>{match[side].name}</EntityLink></h2>
        <button type="button" role="switch" aria-checked={withBench} className="alterna-banco" onClick={() => setWithBench((v) => !v)}>
          <span className="alterna-pista" aria-hidden="true" />
          {t("match.seeSubstitutes")}
        </button>
      </div>
      <Lineup match={match} side={side} withBench={withBench} />
    </section>
  );
}

/** Evolução do xG acumulado de cada equipa, minuto a minuto (degraus: o xG sobe quando há remate). */
export function XgChart({ match, withoutPanel = false, fill = false }: { match: LiveMatch; withoutPanel?: boolean; /** Ocupa a altura que sobra ao pai (popup do intervalo). */ fill?: boolean }) {
  const { t } = useT();
  const xg = match.xg;
  const inbox = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const el = inbox.current;
    if (!fill || !el) return;
    const read = () => setSize({ w: Math.max(200, el.clientWidth), h: Math.max(120, el.clientHeight) });
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fill]);
  if (!xg || xg.home.length < 2) return null;
  const W = fill && size ? size.w : 320;
  const H = fill && size ? size.h : 150;
  const m = { e: 26, d: 8, c: 8, b: 20 };
  const end = Math.max(match.duration, xg.home.length - 1, 90);
  const top = Math.max(1, Math.ceil(Math.max(...xg.home, ...xg.away) * 2) / 2);
  const x = (min: number) => m.e + (min / end) * (W - m.e - m.d);
  const y = (v: number) => H - m.b - (v / top) * (H - m.b - m.c);
  const steps = (series: number[]) => series.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(series[i - 1] ?? v).toFixed(1)} L${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const last = xg.home.length - 1;
  const marks = [0, 15, 30, 45, 60, 75, 90].filter((n) => n <= end);
  const names = { home: match.home.name, away: match.away.name };
  const colour = { home: predominantColour(match.colours?.[match.home.id]) ?? "var(--destaque)", away: predominantColour(match.colours?.[match.away.id]) ?? "var(--texto)" };
  const content = (
    <>
      <div ref={inbox} className={fill ? "grafico-xg-caixa" : undefined}><svg className="grafico-xg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t("match.xg.aria", { home: names.home, a: xg.home[last]!.toFixed(2), away: names.away, b: xg.away[last]!.toFixed(2) })}>
        {[0, top / 2, top].map((v) => <g key={v}><line className="xg-grelha" x1={m.e} x2={W - m.d} y1={y(v)} y2={y(v)} /><text className="xg-eixo" x={m.e - 4} y={y(v) + 3} textAnchor="end">{v.toFixed(1)}</text></g>)}
        {marks.map((n) => <text key={n} className="xg-eixo" x={x(n)} y={H - 6} textAnchor="middle">{n}'</text>)}
        <path className="xg-linha xg-fora" stroke={colour.away} d={steps(xg.away)} />
        <path className="xg-linha xg-casa" stroke={colour.home} d={steps(xg.home)} />
      </svg></div>
      <p className="xg-legenda">
        <span><i className="xg-chave xg-casa" style={{ borderTopColor: colour.home }} /> {names.home} <b>{xg.home[last]!.toFixed(2)}</b></span>
        <span><i className="xg-chave xg-fora" style={{ borderTopColor: colour.away }} /> {names.away} <b>{xg.away[last]!.toFixed(2)}</b></span>
      </p>
    </>
  );
  if (withoutPanel) return content;
  return (
    <section className="painel" aria-labelledby="h-xg">
      <h2 id="h-xg">{t("match.xg.title")}</h2>
      {content}
    </section>
  );
}

/** Últimos jogos entre as duas equipas e quem ganhou mais vezes. */
export function Meetings({ match }: { match: LiveMatch }) {
  const { t } = useT();
  const list = match.meetings ?? [];
  const name = (id: string) => (id === match.home.id ? match.home.name : id === match.away.id ? match.away.name : id);
  let a = 0;
  let b = 0;
  let e = 0;
  for (const c of list) {
    if (c.homeGoals === c.awayGoals) e++;
    else if ((c.homeGoals > c.awayGoals ? c.home : c.away) === match.home.id) a++;
    else b++;
  }
  return (
    <section className="painel" aria-labelledby="h-conf">
      <h2 id="h-conf">{t("match.meetings.title")}</h2>
      {list.length === 0 ? <p className="vazio">{t("match.meetings.without")}</p> : (
        <>
          <p className="confrontos-resumo"><b>{a}</b> {match.home.name} · <b>{e}</b> {t("match.meetings.draws")} · <b>{b}</b> {match.away.name}</p>
          <ul className="confrontos">
            {list.map((c) => (
              <li key={c.id}>
                <span className="suave">{c.date}</span>
                <span className="confronto-resultado">{name(c.home)} <b>{c.homeGoals}–{c.awayGoals}</b> {name(c.away)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/** Por baixo do resultado: estádio, adeptos com barra de ocupação, árbitro e quem transmite. */
export function HeaderInfo({ match }: { match: LiveMatch }) {
  const { t } = useT();
  const i = match.info;
  if (!i) return null;
  const pct = Math.round((i.attendance / i.stadium.capacity) * 100);
  const middle = (m: "tv" | "streaming" | "radio") => t(`match.middle.${m}` as Key);
  return (
    <div className="info-cabecalho">
      <p>
        <span>{i.stadium.name} · {i.stadium.locality}</span>
        <span className="info-adeptos" title={t("match.info.attendance")}>
          <b>{i.attendance.toLocaleString("pt-PT")}</b> / {i.stadium.capacity.toLocaleString("pt-PT")}
          <span className="barra-ocupacao" role="img" aria-label={`${t("match.info.attendance")}: ${pct}%`}><i style={{ width: `${pct}%` }} /></span>
          {pct}%
        </span>
      </p>
      {((i.referee) || (i.channels && i.channels.length > 0)) && (
        <p>
          {i.referee && <span>{t("match.info.referee")}: {i.referee}</span>}
          {i.channels && i.channels.length > 0 && <span>{t("match.info.channels")}: {i.channels.map((c) => `${c.name} (${middle(c.middle)})`).join(", ")}</span>}
        </p>
      )}
    </div>
  );
}
