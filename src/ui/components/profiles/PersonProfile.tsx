"use client";
import { useEffect, useState } from "react";
import type { BidView, CareerLine, PersonProfileData } from "@/engine/api/contracts";
import { PHYSICAL_ATTRIBUTES, GK_ATTRIBUTES, MENTAL_ATTRIBUTES, TECHNICAL_ATTRIBUTES } from "@/engine/world/types";
import { Attributes, Chip, type AttributesGroup, type AttributeLine } from "@/ui/components/Attributes";
import { Card, Data, Top } from "@/ui/components/Card";
import { Table } from "@/ui/components/Table";
import { PersonHistoryTable } from "@/ui/components/profiles/PersonHistoryTable";
import { Profile } from "@/ui/components/Profile";
import { EntityLink } from "@/ui/components/Link";
import { seasonName } from "@/engine/calendar/seasonName";
import { Stars } from "@/ui/components/Stars";
import { Flag } from "@/ui/components/Flag";
import { useEngine } from "@/ui/EngineProvider";
import { ObservePlayer } from "@/ui/components/ScoutDialogs";
import { BidDialog } from "@/ui/components/BidDialog";
import { RenewalDialog } from "@/ui/components/RenewalDialog";
import type { Key } from "@/ui/i18n";
import { useT } from "@/ui/i18n/LocaleProvider";
import { namePosition, abbreviationPosition } from "@/ui/i18n/position";
import { useCountries } from "@/ui/useCountries";
import type { Column } from "@/ui/table/logic";
import { showEstimate } from "@/ui/value";

