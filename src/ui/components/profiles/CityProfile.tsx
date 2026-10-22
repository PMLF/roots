"use client";
import type { CityProfileData, ViewCityLevel } from "@/engine/api/contracts";
import { Chip } from "@/ui/components/Attributes";
import { Card, Data, Top } from "@/ui/components/Card";
import { Table } from "@/ui/components/Table";
import type { Column } from "@/ui/table/logic";
import { Profile } from "@/ui/components/Profile";
import { CouncilBudget } from "@/ui/components/profiles/CouncilBudget";
import { LocalTalent } from "@/ui/components/profiles/LocalTalent";
import { EntityLink } from "@/ui/components/Link";
import type { Key } from "@/ui/i18n";
import { useT } from "@/ui/i18n/LocaleProvider";

/** Cinco segmentos: quantos estão cheios diz o nível; a palavra vem sempre ao lado. */
export function BarLevel({ level }: { level: ViewCityLevel }) {
  return (
    <span className="nivel-barra" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((i) => <span key={i} className={i <= level ? "full" : ""} />)}
    </span>
  );
}

function LevelCell({ level, word }: { level: ViewCityLevel; word: string }) {
  return <span title={word}><BarLevel level={level} /><span className="so-leitor">{word}</span></span>;
}

/** Serviços: seta forte (↑ ↓), fraca (↗ ↘) ou traço quando estável. */
export const SERVICE_ARROW = { up2: "↑", up1: "↗", stable: "–", down1: "↘", down2: "↓" } as const;

/** Evolução de um número ao longo das épocas (linha simples, sem eixos). */
function ChartPopulation({ points }: { points: { label: string; population: number }[] }) {
  const { t, locale } = useT();
  const L = 560, A = 170, ex = 76, dx = 24, top = 16, base = A - 30;
  const min = Math.min(...points.map((p) => p.population));
  const max = Math.max(...points.map((p) => p.population));
  const n = Math.max(points.length, 2);
  const x = (i: number) => ex + (i * (L - ex - dx)) / (n - 1);
  const y = (v: number) => (max === min ? (top + base) / 2 : base - ((v - min) / (max - min)) * (base - top));
  const fmt = new Intl.NumberFormat(locale);
  if (points.length < 2) return <p className="suave">{t("city.emptyChart", { n: fmt.format(points[0]?.population ?? 0) })}</p>;
  return (
    <figure className="grafico">
      <svg viewBox={`0 0 ${L} ${A}`} role="img" aria-label={t("city.populationChart")}>
        {[...new Set([min, max])].map((v) => (
          <g key={v}>
            <line x1={ex - 8} x2={L - dx + 8} y1={y(v)} y2={y(v)} className="grafico-grelha" />
            <text x={ex - 14} y={y(v) + 4} textAnchor="end" className="grafico-eixo">{fmt.format(v)}</text>
          </g>
        ))}
        {points.slice(1).map((p, i) => <line key={p.label} x1={x(i)} y1={y((points[i] as { population: number }).population)} x2={x(i + 1)} y2={y(p.population)} className="grafico-linha grafico-igual" />)}
        {points.map((p, i) => (
          <g key={p.label}>
            <circle cx={x(i)} cy={y(p.population)} r={4} className="grafico-ponto"><title>{`${p.label} · ${fmt.format(p.population)}`}</title></circle>
            {(points.length <= 8 || i % Math.ceil(points.length / 8) === 0 || i === points.length - 1) && <text x={x(i)} y={A - 8} textAnchor="middle" className="grafico-eixo">{p.label}</text>}
          </g>
        ))}
      </svg>
    </figure>
  );
}

