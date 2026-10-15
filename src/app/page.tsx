"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { CompetitionPage, FichaClubeDados, ResumoMundoCriado } from "@/engine/api/contratos";
import { jogosDoClube } from "@/ui/jogosClube";
import { Ligacao } from "@/ui/components/Ligacao";
import { useMeuClube } from "@/ui/meuClube";
import { EscolherClubeInicial } from "@/ui/components/ComClube";
import { useTempo } from "@/ui/useTempo";
import { useT } from "@/ui/i18n/LocaleProvider";
import { useMotor } from "@/ui/MotorProvider";

/** Página «Hoje» (TOM_E_UX §3.8): o que mudou, o que exige decisão, o que vem a seguir. */
export default function Hoje() {
  const { t } = useT();
  const motor = useMotor();
  const [mundo, setMundo] = useState<ResumoMundoCriado | null | undefined>(undefined);

  useEffect(() => {
    if (!motor) return;
    let vivo = true;
    motor.chamar("estadoMundo", null).then((m) => vivo && setMundo(m)).catch(() => vivo && setMundo(null));
    return () => { vivo = false; };
  }, [motor]);

  const [meu] = useMeuClube();
  const tempo = useTempo();
  const [clube, setClube] = useState<{ ficha: FichaClubeDados; liga: CompetitionPage } | undefined>(undefined);
  useEffect(() => {
    if (!motor || !meu || !mundo) { setClube(undefined); return; }
    let vivo = true;
    (async () => {
      const ficha = await motor.chamar("fichaClube", { id: meu });
      const liga = ficha ? await motor.chamar("competitionPage", { league: ficha.liga }) : null;
      if (vivo) setClube(ficha && liga ? { ficha, liga } : undefined);
    })().catch(() => vivo && setClube(undefined));
    return () => { vivo = false; };
  }, [motor, meu, mundo, tempo.estado?.hoje]);
  const resultados = (tempo.ultimo?.dias ?? []).flatMap((d) => d.jogos).filter((j) => (meu ? j.casa === meu || j.fora === meu : false) || (clube ? j.competicao === clube.ficha.liga : false)).slice(-12);
  const proximo = clube ? jogosDoClube(clube.liga, clube.ficha.id).find((j) => !j.bye && j.result === "") : undefined;
  const posicao = clube?.liga.table.find((r) => r.club === clube.ficha.id)?.position;

  return (
    <section>
      <h1>{t("hoje.titulo")}</h1>
      {mundo && (
        <p>
          {clube ? (
            <>
              <b>{t("hoje.oTeuClube")}:</b> <Ligacao k="clube" id={clube.ficha.id}>{clube.ficha.nome}</Ligacao>
              {posicao !== undefined && <span className="suave"> · {t("hoje.posicao", { pos: posicao, liga: clube.ficha.liga })}</span>}
              {proximo && <span className="suave"> · {t("hoje.proximo", { jogo: `${proximo.home ? "" : "@ "}${proximo.opponentName}` })}</span>}
            </>
          ) : (
            <EscolherClubeInicial />
          )}
        </p>
      )}
      {mundo === null && (
        <p data-testid="hoje-sem-mundo">
          {t("hoje.semMundo")} <Link href="/world/">{t("hoje.criarMundo")}</Link>
        </p>
      )}
      {mundo && <p className="suave" data-testid="hoje-mundo">{t("hoje.mundo", { seed: mundo.seed, pessoas: mundo.pessoas })}</p>}
      <div className="hoje-grelha">
        <section className="painel" aria-labelledby="h-mudou">
          <h2 id="h-mudou">{t("hoje.mudou")}</h2>
          {resultados.length === 0 ? <p className="vazio">{t("hoje.mudouVazio")}</p> : (
            <ul className="ligacoes">
              {resultados.map((j) => (
                <li key={j.id}>
                  <b>{j.casaNome} {j.golosCasa}–{j.golosFora} {j.foraNome}</b>
                  <span className="suave"> · {[...j.golos.map((g) => `${g.nome} ${g.minuto}'`), ...j.cartoes.map((c) => `${c.cor === "vermelho" ? "🟥" : "🟨"} ${c.nome}`), ...j.lesoes.map((l) => `✚ ${l.nome}`)].join(" · ")}</span>
                  {j.homemDoJogo && <span className="suave"> · {t("hoje.homemDoJogo", { nome: j.homemDoJogo.nome, nota: j.homemDoJogo.nota.toFixed(1) })}</span>}
                </li>
              ))}
            </ul>
          )}
          {tempo.ultimo && <p className="suave">{t("hoje.resumoAvanco", { jogos: tempo.ultimo.dias.reduce((s, d) => s + d.jogos.length, 0), lesoes: tempo.ultimo.dias.reduce((s, d) => s + d.jogos.reduce((x, j) => x + j.lesoes.length, 0), 0), cartoes: tempo.ultimo.dias.reduce((s, d) => s + d.jogos.reduce((x, j) => x + j.cartoes.length, 0), 0) })}</p>}
        </section>
        <section className="painel" aria-labelledby="h-decisao">
          <h2 id="h-decisao">{t("hoje.decisao")}</h2>
          <p className="vazio">{t("hoje.decisaoVazio")}</p>
        </section>
        <section className="painel" aria-labelledby="h-seguir">
          <h2 id="h-seguir">{t("hoje.seguir")}</h2>
          {proximo ? <p>{t("hoje.proximo", { jogo: `${proximo.home ? "" : "@ "}${proximo.opponentName}` })} <span className="suave">· {proximo.date}</span></p> : <p className="vazio">{t("hoje.seguirVazio")}</p>}
          {tempo.estado?.porJogar === 0 && <p className="suave">{t("hoje.fimDeEpoca")}</p>}
          <p className="acoes">
            <button type="button" className="primario" disabled={!mundo || tempo.aAvancar || tempo.estado?.porJogar === 0} onClick={() => void tempo.avancar(meu ? "proximoJogo" : "semana")}>{tempo.aAvancar ? t("hoje.aAvancar") : meu ? t("hoje.avancarJogo") : t("hoje.avancarSemana")}</button>
            <button type="button" disabled={!mundo || tempo.aAvancar || tempo.estado?.porJogar === 0} onClick={() => void tempo.avancar("dia")}>{t("hoje.avancarDia")}</button>
            <button type="button" disabled={!mundo || tempo.aAvancar || tempo.estado?.porJogar === 0} onClick={() => void tempo.avancar("semana")}>{t("hoje.avancarSemana")}</button>
          </p>
          {tempo.erro && <p className="erro">{tempo.erro}</p>}
        </section>
      </div>
    </section>
  );
}
