"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Key } from "@/ui/i18n";
import { useT } from "@/ui/i18n/LocaleProvider";
import { WithClub } from "@/ui/components/WithClub";

/** Secções da cidade. Só `/city/` existe; as outras são páginas em branco até às fatias do backlog (RZ-233…238, RZ-314, RZ-315). */
export const CITY_SECTIONS: { id: string; href: string; label: Key; ref: string }[] = [
  { id: "overview", href: "/city/", label: "city.section.overview", ref: "" },
  { id: "services", href: "/city/services/", label: "city.section.services", ref: "RZ-233" },
  { id: "youth", href: "/city/youth/", label: "city.section.youth", ref: "RZ-234" },
  { id: "companies", href: "/city/companies/", label: "city.section.companies", ref: "RZ-235" },
  { id: "council", href: "/city/council/", label: "city.section.council", ref: "RZ-236" },
  { id: "stadium", href: "/city/stadium/", label: "city.section.stadium", ref: "RZ-314, RZ-315" },
];

export function CitySections() {
  const { t } = useT();
  const path = (usePathname() ?? "").replace(/\/?$/, "/");
  return (
    <nav className="seccoes" aria-label={t("city.sections")}>
      {CITY_SECTIONS.map((s) => (
        <Link key={s.id} href={s.href} aria-current={path === s.href ? "page" : undefined} >{t(s.label)}</Link>
      ))}
    </nav>
  );
}

/** Página em branco de uma secção da cidade ainda por implementar. */
export function CitySoon({ id }: { id: string }) {
  const { t } = useT();
  const s = CITY_SECTIONS.find((x) => x.id === id);
  return (
    <WithClub title="">
      {() => (
        <>
          <h1>{t("menu.city")}</h1>
          <CitySections />
          <p className="vazio">{t("city.soon", { section: s ? t(s.label) : "" })}</p>
        </>
      )}
    </WithClub>
  );
}
