"use client";
import type { LocalityProfileData } from "@/engine/api/contracts";
import { Profile } from "@/ui/components/Profile";
import { EntityLink } from "@/ui/components/Link";
import type { Key } from "@/ui/i18n";
import { useT } from "@/ui/i18n/LocaleProvider";

/** Ficha de uma aldeia, vila ou cidade (RZ-136): estatuto e população atuais, clubes e mudanças de estatuto. */
export function LocalityProfile({ d }: { d: LocalityProfileData }) {
  const { t, locale } = useT();
  const n = new Intl.NumberFormat(locale);
  const status = (e: string) => t(`status.${e}` as Key);
  return (
    <Profile
      type="locality"
      title={d.name}
      subtitle={<>{status(d.status)} · <EntityLink k="city" id={d.city.id}>{d.city.name}</EntityLink> ({d.district})</>}
      numbers={[
        { label: t("locality.population"), value: n.format(d.population) },
        { label: t("locality.status"), value: status(d.status) },
        { label: t("locality.host"), value: d.host ? t("locality.yes") : t("locality.no") },
      ]}
      tabs={{
        summary: (
          <table className="tabela">
            <tbody>
              <tr><th scope="row">{t("locality.municipality")}</th><td><EntityLink k="city" id={d.city.id}>{d.city.name}</EntityLink> ({d.district})</td></tr>
              <tr><th scope="row">{t("locality.since")}</th><td>{d.since}</td></tr>
            </tbody>
          </table>
        ),
        clubs: d.clubs.length > 0 ? (
          <ul className="ligacoes">
            {d.clubs.map((c) => <li key={c.id}><EntityLink k="club" id={c.id}>{c.name}</EntityLink> <span className="suave">· {c.league}</span></li>)}
          </ul>
        ) : (
          <p className="vazio">{t("locality.noClubs")}</p>
        ),
        story: d.history.length > 0 ? (
          <ul>
            {d.history.map((h, i) => (
              <li key={i}>{t("locality.changed", { date: h.date, from: status(h.from), to: status(h.to), population: h.population })}</li>
            ))}
          </ul>
        ) : (
          <p className="vazio">{t("locality.noStory")}</p>
        ),
      }}
    />
  );
}
