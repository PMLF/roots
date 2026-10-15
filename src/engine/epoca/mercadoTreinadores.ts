/**
 * Mercado de treinadores (RZ-157; decidido a 15-10-2026): o gamer escolhe um clube para começar e só muda se se demitir
 * (o despedimento chega com o sistema de presidente, RZ-210). Sem clube, o tempo continua e todas as segundas-feiras
 * chegam ofertas de clubes de reputação igual ou inferior à do clube que deixou, mais uma surpresa acima.
 * Estado no save (meta; texto vazio = sem valor): `clube.gamer`, `gamer.anterior`, `gamer.ofertas`.
 */
import { Rng } from "../aleatorio/rng";
import type { Parametros } from "../config/parametros";
import type { DadosBase } from "../dados/tipos";
import type { Repositorio } from "../persistencia/repositorio";
import type { Data } from "../persistencia/tipos";
import { epocaAtual } from "./piramideEpoca";
import { prepararEpoca } from "./preparar";

export type Oferta = { clube: string; desde: Data };

export const ofertasDoGamer = (repo: Repositorio): Oferta[] => {
  const bruto = repo.meta("gamer.ofertas");
  return bruto ? (JSON.parse(bruto) as Oferta[]) : [];
};

export const estaDesempregado = (repo: Repositorio): boolean => !repo.meta("clube.gamer") && !!repo.meta("gamer.anterior");

/** Renova as ofertas (determinístico por save e data). `dados` já traz as ligas atuais. */
export function atualizarOfertas(repo: Repositorio, dados: DadosBase, params: Parametros, hoje: Data): Oferta[] {
  const anterior = repo.meta("gamer.anterior");
  const ref = dados.clubes.find((c) => c.id === anterior)?.reputacao ?? 0;
  const rng = new Rng(repo.meta("seed") ?? "?", `ofertas/${hoje}`);
  const tirar = (pool: typeof dados.clubes, n: number) => {
    const p = [...pool];
    const out: typeof dados.clubes = [];
    while (out.length < n && p.length > 0) out.push(p.splice(rng.inteiro(0, p.length - 1), 1)[0]!);
    return out;
  };
  const outros = dados.clubes.filter((c) => c.id !== anterior);
  const normais = tirar(outros.filter((c) => c.reputacao <= ref), params.treinador.ofertas);
  const ids = new Set(normais.map((c) => c.id));
  const surpresas = tirar(outros.filter((c) => !ids.has(c.id) && c.reputacao > ref && c.reputacao <= ref + params.treinador.margemSurpresa), params.treinador.surpresas);
  const ofertas = [...normais, ...surpresas].map((c): Oferta => ({ clube: c.id, desde: hoje }));
  repo.definirMeta("gamer.ofertas", JSON.stringify(ofertas));
  return ofertas;
}

/** O gamer demite-se do clube atual: fica sem clube e recebe as primeiras ofertas. */
export function demitir(repo: Repositorio, dados: DadosBase, params: Parametros): { clube: string } {
  const clube = repo.meta("clube.gamer");
  if (!clube) throw new Error("Não tens clube de que te demitir");
  const { hoje } = prepararEpoca(repo, dados, params);
  repo.transacao(() => {
    repo.acrescentarEvento({ tipo: "GAMER_DEMISSAO", data: hoje, epoca: epocaAtual(repo), vis: "publico", origem: "jogo", entidades: [{ k: "clube", id: clube, papel: "deixado" }], dados: {} });
    repo.definirMeta("gamer.anterior", clube);
    repo.definirMeta("clube.gamer", "");
    atualizarOfertas(repo, dados, params, hoje);
  });
  return { clube };
}

/** Aceita uma das ofertas em vigor. */
export function aceitarOferta(repo: Repositorio, clube: string): void {
  if (!estaDesempregado(repo)) throw new Error("Já tens clube");
  if (!ofertasDoGamer(repo).some((o) => o.clube === clube)) throw new Error("Esse clube não te fez nenhuma oferta");
  const hoje = (repo.meta("data.hoje") ?? "") as Data;
  repo.transacao(() => {
    repo.acrescentarEvento({ tipo: "GAMER_CONTRATADO", data: hoje, epoca: epocaAtual(repo), vis: "publico", origem: "jogo", entidades: [{ k: "clube", id: clube, papel: "contratou" }], dados: { anterior: repo.meta("gamer.anterior") ?? "" } });
    repo.definirMeta("clube.gamer", clube);
    repo.definirMeta("gamer.anterior", "");
    repo.definirMeta("gamer.ofertas", "");
  });
}
