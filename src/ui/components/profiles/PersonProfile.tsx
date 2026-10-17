"use client";
import type { PersonProfileData } from "@/engine/api/contracts";
import { PHYSICAL_ATTRIBUTES, GK_ATTRIBUTES, MENTAL_ATTRIBUTES, TECHNICAL_ATTRIBUTES } from "@/engine/world/types";
import { Attributes, Chip, type AttributesGroup, type AttributeLine } from "@/ui/components/Attributes";
import { Card, Data, Top } from "@/ui/components/Card";
import { Profile } from "@/ui/components/Profile";
import { EntityLink } from "@/ui/components/Link";
import { seasonName } from "@/engine/calendar/seasonName";
import { Stars } from "@/ui/components/Stars";
import { Value } from "@/ui/components/Value";
import type { Key } from "@/ui/i18n";
import { useT } from "@/ui/i18n/LocaleProvider";
import { namePosition, abbreviationPosition } from "@/ui/i18n/position";
import { useCountries } from "@/ui/useCountries";
import { showEstimate } from "@/ui/value";

const eur = (locale: string, n: number) => new Intl.NumberFormat(locale, { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

/** Ficha de uma pessoa: dados de identidade ao lado do nome; no corpo, o que o gamer sabe (ou «?»), conforme o papel. */
export function PersonProfile({ d, seeAll }: { d: PersonProfileData; seeAll: boolean }) {
  const { t, locale } = useT();
  const country = useCountries();
  const { exposed: p, attributes, potential, personality } = d.profile;
  const j = p.player;
  const truth = seeAll ? d.truth : undefined;
  const unknown = <span className="valor-estimado" title={t("person.unknown")}>?</span>;

  // ---- atributos de 1 a 20
  const line = (id: string): AttributeLine => {
    const name = t(`attribute.${id}` as Key);
    const exact = truth?.attributes?.[id];
    if (exact !== undefined) return { id, name, text: String(exact), number: exact, state: "exact" };
    const est = attributes?.fields[id];
    if (!est) return { id, name, text: "?", state: "unknown", hint: t("person.unknown") };
    const v = showEstimate(est, est);
    return { id, name, text: v.text.replace("≈ ", ""), number: est.value, state: v.state, hint: v.state === "outdated" ? t("value.seenAgo", { seasons: est.sinceSeasons }) : t("value.estimated") };
  };
  const group = (id: string, ids: readonly string[]): AttributesGroup => ({ id, title: t(`group.${id}` as Key), lines: ids.map(line) });
  const groups: AttributesGroup[] = j
    ? [group("tecnicos", TECHNICAL_ATTRIBUTES), group("mentais", MENTAL_ATTRIBUTES), group("fisicos", PHYSICAL_ATTRIBUTES), ...(j.position === "GK" ? [group("goalkeeper", GK_ATTRIBUTES)] : [])]
    : [];

  const level = d.level ? (d.level.exact ? <b>{d.level.value}</b> : <Value v={showEstimate({ value: d.level.value, margin: d.level.margin, halfTime: [d.level.value - d.level.margin, d.level.value + d.level.margin] })} />) : unknown;
  const potentialValue = truth?.potential !== undefined ? <b>{truth.potential}</b> : potential?.fields.potential ? <Value v={showEstimate(potential.fields.potential, potential.fields.potential)} /> : unknown;

  // ---- identidade ao lado do nome
  const data = [
    { label: t("person.birth"), value: `${p.birth} (${t("person.years", { n: p.age })})` },
    { label: t("column.country"), value: country(p.nationality) },
    ...(d.birthCity ? [{ label: t("person.birthCity"), value: <EntityLink k="city" id={d.birthCity.id}>{d.birthCity.name}</EntityLink> }] : []),
    ...(j ? [
      { label: t("person.body"), value: `${j.heightCm} cm · ${j.weightKg} kg` },
      { label: t("column.pe"), value: t(`pe.${j.pe}` as Key) },
    ] : []),
    ...(d.club ? [{ label: t("entity.club"), value: <EntityLink k="club" id={d.club.id}>{d.club.name}</EntityLink> }] : []),
    ...(d.contract ? [{ label: t("person.contractUntil"), value: d.contract.end }] : []),
    ...(j ? [{ label: t("person.state"), value: t(`state.${j.state}` as Key) }] : []),
  ];
  const labels = (
    <>
      {j && <Chip tone="destaque">{namePosition(t, j.position)}</Chip>}
      {!j && p.fn && <Chip tone="destaque">{t(`fn.${p.fn}` as Key)}</Chip>}
      {d.club && <Chip><EntityLink k="club" id={d.club.id}>{d.club.name}</EntityLink></Chip>}
      {!d.club && j?.state === "free" && <Chip tone="suave">{t("state.free")}</Chip>}
    </>
  );

  // ---- estatísticas de jogo (factos públicos)
  const stats = d.stats;
  const sum = (k: "matches" | "minutes" | "goals" | "assists" | "yellows" | "reds") => stats.reduce((s, x) => s + x[k], 0);
  const statistics = (
    <Card title={t("card.stats")} wide>
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
          { label: t("person.contractUntil"), value: d.contract?.end ?? unknown },
          { label: t("person.atClubSince"), value: d.contract?.start ?? unknown },
          { label: t("person.wage"), value: truth?.monthlyWage !== undefined ? `${eur(locale, truth.monthlyWage)}/${t("person.month")}` : unknown },
          { label: t("person.marketValue"), value: unknown },
          { label: t("person.clause"), value: unknown },
        ]}
      />
    </Card>
  );

  const cardPersonality = (
    <Card title={t("person.personality")}>
      {truth ? (
        <Data lines={Object.entries(truth.personality).map(([k, v]) => ({ label: t(`trait.${k}` as Key), value: <b className="attr attr-exato" data-banda={v <= 6 ? 1 : v <= 10 ? 2 : v <= 13 ? 3 : v <= 16 ? 4 : 5}>{v}</b> }))} />
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
      <Card title={t("card.attributes")} wide>
        {!attributes && !truth && <p className="suave">{t("person.unobservedShort")}</p>}
        <Attributes groups={groups} />
      </Card>
      <Card title={t("card.level")}>
        <Data
          lines={[
            ...(d.rating ? [{ label: t("person.stars"), value: <Stars value={d.rating.stars} /> }] : []),
            ...(d.rating?.potential ? [{ label: t("person.potentialStars"), value: <Stars range={d.rating.potential} /> }] : []),
            { label: t("person.level"), value: level },
            { label: t("person.potential"), value: potentialValue },
            { label: t("person.form"), value: unknown },
            { label: t("person.condition"), value: unknown },
            { label: t("person.morale"), value: unknown },
          ]}
        />
      </Card>
      {contract}
      {cardPersonality}
      {statistics}
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
        {truth?.quality ? (
          <Data lines={Object.entries(truth.quality).map(([k, v]) => ({ label: t(`quality.${k}` as Key), value: <b className="attr attr-exato" data-banda={v <= 6 ? 1 : v <= 10 ? 2 : v <= 13 ? 3 : v <= 16 ? 4 : 5}>{v}</b> }))} />
        ) : (
          <p className="vazio">{t("role.qualitiesUnknown")}</p>
        )}
      </Card>
      {cardPersonality}
      {cardDev}
    </div>
  );

  return (
    <Profile
      type="person"
      title={p.sportingName}
      top={<Top title={p.sportingName} labels={labels} card={<Data lines={data} />} />}
      tabs={{ summary }}
    />
  );
}
