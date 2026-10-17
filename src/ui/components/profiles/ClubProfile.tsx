"use client";
import { useState } from "react";
import type { ClubProfileData } from "@/engine/api/contracts";
import type { ViewPerson } from "@/engine/view/types";
import { Chip } from "@/ui/components/Attributes";
import { ClubSwatch } from "@/ui/components/ClubSwatch";
import { Card, Data, Top } from "@/ui/components/Card";
import { Profile } from "@/ui/components/Profile";
import { DivisionsChart } from "@/ui/components/DivisionsChart";
import { EntityLink } from "@/ui/components/Link";
import { ClubBudget } from "@/ui/components/profiles/ClubBudget";
import { Table } from "@/ui/components/Table";
import { Stars } from "@/ui/components/Stars";
import { Flag } from "@/ui/components/Flag";
import type { Key } from "@/ui/i18n";
import { useT } from "@/ui/i18n/LocaleProvider";
import { abbreviationPosition, rankPosition } from "@/ui/i18n/position";
import type { Column } from "@/ui/table/logic";
import { useCountries } from "@/ui/useCountries";

/** Barra 0-100 (qualidade de um aspeto do estádio). */
function Bar({ value }: { value: number }) {
  return (
    <span className="barra-medida" title={`${value}/100`}>
      <span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </span>
  );
}

