"use client";
import { useState } from "react";
import type { FinancasClube } from "@/engine/api/contratos";
import { useMotor } from "@/ui/MotorProvider";
import { Dados } from "@/ui/components/Cartao";
import { useT } from "@/ui/i18n/LocaleProvider";

type Orc = NonNullable<FinancasClube["orcamento"]>;

/** O orçamento anual do teu clube: massa salarial máxima e verba para transferências, editáveis. */
export function OrcamentoClube({ inicial, saldo }: { inicial: Orc; saldo: number }) {
  const { t, locale } = useT();
  const motor = useMotor();
  const eur = new Intl.NumberFormat(locale, { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  const [orc, setOrc] = useState(inicial);
  const [massa, setMassa] = useState(String(inicial.massaSalarialMax));
  const [transf, setTransf] = useState(String(inicial.transferencias));
  const [erro, setErro] = useState<string>();
  const [aGuardar, setAGuardar] = useState(false);
  const guardar = async () => {
    setAGuardar(true);
    try {
      if (!motor) return;
      const f = await motor.chamar("definirOrcamento", { massaSalarialMax: Number(massa), transferencias: Number(transf) });
      if (f.orcamento) { setOrc(f.orcamento); setMassa(String(f.orcamento.massaSalarialMax)); setTransf(String(f.orcamento.transferencias)); }
      setErro(undefined);
    } catch (e) { setErro(e instanceof Error ? e.message : String(e)); } finally { setAGuardar(false); }
  };
  return (
    <div className="orcamento-clube">
      <Dados linhas={[
        { rotulo: t("financas.massaAtual"), valor: <span className={orc.acima ? "erro" : undefined}>{eur.format(orc.massaAtual)} {orc.acima ? `· ${t("financas.acimaOrcamento")}` : ""}</span> },
      ]} />
      <form className="formulario" onSubmit={(e) => { e.preventDefault(); void guardar(); }}>
        <label>{t("financas.massaMax")}{" "}
          <input type="number" min={0} step={1000} value={massa} onChange={(e) => setMassa(e.target.value)} />
        </label>
        <label>{t("financas.verbaTransferencias")}{" "}
          <input type="number" min={0} max={Math.max(0, Math.floor(saldo))} step={1000} value={transf} onChange={(e) => setTransf(e.target.value)} />
        </label>
        <button type="submit" disabled={aGuardar}>{t("financas.guardarOrcamento")}</button>
      </form>
      {erro && <p className="erro" role="alert">{erro}</p>}
    </div>
  );
}
