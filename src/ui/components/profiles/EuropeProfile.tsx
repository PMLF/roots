"use client";
import type { CupView, EuropeView } from "@/engine/api/contracts";
import { Card, Top } from "@/ui/components/Card";
import { Chip } from "@/ui/components/Attributes";
import { CupRounds } from "@/ui/components/competition/CupRounds";
import { History } from "@/ui/components/competition/History";
import { EuropeTable } from "@/ui/components/competition/EuropeTable";
import { Profile } from "@/ui/components/Profile";
import { useT } from "@/ui/i18n/LocaleProvider";

/** Ficha de uma competição europeia: fase de liga (tabela com zonas), eliminatórias e histórico de vencedores. */
export function EuropeProfile({ d }: { d: EuropeView }) {
  const { t } = useT();
  const top = <Top title={d.competition} labels={<><Chip tone="destaque">{t("europe.kind")}</Chip><Chip tone="suave">{d.seasonLabel}</Chip></>} />;
  return (
    <Profile
      type="competition"
      title={d.competition}
      top={top}
      tabs={{
        summary: (
          <>
            <Card title={t("europe.leaguePhase")}>
              <p className="suave cartao-sub">{t("europe.matchdays", { played: d.matchdays.played, total: d.matchdays.total })}</p>
              <EuropeTable view={d} />
            </Card>
            <Card title={t("europe.knockout")}><CupRounds cup={d as CupView} /></Card>
          </>
        ),
        story: <History competition={d.competition} />,
      }}
    />
  );
}
