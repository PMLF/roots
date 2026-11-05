"use client";
import type { CupView } from "@/engine/api/contracts";
import { Card, Top } from "@/ui/components/Card";
import { Chip } from "@/ui/components/Attributes";
import { CupRounds } from "@/ui/components/competition/CupRounds";
import { History } from "@/ui/components/competition/History";
import { Profile } from "@/ui/components/Profile";
import { useT } from "@/ui/i18n/LocaleProvider";

/** Ficha de uma taça: rondas com resultados e histórico de vencedores. */
export function CupProfile({ d }: { d: CupView }) {
  const { t } = useT();
  const top = <Top title={d.competition} labels={<><Chip tone="destaque">{t("cup.kind")}</Chip><Chip tone="suave">{d.seasonLabel}</Chip></>} />;
  return (
    <Profile
      type="competition"
      title={d.competition}
      top={top}
      tabs={{
        summary: <Card title={t("cup.rounds")}><CupRounds cup={d} /></Card>,
        story: <History competition={d.competition} />,
      }}
    />
  );
}
