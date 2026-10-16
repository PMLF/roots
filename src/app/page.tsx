"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { CompetitionPage, FichaClubeDados, ResumoMundoCriado } from "@/engine/api/contratos";
import type { Noticia } from "@/engine/noticias/noticias";
import { BotaoDemitir, EscolherClubeInicial } from "@/ui/components/ComClube";
import { FitaResultados } from "@/ui/components/FitaResultados";
import { ItemNoticia } from "@/ui/components/ItemNoticia";
import { AmostraClube } from "@/ui/components/AmostraClube";
import { Ligacao } from "@/ui/components/Ligacao";
import { useCaixaRecente } from "@/ui/useCaixa";
import { useModoDev } from "@/ui/dev";
import { useT } from "@/ui/i18n/LocaleProvider";
import { jogosDoClube } from "@/ui/jogosClube";
import { useMeuClube } from "@/ui/meuClube";
import { useMotor } from "@/ui/MotorProvider";
import { useTempo } from "@/ui/useTempo";

const DIA = 86_400_000;
const diasEntre = (de: string, ate: string) => Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / DIA);

/**
 * Página inicial (TOM_E_UX §3.8, RZ-166), por hierarquia: o que vem a seguir em cima, num cartão baixo; por baixo, lado a lado,
 * o que exige decisão, a caixa de entrada e as notícias; no rodapé, a fita com os resultados e os marcadores.
 */
