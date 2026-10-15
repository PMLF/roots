/**
 * O que é notícia num jogo (RZ-109; docs/HISTORICO_EVENTOS.md §4): hat-tricks, vermelhos, goleadas, reviravoltas e golos
 * nos descontos. Sai do relatório do jogo, por isso aparece com o mesmo critério em todos os níveis de detalhe.
 * As lesões têm os seus próprios eventos (`registoDoJogo`).
 */
import type { Parametros } from "../config/parametros";
import type { EventoNovo } from "../persistencia/tipos";
import type { MetaJogo } from "./registo";
import type { RelatorioPublico } from "./detalhe";
import type { Lado } from "./tipos";

export type ClubesDoJogo = { casa: string; fora: string };

export function historiasDoJogo(meta: MetaJogo, clubes: ClubesDoJogo, rel: Pick<RelatorioPublico, "duracao" | "golosCasa" | "golosFora" | "golos" | "cartoes">, params: Parametros): EventoNovo[] {
  const h = params.historias;
  const base = { data: meta.data, epoca: meta.epoca, jornada: meta.jornada, vis: "publico" as const, origem: "jogo" as const };
  const out: EventoNovo[] = [];
  const clube = (l: Lado) => clubes[l];

  // hat-tricks
  const porMarcador = new Map<string, { lado: Lado; golos: number; minutos: number[] }>();
  for (const g of rel.golos) {
    const m = porMarcador.get(g.jogador) ?? { lado: g.lado, golos: 0, minutos: [] };
    m.golos++;
    m.minutos.push(g.minuto);
    porMarcador.set(g.jogador, m);
  }
  for (const [jogador, m] of porMarcador)
    if (m.golos >= h.hattrick)
      out.push({ ...base, tipo: "HATTRICK", entidades: [{ k: "pessoa", id: jogador, papel: "marcador" }, { k: "clube", id: clube(m.lado) }, { k: "jogo", id: meta.id }], dados: { golos: m.golos, minutos: m.minutos } });

  // vermelhos
  for (const c of rel.cartoes)
    if (c.cor === "vermelho")
      out.push({ ...base, tipo: "CARTAO_VERMELHO", entidades: [{ k: "pessoa", id: c.jogador, papel: "expulso" }, { k: "clube", id: clube(c.lado) }, { k: "jogo", id: meta.id }], dados: { minuto: c.minuto, segundoAmarelo: !!c.segundoAmarelo } });

  const dif = rel.golosCasa - rel.golosFora;
  const vencedor: Lado | undefined = dif > 0 ? "casa" : dif < 0 ? "fora" : undefined;

  // goleada
  if (Math.abs(dif) >= h.goleada && vencedor) {
    const perdedor: Lado = vencedor === "casa" ? "fora" : "casa";
    out.push({ ...base, tipo: "GOLEADA", entidades: [{ k: "clube", id: clube(vencedor), papel: "vencedor" }, { k: "clube", id: clube(perdedor), papel: "vencido" }, { k: "jogo", id: meta.id }], dados: { golosVencedor: Math.max(rel.golosCasa, rel.golosFora), golosVencido: Math.min(rel.golosCasa, rel.golosFora) } });
  }

  // golos notáveis: reviravolta e golo nos descontos que decide ou salva o resultado
  const notaveis: { golo: (typeof rel.golos)[number]; motivo: "reviravolta" | "descontos" }[] = [];
  const ultimo = rel.golos.at(-1);
  if (vencedor) {
    const atras = (g: { golosCasa: number; golosFora: number }) => (vencedor === "casa" ? g.golosFora - g.golosCasa : g.golosCasa - g.golosFora);
    const pior = rel.golos.reduce((a, g) => Math.max(a, atras(g)), 0);
    if (pior >= h.reviravolta) {
      // o golo com que o vencedor passa para a frente pela última vez
      let prev = { golosCasa: 0, golosFora: 0 };
      let virada: (typeof rel.golos)[number] | undefined;
      for (const g of rel.golos) {
        if (g.lado === vencedor && atras(g) < 0 && atras(prev) >= 0) virada = g;
        prev = g;
      }
      if (virada) notaveis.push({ golo: virada, motivo: "reviravolta" });
    }
  }
  if (ultimo && ultimo.minuto > rel.duracao - h.descontos && !notaveis.some((n) => n.golo === ultimo)) {
    // decide a vitória por um golo, ou salva o empate
    const decide = !vencedor || (vencedor === ultimo.lado && Math.abs(dif) === 1);
    if (decide) notaveis.push({ golo: ultimo, motivo: "descontos" });
  }
  for (const { golo, motivo } of notaveis)
    out.push({
      ...base,
      tipo: "GOLO_NOTAVEL",
      entidades: [{ k: "pessoa", id: golo.jogador, papel: "marcador" }, { k: "clube", id: clube(golo.lado) }, { k: "jogo", id: meta.id }],
      dados: { motivo, minuto: golo.minuto, golosCasa: golo.golosCasa, golosFora: golo.golosFora },
    });
  return out;
}
