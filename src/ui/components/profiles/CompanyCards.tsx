"use client";
import type { CityCompaniesView } from "@/engine/api/contracts";
import { Card, Data } from "@/ui/components/Card";
import { ClubSwatch } from "@/ui/components/ClubSwatch";
import { EntityLink } from "@/ui/components/Link";
import type { Key } from "@/ui/i18n";
import { useT } from "@/ui/i18n/LocaleProvider";

/** Um cartão por empresa do concelho (RZ-240): cores à esquerda do nome, setor, escala, anos no setor, empregados, dono e clubes que patrocina. */
export function CompanyCards({ list, full = true }: { list: CityCompaniesView["list"]; full?: boolean }) {
  const { t, locale } = useT();
  const n = new Intl.NumberFormat(locale);
  if (list.length === 0) return <Card wide><p className="vazio">{t("city.noCompanies")}</p></Card>;
  return (
    <div className="empresas">
      {list.map((c) => (
        <Card
          key={c.id}
          className="empresa"
          title={<span className="empresa-nome"><ClubSwatch colours={c.colours} className="amostra-empresa" />{c.name}</span>}
        >
          <Data
            lines={[
              { label: t("column.sector"), value: t(`company.sector.${c.sector}` as Key) },
              { label: t("column.scale"), value: t(`company.scale.${c.scale}` as Key) },
              { label: t("company.years"), value: t("company.yearsValue", { n: c.years }) },
              { label: t("company.employees"), value: `≈ ${n.format(c.employees)}` },
              ...(full ? [
                { label: t("column.owner"), value: c.owner ? <EntityLink k="person" id={c.owner.id}>{c.owner.name}</EntityLink> : "—" },
                { label: t("column.sponsors"), value: c.sponsors.length > 0 ? <>{c.sponsors.map((x, i) => <span key={x.id}>{i > 0 && ", "}<EntityLink k="club" id={x.id}>{x.name}</EntityLink></span>)}</> : "—" },
              ] : []),
            ]}
          />
        </Card>
      ))}
    </div>
  );
}
