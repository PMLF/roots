/**
 * «Avançar» (RZ-257) leva o foco para o que falta tratar na página Início: a mensagem por ler mais antiga, uma proposta recebida ou uma
 * negociação em aberto. O pedido guarda-se para sobreviver à navegação para o Início e aplica-se sem fazer scroll se o elemento já se vê.
 */
const KEY = "raizes.foco";
const EVENT = "raizes:foco";

export const requestHomeFocus = (elementId: string): void => {
  try { sessionStorage.setItem(KEY, elementId); } catch { /* sem armazenamento: o evento chega na mesma */ }
  window.dispatchEvent(new Event(EVENT));
};

/** Aplica o pedido pendente; devolve `true` se o elemento existe. O scroll só acontece se o elemento estiver (em parte) fora de vista. */
export const applyHomeFocus = (): boolean => {
  let id: string | null = null;
  try { id = sessionStorage.getItem(KEY); } catch { /* ignora */ }
  if (!id) return false;
  const el = document.getElementById(id);
  if (!el) return false;
  try { sessionStorage.removeItem(KEY); } catch { /* ignora */ }
  document.querySelectorAll(".mensagem-foco").forEach((x) => x.classList.remove("mensagem-foco"));
  el.classList.add("mensagem-foco");
  const target = el.querySelector<HTMLElement>("button.primario") ?? el;
  target.focus({ preventScroll: true });
  el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  return true;
};

export const onHomeFocus = (fn: () => void): (() => void) => {
  window.addEventListener(EVENT, fn);
  return () => window.removeEventListener(EVENT, fn);
};