export function ClubProfile({ d, seeAll, squadOnly = false }: { d: ClubProfileData; seeAll: boolean; squadOnly?: boolean }) {
  const { t, locale } = useT();
  const country = useCountries();
  const n = new Intl.NumberFormat(locale);
  const eur = new Intl.NumberFormat(locale, { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  const unknown = <span className="valor-estimado" title={t("person.unknown")}>?</span>;
  const truth = seeAll ? d.truth : undefined;
  const name = (p: ViewPerson) => <EntityLink k="person" id={p.id}>{p.sportingName}</EntityLink>;
  const president = d.roles.find((c) => c.fn === "president");
  const technicalTeam = d.roles.filter((c) => c.fn !== "president");

  const squad: Column<ViewPerson>[] = [
    { id: "name", title: t("column.name"), value: (p) => p.sportingName },
    { id: "pos", title: t("column.position"), value: (p) => abbreviationPosition(t, p.player?.position ?? ""), sortValue: (p) => rankPosition(p.player?.position ?? "") },
    { id: "age", title: t("column.age"), value: (p) => p.age, numeric: true },
    { id: "stars", title: t("column.level"), value: (p) => d.extraSquad[p.id]?.rating?.stars ?? 0, numeric: true },
    { id: "potential", title: t("column.potential"), value: (p) => d.extraSquad[p.id]?.rating?.potential?.high ?? 0, numeric: true },
    { id: "country", title: t("column.country"), value: (p) => country(p.nationality) },
    { id: "wage", title: t("column.wage"), value: (p) => d.extraSquad[p.id]?.wage ?? 0, numeric: true },
    { id: "games", title: t("column.matches"), value: (p) => d.season?.players[p.id]?.games ?? 0, numeric: true },
    { id: "goals", title: t("column.goals"), value: (p) => d.season?.players[p.id]?.goals ?? 0, numeric: true },
    { id: "foot", title: t("column.pe"), value: (p) => (p.player ? t(`pe.${p.player.pe}` as Key) : "") },
    { id: "height", title: t("column.height"), value: (p) => p.player?.heightCm ?? 0, numeric: true },
    { id: "weight", title: t("column.weight"), value: (p) => p.player?.weightKg ?? 0, numeric: true },
    { id: "contract", title: t("column.contract"), value: (p) => d.extraSquad[p.id]?.endContract ?? "" },
  ];
  // estatísticas da época atual (RZ-175); o xG por jogador não se guarda
  const ep = (p: ViewPerson) => d.season?.players[p.id];
  const dec = (v: number, c = 1) => v.toFixed(c);
  const g90 = (p: ViewPerson) => { const e = ep(p); return e && e.minutes > 0 ? (e.goals * 90) / e.minutes : 0; };
  const countC = (id: string, title: Key, value: (p: ViewPerson) => number): Column<ViewPerson> => ({ id, title: t(title), value, numeric: true });
  const base = squad.filter((c) => ["name", "pos"].includes(c.id));
  const seasonCol: Column<ViewPerson>[] = [
    ...base,
    countC("games", "column.matches", (p) => ep(p)?.games ?? 0),
    countC("minutes", "column.minutes", (p) => ep(p)?.minutes ?? 0),
    countC("goals", "column.goals", (p) => ep(p)?.goals ?? 0),
    countC("assists", "column.assists", (p) => ep(p)?.assists ?? 0),
    countC("ga", "column.ga", (p) => (ep(p)?.goals ?? 0) + (ep(p)?.assists ?? 0)),
    countC("g90", "column.goals90", g90),
    countC("rating", "column.rating", (p) => ep(p)?.rating ?? 0),
    countC("yellow", "column.yellows", (p) => ep(p)?.yellow ?? 0),
    countC("red", "column.reds", (p) => ep(p)?.red ?? 0),
  ];
  const disciplineCol: Column<ViewPerson>[] = [
    ...base,
    countC("games", "column.matches", (p) => ep(p)?.games ?? 0),
    countC("minutes", "column.minutes", (p) => ep(p)?.minutes ?? 0),
    countC("mpg", "column.minPerMatch", (p) => { const e = ep(p); return e && e.games ? Math.round(e.minutes / e.games) : 0; }),
    countC("yellow", "column.yellows", (p) => ep(p)?.yellow ?? 0),
    countC("red", "column.reds", (p) => ep(p)?.red ?? 0),
  ];
  const [view, setView] = useState<"profile" | "season" | "discipline">("profile");
  const viewColumns = view === "season" ? seasonCol : view === "discipline" ? disciplineCol : squad;
  const seasonCell = {
    name: (p: ViewPerson) => <>{name(p)}{d.extraSquad[p.id]?.injured && <span className="lesao" role="img" aria-label={t("squad.injured")} title={t("squad.injured")}> ✚</span>}</>, country: (p: ViewPerson) => <Flag id={p.nationality} />, wage: (p: ViewPerson) => { const w = d.extraSquad[p.id]?.wage; return w !== undefined ? eur.format(w) : unknown; }, potential: (p: ViewPerson) => { const r = d.extraSquad[p.id]?.rating?.potential; return r ? <Stars range={r} /> : unknown; }, stars: (p: ViewPerson) => { const r = d.extraSquad[p.id]?.rating; return r ? <Stars value={r.stars} /> : unknown; },
    rating: (p: ViewPerson) => (ep(p)?.rating !== undefined ? dec(ep(p)?.rating ?? 0, 2) : "—"),
    g90: (p: ViewPerson) => (ep(p)?.minutes ? dec(g90(p), 2) : "—"),
  };
  const squadTable = (
    <>
      <label className="vista-plantel">
        <span>{t("squad.view")}</span>
        <select value={view} onChange={(e) => setView(e.target.value as typeof view)} data-testid="plantel-vista">
          <option value="profile">{t("squad.view.profile")}</option>
          <option value="season">{t("squad.view.season")}</option>
          <option value="discipline">{t("squad.view.discipline")}</option>
        </select>
      </label>
      <Table key={view} id={`plantel-${view}`} fileName={`plantel-${view}-${d.id}`} columns={viewColumns} lines={d.squad} rowKey={(p) => p.id} cell={seasonCell} lineClass={(p) => (d.extraSquad[p.id]?.injured ? "lesionado" : undefined)} initialOrder={view === "profile" ? { column: "pos", direction: "asc" } : { column: view === "season" ? "ga" : "minutes", direction: "desc" }} />
    </>
  );
  const tp = d.season?.tops;
  const topLine = (rot: Key, x: { player: string; name: string; value: number } | undefined, fmt: (v: number) => string = String) =>
    x ? [{ label: t(rot), value: <><EntityLink k="person" id={x.player}>{x.name}</EntityLink> <b>{fmt(x.value)}</b></> }] : [];
  const clubTops = (
    <Card title={t("card.clubTops")}>
      {tp && Object.keys(tp).length > 0 ? (
        <Data lines={[
          ...topLine("tops.scorer", tp.scorer), ...topLine("tops.assistant", tp.assist), ...topLine("tops.ga", tp.goalsAndAssists),
          ...topLine("tops.rating", tp.rating, (v) => dec(v, 2)), ...topLine("tops.matches", tp.games), ...topLine("tops.minutes", tp.minutes),
          ...topLine("tops.yellows", tp.yellow), ...topLine("tops.reds", tp.red),
        ]} />
      ) : (
        <p className="vazio">{t("tops.empty")}</p>
      )}
    </Card>
  );
  const eq = d.season?.team;
  const clubSeason = eq ? (
    <Card title={t("card.clubSeason", { season: d.season?.seasonLabel ?? "" })}>
      <Data lines={[
        { label: t("season.position"), value: <b>{eq.position}º</b> },
        { label: t("season.matches"), value: eq.played },
        { label: t("season.vde"), value: `${eq.won} / ${eq.drawn} / ${eq.lost}` },
        { label: t("season.goals"), value: `${eq.goalsFor} / ${eq.goalsAgainst}` },
        { label: t("season.points"), value: <b>{eq.points}</b> },
      ]} />
    </Card>
  ) : null;
  const staff: Column<ViewPerson>[] = [
    { id: "name", title: t("column.name"), value: (p) => p.sportingName },
    { id: "role", title: t("column.fn"), value: (p) => (p.fn ? t(`fn.${p.fn}` as Key) : "") },
    { id: "age", title: t("column.age"), value: (p) => p.age, numeric: true },
    { id: "country", title: t("column.country"), value: (p) => country(p.nationality) },
    { id: "quality", title: t("column.quality"), value: (p) => { const q = truth?.staffQuality[p.id]; return q ? Object.entries(q).map(([k, v]) => `${t(`quality.${k}` as Key)} ${v}`).join(" · ") : "?"; } },
  ];

  // plantel em números
  const ages = d.squad.map((p) => p.age);
  const meanAge = ages.length ? (ages.reduce((s, x) => s + x, 0) / ages.length).toFixed(1) : undefined;
  const foreigners = d.squad.filter((p) => p.nationality !== "pt").length;
  const goalkeeper = d.squad.filter((p) => p.player?.position === "GK").length;
  const ratings = d.squad.map((p) => d.extraSquad[p.id]?.rating?.stars).filter((v): v is number => v !== undefined);
  const averageLevel = ratings.length === d.squad.length && ratings.length > 0 ? <Stars value={Math.round((ratings.reduce((s, x) => s + x, 0) / ratings.length) * 2) / 2} /> : undefined;

  const size = t(`reputation.level.${d.levelReputation}` as Key);
  const labels = (
    <>
      <Chip>{size}</Chip>
      <Chip tone="destaque"><EntityLink k="competition" id={d.league}>{d.league}</EntityLink>{d.season?.team ? ` · ${t("club.place", { n: d.season.team.position })}` : ""}</Chip>
      <Chip tone="suave">{d.district}</Chip>
    </>
  );
  const identity = (
    <Data
      lines={[
        { label: t("club.locality"), value: <><EntityLink k="locality" id={d.locality.id}>{d.locality.name}</EntityLink> <span className="suave">({t(`status.${d.locality.status}` as Key).toLowerCase()})</span></> },
        { label: t("club.municipality"), value: <EntityLink k="city" id={d.city.id}>{d.city.name}</EntityLink> },
        { label: t("club.nickname"), value: `${d.nickname} · ${d.mascot}` },
        ...(president ? [{ label: t("club.president"), value: name(president) }] : []),
        ...(d.rival ? [{ label: t("club.rival"), value: <EntityLink k="club" id={d.rival.id}>{d.rival.name}</EntityLink> }] : []),
        { label: t("club.founded"), value: unknown },
      ]}
    />
  );

  const e = d.detailStadium;
  const summary = (
    <div className="cartoes">
      <Card title={t("card.size")}>
        <Data
          lines={[
            { label: t("club.size"), value: <b>{size}</b> },
            { label: t("club.division"), value: t(`tier.${d.tier}` as Key) },
            { label: t("club.fans"), value: unknown },
            { label: t("club.members"), value: unknown },
            ...(truth ? [{ label: t("dev.reputation"), value: n.format(truth.reputation) }] : []),
          ]}
        />
      </Card>
      <Card title={t("card.finances")}>
        <Data
          lines={[
            { label: t("finances.state"), value: <span title={d.finances.exact ? undefined : t("finances.estimate")}>{t(`finances.state.${d.finances.state}` as Key)}{d.finances.exact ? "" : " ~"}</span> },
            ...(d.finances.balance !== undefined ? [{ label: t("finances.balance"), value: eur.format(d.finances.balance) }] : []),
            ...(d.finances.lastClose ? [
              { label: t("finances.revenuesMonth"), value: eur.format(d.finances.lastClose.revenues) },
              { label: t("finances.expensesMonth"), value: eur.format(-d.finances.lastClose.expenses) },
            ] : []),
            ...(d.finances.exact ? [] : [
              { label: t("club.budget"), value: unknown },
              { label: t("club.wageBill"), value: unknown },
              { label: t("club.sponsorships"), value: unknown },
            ]),
          ]}
        />
        {d.finances.budget && d.finances.balance !== undefined && <ClubBudget initial={d.finances.budget} balance={d.finances.balance} />}
      </Card>
      {clubSeason}
      {clubTops}
      <Card title={t("card.squadNumbers")}>
        <Data
          lines={[
            { label: t("club.squad"), value: d.squad.length },
            { label: t("squad.averageAge"), value: meanAge ?? "—" },
            { label: t("squad.foreigners"), value: d.squad.length ? `${foreigners} (${Math.round((foreigners / d.squad.length) * 100)}%)` : "—" },
            { label: t("squad.goalkeeper"), value: goalkeeper },
            { label: t("squad.averageLevel"), value: averageLevel ?? unknown },
            { label: t("squad.injured"), value: unknown },
          ]}
        />
      </Card>
      <Card title={t("card.stadium")}>
        <Data
          lines={[
            { label: d.stadium.name, value: `${n.format(d.stadium.capacity)} ${t("stadium.places")}` },
            { label: t("stadium.ownership"), value: t(`ownership.${e.ownership}` as Key) },
            { label: t("stadium.distance"), value: t("stadium.km", { n: e.centreDistanceKm }) },
            { label: t("stadium.transport"), value: <Bar value={e.transport} /> },
            { label: t("stadium.access"), value: <Bar value={e.roadAccess} /> },
            { label: t("stadium.parking"), value: <Bar value={e.parking} /> },
            { label: t("stadium.expansion"), value: <Bar value={e.expansionTerrain} /> },
          ]}
        />
      </Card>
      <Card title={t("card.technicalTeam")}>
        {technicalTeam.length === 0 ? (
          <p className="vazio">{t("club.noStaff")}</p>
        ) : (
          <Data lines={technicalTeam.map((p) => ({ label: t(`fn.${p.fn}` as Key), value: name(p) }))} />
        )}
      </Card>
      <Card title={t("card.divisions")} wide>
        <DivisionsChart points={d.divisionsHistory} />
      </Card>
    </div>
  );

  if (squadOnly) {
    return d.squad.length > 0 ? (
      squadTable
    ) : (
      <p className="vazio">{t("club.noWorld")}</p>
    );
  }

  return (
    <Profile
      type="club"
      title={d.name}
      top={<Top title={d.name} crest={<ClubSwatch colours={d.colours} className="amostra-titulo" />} labels={labels} card={identity} />}
      tabs={{
        summary,
        squad: d.squad.length > 0 ? (
          squadTable
        ) : (
          <p className="vazio">{t("club.noWorld")}</p>
        ),
        staff: d.roles.length > 0 ? (
          <Table id="staff" fileName={`staff-${d.id}`} columns={staff} lines={d.roles} rowKey={(p) => p.id} cell={{ name: name }} />
        ) : (
          <p className="vazio">{t("club.noWorld")}</p>
        ),
      }}
    />
  );
}
