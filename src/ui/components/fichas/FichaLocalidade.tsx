"use client";
import type { LocalityProfileData } from "@/engine/api/contratos";
import { Profile } from "@/ui/components/Ficha";
import { EntityLink } from "@/ui/components/Ligacao";
import type { Key } from "@/ui/i18n";
import { useT } from "@/ui/i18n/LocaleProvider";

/** Ficha de uma aldeia, vila ou cidade (RZ-136): estatuto e população atuais, clubes e mudanças de estatuto. */
export function LocalityProfile({ d }: { d: LocalityProfileData }) {
  const { t, locale } = useT();
  const n = new Intl.NumberFormat(locale);
  const status = (e: string) => t(`estatuto.${e}` as Key);
  return (
    <Profile
      type="locality"
      title={d.name}
      subtitle={<>{status(d.status)} · <EntityLink k="city" id={d.city.id}>{d.city.name}</EntityLink> ({d.district})</>}
      numbers={[
        { label: t("localidade.populacao"), value: n.format(d.population) },
        { label: t("localidade.estatuto"), value: status(d.status) },
        { label: t("localidade.sede"), value: d.host ? t("localidade.sim") : t("localidade.nao") },
      ]}
      tabs={{
        summary: (
          <table className="tabela">
            <tbody>
              <tr><th scope="row">{t("localidade.concelho")}</th><td><EntityLink k="city" id={d.city.id}>{d.city.name}</EntityLink> ({d.district})</td></tr>
              <tr><th scope="row">{t("localidade.desde")}</th><td>{d.since}</td></tr>
            </tbody>
          </table>
        ),
        clubs: d.clubs.length > 0 ? (
          <ul className="ligacoes">
            {d.clubs.map((c) => <li key={c.id}><EntityLink k="club" id={c.id}>{c.name}</EntityLink> <span className="suave">· {c.league}</span></li>)}
          </ul>
        ) : (
          <p className="vazio">{t("localidade.semClubes")}</p>
        ),
        story: d.history.length > 0 ? (
          <ul>
            {d.history.map((h, i) => (
              <li key={i}>{t("localidade.mudou", { date: h.date, de: status(h.de), para: status(h.para), population: h.population })}</li>
            ))}
          </ul>
        ) : (
          <p className="vazio">{t("localidade.semHistoria")}</p>
        ),
      }}
    />
  );
}
