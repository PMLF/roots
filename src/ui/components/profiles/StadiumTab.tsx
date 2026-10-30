"use client";
import { Card } from "@/ui/components/Card";
import { StadiumPlan } from "@/ui/components/profiles/StadiumPlan";
import type { Key } from "@/ui/i18n";
import { useT } from "@/ui/i18n/LocaleProvider";

/** Quem é o dono do estádio, por extenso. */
export function stadiumOwner(t: ReturnType<typeof useT>["t"], ownership: "club" | "municipal" | "shared", club: string, city: string): string {
  return ownership === "club" ? club : ownership === "municipal" ? t("stadium.owner.council", { city }) : t("stadium.owner.shared", { club, city });
}

/** Separador «Estádio» da ficha do clube: nome, dono, números e a planta fechada (RZ-116). Todos os clubes se veem; só o do gamer permite obras. */
export function StadiumTab({ club, clubName, cityName, name, capacity, ownership }: { club: string; clubName: string; cityName: string; name: string; capacity: number; ownership: "club" | "municipal" | "shared" }) {
  const { t, locale } = useT();
  return (
    <div className="estadio-aba" data-testid="stadium-tab">
      <Card className="estadio-planta">
        <StadiumPlan club={club} header={(d) => (
          <header className="estadio-cabeca">
            <h2>{d.sponsor ? t("stadium.named", { name: d.sponsor.name }) : name}</h2>
            {d.sponsor && <p className="suave">{t("stadium.originalName", { name })}</p>}
            <p className="suave">{t("stadium.owner", { owner: stadiumOwner(t, ownership, clubName, cityName) })}</p>
            <p className="suave">{t("stadium.ownership")}: {t(`ownership.${ownership}` as Key)} · {t("stadium.capacity")}: {new Intl.NumberFormat(locale).format(capacity)} {t("stadium.places")}</p>
          </header>
        )} />
      </Card>
    </div>
  );
}
