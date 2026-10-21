"use client";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Key } from "@/ui/i18n";
import { useT } from "@/ui/i18n/LocaleProvider";
import { save, read } from "@/ui/storage";
import { useOwnClub } from "@/ui/myClub";
import { useEngine } from "@/ui/EngineProvider";
import { useTime } from "@/ui/useTime";
import { requestHomeFocus } from "@/ui/focusHome";

const MODES = ["day", "week", "nextMatch"] as const;
type AdvanceMode = (typeof MODES)[number];
const isMode = (v: unknown): v is AdvanceMode => MODES.includes(v as AdvanceMode);

/** Elementos onde a barra de espaço já tem outro significado: escrever, ativar um botão ou ligação, abrir um menu. */
const WHERE_SPACE_IS_ELEMENT = "input, textarea, select, button, a, summary, [contenteditable], [role=tab], [role=menuitemradio], [role=switch]";

/**
 * «Avançar» (RZ-166): botão dividido, em baixo à direita em todas as páginas. Por defeito passa um dia; a seta deixa escolher
 * um dia, uma semana ou até ao próximo jogo (fica guardado). A barra de espaço conta como clicar. Quando há jogo do teu clube
 * por jogar, o botão leva ao ecrã pré-jogo (ou ao jogo a decorrer) em vez de avançar: o tempo nunca passa por cima de uma decisão.
 */
export function AdvanceButton() {
  const { t } = useT();
  const time = useTime();
  const engine = useEngine();
  const [mine] = useOwnClub();
  const router = useRouter();
  const path = usePathname() ?? "/";
  const [mode, setMode] = useState<AdvanceMode>("day");
  const [isOpen, setIsOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => { setMode(read("raizes.advance", isMode) ?? "day"); }, []);
  const choose = (m: AdvanceMode) => { setMode(m); save("raizes.advance", m); setIsOpen(false); };
  // sem clube não há «próximo jogo»: avança-se por dias
  const effective: AdvanceMode = mode === "nextMatch" && !mine ? "day" : mode;

  const withoutWorld = !time.state;
  const ended = time.state?.byPlay === 0;
  const disabled = withoutWorld || time.advancing || ended;

  // no pré-jogo o botão é o «começar o jogo»; num jogo já acabado só leva ao Início, sem passar tempo
  const inPrematch = path.startsWith("/prematch") && !!time.pause && !time.pause.ongoing;
  const finishedMatch = (path.startsWith("/match") && !time.pause?.ongoing) || path.startsWith("/results");
  const simple = inPrematch || finishedMatch;
  const [starting, setStarting] = useState(false);

  const load = () => {
    if (inPrematch) {
      if (!engine || !time.pause || starting) return;
      const match = time.pause.match;
      setStarting(true);
      void engine.call("startMatch", { match, strict: true }).then(() => {
        window.dispatchEvent(new Event("raizes:tempo"));
        router.push(`/match/?id=${encodeURIComponent(match)}&arrancar=1`);
      }).catch((e: unknown) => { window.dispatchEvent(new CustomEvent("raizes:onze-invalido", { detail: e instanceof Error ? e.message : String(e) })); }).finally(() => setStarting(false));
      return;
    }
    if (finishedMatch) { router.push("/"); return; }
    if (time.pause) {
      router.push(time.pause.ongoing ? "/match/" : "/prematch/");
      return;
    }
    // antes de passar o tempo: ler as mensagens (uma a uma, da mais antiga) e responder a propostas e negociações em aberto
    if (!disabled && !engine) void advanceTime();
    else if (!disabled && engine) {
      void engine.call("attention", null).then(async (a) => {
        if (a.unread !== undefined) {
          await engine.call("markMessage", { id: a.unread, isRead: true });
          window.dispatchEvent(new Event("raizes:caixa"));
          toHome(`msg-${a.unread}`);
        } else if (a.offer) toHome(`oferta-${a.offer.person}`);
        else if (a.bid) toHome(`negoc-${a.bid.person}`);
        else await advanceTime();
      }).catch(() => advanceTime());
    }
  };
  // o foco muda dentro do Início: se já lá estás não há navegação nem scroll desnecessário
  const toHome = (elementId: string) => {
    requestHomeFocus(elementId);
    if (path !== "/") router.push("/");
  };
  const advanceTime = async () => {
    // se o avanço pára num jogo do teu clube, um só clique leva-te ao pré-jogo
    if (!disabled) void time.advance(effective).then((r) => { if (r?.pause) router.push(r.pause.ongoing ? "/match/" : "/prematch/"); });
  };
  // a função mais recente fica numa referência para o atalho de teclado não ter de se registar a cada render
  const last = useRef(load);
  last.current = load;

  useEffect(() => {
    const onPress = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || e.defaultPrevented) return;
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest(WHERE_SPACE_IS_ELEMENT) || (path.startsWith("/match") && !finishedMatch)) return;
      e.preventDefault();
      last.current();
    };
    window.addEventListener("keydown", onPress);
    return () => window.removeEventListener("keydown", onPress);
  }, [path, finishedMatch]);

  useEffect(() => {
    if (!isOpen) return;
    const away = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setIsOpen(false); };
    const hotkey = (e: KeyboardEvent) => { if (e.key === "Escape") setIsOpen(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", hotkey);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", hotkey); };
  }, [isOpen]);

  const modeLabel = (m: AdvanceMode) => t(`advance.mode.${m}` as Key);
  const main = inPrematch ? t("prematch.go") : finishedMatch ? t("results.continue") : time.advancing ? t("advance.advancing") : time.pause ? t(time.pause.ongoing ? "advance.matchInProgress" : "advance.matchToday") : t("advance.label");

  return (
    <div className="avancar" ref={root}>
      {time.error && <span className="erro avancar-erro" role="alert">{time.error}</span>}
      <div className="avancar-botao">
        <button type="button" className={`primario avancar-principal${simple ? " avancar-sozinho" : ""}`} onClick={load} disabled={simple ? starting : time.pause ? false : disabled} title={t("advance.hint")} data-testid="advance" aria-busy={time.advancing || undefined}>
          {time.advancing && <span className="rodar" aria-hidden="true" />}
          <span>{main}</span>
          {!simple && !time.pause && !time.advancing && <span className="avancar-modo">{modeLabel(effective)}</span>}
        </button>
        {!simple && <button type="button" className="primario avancar-seta" aria-haspopup="menu" aria-expanded={isOpen} aria-label={t("advance.options")} onClick={() => setIsOpen((a) => !a)} disabled={withoutWorld} data-testid="avancar-opcoes">
          <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M2 4.5 6 8.5l4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>}
      </div>
      {isOpen && !simple && (
        <div className="avancar-menu" role="menu" aria-label={t("advance.options")}>
          {MODES.map((m) => {
            const withoutMatch = m === "nextMatch" && !mine;
            return (
              <button key={m} type="button" role="menuitemradio" aria-checked={effective === m} disabled={withoutMatch} title={withoutMatch ? t("advance.noClub") : undefined} onClick={() => choose(m)}>
                <span className="avancar-visto" aria-hidden="true">{effective === m ? "✓" : ""}</span>
                {modeLabel(m)}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
