"use client";
import { useEffect, useRef, useState } from "react";
import type { CityCompaniesView, DonationOutcome, PersonalBankView } from "@/engine/api/contracts";
import { useEngine } from "@/ui/EngineProvider";
import { Card, Data } from "@/ui/components/Card";
import { CloseButton } from "@/ui/components/CloseButton";
import { ClubSwatch } from "@/ui/components/ClubSwatch";
import { EntityLink } from "@/ui/components/Link";
import type { Key } from "@/ui/i18n";
import { useT } from "@/ui/i18n/LocaleProvider";

/** Donativo pessoal (RZ-162) num popup, para o cartão não mudar de tamanho; o efeito diz-se em palavras porque depende do tamanho da empresa. */
function Donate({ company, bank, onDone }: { company: CityCompaniesView["list"][number]; bank: PersonalBankView; onDone: (balance: number) => void }) {
  const { t, locale } = useT();
  const engine = useEngine();
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const money = new Intl.NumberFormat(locale, { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  const n = new Intl.NumberFormat(locale);
  const start = () => String(Math.min(Math.max(bank.minDonation, 1000), Math.max(bank.minDonation, Math.floor(bank.balance / 2 / 100) * 100)));
  const [amount, setAmount] = useState(start());
  const [answer, setAnswer] = useState<DonationOutcome | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) ref.current?.showModal(); }, [open]);
  const value = Number(amount);
  const done = answer?.ok === true;
  const send = async () => {
    if (!engine) return;
    setBusy(true);
    try {
      const r = await engine.call("donate", { company: company.id, amount: value });
      setAnswer(r);
      if (r.ok) onDone(r.balance);
    } finally { setBusy(false); }
  };
  return (
    <div className="doar">
      <button type="button" className="primario" disabled={bank.balance < bank.minDonation} onClick={() => { setAnswer(undefined); setAmount(start()); setOpen(true); }} data-testid="doar">{t("donate.open")}</button>
      {open && (
        <dialog ref={ref} className="popup popup-doar" aria-labelledby={`h-doar-${company.id}`} onClose={() => setOpen(false)} onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}>
          <CloseButton onClose={() => ref.current?.close()} />
          <h2 id={`h-doar-${company.id}`} className="empresa-nome"><ClubSwatch colours={company.colours} className="amostra-empresa" />{company.name}</h2>
          <Data
            lines={[
              { label: t("column.sector"), value: t(`company.sector.${company.sector}` as Key) },
              { label: t("column.scale"), value: t(`company.scale.${company.scale}` as Key) },
              { label: t("company.years"), value: t("company.yearsValue", { n: company.years }) },
              { label: t("company.employees"), value: `≈ ${n.format(company.employees)}` },
              { label: t("donate.balance"), value: money.format(bank.balance) },
            ]}
          />
          {done ? (
            <p role="status" data-testid="doar-ok">{t(`donate.effect.${answer.effect}` as Key)}</p>
          ) : (
            <>
              <div className="doar-form">
                <input type="number" inputMode="numeric" min={bank.minDonation} step={100} value={amount} onChange={(e) => setAmount(e.target.value)} aria-label={t("donate.amount")} data-testid="doar-valor" />
                <button type="button" className="primario" disabled={busy || !(value >= bank.minDonation) || value > bank.balance} onClick={() => void send()} data-testid="doar-confirmar">{t("donate.confirm")}</button>
              </div>
              <p className={answer ? "erro" : "suave"} role={answer ? "alert" : undefined}>
                {answer && !answer.ok ? t(`donate.reason.${answer.reason}` as Key, { min: money.format(bank.minDonation) }) : t("donate.hint", { min: money.format(bank.minDonation) })}
              </p>
            </>
          )}
        </dialog>
      )}
    </div>
  );
}

/** Um cartão por empresa do concelho (RZ-240): cores à esquerda do nome, setor, escala, anos no setor, empregados, dono e clubes que patrocina. */
export function CompanyCards({ list, full = true }: { list: CityCompaniesView["list"]; full?: boolean }) {
  const { t, locale } = useT();
  const n = new Intl.NumberFormat(locale);
  const engine = useEngine();
  const [bank, setBank] = useState<PersonalBankView | null>(null);
  useEffect(() => {
    if (!engine) return;
    let live = true;
    void engine.call("personalBank", null).then((b) => { if (live) setBank(b); }).catch(() => undefined);
    return () => { live = false; };
  }, [engine]);
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
          {bank && <Donate company={c} bank={bank} onDone={(balance) => setBank({ ...bank, balance })} />}
        </Card>
      ))}
    </div>
  );
}
