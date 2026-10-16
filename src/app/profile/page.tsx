"use client";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import type { FichaClubeDados, CompetitionPage, FichaCidadeDados, FichaLocalidadeDados, FichaPessoaDados } from "@/engine/api/contratos";
import { FichaCidade } from "@/ui/components/fichas/FichaCidade";
import { FichaClube } from "@/ui/components/fichas/FichaClube";
import { FichaCompeticao } from "@/ui/components/fichas/FichaCompeticao";
import { FichaLocalidade } from "@/ui/components/fichas/FichaLocalidade";
import { FichaPessoa } from "@/ui/components/fichas/FichaPessoa";
import { useT } from "@/ui/i18n/LocaleProvider";
import { lerFicha } from "@/ui/ligacoes";
import { useVerTudo } from "@/ui/dev";
import { useMotor } from "@/ui/MotorProvider";

type Estado =
  | { fase: "a-carregar" }
  | { fase: "nao-encontrada" }
  | { fase: "erro"; erro: string }
  | { fase: "clube"; d: FichaClubeDados }
  | { fase: "pessoa"; d: FichaPessoaDados }
  | { fase: "localidade"; d: FichaLocalidadeDados }
  | { fase: "cidade"; d: FichaCidadeDados }
  | { fase: "competicao"; d: CompetitionPage };

function Conteudo() {
  const { t } = useT();
  const motor = useMotor();
  const alvo = lerFicha(useSearchParams());
  const [estado, setEstado] = useState<Estado>({ fase: "a-carregar" });
  const [verTudo] = useVerTudo();
  const k = alvo?.k;
  const id = alvo?.id;

  useEffect(() => {
    if (!motor || !k || !id) return;
    let vivo = true;
    setEstado({ fase: "a-carregar" });
    (async () => {
      try {
        if (k === "clube") {
          const d = await motor.chamar("fichaClube", { id, verTudo });
          if (vivo) setEstado(d ? { fase: "clube", d } : { fase: "nao-encontrada" });
        } else if (k === "pessoa") {
          const d = await motor.chamar("fichaPessoa", { id, verTudo });
          if (vivo) setEstado(d ? { fase: "pessoa", d } : { fase: "nao-encontrada" });
        } else if (k === "localidade") {
          const d = await motor.chamar("fichaLocalidade", { id });
          if (vivo) setEstado(d ? { fase: "localidade", d } : { fase: "nao-encontrada" });
        } else if (k === "cidade") {
          const d = await motor.chamar("fichaCidade", { id });
          if (vivo) setEstado(d ? { fase: "cidade", d } : { fase: "nao-encontrada" });
        } else if (k === "competicao") {
          const d = await motor.chamar("competitionPage", { league: id });
          if (vivo) setEstado(d ? { fase: "competicao", d } : { fase: "nao-encontrada" });
        }
      } catch (e) {
        if (vivo) setEstado({ fase: "erro", erro: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => { vivo = false; };
  }, [motor, k, id, verTudo]);

  if (!alvo) return <p className="erro">{t("ficha.invalida")}</p>;
  switch (estado.fase) {
    case "a-carregar": return <p data-testid="ficha-estado">{t("ficha.aCarregar")}</p>;
    case "nao-encontrada": return <p data-testid="ficha-estado" className="erro">{t("ficha.naoEncontrada")}</p>;
    case "erro": return <p className="erro">{estado.erro}</p>;
    case "clube": return <FichaClube d={estado.d} verTudo={verTudo} />;
    case "pessoa": return <FichaPessoa d={estado.d} verTudo={verTudo} />;
    case "localidade": return <FichaLocalidade d={estado.d} />;
    case "cidade": return <FichaCidade d={estado.d} />;
    case "competicao": return <FichaCompeticao d={estado.d} />;
  }
}

export default function PaginaFicha() {
  return (
    <Suspense fallback={null}>
      <Conteudo />
    </Suspense>
  );
}