const eur = (locale: string, n: number) => new Intl.NumberFormat(locale, { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

/** Ficha de uma pessoa: dados de identidade ao lado do nome; no corpo, o que o gamer sabe (ou «?»), conforme o papel. */
export function PersonProfile({ d, seeAll }: { d: PersonProfileData; seeAll: boolean }) {
  const { t, locale } = useT();
  const country = useCountries();
  const { exposed: p, attributes, personality } = d.profile;
  const j = p.player;
  const truth = seeAll ? d.truth : undefined;
  const inside = truth ?? d.known;
  const [renewing, setRenewing] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [bidding, setBidding] = useState(false);
  // «Avançar» com uma negociação por responder abre-a logo (RZ-257)
  useEffect(() => { if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("negociar")) setBidding(true); }, []);
  const [observing, setObserving] = useState(false);
  const engine = useEngine();
  const [saleOverride, setSaleOverride] = useState<boolean | undefined>(undefined);
  const forSale = saleOverride ?? d.forSale;
  const toggleSale = () => { const on = !forSale; setSaleOverride(on); void engine?.call("setForSale", { person: d.profile.exposed.id, forSale: on }); };
  // estado da negociação; o popup atualiza-o à medida que a conversa avança
  const [bidView, setBidView] = useState<BidView | undefined>(undefined);
  const bid = bidView ? (bidView.stage === "closed" ? undefined : { stage: bidView.stage, ...(bidView.moving ? { moving: { club: bidView.moving.club, date: bidView.moving.date } } : {}) }) : d.bid;
  const joined = bidView?.stage === "done";
  const [recalled, setRecalled] = useState(false);
  const recall = async () => { const r = await engine?.call("recallLoan", { person: d.profile.exposed.id }); if (r?.ok) setRecalled(true); };
  const unknown = <span className="valor-estimado" title={t("person.unknown")}>?</span>;

  // ---- atributos de 1 a 20
  const line = (id: string): AttributeLine => {
    const name = t(`attribute.${id}` as Key);
    const exact = truth?.attributes?.[id] ?? d.known?.attributes?.[id];
    if (exact !== undefined) return { id, name, text: String(exact), number: exact, state: "exact" };
    const est = attributes?.fields[id];
    if (!est) return { id, name, text: "?", state: "unknown", hint: t("person.unknown") };
    const v = showEstimate(est, est);
    return { id, name, text: v.text.replace("≈ ", ""), number: est.value, state: v.state, hint: v.state === "outdated" ? t("value.seenAgo", { seasons: est.sinceSeasons }) : t("value.estimated") };
  };
  const group = (id: string, ids: readonly string[]): AttributesGroup => ({ id, title: t(`group.${id}` as Key), lines: ids.map(line) });
  const groups: AttributesGroup[] = j
    ? [group("technical", TECHNICAL_ATTRIBUTES), group("mental", MENTAL_ATTRIBUTES), group("physical", PHYSICAL_ATTRIBUTES), ...(j.position === "GK" ? [group("goalkeeper", GK_ATTRIBUTES)] : [])]
    : [];


  // ---- identidade ao lado do nome
  const data = [
    { label: t("person.birth"), value: `${p.birth} (${t("person.years", { n: p.age })})` },
    { label: t("column.country"), value: <><Flag id={p.nationality} /> {country(p.nationality)}</> },
    ...(d.birthCity ? [{ label: t("person.birthCity"), value: <EntityLink k="city" id={d.birthCity.id}>{d.birthCity.name}</EntityLink> }] : []),
    ...(j ? [
      { label: t("person.body"), value: `${j.heightCm} cm · ${j.weightKg} kg` },
      { label: t("column.foot"), value: t(`foot.${j.foot}` as Key) },
    ] : []),
    ...(d.club ? [{ label: t("entity.club"), value: <EntityLink k="club" id={d.club.id}>{d.club.name}</EntityLink> }] : []),
    ...(d.foreignClub ? [{ label: t("entity.club"), value: d.foreignClub.name }] : []),
    ...(d.contract ? [{ label: t("person.contractUntil"), value: d.contractEndingSoon ? <span className="erro" title={t("squad.endingSoon")}>{d.contract.end}</span> : d.contract.end }] : []),
    ...(j ? [{ label: t("person.state"), value: t(`state.${j.state}` as Key) }] : []),
    ...(j ? [
      { label: t("person.stars"), value: d.rating ? <Stars value={d.rating.stars} /> : unknown },
      { label: t("person.potentialStars"), value: d.rating?.potential ? <Stars range={d.rating.potential} /> : unknown },
    ] : []),
  ];
  const labels = (
    <>
      {j && <Chip tone="destaque">{namePosition(t, j.position)}</Chip>}
      {forSale && <Chip tone="mercado">{t("person.forSale")}</Chip>}
      {d.interest && d.interest.offers.length > 0 ? <Chip tone="mercado">{t("interest.pillOffers")}</Chip> : d.interest && d.interest.clubs.length > 0 && <Chip tone="mercado">{t("interest.pillWanted")}</Chip>}
      {!j && p.fn && <Chip tone="destaque">{t(`fn.${p.fn}` as Key)}</Chip>}
      {d.club && <Chip><EntityLink k="club" id={d.club.id}>{d.club.name}</EntityLink></Chip>}
      {d.foreignClub && <Chip>{d.foreignClub.name}</Chip>}
      {!d.club && !d.foreignClub && j?.state === "free" && <Chip tone="suave">{t("state.free")}</Chip>}
    </>
  );

  // ---- estatísticas de jogo (factos públicos)
  const stats = d.stats;
  const sum = (k: "matches" | "minutes" | "goals" | "assists" | "yellows" | "reds") => stats.reduce((s, x) => s + x[k], 0);
  const statistics = (
    <Card title={j ? t("card.stats") : t("career.asPlayer")} wide>
      {stats.length === 0 ? (
        <>
          <p className="vazio">{t("person.noStats")}</p>
          <Data lines={[{ label: t("stat.matches"), value: "—" }, { label: t("stat.goals"), value: "—" }, { label: t("stat.assists"), value: "—" }, { label: t("stat.rating"), value: unknown }]} />
        </>
      ) : (
        <table className="tabela">
          <thead><tr>{(["season", "competition", "matches", "minutes", "goals", "assists", "yellows", "reds"] as const).map((c) => <th key={c} className={c === "season" || c === "competition" ? undefined : "within"}>{t(`stat.${c}` as Key)}</th>)}</tr></thead>
          <tbody>
            {stats.map((s) => (
              <tr key={`${s.season}-${s.competition}-${s.club}`}>
                <td>{seasonName(s.season, d.initialYear)}</td><td>{s.competition}</td>
                <td className="num">{s.matches}</td><td className="num">{s.minutes}</td><td className="num">{s.goals}</td><td className="num">{s.assists}</td><td className="num">{s.yellows}</td><td className="num">{s.reds}</td>
              </tr>
            ))}
            {stats.length > 1 && (
              <tr className="total"><td colSpan={2}>{t("stat.total")}</td>{(["matches", "minutes", "goals", "assists", "yellows", "reds"] as const).map((k) => <td key={k} className="num">{sum(k)}</td>)}</tr>
            )}
          </tbody>
        </table>
      )}
    </Card>
  );

  const contract = (
    <Card title={t("card.contract")}>
      <Data
        lines={[
          { label: t("person.contractUntil"), value: d.contract ? (d.contractEndingSoon ? <span className="erro" title={t("squad.endingSoon")}>{d.contract.end}</span> : d.contract.end) : unknown },
          { label: t("person.atClubSince"), value: d.contract?.start ?? unknown },
          { label: t("person.wage"), value: (d.wage ?? truth?.monthlyWage) !== undefined ? `${eur(locale, (d.wage ?? truth?.monthlyWage) as number)}/${t("person.month")}` : unknown },
          ...(d.agent ? [{ label: t("person.agent"), value: <EntityLink k="person" id={d.agent.id}>{d.agent.name}</EntityLink> }] : []),
          { label: t("person.clause"), value: d.clauses ? (d.clauses.release !== undefined ? eur(locale, d.clauses.release) : t("person.noClause")) : unknown },
        ]}
      />
    {d.loan && !recalled && <p><b>{t(d.loan.direction === "out" ? "person.loan.out" : "person.loan.in", { club: d.loan.club.name, date: d.loan.until, share: Math.round(d.loan.share * 100) })}</b>{d.loan.direction === "out" && d.loan.canRecall && <> <button type="button" className="secundario" onClick={() => void recall()}>{t("person.loan.recall")}</button></>}</p>}
    {recalled && <p><b>{t("person.loan.recalled", { name: p.sportingName })}</b></p>}
    {joined && <p><b>{bidView?.loanedUntil ? t("bid.loan.doneNow", { name: p.sportingName, date: bidView.loanedUntil }) : t("bid.doneNow", { name: p.sportingName })}</b></p>}
    {bid?.moving && <p><b>{t("bid.moving", { club: bid.moving.club, date: bid.moving.date })}</b></p>}
    {d.renewable && (agreed ? <p><b>{t("renewals.done")}</b></p> : <p><button type="button" onClick={() => setRenewing(true)}>{t("renewals.renewContract")}</button></p>)}
      </Card>
  );

  const cardPersonality = (
    <Card title={t("person.personality")}>
      {inside ? (
        <Data lines={Object.entries(inside.personality).map(([k, v]) => ({ label: t(`trait.${k}` as Key), value: <b className="attr attr-exato" data-banda={v <= 6 ? 1 : v <= 10 ? 2 : v <= 13 ? 3 : v <= 16 ? 4 : 5}>{v}</b> }))} />
      ) : personality ? (
        <p>
          {personality.labels.length > 0 ? personality.labels.map((r) => t(`trait.${r.trait}.${r.strip}` as Key)).join(" · ") : t("person.noMarkedTraits")}
          {personality.outdated && <small className="valor-nota"> · {t("value.seenAgo", { seasons: personality.sinceSeasons })}</small>}
        </p>
      ) : (
        <p className="vazio">{t("person.personalityUnknown")}</p>
      )}
    </Card>
  );

  /** Posições em que o jogador joga e com que qualidade: em palavras e cores (as bandas dos atributos), nunca os números. */
  const positionBand = (a: number) => (a >= 17 ? 5 : a >= 14 ? 4 : a >= 10 ? 3 : a >= 6 ? 2 : 1);
  const positionLevel = (a: number) => (a >= 17 ? "natural" : a >= 14 ? "competent" : a >= 10 ? "fair" : a >= 6 ? "limited" : "poor");
  const knownPositions = inside?.positions;
  const cardPositions = j && knownPositions && knownPositions.length > 0 ? (
    <Card title={t("person.positions")}>
      <Data lines={[...knownPositions].sort((a, b) => b.aptitude - a.aptitude).map((x) => ({ label: namePosition(t, x.pos), value: <b className="attr" data-banda={positionBand(x.aptitude)}>{t(`positionLevel.${positionLevel(x.aptitude)}` as Key)}</b> }))} />
    </Card>
  ) : undefined;

  const cardDev = truth && (
    <Card title={t("dev.card")} wide dev>
      <Data
        lines={[
          { label: t("dev.archetype"), value: truth.archetype },
          { label: t("dev.lod"), value: truth.lod },
          ...(truth.positions ? [{ label: t("person.positions"), value: truth.positions.map((x) => `${abbreviationPosition(t, x.pos)} ${x.aptitude}`).join(" · ") }] : []),
          ...(truth.quality ? [{ label: t("role.qualities"), value: Object.entries(truth.quality).map(([k, v]) => `${t(`quality.${k}` as Key)} ${v}`).join(" · ") }] : []),
        ]}
      />
    </Card>
  );

  const summary = j ? (
    <div className="cartoes">
      <div className={`cartoes-atributos${cardPositions ? "" : " sozinho"}`}>
        <Card title={t("card.attributes")}>
          {!attributes && !truth && <p className="suave">{t("person.unobservedShort")}</p>}
          <Attributes groups={groups} />
        </Card>
        {cardPositions}
      </div>
      {cardDev}
    </div>
  ) : (
    <div className="cartoes">
      <Card title={t("card.role")}>
        <Data
          lines={[
            { label: t("column.fn"), value: p.fn ? t(`fn.${p.fn}` as Key) : unknown },
            ...(d.club ? [{ label: t("person.worksAt"), value: <EntityLink k="club" id={d.club.id}>{d.club.name}</EntityLink> }] : []),
            ...(d.contract ? [{ label: t("person.atClubSince"), value: d.contract.start }] : []),
          ]}
        />
      </Card>
      <Card title={t("role.qualities")}>
        {inside?.quality ? (
          <Data lines={Object.entries(inside.quality).map(([k, v]) => ({ label: t(`quality.${k}` as Key), value: <b className="attr attr-exato" data-banda={v <= 6 ? 1 : v <= 10 ? 2 : v <= 13 ? 3 : v <= 16 ? 4 : 5}>{v}</b> }))} />
        ) : (
          <p className="vazio">{t("role.qualitiesUnknown")}</p>
        )}
      </Card>
      {stats.length > 0 && statistics}
      {cardPersonality}
      {cardDev}
    </div>
  );

  const eurShort = (n: number) => eur(locale, n);
  const careerColumns: Column<CareerLine>[] = [
    { id: "season", title: t("column.season"), value: (c) => c.season, numeric: true },
    { id: "date", title: t("career.date"), value: (c) => c.date },
    { id: "event", title: t("career.event"), value: (c) => t(`career.${c.kind}` as Key) },
    { id: "club", title: t("entity.club"), value: (c) => c.club?.name ?? "" },
    { id: "fee", title: t("career.fee"), value: (c) => c.fee ?? 0, numeric: true },
  ];
  const interest = j && d.interest ? (
    <Card title={t("interest.card")}>
      {d.interest.offers.length === 0 && d.interest.clubs.length === 0 && <p className="vazio">{t("interest.none")}</p>}
      {d.interest.offers.length > 0 && (
        <Data lines={d.interest.offers.map((o) => ({ label: t("interest.offer", { fee: eur(locale, o.fee) }), value: <span className="clube-linha"><EntityLink k="club" id={o.buyer.id}>{o.buyer.name}</EntityLink></span> }))} />
      )}
      {d.interest.clubs.length > 0 && (
        <div className="interesse-lista"><Data lines={d.interest.clubs.map((c) => ({ label: t(`interest.${c.level}` as Key) + (c.local ? ` · ${t("interest.local")}` : ""), value: <span className="clube-linha"><EntityLink k="club" id={c.club.id}>{c.club.name}</EntityLink></span> }))} /></div>
      )}
    </Card>
  ) : null;
  const contractTab = (
    <div className={`cartoes-par${interest ? " tres" : ""}`}>
      {contract}
      {cardPersonality}
      {interest}
    </div>
  );
  const story = (
    <div className="cartoes">
      {d.history && d.history.length > 0 && (
        <Card title={t("tab.story")} wide>
          <PersonHistoryTable rows={d.history} initialYear={d.initialYear} />
        </Card>
      )}
      {d.career && d.career.length > 0 && (
    <Card title={t("career.title")} wide>
      <Table
        id="pessoa-percurso" columns={careerColumns} lines={d.career ?? []} rowKey={(c) => String(c.id)} simple
        initialOrder={{ column: "date", direction: "desc" }}
        cell={{
          season: (c) => seasonName(c.season, d.initialYear),
          club: (c) => (c.club ? <>{c.from && <><EntityLink k="club" id={c.from.id}>{c.from.name}</EntityLink> → </>}<EntityLink k="club" id={c.club.id}>{c.club.name}</EntityLink></> : "—"),
          fee: (c) => (c.fee !== undefined ? (c.fee > 0 ? eurShort(c.fee) : t("career.free")) : "—"),
        }}
      />
    </Card>
      )}
    </div>
  );

  return (
    <Profile
      type="person"
      title={p.sportingName}
      top={<><Top title={p.sportingName} labels={labels} card={<Data lines={data} />} actions={d.forSale !== undefined ? <button type="button" className={forSale ? "primario" : "secundario"} onClick={toggleSale}>{t(forSale ? "person.removeFromSale" : "person.putForSale")}</button> : d.biddable && !joined && !bid?.moving ? <span className="acoes-linha"><button type="button" className="secundario" onClick={() => setObserving(true)}>{t("scouting.observe")}</button><button type="button" className="primario" onClick={() => setBidding(true)}>{t(bid?.stage === "agreed" ? "bid.confirm" : bid ? "bid.continue" : "bid.make")}</button></span> : undefined} />{observing && <ObservePlayer person={p.id} name={p.sportingName} onClose={() => setObserving(false)} />}{bidding && <BidDialog person={p.id} name={p.sportingName} onClose={() => setBidding(false)} onChanged={setBidView} />}{renewing && <RenewalDialog person={p.id} name={p.sportingName} onClose={() => setRenewing(false)} onAgreed={() => setAgreed(true)} />}</>}
      omit={j ? ["career"] : ["career", "contract"]}
      tabs={{ summary, contract: contractTab, story }}
    />
  );
}