export default function Inicio() {
  const { t, locale } = useT();
  const motor = useMotor();
  const router = useRouter();
  const dev = useModoDev();
  const [mundo, setMundo] = useState<ResumoMundoCriado | null | undefined>(undefined);
  const [meu] = useMeuClube();
  const tempo = useTempo();
  const caixa = useCaixaRecente(5);

  useEffect(() => {
    if (!motor) return;
    let vivo = true;
    motor.chamar("estadoMundo", null).then((m) => vivo && setMundo(m)).catch(() => vivo && setMundo(null));
    return () => { vivo = false; };
  }, [motor]);

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

  const [noticias, setNoticias] = useState<Noticia[]>([]);
  useEffect(() => {
    if (!motor || !mundo) return;
    let vivo = true;
    motor.chamar("noticias", { escopo: meu ? "liga" : "mundo", limite: 5 }).then((l) => vivo && setNoticias(l)).catch(() => undefined);
    return () => { vivo = false; };
  }, [motor, mundo, meu, tempo.estado?.hoje]);

  // o próximo jogo vem do plano (data real do jogo); a jornada, do calendário da liga
  const pj = tempo.proximoJogo;
  const lin = pj && clube ? jogosDoClube(clube.liga, clube.ficha.id).find((j) => j.id === pj.id) : undefined;
  const proximo = pj && clube ? { home: pj.emCasa, opponentName: pj.adversario, date: pj.data, round: lin?.round ?? 0 } : undefined;
  const linha = clube?.liga.table.find((r) => r.club === clube.ficha.id);
  const hoje = tempo.estado?.hoje;
  const dias = proximo && hoje ? diasEntre(hoje, proximo.date) : undefined;
  const quando = dias === undefined ? "" : dias <= 0 ? t("inicio.hoje") : dias === 1 ? t("inicio.amanha") : t("inicio.emDias", { n: dias });
  const dataLonga = (d: string) => new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));
  const fita = (tempo.ultimo?.dias ?? []).flatMap((d) => d.jogos).filter((j) => (clube ? j.competicao === clube.ficha.liga : meu ? j.casa === meu || j.fora === meu : false)).slice(-40);
  const resumo = tempo.ultimo?.resumoEpoca;

  if (mundo === null) {
    return (
      <section className="inicio">
        <h1>{t("hoje.titulo")}</h1>
        <p data-testid="hoje-sem-mundo">{t("hoje.semMundo")} <Link href="/world/">{t("hoje.criarMundo")}</Link></p>
      </section>
    );
  }

  const casaFora = proximo && clube ? (proximo.home ? [clube.ficha.nome, proximo.opponentName] : [proximo.opponentName, clube.ficha.nome]) : [];
  const decisoes = (tempo.pausa ? 1 : 0) + (mundo && !meu ? 1 : 0);

  return (
    <section className="inicio">
      <header className="inicio-cabecalho">
        <h1>{t("hoje.titulo")}</h1>
        {clube && (
          <p className="inicio-clube">
            <Ligacao k="clube" id={clube.ficha.id}>{clube.ficha.nome}</Ligacao>
            <span className="suave"> · <Ligacao k="competicao" id={clube.ficha.liga}>{clube.ficha.liga}</Ligacao></span>
          </p>
        )}
        <span className="espaco" />
        {dev && mundo && <span className="suave" data-testid="hoje-mundo">{t("hoje.mundo", { seed: mundo.seed, pessoas: mundo.pessoas })}</span>}
        {clube && <BotaoDemitir />}
      </header>

      <section className="painel inicio-seguir" aria-labelledby="i-seguir">
        <h2 id="i-seguir">{t("inicio.seguir")}</h2>
        {proximo && clube ? (
          <>
            <div className="inicio-jogo">
              <p className="inicio-confronto">{proximo.home ? <><AmostraClube id={clube.ficha.id} /><Ligacao k="clube" id={clube.ficha.id} semAmostra>{casaFora[0]}</Ligacao></> : <><AmostraClube id={pj?.adversarioId} />{pj?.adversarioId ? <Ligacao k="clube" id={pj.adversarioId} semAmostra>{casaFora[0]}</Ligacao> : casaFora[0]}</>} <span className="suave">{t("inicio.vs")}</span> {proximo.home ? <><AmostraClube id={pj?.adversarioId} />{pj?.adversarioId ? <Ligacao k="clube" id={pj.adversarioId} semAmostra>{casaFora[1]}</Ligacao> : casaFora[1]}</> : <><AmostraClube id={clube.ficha.id} /><Ligacao k="clube" id={clube.ficha.id} semAmostra>{casaFora[1]}</Ligacao></>}</p>
              <p className="suave">{t(proximo.home ? "inicio.emCasa" : "inicio.fora")} · {clube.ficha.liga} {proximo.round > 0 && <>· {t("inicio.jornada", { n: proximo.round })}</>}</p>
            </div>
            <dl className="inicio-factos">
              <div><dt>{t("inicio.quando")}</dt><dd>{quando} <span className="suave">· {dataLonga(proximo.date)}</span></dd></div>
              {linha && <div><dt>{t("inicio.classificacao")}</dt><dd>{t("hoje.posicao", { pos: linha.position, liga: clube.ficha.liga })}</dd></div>}
            </dl>
          </>
        ) : (
          <p className="vazio">{!meu ? t("inicio.semClube") : clube ? t("hoje.seguirVazio") : t("ficha.aCarregar")}</p>
        )}
      </section>

      {resumo && (
        <section className="painel resumo-epoca" aria-label={t("hoje.epocaAcabou", { epoca: resumo.epoca })}>
          <p><b>{t("hoje.epocaAcabou", { epoca: resumo.epoca })}</b></p>
          <p className="suave">{t("hoje.campeoes")}: {resumo.campeoes.map((c, i) => <span key={c.clube}>{i > 0 && " · "}<Ligacao k="clube" id={c.clube} semAmostra>{c.nome}</Ligacao> (<Ligacao k="competicao" id={c.liga}>{c.liga}</Ligacao>)</span>)}</p>
          {meu && resumo.movimentos.filter((m) => m.clube === meu).map((m) => <p key={m.clube}>{t(m.motivo === "descida" ? "hoje.desceste" : "hoje.subiste")}</p>)}
          <p className="suave">{t("hoje.movimentos", { n: resumo.movimentos.length })}</p>
        </section>
      )}

      <div className="inicio-colunas">
        <section className="painel" aria-labelledby="i-decisao">
          <h2 id="i-decisao">{t("hoje.decisao")}{decisoes > 0 && <span className="distintivo" aria-label={t("inicio.pendentes", { n: decisoes })}>{decisoes}</span>}</h2>
          {tempo.pausa && (
            <div className="decisao">
              <p><b>{t(tempo.pausa.emCurso ? "hoje.jogoEmCurso" : "hoje.jogoHoje", { jogo: `${tempo.pausa.emCasa ? "" : "@ "}${tempo.pausa.adversario}` })}</b></p>
              <p className="acoes">
                <button id="confirmar-jogo" type="button" className="primario" disabled={tempo.aAvancar} onClick={() => router.push(tempo.pausa?.emCurso ? "/match/" : "/prematch/")}>{t(tempo.pausa.emCurso ? "hoje.continuarJogo" : "hoje.confirmarJogar")}</button>
                <Link href="/tactics/">{t("hoje.verTatica")}</Link>
              </p>
            </div>
          )}
          {mundo && !meu && <EscolherClubeInicial />}
          {decisoes === 0 && <p className="vazio">{t("hoje.decisaoVazio")}</p>}
        </section>

        <section className="painel" aria-labelledby="i-caixa">
          <h2 id="i-caixa">{t("menu.caixa")}{caixa.naoLidas > 0 && <span className="distintivo" aria-label={t("caixa.naoLidas", { n: caixa.naoLidas })}>{caixa.naoLidas > 99 ? "99+" : caixa.naoLidas}</span>}</h2>
          {caixa.mensagens.length === 0 ? <p className="vazio">{t("caixa.vazio")}</p> : (
            <ul className="lista-compacta">
              {caixa.mensagens.map((m) => <li key={m.id}><ItemNoticia n={m} naoLida={!m.lida} compacto aoAlternarLida={() => { void motor?.chamar("marcarMensagem", { id: m.id, lida: !m.lida }).then(() => window.dispatchEvent(new Event("raizes:caixa"))); }} /></li>)}
            </ul>
          )}
          <p className="painel-rodape"><Link href="/inbox/">{t("inicio.verCaixa")}</Link>{caixa.naoLidas > 0 && <button type="button" className="ligacao-botao" onClick={() => { void motor?.chamar("marcarCaixaLida", null).then(() => window.dispatchEvent(new Event("raizes:caixa"))); }}>{t("caixa.marcarLidas")}</button>}</p>
        </section>

        <section className="painel" aria-labelledby="i-noticias">
          <h2 id="i-noticias">{t("menu.noticias")}</h2>
          {noticias.length === 0 ? <p className="vazio">{t("noticias.vazio")}</p> : (
            <ul className="lista-compacta">
              {noticias.map((n) => <li key={n.id}><ItemNoticia n={n} compacto /></li>)}
            </ul>
          )}
          <p className="painel-rodape"><Link href="/news/">{t("noticias.verTodas")}</Link></p>
        </section>
      </div>

      <FitaResultados jogos={fita} />
    </section>
  );
}
