"use client";
import { useEffect, useState } from "react";
import type { CityCompaniesView, DonationOutcome, PersonalBankView } from "@/engine/api/contracts";
import { useEngine } from "@/ui/EngineProvider";
import { Card, Data } from "@/ui/components/Card";
import { ClubSwatch } from "@/ui/components/ClubSwatch";
import { EntityLink } from "@/ui/components/Link";
import type { Key } from "@/ui/i18n";
import { useT } from "@/ui/i18n/LocaleProvider";

/** Donativo pessoal (RZ-162): sai da conta do gamer; o efeito diz-se em palavras porque depende do tamanho da empresa. */
function Donate({ company, bank, onDone }: { company: string; bank: PersonalBankView; onDone: (balance: number) => void }) {
  const { t, locale } = useT();
  const engine = useEngine();
  const money = new Intl.NumberFormat(locale, { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(Math.min(Math.max(bank.minDonation, 1000), Math.max(bank.minDonation, Math.floor(bank.balance / 2 / 100) * 100)));
  const [answer, setAnswer] = useState<DonationOutcome | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const send = async () => {
    if (!engine) return;
    setBusy(true);
    try {
      const r = await engine.call("donate", { company, amount });
      setAnswer(r);
      if (r.ok) { onDone(r.balance); setOpen(false); }
    } finally { setBusy(false); }
  };
  return (
    <div className="doar">
      {answer?.ok && <p className="suave" role="status" data-testid="doar-ok">{t(`donate.effect.${answer.effect}` as Key)}</p>}
      {answer && !answer.ok && <p className="erro" role="alert">{t(`donate.reason.${answer.reason}` as Key, { min: money.format(bank.minDonation) })}</p>}
      {open ? (
        <div className="doar-form">
          <input type="number" min={bank.minDonation} step={100} value={amount} onChange={(e) => setAmount(Number(e.target.value))} aria-label={t("donate.amount")} data-testid="doar-valor" />
          <button type="button" className="primario" disabled={busy || amount < bank.minDonation || amount > bank.balance} onClick={() => void send()} data-testid="doar-confirmar">{t("donate.confirm")}</button>
          <button type="button" onClick={() => setOpen(false)}>{t("donate.cancel")}</button>
        </div>
      ) : (
        <button type="button" disabled={bank.balance < bank.minDonation} onClick={() => { setAnswer(undefined); setOpen(true); }} data-testid="doar">{t("donate.open")}</button>
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
          {bank && <Donate company={c.id} bank={bank} onDone={(balance) => setBank({ ...bank, balance })} />}
        </Card>
      ))}
    </div>
  );
}
