"use client";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import type { FichaClubeDados, FichaLocalidadeDados, FichaPessoaDados } from "@/engine/api/contratos";
import { FichaClube } from "@/ui/components/fichas/FichaClube";
import { FichaLocalidade } from "@/ui/components/fichas/FichaLocalidade";
import { FichaPessoa } from "@/ui/components/fichas/FichaPessoa";
import { Ficha } from "@/ui/components/Ficha";
import { useT } from "@/ui/i18n/LocaleProvider";
import { lerFicha } from "@/ui/ligacoes";
import { useMotor } from "@/ui/MotorProvider";

type Estado =
  | { fase: "a-carregar" }
  | { fase: "nao-encontrada" }
  | { fase: "em-breve" }
  | { fase: "erro"; erro: string }
  | { fase: "clube"; d: FichaClubeDados }
  | { fase: "pessoa"; d: FichaPessoaDados }
  | { fase: "localidade"; d: FichaLocalidadeDados };

function Conteudo() {
  const { t } = useT();
  const motor = useMotor();
  const alvo = lerFicha(useSearchParams());
  const [estado, setEstado] = useState<Estado>({ fase: "a-carregar" });
  const k = alvo?.k;
  const id = alvo?.id;

  useEffect(() => {
    if (!motor || !k || !id) return;
    let vivo = true;
    setEstado({ fase: "a-carregar" });
    (async () => {
      try {
        if (k === "clube") {
          const d = await motor.chamar("fichaClube", { id });
          if (vivo) setEstado(d ? { fase: "clube", d } : { fase: "nao-encontrada" });
        } else if (k === "pessoa") {
          const d = await motor.chamar("fichaPessoa", { id });
          if (vivo) setEstado(d ? { fase: "pessoa", d } : { fase: "nao-encontrada" });
        } else if (k === "localidade") {
          const d = await motor.chamar("fichaLocalidade", { id });
          if (vivo) setEstado(d ? { fase: "localidade", d } : { fase: "nao-encontrada" });
        } else if (vivo) setEstado({ fase: "em-breve" }); // cidade (RZ-133) e competição (RZ-110): ainda sem ficha
      } catch (e) {
        if (vivo) setEstado({ fase: "erro", erro: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => { vivo = false; };
  }, [motor, k, id]);

  if (!alvo) return <p className="erro">{t("ficha.invalida")}</p>;
  switch (estado.fase) {
    case "a-carregar": return <p data-testid="ficha-estado">{t("ficha.aCarregar")}</p>;
    case "nao-encontrada": return <p data-testid="ficha-estado" className="erro">{t("ficha.naoEncontrada")}</p>;
    case "erro": return <p className="erro">{estado.erro}</p>;
    case "em-breve": return <Ficha tipo={alvo.k} titulo={alvo.id} numeros={[]} separadores={{ resumo: <p className="vazio">{t("ficha.embreve")}</p> }} />;
    case "clube": return <FichaClube d={estado.d} />;
    case "pessoa": return <FichaPessoa d={estado.d} />;
    case "localidade": return <FichaLocalidade d={estado.d} />;
  }
}

export default function PaginaFicha() {
  return (
    <Suspense fallback={null}>
      <Conteudo />
    </Suspense>
  );
}
