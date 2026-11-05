"use client";
import { useEffect, useRef, useState } from "react";
import type { CampaignView } from "@/engine/api/contracts";
import { Chip } from "@/ui/components/Attributes";
import { CloseButton } from "@/ui/components/CloseButton";
import { Data } from "@/ui/components/Card";
import { EntityLink } from "@/ui/components/Link";
import { BarLevel, SERVICE_ARROW } from "@/ui/components/profiles/CityProfile";
import { useEngine } from "@/ui/EngineProvider";
import type { Key } from "@/ui/i18n";
import { useT } from "@/ui/i18n/LocaleProvider";

/**
 * Campanha autárquica (RZ-236B): decisão obrigatória na caixa de entrada. Mostra cada candidato com o que valoriza mais e menos,
 * a relação que o gamer já tem com ele e se é ou foi autarca; o gamer apoia um ou fica neutro.
 */
export function CampaignDialog({ campaign, onClose, onAnswered }: { campaign: CampaignView; onClose: () => void; onAnswered?: () => void }) {
  const { t, locale } = useT();
  const engine = useEngine();
  const ref = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  useEffect(() => { ref.current?.showModal(); }, []);
  const areas = (xs: string[]) => xs.map((a) => t(`council.area.${a}` as Key)).join(", ");
  const date = new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${campaign.date}T00:00:00Z`));
  const send = async (candidate: string) => {
    if (!engine) return;
    setBusy(true);
    setError(undefined);
    try {
      const r = await engine.call("campaignSupport", { candidate });
      if (!r.ok) { setError(t("campaign.error")); return; }
      onAnswered?.();
      ref.current?.close();
    } catch { setError(t("campaign.error")); } finally { setBusy(false); }
  };
  return (
    <dialog ref={ref} className="popup popup-renovacao" aria-labelledby="h-campaign" onClose={onClose} onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}>
      <CloseButton onClose={() => ref.current?.close()} />
      <h2 id="h-campaign">{t("campaign.title", { city: campaign.city.name })}</h2>
      <div className="formulario renovacao-form">
        <p>{t("campaign.intro", { date })}</p>
        <p className="suave">{t("campaign.weight", { level: t(`campaign.weight.${campaign.weight}` as Key) })}</p>
        {campaign.candidates.map((c) => (
          <div key={c.person.id} className="decisao">
            <p>
              <b><EntityLink k="person" id={c.person.id}>{c.person.name}</EntityLink></b>{" "}
              <Chip tone="suave">{t(`campaign.kind.${c.current && c.kind === "incumbent" ? "incumbent" : c.kind}` as Key)}</Chip>
            </p>
            <Data lines={[
              { label: t("campaign.most"), value: areas(c.most) },
              { label: t("campaign.least"), value: areas(c.least) },
              ...(c.kept ? [{ label: t("campaign.kept"), value: t("campaign.keptOf", { kept: c.kept.kept, total: c.kept.total }) }] : []),
              ...(c.relation ? [{ label: t("campaign.relation"), value: <span className="nivel-linha"><BarLevel level={c.relation.level} /><b>{t(`city.level.${c.relation.level}` as Key)}</b><span aria-hidden="true">{SERVICE_ARROW[c.relation.trend]}</span></span> }] : []),
            ]} />
            <p className="acoes"><button type="button" className="primario" disabled={busy} onClick={() => void send(c.person.id)}>{t("campaign.support", { name: c.person.name })}</button></p>
          </div>
        ))}
        {error && <p className="erro" role="alert">{error}</p>}
        <div className="acoes-popup">
          <button type="button" className="secundario" disabled={busy} onClick={() => void send("neutral")}>{t("campaign.neutral")}</button>
        </div>
        <p className="suave">{t("campaign.neutralHint")}</p>
      </div>
    </dialog>
  );
}
