"use client";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Chave } from "@/ui/i18n";
import { useT } from "@/ui/i18n/LocaleProvider";
import { guardar, ler } from "@/ui/armazenamento";
import { useMeuClube } from "@/ui/meuClube";
import { useTempo } from "@/ui/useTempo";

const MODOS = ["dia", "semana", "proximoJogo"] as const;
type ModoAvancar = (typeof MODOS)[number];
const eModo = (v: unknown): v is ModoAvancar => MODOS.includes(v as ModoAvancar);

/** Elementos onde a barra de espaço já tem outro significado: escrever, ativar um botão ou ligação, abrir um menu. */
const ONDE_ESPACO_E_DO_ELEMENTO = "input, textarea, select, button, a, summary, [contenteditable], [role=tab], [role=menuitemradio], [role=switch]";

/**
 * «Avançar» (RZ-166): botão dividido, em baixo à direita em todas as páginas. Por defeito passa um dia; a seta deixa escolher
 * um dia, uma semana ou até ao próximo jogo (fica guardado). A barra de espaço conta como clicar. Quando há jogo do teu clube
 * por preparar, o botão leva ao onze e à tática em vez de avançar: o tempo nunca passa por cima de uma decisão.
 */
export function BotaoAvancar() {
  const { t } = useT();
  const tempo = useTempo();
  const [meu] = useMeuClube();
  const router = useRouter();
  const caminho = usePathname() ?? "/";
  const [modo, setModo] = useState<ModoAvancar>("dia");
  const [aberto, setAberto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);

  useEffect(() => { setModo(ler("raizes.avancar", eModo) ?? "dia"); }, []);
  const escolher = (m: ModoAvancar) => { setModo(m); guardar("raizes.avancar", m); setAberto(false); };
  // sem clube não há «próximo jogo»: avança-se por dias
  const efetivo: ModoAvancar = modo === "proximoJogo" && !meu ? "dia" : modo;

  const semMundo = !tempo.estado;
  const acabou = tempo.estado?.porJogar === 0;
  const desativado = semMundo || tempo.aAvancar || acabou;

  const carregar = () => {
    if (tempo.pausa) {
      if (caminho === "/") document.getElementById("confirmar-jogo")?.focus();
      else router.push("/");
      return;
    }
    if (!desativado) void tempo.avancar(efetivo);
  };
  // a função mais recente fica numa referência para o atalho de teclado não ter de se registar a cada render
  const ultima = useRef(carregar);
  ultima.current = carregar;

  useEffect(() => {
    const aoPremir = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || e.defaultPrevented) return;
      const alvo = e.target instanceof Element ? e.target : null;
      if (alvo?.closest(ONDE_ESPACO_E_DO_ELEMENTO) || caminho.startsWith("/match")) return;
      e.preventDefault();
      ultima.current();
    };
    window.addEventListener("keydown", aoPremir);
    return () => window.removeEventListener("keydown", aoPremir);
  }, [caminho]);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => { if (!raiz.current?.contains(e.target as Node)) setAberto(false); };
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") setAberto(false); };
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", tecla);
    return () => { document.removeEventListener("mousedown", fora); document.removeEventListener("keydown", tecla); };
  }, [aberto]);

  const rotuloModo = (m: ModoAvancar) => t(`avancar.modo.${m}` as Chave);
  const principal = tempo.aAvancar ? t("avancar.aAvancar") : tempo.pausa ? t("avancar.jogoHoje") : t("avancar.rotulo");

  return (
    <div className="avancar" ref={raiz}>
      {tempo.erro && <span className="erro avancar-erro" role="alert">{tempo.erro}</span>}
      <div className="avancar-botao">
        <button type="button" className="primario avancar-principal" onClick={carregar} disabled={tempo.pausa ? false : desativado} title={t("avancar.dica")} data-testid="avancar">
          <span>{principal}</span>
          {!tempo.pausa && !tempo.aAvancar && <span className="avancar-modo">{rotuloModo(efetivo)}</span>}
        </button>
        <button type="button" className="primario avancar-seta" aria-haspopup="menu" aria-expanded={aberto} aria-label={t("avancar.opcoes")} onClick={() => setAberto((a) => !a)} disabled={semMundo} data-testid="avancar-opcoes">
          <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M2 4.5 6 8.5l4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </div>
      {aberto && (
        <div className="avancar-menu" role="menu" aria-label={t("avancar.opcoes")}>
          {MODOS.map((m) => {
            const semJogo = m === "proximoJogo" && !meu;
            return (
              <button key={m} type="button" role="menuitemradio" aria-checked={efetivo === m} disabled={semJogo} title={semJogo ? t("avancar.semClube") : undefined} onClick={() => escolher(m)}>
                <span className="avancar-visto" aria-hidden="true">{efetivo === m ? "✓" : ""}</span>
                {rotuloModo(m)}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
