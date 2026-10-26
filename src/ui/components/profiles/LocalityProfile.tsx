"use client";
import type { CityProfileData, LocalityProfileData } from "@/engine/api/contracts";
import { Chip } from "@/ui/components/Attributes";
import { Card, Data, Top } from "@/ui/components/Card";
import { Table } from "@/ui/components/Table";
import { Profile } from "@/ui/components/Profile";
import { BarLevel, CityProfile, StatusHistory, serviceLines } from "@/ui/components/profiles/CityProfile";
import { EntityLink } from "@/ui/components/Link";
import type { Column } from "@/ui/table/logic";
import type { Key } from "@/ui/i18n";
import { useT } from "@/ui/i18n/LocaleProvider";
import { profileHref } from "@/ui/links";
import Link from "next/link";

/**
 * Página única de lugar (RZ-238): aldeia, vila ou cidade. A sede do concelho mostra a ficha completa do concelho;
 * as restantes localidades mostram o que é delas e, como contexto, a Câmara e os serviços do concelho.
 */
export function LocalityProfile({ d, city }: { d: LocalityProfileData; city: CityProfileData | null }) {
  const { t, locale } = useT();
  const n = new Intl.NumberFormat(locale);
  const status = (e: string) => t(`status.${e}` as Key);
  const level = (v: 1 | 2 | 3 | 4 | 5) => t(`city.level.${v}` as Key);
  const isSeat = d.seat.id === d.id;
  if (isSeat && city) return <CityProfile d={city} locality={d} />;

  const seatHref = (tab?: string) => `${profileHref("locality", d.seat.id)}${tab ? `&tab=${tab}` : ""}`;
  const labels = (
    <>
      <Chip tone="destaque">{status(d.status)}</Chip>
      <Chip tone="suave">{d.district}</Chip>
    </>
  );
  const identity = (
    <Data
      lines={[
        { label: t("locality.population"), value: n.format(d.population) },
        { label: t("locality.municipality"), value: <EntityLink k="locality" id={d.seat.id}>{d.city.name}</EntityLink> },
        { label: t("locality.since"), value: d.since },
        ...(city?.mayor ? [{ label: t("city.mayor"), value: <EntityLink k="person" id={city.mayor.person.id}>{city.mayor.person.name}</EntityLink> }] : []),
      ]}
    />
  );

  const councilCard = city ? (
    <Card title={t("locality.councilOf", { name: city.name })}>
      <Data
        lines={[
          ...(city.mayor ? [{ label: t("city.mayor"), value: <EntityLink k="person" id={city.mayor.person.id}>{city.mayor.person.name}</EntityLink> }] : []),
          { label: t("city.budget"), value: <span className="nivel-linha"><BarLevel level={city.budget} /><b>{level(city.budget)}</b></span> },
          ...(city.mayor ? [{ label: t("mayor.support"), value: <span className="nivel-linha"><BarLevel level={city.mayor.sportSupport} /><b>{level(city.mayor.sportSupport)}</b></span> }] : []),
        ]}
      />
      <p className="suave"><Link href={seatHref("council")}>{t("locality.seeCouncil", { name: d.seat.name })}</Link></p>
    </Card>
  ) : null;

  const summary = (
    <div className="cartoes">
      <div className="cartoes-par">
        <Card title={t("card.locality")}>
          <Data
            lines={[
              { label: t("locality.status"), value: status(d.status) },
              { label: t("locality.population"), value: n.format(d.population) },
              { label: t("locality.seat"), value: <EntityLink k="locality" id={d.seat.id}>{d.seat.name}</EntityLink> },
              { label: t("locality.clubsCount"), value: n.format(d.clubs.length) },
            ]}
          />
        </Card>
        {councilCard}
      </div>
    </div>
  );

  type Club = LocalityProfileData["clubs"][number];
  const clubColumns: Column<Club>[] = [
    { id: "club", title: t("column.club"), value: (c) => c.name },
    { id: "league", title: t("club.division"), value: (c) => c.league },
  ];
  const clubs = (
    <div className="cartoes">
      <Card title={t("city.clubs")} wide>
        {d.clubs.length > 0 ? (
          <Table
            id="local-clubes" simple columns={clubColumns} lines={d.clubs} rowKey={(c) => c.id}
            cell={{
              club: (c) => <EntityLink k="club" id={c.id}>{c.name}</EntityLink>,
              league: (c) => <EntityLink k="competition" id={c.league}>{c.league}</EntityLink>,
            }}
          />
        ) : (
          <p className="vazio">{t("locality.noClubs")}</p>
        )}
      </Card>
    </div>
  );

  const services = city ? (
    <div className="cartoes">
      <Card title={t("locality.servicesOf", { name: city.name })} wide>
        <Data lines={serviceLines(city, t)} />
      </Card>
    </div>
  ) : undefined;

  type Company = NonNullable<CityProfileData["companies"]>["list"][number];
  const companyColumns: Column<Company>[] = [
    { id: "name", title: t("column.company"), value: (c) => c.name },
    { id: "sector", title: t("column.sector"), value: (c) => t(`company.sector.${c.sector}` as Key) },
    { id: "scale", title: t("column.scale"), value: (c) => t(`company.scale.${c.scale}` as Key) },
  ];
  // nas aldeias não há empresas à parte: o concelho é que as tem (RZ-238)
  const companies = city?.companies && d.status !== "village" ? (
    <div className="cartoes">
      <Card title={t("card.companies")} wide>
        {city.companies.list.length > 0 ? (
          <Table id="local-empresas" simple columns={companyColumns} lines={city.companies.list} rowKey={(c) => c.id}
            cell={{ sector: (c) => t(`company.sector.${c.sector}` as Key), scale: (c) => t(`company.scale.${c.scale}` as Key) }} />
        ) : <p className="vazio">{t("city.noCompanies")}</p>}
      </Card>
    </div>
  ) : undefined;

  const story = (
    <div className="cartoes">
      <Card title={t("locality.statusHistory")} wide><StatusHistory d={d} /></Card>
    </div>
  );

  return (
    <Profile
      type="locality"
      title={d.name}
      top={<Top title={d.name} labels={labels} card={identity} />}
      tabs={{ summary, clubs, ...(services ? { services } : {}), ...(companies ? { companies } : {}), story }}
    />
  );
}
