"use client";
import type { PersonProfileData } from "@/engine/api/contratos";
import { PHYSICAL_ATTRIBUTES, GK_ATTRIBUTES, MENTAL_ATTRIBUTES, TECHNICAL_ATTRIBUTES } from "@/engine/mundo/tipos";
import { Attributes, Chip, type AttributesGroup, type AttributeLine } from "@/ui/components/Atributos";
import { Card, Data, Top } from "@/ui/components/Cartao";
import { Profile } from "@/ui/components/Ficha";
import { EntityLink } from "@/ui/components/Ligacao";
import { seasonName } from "@/engine/calendario/nomeEpoca";
import { Value } from "@/ui/components/Valor";
import type { Key } from "@/ui/i18n";
import { useT } from "@/ui/i18n/LocaleProvider";
import { namePosition, abbreviationPosition } from "@/ui/i18n/posicao";
import { useCountries } from "@/ui/usePaises";
import { showEstimate } from "@/ui/valor";

const eur = (locale: string, n: number) => new Intl.NumberFormat(locale, { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

/** Ficha de uma pessoa: dados de identidade ao lado do nome; no corpo, o que o gamer sabe (ou «?»), conforme o papel. */
export function PersonProfile({ d, seeAll }: { d: PersonProfileData; seeAll: boolean }) {
  const { t, locale } = useT();
  const country = useCountries();
  const { exposed: p, attributes, potential, personality } = d.profile;
  const j = p.player;
  const truth = seeAll ? d.truth : undefined;
  const unknown = <span className="valor-estimado" title={t("pessoa.desconhecido")}>?</span>;

  // ---- atributos de 1 a 20
  const line = (id: string): AttributeLine => {
    const name = t(`atributo.${id}` as Key);
    const exact = truth?.attributes?.[id];
    if (exact !== undefined) return { id, name, text: String(exact), number: exact, state: "exact" };
    const est = attributes?.fields[id];
    if (!est) return { id, name, text: "?", state: "unknown", hint: t("pessoa.desconhecido") };
    const v = showEstimate(est, est);
    return { id, name, text: v.text.replace("≈ ", ""), number: est.value, state: v.state, hint: v.state === "outdated" ? t("valor.vistoHa", { seasons: est.sinceSeasons }) : t("valor.estimado") };
  };
  const group = (id: string, ids: readonly string[]): AttributesGroup => ({ id, title: t(`grupo.${id}` as Key), lines: ids.map(line) });
  const groups: AttributesGroup[] = j
    ? [group("tecnicos", TECHNICAL_ATTRIBUTES), group("mentais", MENTAL_ATTRIBUTES), group("fisicos", PHYSICAL_ATTRIBUTES), ...(j.position === "GK" ? [group("goalkeeper", GK_ATTRIBUTES)] : [])]
    : [];

  const level = d.level ? (d.level.exact ? <b>{d.level.value}</b> : <Value v={showEstimate({ value: d.level.value, margin: d.level.margin, halfTime: [d.level.value - d.level.margin, d.level.value + d.level.margin] })} />) : unknown;
  const potentialValue = truth?.potential !== undefined ? <b>{truth.potential}</b> : potential?.fields.potencial ? <Value v={showEstimate(potential.fields.potencial, potential.fields.potencial)} /> : unknown;

  // ---- identidade ao lado do nome
  const data = [
    { label: t("pessoa.nascimento"), value: `${p.birth} (${t("pessoa.anos", { n: p.age })})` },
    { label: t("coluna.pais"), value: country(p.nationality) },
    ...(d.naturalDe ? [{ label: t("pessoa.naturalDe"), value: <EntityLink k="city" id={d.naturalDe.id}>{d.naturalDe.name}</EntityLink> }] : []),
    ...(j ? [
      { label: t("pessoa.corpo"), value: `${j.heightCm} cm · ${j.weightKg} kg` },
      { label: t("coluna.pe"), value: t(`pe.${j.pe}` as Key) },
    ] : []),
    ...(d.club ? [{ label: t("entidade.clube"), value: <EntityLink k="club" id={d.club.id}>{d.club.name}</EntityLink> }] : []),
    ...(d.contract ? [{ label: t("pessoa.contratoAte"), value: d.contract.end }] : []),
    ...(j ? [{ label: t("pessoa.estado"), value: t(`estado.${j.state}` as Key) }] : []),
  ];
  const labels = (
    <>
      {j && <Chip tone="destaque">{namePosition(t, j.position)}</Chip>}
      {!j && p.fn && <Chip tone="destaque">{t(`funcao.${p.fn}` as Key)}</Chip>}
      {d.club && <Chip><EntityLink k="club" id={d.club.id}>{d.club.name}</EntityLink></Chip>}
      {!d.club && j?.state === "free" && <Chip tone="suave">{t("estado.livre")}</Chip>}
    </>
  );

  // ---- estatísticas de jogo (factos públicos)
  const stats = d.stats;
  const sum = (k: "matches" | "minutes" | "goals" | "assists" | "yellows" | "reds") => stats.reduce((s, x) => s + x[k], 0);
  const statistics = (
    <Card title={t("cartao.stats")} wide>
      {stats.length === 0 ? (
        <>
          <p className="vazio">{t("pessoa.semStats")}</p>
          <Data lines={[{ label: t("stat.jogos"), value: "—" }, { label: t("stat.golos"), value: "—" }, { label: t("stat.assistencias"), value: "—" }, { label: t("stat.nota"), value: unknown }]} />
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
    <Card title={t("cartao.contrato")}>
      <Data
        lines={[
          { label: t("pessoa.contratoAte"), value: d.contract?.end ?? unknown },
          { label: t("pessoa.noClubeDesde"), value: d.contract?.start ?? unknown },
          { label: t("pessoa.salario"), value: truth?.monthlyWage !== undefined ? `${eur(locale, truth.monthlyWage)}/${t("pessoa.mes")}` : unknown },
          { label: t("pessoa.valorMercado"), value: unknown },
          { label: t("pessoa.clausula"), value: unknown },
        ]}
      />
    </Card>
  );

  const cardPersonality = (
    <Card title={t("pessoa.personalidade")}>
      {truth ? (
        <Data lines={Object.entries(truth.personality).map(([k, v]) => ({ label: t(`traco.${k}` as Key), value: <b className="attr attr-exato" data-banda={v <= 6 ? 1 : v <= 10 ? 2 : v <= 13 ? 3 : v <= 16 ? 4 : 5}>{v}</b> }))} />
      ) : personality ? (
        <p>
          {personality.labels.length > 0 ? personality.labels.map((r) => t(`traco.${r.trait}.${r.strip}` as Key)).join(" · ") : t("pessoa.semTracosMarcados")}
          {personality.outdated && <small className="valor-nota"> · {t("valor.vistoHa", { seasons: personality.sinceSeasons })}</small>}
        </p>
      ) : (
        <p className="vazio">{t("pessoa.personalidadeDesconhecida")}</p>
      )}
    </Card>
  );

  const cardDev = truth && (
    <Card title={t("dev.cartao")} wide dev>
      <Data
        lines={[
          { label: t("dev.arquetipo"), value: truth.archetype },
          { label: t("dev.lod"), value: truth.lod },
          ...(truth.positions ? [{ label: t("pessoa.posicoes"), value: truth.positions.map((x) => `${abbreviationPosition(t, x.pos)} ${x.aptitude}`).join(" · ") }] : []),
          ...(truth.quality ? [{ label: t("cargo.qualidades"), value: Object.entries(truth.quality).map(([k, v]) => `${t(`qualidade.${k}` as Key)} ${v}`).join(" · ") }] : []),
        ]}
      />
    </Card>
  );

  const summary = j ? (
    <div className="cartoes">
      <Card title={t("cartao.atributos")} wide>
        {!attributes && !truth && <p className="suave">{t("pessoa.naoObservadoCurto")}</p>}
        <Attributes groups={groups} />
      </Card>
      <Card title={t("cartao.nivel")}>
        <Data
          lines={[
            { label: t("pessoa.nivel"), value: level },
            { label: t("pessoa.potencial"), value: potentialValue },
            { label: t("pessoa.forma"), value: unknown },
            { label: t("pessoa.condicao"), value: unknown },
            { label: t("pessoa.moral"), value: unknown },
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
      <Card title={t("cartao.cargo")}>
        <Data
          lines={[
            { label: t("coluna.funcao"), value: p.fn ? t(`funcao.${p.fn}` as Key) : unknown },
            ...(d.club ? [{ label: t("pessoa.ondeTrabalha"), value: <EntityLink k="club" id={d.club.id}>{d.club.name}</EntityLink> }] : []),
            ...(d.contract ? [{ label: t("pessoa.noClubeDesde"), value: d.contract.start }] : []),
          ]}
        />
      </Card>
      <Card title={t("cargo.qualidades")}>
        {truth?.quality ? (
          <Data lines={Object.entries(truth.quality).map(([k, v]) => ({ label: t(`qualidade.${k}` as Key), value: <b className="attr attr-exato" data-banda={v <= 6 ? 1 : v <= 10 ? 2 : v <= 13 ? 3 : v <= 16 ? 4 : 5}>{v}</b> }))} />
        ) : (
          <p className="vazio">{t("cargo.qualidadesDesconhecidas")}</p>
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
