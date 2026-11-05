/**
 * Imagem que o rato arrasta ao mover um jogador (RZ-249): um cartão pequeno com a posição, as cores do clube e o nome,
 * em vez da linha da tabela ou da ligação. O elemento fica fora do ecrã só o tempo de o browser o fotografar.
 */
export function setPlayerDragImage(e: { dataTransfer: DataTransfer }, card: { name: string; position: string; background: string }): void {
  const el = document.createElement("div");
  el.className = "arrasto-cartao";
  const top = document.createElement("span");
  top.className = "arrasto-cartao-cores";
  top.style.background = card.background;
  top.textContent = card.position;
  const name = document.createElement("span");
  name.className = "arrasto-cartao-nome";
  name.textContent = card.name;
  el.append(top, name);
  document.body.appendChild(el);
  e.dataTransfer.setDragImage(el, el.offsetWidth / 2, el.offsetHeight / 2);
  window.setTimeout(() => el.remove(), 0);
}

/** Começa a arrastar um jogador: só leva o seu id (sem a ligação que o browser juntaria) e mostra o cartão. */
export function startPlayerDrag(e: { dataTransfer: DataTransfer }, player: string, card: Parameters<typeof setPlayerDragImage>[1]): void {
  e.dataTransfer.clearData();
  e.dataTransfer.setData("text/plain", player);
  e.dataTransfer.effectAllowed = "move";
  setPlayerDragImage(e, card);
}
