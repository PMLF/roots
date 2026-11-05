"use client";
import { useEffect, useState } from "react";
import type { CompetitionHistory } from "@/engine/api/contracts";
import { Card } from "@/ui/components/Card";
import { ClubSwatch } from "@/ui/components/ClubSwatch";
import { EntityLink } from "@/ui/components/Link";
import { useT } from "@/ui/i18n/LocaleProvider";
import { useEngine } from "@/ui/EngineProvider";

type Club = { club: string; name: string };
const ClubName = ({ c }: { c: Club }) => <span className="nome-clube"><ClubSwatch id={c.club} /><EntityLink k="club" id={c.club} withoutSwatch>{c.name}</EntityLink></span>;

function Ranking({ title, rows }: { title: string; rows: { key: string; label: React.ReactNode; value: React.ReactNode }[] }) {
  const { t } = useT();
  return (
    <Card title={title}>
      {rows.length === 0 ? <p className="vazio">{t("history.empty")}</p> : (
        <ol className="historico-lista">
          {rows.map((r) => <li key={r.key}>{r.label}<b>{r.value}</b></li>)}
        </ol>
      )}
    </Card>
  );
}

/** Histórico de uma competição (RZ-244): pódios por época, títulos, melhores de sempre e recordes. */
export function History({ competition }: { competition: string }) {
  const { t } = useT();
  const engine = useEngine();
  const [h, setH] = useState<CompetitionHistory | null>(null);
  useEffect(() => {
    if (!engine) return;
    let live = true;
    engine.call("competitionHistory", { competition }).then((x) => live && setH(x)).catch(() => undefined);
    return () => { live = false; };
  }, [engine, competition]);
  if (!h) return <p className="vazio">{t("profile.loading")}</p>;
  if (h.seasonCount === 0) return <Card title={t("tab.story")}><p className="vazio">{t("competition.noStory")}</p></Card>;
  const player = (p: CompetitionHistory["scorers"][number]) => ({ key: p.player, label: <span><EntityLink k="person" id={p.player}>{p.name}</EntityLink> <small className="suave">{p.clubName}</small></span>, value: p.value });
  const clubRow = (c: Club & { value: number }) => ({ key: c.club, label: <ClubName c={c} />, value: c.value });
  const r = h.records;
  const match = (m: NonNullable<typeof r.biggestWin>) => (
    <span><EntityLink k="club" id={m.home}>{m.homeName}</EntityLink> <b>{m.homeGoals}–{m.awayGoals}</b> <EntityLink k="club" id={m.away}>{m.awayName}</EntityLink> <small className="suave">{m.label}</small></span>
  );
  const rec: { key: string; label: string; value: React.ReactNode }[] = [];
  if (r.bestPoints) rec.push({ key: "pts", label: t("history.rec.points"), value: <span><ClubName c={r.bestPoints} /> <b>{r.bestPoints.value}</b> <small className="suave">{r.bestPoints.label}</small></span> });
  if (r.bestAttack) rec.push({ key: "att", label: t("history.rec.attack"), value: <span><ClubName c={r.bestAttack} /> <b>{r.bestAttack.value}</b> <small className="suave">{r.bestAttack.label}</small></span> });
  if (r.bestDefence) rec.push({ key: "def", label: t("history.rec.defence"), value: <span><ClubName c={r.bestDefence} /> <b>{r.bestDefence.value}</b> <small className="suave">{r.bestDefence.label}</small></span> });
  if (r.topScorerSeason) rec.push({ key: "top", label: t("history.rec.topScorer"), value: <span><EntityLink k="person" id={r.topScorerSeason.player}>{r.topScorerSeason.name}</EntityLink> <b>{r.topScorerSeason.value}</b> <small className="suave">{r.topScorerSeason.label}</small></span> });
  if (r.biggestWin) rec.push({ key: "big", label: t("history.rec.biggestWin"), value: match(r.biggestWin) });
  if (r.mostGoalsMatch) rec.push({ key: "most", label: t("history.rec.mostGoals"), value: match(r.mostGoalsMatch) });
  return (
    <div className="historico-grelha">
      <Card title={h.cup ? t("history.finals") : t("history.podiums")}>
        <table className="tabela-historico">
          <thead><tr><th>{t("competitions.season")}</th>{h.cup ? <><th>{t("history.winner")}</th><th>{t("history.runnerUp")}</th></> : <><th>1.º</th><th>2.º</th><th>3.º</th></>}</tr></thead>
          <tbody>
            {h.seasons.map((s) => (
              <tr key={s.season}>
                <td>{s.label}</td>
                {s.podium.map((c) => <td key={c.club}><ClubName c={c} />{c.points !== undefined && <small className="suave"> {c.points}</small>}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Ranking title={t("history.titles")} rows={h.titles.map(clubRow)} />
      {!h.cup && <Ranking title={t("history.podiumCount")} rows={h.podiums.map(clubRow)} />}
      {!h.cup && <Ranking title={t("history.totalPoints")} rows={h.totalPoints.map((c) => ({ key: c.club, label: <span><ClubName c={c} /> <small className="suave">{t("history.seasonsN", { n: c.seasons })}</small></span>, value: c.value }))} />}
      <Ranking title={t("history.scorers")} rows={h.scorers.map(player)} />
      {!h.cup && <Ranking title={t("history.assisters")} rows={h.assisters.map(player)} />}
      <Ranking title={t("history.appearances")} rows={h.appearances.map(player)} />
      {!h.cup && <Ranking title={t("history.yellows")} rows={h.yellows.map(player)} />}
      {!h.cup && <Ranking title={t("history.reds")} rows={h.reds.map(player)} />}
      <Card title={t("history.records")}>
        <ul className="destaques-mini">
          {rec.map((x) => <li key={x.key}><span className="suave">{x.label}</span><span>{x.value}</span></li>)}
        </ul>
      </Card>
    </div>
  );
}
