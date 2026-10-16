"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import type { JogoVivo } from "@/engine/epoca/jogoAoVivo";
import type { Tatica } from "@/engine/jogo/tipos";
import { Ligacao } from "@/ui/components/Ligacao";
import { AmostraClube } from "@/ui/components/AmostraClube";
import { CartaoEquipa, Confrontos, Estatisticas, Eventos, GraficoXg, InfoDoJogo, OutrosJogos, TabelaViva, TaticaNoJogo } from "@/ui/components/jogo/PainelJogo";
import { guardar, ler } from "@/ui/armazenamento";
import { useModoDev } from "@/ui/dev";
import type { Chave } from "@/ui/i18n";
import { useT } from "@/ui/i18n/LocaleProvider";
import { useMeuClube } from "@/ui/meuClube";
import { useMotor } from "@/ui/MotorProvider";

/** Segundos de relógio por minuto de jogo em cada velocidade. */
const VELOCIDADES = [{ rotulo: "1×", seg: 0.5 }, { rotulo: "2×", seg: 0.25 }, { rotulo: "4×", seg: 0.1 }] as const;
const SEPARADORES = ["jogo", "estatisticas", "info"] as const;
type Separador = (typeof SEPARADORES)[number];
const eSeparador = (v: unknown): v is Separador => SEPARADORES.includes(v as Separador);
const eVelocidade = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) < VELOCIDADES.length;

