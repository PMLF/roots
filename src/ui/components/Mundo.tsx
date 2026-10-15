"use client";
import { useEffect, useState } from "react";
import { useT } from "@/ui/i18n/LocaleProvider";
import type { MotorCliente } from "@/ui/engineClient";
import type { ClubeResumo, ProgressoMundo, ResumoMundoCriado } from "@/engine/api/contratos";
import type { PessoaVista } from "@/engine/vista/tipos";

type Estado =
  | { fase: "inicial" }
  | { fase: "a-criar"; progresso?: ProgressoMundo }
  | { fase: "pronto"; resumo: ResumoMundoCriado }
  | { fase: "erro"; erro: string };

/** Criação do mundo (RZ-103) com progresso, e plantel público de um clube lido pela Vista. */
export function Mundo({ motor }: { motor: MotorCliente }) {
  const { t } = useT();
  const [seed, setSeed] = useState("raizes");
  const [estado, setEstado] = useState<Estado>({ fase: "inicial" });
  const [clubes, setClubes] = useState<ClubeResumo[]>([]);
  const [clube, setClube] = useState("");
  const [plantel, setPlantel] = useState<PessoaVista[]>([]);

  // Se o save já tem mundo (OPFS), mostra-o logo: "criar" devolve o resumo sem gerar outra vez.
  const criar = async () => {
    setEstado({ fase: "a-criar" });
    try {
      const resumo = await motor.chamar("criarMundo", { seed }, (progresso) => setEstado({ fase: "a-criar", progresso }));
      const lista = await motor.chamar("clubes", null);
      setClubes(lista);
      setClube((c) => c || lista[0]?.id || "");
      setEstado({ fase: "pronto", resumo });
    } catch (e) {
      setEstado({ fase: "erro", erro: e instanceof Error ? e.message : String(e) });
    }
  };

  useEffect(() => {
    if (estado.fase !== "pronto" || !clube) return;
    let vivo = true;
    motor.chamar("plantel", { clube }).then((p) => vivo && setPlantel(p)).catch(() => vivo && setPlantel([]));
    return () => { vivo = false; };
  }, [estado.fase, clube, motor]);

  const p = estado.fase === "a-criar" ? estado.progresso : undefined;
  const textoFase = (fase: string) =>
    ({ clubes: t("mundo.fase.clubes"), cidades: t("mundo.fase.cidades"), outros: t("mundo.fase.outros"), livres: t("mundo.fase.livres"), validar: t("mundo.fase.validar"), guardar: t("mundo.fase.guardar") })[fase] ?? t("mundo.aCriar");
  return (
    <section>
      <h2>{t("mundo.titulo")}</h2>
      <p>
        <label>
          {t("mundo.seed")}{" "}
          <input value={seed} onChange={(e) => setSeed(e.target.value)} disabled={estado.fase === "a-criar"} data-testid="mundo-seed" />
        </label>{" "}
        <button onClick={criar} disabled={estado.fase === "a-criar" || seed.trim() === ""} data-testid="mundo-criar">{t("mundo.criar")}</button>
      </p>
      {estado.fase === "a-criar" && (
        <p data-testid="mundo-progresso">
          {p ? textoFase(p.fase) : t("mundo.aCriar")}{" "}
          <progress max={p?.total ?? 1} value={p?.feito ?? 0} />
        </p>
      )}
      {estado.fase === "erro" && <p className="erro" data-testid="mundo-estado">{t("mundo.erro", { erro: estado.erro })}</p>}
      {estado.fase === "pronto" && (
        <>
          <p data-testid="mundo-estado" data-pessoas={estado.resumo.pessoas}>
            {estado.resumo.jaExistia
              ? t("mundo.jaExistia", { seed: estado.resumo.seed, pessoas: estado.resumo.pessoas, jogadores: estado.resumo.jogadores })
              : t("mundo.criado", { seed: estado.resumo.seed, clubes: estado.resumo.clubes, pessoas: estado.resumo.pessoas, jogadores: estado.resumo.jogadores, segundos: (estado.resumo.ms / 1000).toFixed(1) })}
            {estado.resumo.avisos.length > 0 && <> {t("mundo.avisos", { n: estado.resumo.avisos.length })}</>}
          </p>
          <h3>{t("mundo.plantel")}</h3>
          <p>
            <label>
              {t("mundo.clube")}{" "}
              <select value={clube} onChange={(e) => setClube(e.target.value)} data-testid="mundo-clube">
                {clubes.map((c) => <option key={c.id} value={c.id}>{c.nome} ({c.liga})</option>)}
              </select>
            </label>
          </p>
          <table className="tabela" data-testid="mundo-plantel">
            <thead><tr><th>{t("mundo.colNome")}</th><th>{t("mundo.colIdade")}</th><th>{t("mundo.colPos")}</th><th>{t("mundo.colPais")}</th></tr></thead>
            <tbody>
              {plantel.map((j) => (
                <tr key={j.id}><td>{j.nomeDesportivo}</td><td>{j.idade}</td><td>{j.jogador?.posicao}</td><td>{j.nacionalidade}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