/** Ficha de uma cidade (concelho; RZ-133): números em palavras, autarca, clubes e acontecimentos. Só o que é público. */
export function CityProfile({ d }: { d: CityProfileData }) {
  const { t, locale } = useT();
  const n = new Intl.NumberFormat(locale);
  const level = (v: ViewCityLevel) => t(`city.level.${v}` as Key);
  const indicator = (id: CityProfileData["indicators"][number]["id"]) => d.indicators.find((i) => i.id === id)!;
  const line = (id: CityProfileData["indicators"][number]["id"]) => {
    const i = indicator(id);
    return {
      label: t(`city.indicator.${id}` as Key),
      value: (
        <span className="nivel-linha">
          <BarLevel level={i.level} />
          <b>{level(i.level)}</b>
          <span className={`tendencia tendencia-${i.trend.startsWith("up") ? "rises" : i.trend.startsWith("down") ? "drops" : "stable"}`} title={t(`city.serviceTrend.${i.trend}` as Key)}>
            <span aria-hidden="true">{SERVICE_ARROW[i.trend]}</span>
            <span className="so-leitor">{t(`city.serviceTrend.${i.trend}` as Key)}</span>
          </span>
        </span>
      ),
    };
  };
  const serviceLine = (s: CityProfileData["services"][number]) => ({
    label: t(`city.service.${s.id}` as Key),
    value: (
      <span className="nivel-linha">
        <BarLevel level={s.level} />
        <b>{level(s.level)}</b>
        <span className={`tendencia tendencia-${s.trend.startsWith("up") ? "rises" : s.trend.startsWith("down") ? "drops" : "stable"}`} title={t(`city.serviceTrend.${s.trend}` as Key)}>
          <span aria-hidden="true">{SERVICE_ARROW[s.trend]}</span>
          <span className="so-leitor">{t(`city.serviceTrend.${s.trend}` as Key)}</span>
        </span>
        {s.cause && <span className="suave">{t(`city.incident.${s.cause.type}` as Key)} · {s.cause.label}</span>}
      </span>
    ),
  });
  const sectorName = (c: string) => t(`sector.${c}` as Key);
  const sectors = [d.sector, d.secondarySector].filter((s, i, a) => s !== "" && a.indexOf(s) === i);
  const incident = (a: CityProfileData["incidents"][number]) => (
    <li key={`${a.date}-${a.type}`}>
      <b>{t(`city.incident.${a.type}` as Key)}</b>
      <span className="suave"> · {a.label}{a.regional && a.hub ? ` · ${t("city.regiao", { hub: a.hub })}` : ""}</span>
    </li>
  );

  const labels = (
    <>
      <Chip tone="destaque">{sectorName(d.sector)}</Chip>
      <Chip tone="suave">{d.district}</Chip>
      {d.hub && <Chip tone="suave">{d.hub}</Chip>}
      {d.island && <Chip tone="suave">{sectorName("ILH")}</Chip>}
    </>
  );
  const identity = (
    <Data
      lines={[
        { label: t("city.population"), value: n.format(d.population) },
        { label: t("city.sector"), value: sectors.map(sectorName).join(" · ") },
        { label: t("city.district"), value: d.district },
        ...(d.hub ? [{ label: t("city.region"), value: d.hub }] : []),
        ...(d.mayor ? [{ label: t("city.mayor"), value: <EntityLink k="person" id={d.mayor.person.id}>{d.mayor.person.name}</EntityLink> }] : []),
      ]}
    />
  );

  const summary = (
    <div className="cartoes">
      <Card title={t("card.cityEconomy")}>
        <Data lines={[line("economy"), line("employment"), line("tourism")]} />
      </Card>
      <Card title={t("card.cityFootball")}>
        <Data lines={[line("pride"), line("notoriety"), line("footballCulture")]} />
      </Card>
      <div className="cartoes-par">
        <Card title={t("card.synergies")}>
          <ul className="lista-horizontal">
            {sectors.map((s) => <li key={s}><b>{sectorName(s)}</b> <span className="suave">{t(`synergy.${s}` as Key)}</span></li>)}
            {d.island && <li><b>{sectorName("ILH")}</b> <span className="suave">{t("synergy.ILH")}</span></li>}
          </ul>
        </Card>
        <Card title={t("card.incidents")}>
          {d.incidents.length > 0 ? <ul className="lista-simples">{d.incidents.map(incident)}</ul> : <p className="vazio">{t("city.noIncidents")}</p>}
        </Card>
      </div>
    </div>
  );

  const councilTab = (
    <div className="cartoes">
      <Card title={t("card.council")}>
        {d.mayor ? (
          <Data
            lines={[
              { label: t("city.mayor"), value: <EntityLink k="person" id={d.mayor.person.id}>{d.mayor.person.name}</EntityLink> },
              { label: t("mayor.term"), value: `${d.mayor.sinceTerm}–${d.mayor.untilTerm}` },
              { label: t("mayor.support"), value: <span className="nivel-linha"><BarLevel level={d.mayor.sportSupport} /><b>{level(d.mayor.sportSupport)}</b></span> },
              { label: t("mayor.reputation"), value: d.mayor.profile.length > 0 ? ((txt) => txt.charAt(0).toUpperCase() + txt.slice(1))(d.mayor.profile.map((p) => t(`mayor.profile.${p}` as Key)).join(" · ")) : "—" },
              { label: t("city.budget"), value: <span className="nivel-linha"><BarLevel level={d.budget} /><b>{level(d.budget)}</b></span> },
            ]}
          />
        ) : (
          <>
            <p className="vazio">{t("city.noMayor")}</p>
            <Data lines={[{ label: t("city.budget"), value: <span className="nivel-linha"><BarLevel level={d.budget} /><b>{level(d.budget)}</b></span> }]} />
          </>
        )}
      </Card>
      {d.council && <CouncilBudget c={d.council} />}
    </div>
  );
  const serviceColumns: Column<CityProfileData["historyPopulation"][number]>[] = [
    { id: "season", title: t("column.season"), value: (p) => p.season, sortValue: (p) => p.season },
    ...d.services.map((x): Column<CityProfileData["historyPopulation"][number]> => ({ id: x.id, title: t(`city.service.${x.id}` as Key), value: (p) => x.history.find((h) => h.season === p.season)?.level ?? 0 })),
  ];
  const servicesTab = (
    <div className="cartoes">
      <Card title={t("card.cityServices")} wide>
        <Data lines={d.services.map(serviceLine)} />
      </Card>
      <Card title={t("city.servicesHistory")} wide>
        <Table
          id="cidade-servicos" simple columns={serviceColumns} lines={[...d.historyPopulation].reverse()} rowKey={(p) => String(p.season)}
          cell={{ season: (p) => p.label, ...Object.fromEntries(d.services.map((x) => [x.id, (p: (typeof d.historyPopulation)[number]) => { const l = x.history.find((h) => h.season === p.season)?.level ?? 1; return <LevelCell level={l} word={level(l)} />; }])) }}
        />
      </Card>
    </div>
  );

  const clubColumns: Column<CityProfileData["clubs"][number]>[] = [
    { id: "club", title: t("column.club"), value: (c) => c.ref.name },
    { id: "league", title: t("club.division"), value: (c) => c.league },
    { id: "stadium", title: t("card.stadium"), value: (c) => c.stadium.name },
    { id: "capacity", title: t("stadium.capacity"), value: (c) => c.stadium.capacity, numeric: true },
    { id: "ownership", title: t("stadium.ownership"), value: (c) => t(`ownership.${c.stadium.ownership}` as Key) },
  ];
  const indicatorColumns: Column<CityProfileData["historyPopulation"][number]>[] = [
    { id: "season", title: t("column.season"), value: (p) => p.season, sortValue: (p) => p.season },
    ...d.indicators.map((i): Column<CityProfileData["historyPopulation"][number]> => ({ id: i.id, title: t(`city.indicator.${i.id}` as Key), value: (p) => i.history.find((h) => h.season === p.season)?.level ?? 0 })),
  ];
  type Company = NonNullable<CityProfileData["companies"]>["list"][number];
  const companyColumns: Column<Company>[] = [
    { id: "name", title: t("column.company"), value: (c) => c.name },
    { id: "sector", title: t("column.sector"), value: (c) => t(`company.sector.${c.sector}` as Key) },
    { id: "scale", title: t("column.scale"), value: (c) => t(`company.scale.${c.scale}` as Key) },
    { id: "size", title: t("column.size"), value: (c) => c.size },
    { id: "owner", title: t("column.owner"), value: (c) => c.owner?.name ?? "" },
    { id: "sponsors", title: t("column.sponsors"), value: (c) => c.sponsors.map((x) => x.name).join(", ") },
  ];
  const companiesTab = d.companies ? (
    <div className="cartoes">
      <Card title={t("card.employers")}>
        <Data lines={[{ label: t("city.dependence"), value: <span className="nivel-linha"><b>{t(`city.dependence.${d.companies.dependence}` as Key)}</b></span> }]} />
        <p className="suave">{t("city.dependence.hint")}</p>
      </Card>
      <Card title={t("card.companies")} wide>
        {d.companies.list.length > 0 ? (
          <Table
            id="cidade-empresas" simple columns={companyColumns} lines={d.companies.list} rowKey={(c) => c.id}
            cell={{
              size: (c) => <LevelCell level={c.size} word={t(`company.size.${c.size}` as Key)} />,
              owner: (c) => (c.owner ? <EntityLink k="person" id={c.owner.id}>{c.owner.name}</EntityLink> : "—"),
              sponsors: (c) => (c.sponsors.length > 0 ? <>{c.sponsors.map((x, i) => <span key={x.id}>{i > 0 && ", "}<EntityLink k="club" id={x.id}>{x.name}</EntityLink></span>)}</> : "—"),
            }}
          />
        ) : <p className="vazio">{t("city.noCompanies")}</p>}
      </Card>
    </div>
  ) : undefined;
  const clubs = (
    <div className="cartoes">
      <Card title={t("city.clubs")} wide>
        {d.clubs.length > 0 ? (
          <Table
            id="cidade-clubes" simple columns={clubColumns} lines={d.clubs} rowKey={(c) => c.ref.id}
            cell={{
              club: (c) => <EntityLink k="club" id={c.ref.id}>{c.ref.name}</EntityLink>,
              league: (c) => <EntityLink k="competition" id={c.league}>{c.league}</EntityLink>,
              capacity: (c) => n.format(c.stadium.capacity),
            }}
          />
        ) : (
          <p className="vazio">{t("city.noClubs")}</p>
        )}
      </Card>
      <Card title={t("city.localities")} wide>
        <ul className="ligacoes">
          {d.localities.map((l) => (
            <li key={l.ref.id}><EntityLink k="locality" id={l.ref.id}>{l.ref.name}</EntityLink> <span className="suave">· {t(`status.${l.status}` as Key)} · {n.format(l.population)}</span></li>
          ))}
        </ul>
      </Card>
    </div>
  );

  const story = (
    <div className="cartoes">
      <Card title={t("city.populationHistory")} wide>
        <ChartPopulation points={d.historyPopulation} />
      </Card>
      <Card title={t("city.indicatorsHistory")} wide>
        <Table
          id="cidade-indicadores" simple columns={indicatorColumns} lines={[...d.historyPopulation].reverse()} rowKey={(p) => String(p.season)}
          cell={{ season: (p) => p.label, ...Object.fromEntries(d.indicators.map((i) => [i.id, (p: (typeof d.historyPopulation)[number]) => { const l = i.history.find((h) => h.season === p.season)!.level; return <LevelCell level={l} word={level(l)} />; }])) }}
        />
      </Card>
    </div>
  );

  return <Profile type="city" title={d.name} top={<Top title={d.name} labels={labels} card={identity} />} tabs={{ summary, clubs, services: servicesTab, ...(companiesTab ? { companies: companiesTab } : {}), council: councilTab, talent: <LocalTalent city={d.id} />, story }} />;
}