function Conteudo() {
  const { t } = useT();
  const motor = useMotor();
  const dev = useModoDev();
  const [meu] = useMeuClube();
  const params = useSearchParams();
  const id = params.get("id") ?? undefined;
  const arrancar = params.get("arrancar") === "1";
  const [jogo, setJogo] = useState<JogoVivo | null | undefined>(undefined);
  const [aCorrer, setACorrer] = useState(false);
  const [vel, setVel] = useState(0);
  const [separador, setSeparador] = useState<Separador>("jogo");
  const [soImportante, setSoImportante] = useState(false);
  const [taticaAberta, setTaticaAberta] = useState(false);
  const [aMudar, setAMudar] = useState(false);
  const [erro, setErro] = useState<string | undefined>(undefined);
  const corriaAntes = useRef(false);

  useEffect(() => { setSeparador(ler("raizes.separadorJogo", eSeparador) ?? "jogo"); }, []);
  useEffect(() => { setVel(ler("raizes.velocidadeJogo", eVelocidade) ?? 0); }, []);
  useEffect(() => {
    if (!motor) return;
    let vivo = true;
    motor.chamar("jogoAoVivo", id ? { id } : {}).then((j) => { if (vivo) { setJogo(j); setACorrer(!!j?.emCurso && arrancar); } }).catch(() => vivo && setJogo(null));
    return () => { vivo = false; };
  }, [motor, id, arrancar]);

  const terminou = useCallback(() => {
    for (const e of ["raizes:tempo", "raizes:caixa", "raizes:meuClube"]) window.dispatchEvent(new Event(e));
  }, []);

  const passo = useCallback(async (minutos: number) => {
    if (!motor) return;
    try {
      const j = await motor.chamar("passoJogo", { minutos });
      setJogo(j);
      if (!j.emCurso) { setACorrer(false); terminou(); }
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
      setACorrer(false);
    }
  }, [motor, terminou]);

  // o relógio: cada tique pede ao motor mais um minuto, com a tática em vigor nesse momento
  const emCurso = !!jogo?.emCurso;
  useEffect(() => {
    if (!jogo || !emCurso || !aCorrer) return;
    const timer = window.setTimeout(() => { void passo(1); }, (VELOCIDADES[vel] as { seg: number }).seg * 1000);
    return () => window.clearTimeout(timer);
  }, [jogo, emCurso, aCorrer, vel, passo]);

  // espaço: pausa e continua (a barra global não avança o tempo nesta página)
  useEffect(() => {
    if (!emCurso) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target instanceof Element && e.target.closest("input, textarea, select, button, a, [contenteditable]")) return;
      e.preventDefault();
      setACorrer((v) => !v);
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [emCurso]);

  const abrirTatica = () => {
    corriaAntes.current = aCorrer;
    setACorrer(false);
    setTaticaAberta(true);
  };
  const fecharTatica = useCallback(() => {
    setTaticaAberta((aberta) => { if (aberta) setACorrer(corriaAntes.current); return false; });
  }, []);
  const mudarTatica = async (tatica: Tatica) => {
    if (!motor) return;
    setAMudar(true);
    try { setJogo(await motor.chamar("taticaNoJogo", { tatica })); setErro(undefined); } catch (e) { setErro(e instanceof Error ? e.message : String(e)); } finally { setAMudar(false); }
  };

  if (jogo === undefined) return <p>{t("ficha.aCarregar")}</p>;
  if (jogo === null) return <p className="vazio">{t("jogo.semJogo")} <Link href="/">{t("jogo.voltar")}</Link></p>;
  const minuto = jogo.minuto ?? jogo.duracao;
  const ultima = jogo.linhas.filter((l) => l.minuto <= minuto).at(-1);
  const gc = ultima?.golosCasa ?? 0;
  const gf = ultima?.golosFora ?? 0;
  return (
    <section className="pagina-jogo">
      <p className="suave"><Ligacao k="competicao" id={jogo.competicao}>{jogo.competicao}</Ligacao> · {t("jogo.jornada", { n: jogo.jornada })} · {jogo.data}</p>
      <div className="placar" aria-live="polite">
        <span className="placar-equipa placar-casa"><AmostraClube cores={jogo.cores?.[jogo.casa.id]} /><Ligacao k="clube" id={jogo.casa.id} semAmostra>{jogo.casa.nome}</Ligacao></span>
        <b className="placar-golos">{gc}–{gf}</b>
        <span className="placar-equipa placar-fora"><Ligacao k="clube" id={jogo.fora.id} semAmostra>{jogo.fora.nome}</Ligacao><AmostraClube cores={jogo.cores?.[jogo.fora.id]} /></span>
      </div>
      <p className="relogio">{emCurso ? `${Math.floor(minuto)}'` : t("jogo.terminado")}</p>
      {emCurso ? (
        <div className="acoes controlos-jogo">
          <button type="button" className="primario" onClick={() => setACorrer((v) => !v)} disabled={taticaAberta}>
            {aCorrer ? t("jogo.pausa") : minuto === 0 ? t("jogo.comecar") : t("jogo.continuar")}
          </button>
          <label className="velocidade">
            <span className="so-leitor">{t("jogo.velocidade")}</span>
            <select value={vel} aria-label={t("jogo.velocidade")} onChange={(e) => { const v = Number(e.target.value); setVel(v); guardar("raizes.velocidadeJogo", v); }}>
              {VELOCIDADES.map((v, i) => <option key={v.rotulo} value={i}>{v.rotulo}</option>)}
            </select>
          </label>
          <button type="button" onClick={abrirTatica}>{t("jogo.taticaBotao")}</button>
          <label><input type="checkbox" checked={soImportante} onChange={(e) => setSoImportante(e.target.checked)} /> {t("jogo.soImportante")}</label>
          {dev && <button type="button" className="dev" onClick={() => { setACorrer(false); void passo(500); }}>{t("jogo.saltar")}</button>}
        </div>
      ) : null}
      {erro && <p className="erro" role="alert">{erro}</p>}
      {taticaAberta && emCurso && jogo.tatica && <TaticaNoJogo tatica={jogo.tatica} aoMudar={(x) => void mudarTatica(x)} aoFechar={fecharTatica} ocupado={aMudar} />}
      <div className="separadores" role="tablist" aria-label={t("jogo.separadores")}>
        {SEPARADORES.map((x) => (
          <button key={x} type="button" role="tab" id={`sep-${x}`} aria-selected={separador === x} aria-controls={`pn-${x}`} onClick={() => { setSeparador(x); guardar("raizes.separadorJogo", x); }}>{t(`jogo.tab.${x}` as Chave)}</button>
        ))}
      </div>
      <div role="tabpanel" id={`pn-${separador}`} aria-labelledby={`sep-${separador}`}>
        {separador === "jogo" && (
          <div className="jogo-grelha">
            <div className="jogo-coluna">
              <section className="painel" aria-label={t("jogo.eventos")}>
                <h2>{t("jogo.eventos")}</h2>
                <Eventos jogo={jogo} soImportante={soImportante} />
              </section>
            </div>
            <div className="jogo-coluna"><CartaoEquipa jogo={jogo} lado="casa" /><CartaoEquipa jogo={jogo} lado="fora" /></div>
            <div className="jogo-coluna"><OutrosJogos jogo={jogo} meu={meu ?? undefined} /><TabelaViva jogo={jogo} meu={meu ?? undefined} /></div>
          </div>
        )}
        {separador === "estatisticas" && (
          <div className="jogo-grelha">
            <div className="jogo-coluna"><Estatisticas jogo={jogo} /></div>
            <div className="jogo-coluna"><GraficoXg jogo={jogo} /></div>
            <div className="jogo-coluna"><Confrontos jogo={jogo} /></div>
          </div>
        )}
        {separador === "info" && <div className="jogo-grelha"><div className="jogo-coluna"><InfoDoJogo jogo={jogo} /></div></div>}
      </div>
    </section>
  );
}

/** Jogo (RZ-130/170): ao vivo, minuto a minuto, enquanto decorre; depois de jogado, só o resultado e os eventos. */
export default function PaginaJogo() {
  return <Suspense fallback={null}><Conteudo /></Suspense>;
}
