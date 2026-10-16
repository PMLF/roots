"use client";
import { useState } from "react";
import type { ClubProfileData } from "@/engine/api/contratos";
import type { ViewPerson } from "@/engine/vista/tipos";
import { Chip } from "@/ui/components/Atributos";
import { ClubSwatch } from "@/ui/components/AmostraClube";
import { Card, Data, Top } from "@/ui/components/Cartao";
import { Profile } from "@/ui/components/Ficha";
import { DivisionsChart } from "@/ui/components/GraficoDivisoes";
import { EntityLink } from "@/ui/components/Ligacao";
import { ClubBudget } from "@/ui/components/fichas/OrcamentoClube";
import { Table } from "@/ui/components/Tabela";
import { Value } from "@/ui/components/Valor";
import type { Key } from "@/ui/i18n";
import { useT } from "@/ui/i18n/LocaleProvider";
import { abbreviationPosition } from "@/ui/i18n/posicao";
import type { Column } from "@/ui/tabela/logica";
import { useCountries } from "@/ui/usePaises";
import { showEstimate } from "@/ui/valor";

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
  const unknown = <span className="valor-estimado" title={t("pessoa.desconhecido")}>?</span>;
  const truth = seeAll ? d.truth : undefined;
  const name = (p: ViewPerson) => <EntityLink k="person" id={p.id}>{p.sportingName}</EntityLink>;
  const president = d.roles.find((c) => c.fn === "president");
  const technicalTeam = d.roles.filter((c) => c.fn !== "president");
  const levelOf = (p: ViewPerson) => d.extraSquad[p.id]?.level;
  const cellLevel = (p: ViewPerson) => {
    const v = levelOf(p);
    return v ? (v.exact ? <b>{v.value}</b> : <Value v={showEstimate({ value: v.value, margin: v.margin, halfTime: [v.value - v.margin, v.value + v.margin] })} />) : unknown;
  };

  const squad: Column<ViewPerson>[] = [
    { id: "name", title: t("coluna.nome"), value: (p) => p.sportingName },
    { id: "pos", title: t("coluna.posicao"), value: (p) => abbreviationPosition(t, p.player?.position ?? "") },
    { id: "age", title: t("coluna.idade"), value: (p) => p.age, numeric: true },
    { id: "level", title: t("coluna.nivel"), value: (p) => levelOf(p)?.value ?? "", numeric: true },
    { id: "country", title: t("coluna.pais"), value: (p) => country(p.nationality) },
    { id: "foot", title: t("coluna.pe"), value: (p) => (p.player ? t(`pe.${p.player.pe}` as Key) : "") },
    { id: "height", title: t("coluna.altura"), value: (p) => p.player?.heightCm ?? 0, numeric: true },
    { id: "weight", title: t("coluna.peso"), value: (p) => p.player?.weightKg ?? 0, numeric: true },
    { id: "contract", title: t("coluna.contrato"), value: (p) => d.extraSquad[p.id]?.endContract ?? "" },
    { id: "status", title: t("coluna.estado"), value: (p) => (p.player ? t(`estado.${p.player.state}` as Key) : "") },
  ];
  // estatísticas da época atual (RZ-175); o xG por jogador não se guarda
  const ep = (p: ViewPerson) => d.season?.players[p.id];
  const dec = (v: number, c = 1) => v.toFixed(c);
  const g90 = (p: ViewPerson) => { const e = ep(p); return e && e.minutes > 0 ? (e.goals * 90) / e.minutes : 0; };
  const countC = (id: string, title: Key, value: (p: ViewPerson) => number): Column<ViewPerson> => ({ id, title: t(title), value, numeric: true });
  const base = squad.filter((c) => ["name", "pos"].includes(c.id));
  const seasonCol: Column<ViewPerson>[] = [
    ...base,
    countC("games", "coluna.jogos", (p) => ep(p)?.games ?? 0),
    countC("minutes", "coluna.minutos", (p) => ep(p)?.minutes ?? 0),
    countC("goals", "coluna.golos", (p) => ep(p)?.goals ?? 0),
    countC("assists", "coluna.assistencias", (p) => ep(p)?.assists ?? 0),
    countC("ga", "coluna.ga", (p) => (ep(p)?.goals ?? 0) + (ep(p)?.assists ?? 0)),
    countC("g90", "coluna.golos90", g90),
    countC("rating", "coluna.nota", (p) => ep(p)?.rating ?? 0),
    countC("yellow", "coluna.amarelos", (p) => ep(p)?.yellow ?? 0),
    countC("red", "coluna.vermelhos", (p) => ep(p)?.red ?? 0),
  ];
  const disciplineCol: Column<ViewPerson>[] = [
    ...base,
    countC("games", "coluna.jogos", (p) => ep(p)?.games ?? 0),
    countC("minutes", "coluna.minutos", (p) => ep(p)?.minutes ?? 0),
    countC("mpg", "coluna.minPorJogo", (p) => { const e = ep(p); return e && e.games ? Math.round(e.minutes / e.games) : 0; }),
    countC("yellow", "coluna.amarelos", (p) => ep(p)?.yellow ?? 0),
    countC("red", "coluna.vermelhos", (p) => ep(p)?.red ?? 0),
    { id: "status", title: t("coluna.estado"), value: (p) => (p.player ? t(`estado.${p.player.state}` as Key) : "") },
  ];
  const [view, setView] = useState<"profile" | "season" | "discipline">("profile");
  const viewColumns = view === "season" ? seasonCol : view === "discipline" ? disciplineCol : squad;
  const seasonCell = {
    name: name, level: cellLevel,
    rating: (p: ViewPerson) => (ep(p)?.rating !== undefined ? dec(ep(p)?.rating ?? 0, 2) : "—"),
    g90: (p: ViewPerson) => (ep(p)?.minutes ? dec(g90(p), 2) : "—"),
  };
  const squadTable = (
    <>
      <label className="vista-plantel">
        <span>{t("plantel.vista")}</span>
        <select value={view} onChange={(e) => setView(e.target.value as typeof view)} data-testid="plantel-vista">
          <option value="profile">{t("plantel.vista.perfil")}</option>
          <option value="season">{t("plantel.vista.epoca")}</option>
          <option value="discipline">{t("plantel.vista.disciplina")}</option>
        </select>
      </label>
      <Table key={view} id={`plantel-${view}`} fileName={`plantel-${view}-${d.id}`} columns={viewColumns} lines={d.squad} rowKey={(p) => p.id} cell={seasonCell} initialOrder={view === "profile" ? { column: "pos", direction: "asc" } : { column: view === "season" ? "ga" : "minutes", direction: "desc" }} />
    </>
  );
  const tp = d.season?.tops;
  const topLine = (rot: Key, x: { player: string; name: string; value: number } | undefined, fmt: (v: number) => string = String) =>
    x ? [{ label: t(rot), value: <><EntityLink k="person" id={x.player}>{x.name}</EntityLink> <b>{fmt(x.value)}</b></> }] : [];
  const clubTops = (
    <Card title={t("cartao.topsClube")}>
      {tp && Object.keys(tp).length > 0 ? (
        <Data lines={[
          ...topLine("tops.marcador", tp.scorer), ...topLine("tops.assistente", tp.assist), ...topLine("tops.ga", tp.goalsAndAssists),
          ...topLine("tops.nota", tp.rating, (v) => dec(v, 2)), ...topLine("tops.jogos", tp.games), ...topLine("tops.minutos", tp.minutes),
          ...topLine("tops.amarelos", tp.yellow), ...topLine("tops.vermelhos", tp.red),
        ]} />
      ) : (
        <p className="vazio">{t("tops.vazio")}</p>
      )}
    </Card>
  );
  const eq = d.season?.team;
  const clubSeason = eq ? (
    <Card title={t("cartao.epocaClube", { season: d.season?.seasonLabel ?? "" })}>
      <Data lines={[
        { label: t("epoca.posicao"), value: <b>{eq.position}º</b> },
        { label: t("epoca.jogos"), value: eq.played },
        { label: t("epoca.vde"), value: `${eq.won} / ${eq.drawn} / ${eq.lost}` },
        { label: t("epoca.golos"), value: `${eq.goalsFor} / ${eq.goalsAgainst}` },
        { label: t("epoca.pontos"), value: <b>{eq.points}</b> },
      ]} />
    </Card>
  ) : null;
  const staff: Column<ViewPerson>[] = [
    { id: "name", title: t("coluna.nome"), value: (p) => p.sportingName },
    { id: "role", title: t("coluna.funcao"), value: (p) => (p.fn ? t(`funcao.${p.fn}` as Key) : "") },
    { id: "age", title: t("coluna.idade"), value: (p) => p.age, numeric: true },
    { id: "country", title: t("coluna.pais"), value: (p) => country(p.nationality) },
    { id: "quality", title: t("coluna.qualidade"), value: (p) => { const q = truth?.staffQuality[p.id]; return q ? Object.entries(q).map(([k, v]) => `${t(`qualidade.${k}` as Key)} ${v}`).join(" · ") : "?"; } },
  ];

  // plantel em números
  const ages = d.squad.map((p) => p.age);
  const meanAge = ages.length ? (ages.reduce((s, x) => s + x, 0) / ages.length).toFixed(1) : undefined;
  const foreigners = d.squad.filter((p) => p.nationality !== "pt").length;
  const goalkeeper = d.squad.filter((p) => p.player?.position === "GK").length;
  const levels = d.squad.map((p) => levelOf(p)?.value).filter((v): v is number => v !== undefined);
  const averageLevel = levels.length === d.squad.length && levels.length > 0 ? (levels.reduce((s, x) => s + x, 0) / levels.length).toFixed(1) : undefined;

  const size = t(`reputacao.nivel.${d.levelReputation}` as Key);
  const labels = (
    <>
      <Chip>{size}</Chip>
      <Chip tone="destaque"><EntityLink k="competition" id={d.league}>{d.league}</EntityLink>{d.season?.team ? ` · ${t("clube.lugar", { n: d.season.team.position })}` : ""}</Chip>
      <Chip tone="suave">{d.district}</Chip>
    </>
  );
  const identity = (
    <Data
      lines={[
        { label: t("clube.localidade"), value: <><EntityLink k="locality" id={d.locality.id}>{d.locality.name}</EntityLink> <span className="suave">({t(`estatuto.${d.locality.status}` as Key).toLowerCase()})</span></> },
        { label: t("clube.concelho"), value: <EntityLink k="city" id={d.city.id}>{d.city.name}</EntityLink> },
        { label: t("clube.alcunha"), value: `${d.nickname} · ${d.mascot}` },
        ...(president ? [{ label: t("clube.presidente"), value: name(president) }] : []),
        ...(d.rival ? [{ label: t("clube.rival"), value: <EntityLink k="club" id={d.rival.id}>{d.rival.name}</EntityLink> }] : []),
        { label: t("clube.fundacao"), value: unknown },
      ]}
    />
  );

  const e = d.detailStadium;
  const summary = (
    <div className="cartoes">
      <Card title={t("cartao.dimensao")}>
        <Data
          lines={[
            { label: t("clube.dimensao"), value: <b>{size}</b> },
            { label: t("clube.divisao"), value: t(`escalao.${d.tier}` as Key) },
            { label: t("clube.adeptos"), value: unknown },
            { label: t("clube.socios"), value: unknown },
            ...(truth ? [{ label: t("dev.reputacao"), value: n.format(truth.reputation) }] : []),
          ]}
        />
      </Card>
      <Card title={t("cartao.financas")}>
        <Data
          lines={[
            { label: t("financas.estado"), value: <span title={d.finances.exact ? undefined : t("financas.estimativa")}>{t(`financas.estado.${d.finances.state}` as Key)}{d.finances.exact ? "" : " ~"}</span> },
            ...(d.finances.balance !== undefined ? [{ label: t("financas.saldo"), value: eur.format(d.finances.balance) }] : []),
            ...(d.finances.lastClose ? [
              { label: t("financas.receitasMes"), value: eur.format(d.finances.lastClose.revenues) },
              { label: t("financas.despesasMes"), value: eur.format(-d.finances.lastClose.expenses) },
            ] : []),
            ...(d.finances.exact ? [] : [
              { label: t("clube.orcamento"), value: unknown },
              { label: t("clube.massaSalarial"), value: unknown },
              { label: t("clube.patrocinios"), value: unknown },
            ]),
          ]}
        />
        {d.finances.budget && d.finances.balance !== undefined && <ClubBudget initial={d.finances.budget} balance={d.finances.balance} />}
      </Card>
      {clubSeason}
      {clubTops}
      <Card title={t("cartao.plantelNumeros")}>
        <Data
          lines={[
            { label: t("clube.plantel"), value: d.squad.length },
            { label: t("plantel.idadeMedia"), value: meanAge ?? "—" },
            { label: t("plantel.estrangeiros"), value: d.squad.length ? `${foreigners} (${Math.round((foreigners / d.squad.length) * 100)}%)` : "—" },
            { label: t("plantel.guardaRedes"), value: goalkeeper },
            { label: t("plantel.nivelMedio"), value: averageLevel ?? unknown },
            { label: t("plantel.lesionados"), value: unknown },
          ]}
        />
      </Card>
      <Card title={t("cartao.estadio")}>
        <Data
          lines={[
            { label: d.stadium.name, value: `${n.format(d.stadium.capacity)} ${t("estadio.lugares")}` },
            { label: t("estadio.propriedade"), value: t(`propriedade.${e.ownership}` as Key) },
            { label: t("estadio.distancia"), value: t("estadio.km", { n: e.centreDistanceKm }) },
            { label: t("estadio.transportes"), value: <Bar value={e.transport} /> },
            { label: t("estadio.acesso"), value: <Bar value={e.roadAccess} /> },
            { label: t("estadio.estacionamento"), value: <Bar value={e.parking} /> },
            { label: t("estadio.expansao"), value: <Bar value={e.expansionTerrain} /> },
          ]}
        />
      </Card>
      <Card title={t("cartao.equipaTecnica")}>
        {technicalTeam.length === 0 ? (
          <p className="vazio">{t("clube.semStaff")}</p>
        ) : (
          <Data lines={technicalTeam.map((p) => ({ label: t(`funcao.${p.fn}` as Key), value: name(p) }))} />
        )}
      </Card>
      <Card title={t("cartao.divisoes")} wide>
        <DivisionsChart points={d.divisionsHistory} />
      </Card>
    </div>
  );

  if (squadOnly) {
    return d.squad.length > 0 ? (
      squadTable
    ) : (
      <p className="vazio">{t("clube.semMundo")}</p>
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
          <p className="vazio">{t("clube.semMundo")}</p>
        ),
        staff: d.roles.length > 0 ? (
          <Table id="staff" fileName={`staff-${d.id}`} columns={staff} lines={d.roles} rowKey={(p) => p.id} cell={{ name: name }} />
        ) : (
          <p className="vazio">{t("clube.semMundo")}</p>
        ),
      }}
    />
  );
}
