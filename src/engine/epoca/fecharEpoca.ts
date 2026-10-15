/**
 * Fim de época (RZ-159; docs/DESIGN_REGRAS.md §2). Corre sozinho depois da última jornada:
 * 1. As distritais acabam → gera-se a Fase de Promoção com os 20 campeões (4 grupos de 5, uma volta, em maio-junho).
 * 2. Acabada a Fase de Promoção → classificações finais, movimentos entre escalões, calendário da época seguinte.
 * O Prémio do Estado entra com as finanças (RZ-112); o reajuste das distritais com RZ-113.
 */
import { proximoDiaDaSemana, somarDias } from "../calendario/datas";
import { criarData } from "../calendario/datas";
import type { Parametros } from "../config/parametros";
import type { DadosBase, SerieCP } from "../dados/tipos";
import { tabelaDaCompeticao } from "../competicao/tabela";
import type { Repositorio } from "../persistencia/repositorio";
import type { Data } from "../persistencia/tipos";
import { calendarioDoGrupo, classificarGrupo, formarGrupos, promovidosDoGrupo } from "./fasePromocao";
import { aplicarMovimentos, SERIES, type Movimento } from "./movimentos";
import { dadosDaEpoca, guardarPiramide, lerPiramide, ligasDaPiramide } from "./piramideEpoca";
import { nomeGrupoPromocao, gruposDaPromocao, prepararEpoca } from "./preparar";

export type ResumoEpoca = {
  epoca: number;
  campeoes: { liga: string; clube: string; nome: string }[];
  movimentos: (Movimento & { nome: string })[];
  avisos: string[];
};

const serieDoDistrito = (dados: DadosBase) => (d: string): SerieCP => dados.distritos.find((x) => x.id === d)?.serieCP ?? "A";

/** Gera a Fase de Promoção (calendário gravado) quando as ligas acabaram. Devolve os grupos. */
export function gerarFasePromocao(repo: Repositorio, dados: DadosBase, params: Parametros, epoca: number) {
  const seed = repo.meta("seed") ?? "?";
  const rep = new Map(dados.clubes.map((c) => [c.id, c.reputacao] as const));
  const campeoes = [...new Set(dados.clubes.filter((c) => c.escalao === "distrital").map((c) => c.liga))].flatMap((liga) => {
    const tabela = tabelaDaCompeticao(repo, liga, epoca, "promocao", params, { seed, reputacao: rep });
    const clube = tabela[0]?.clube;
    return clube ? [{ clube, distrito: dados.clubes.find((c) => c.id === clube)!.distrito }] : [];
  });
  const { grupos } = formarGrupos(campeoes, serieDoDistrito(dados), params);
  const fimDasLigas = criarData(params.calendario.anoInicial + epoca, params.calendario.ultimaJornadaAte.mes, params.calendario.ultimaJornadaAte.dia);
  const primeiroSabado = proximoDiaDaSemana(somarDias(fimDasLigas, 8), 6);
  repo.transacao(() => {
    for (const g of grupos.filter((x) => x.clubes.length >= 2)) {
      const rondas = calendarioDoGrupo(g, epoca, seed, params);
      const comp = nomeGrupoPromocao(g.serie);
      const jogos = rondas.flatMap((r, i) => r.jogos.map((j) => ({ id: `e${epoca}-promocao-${g.serie}-j${i + 1}-${j.casa}`, competicao: comp, epoca, jornada: i + 1, data: somarDias(primeiroSabado, 7 * i), casa: j.casa, fora: j.fora })));
      const folgas = rondas.flatMap((r, i) => (r.folga ? [{ competicao: comp, epoca, jornada: i + 1, clube: r.folga }] : []));
      repo.guardarCalendario(jogos, folgas);
    }
    repo.definirMeta(`promocao.${epoca}`, JSON.stringify(grupos));
  });
  return grupos;
}

/** Fecha a época: classificações finais → movimentos → eventos → nova época com calendários. */
export function fecharEpoca(repo: Repositorio, dados: DadosBase, params: Parametros, epoca: number): ResumoEpoca {
  const seed = repo.meta("seed") ?? "?";
  const hoje = repo.meta("data.hoje") as Data;
  const rep = new Map(dados.clubes.map((c) => [c.id, c.reputacao] as const));
  const nome = new Map(dados.clubes.map((c) => [c.id, c.nome] as const));
  const atual = lerPiramide(repo, dados, epoca);
  const ligas = ligasDaPiramide(atual, dados);
  const nomeLiga = (clube: string) => ligas.get(clube)?.liga ?? "";
  const ordem = (liga: string, tipo: "liga" | "promocao") => tabelaDaCompeticao(repo, liga, epoca, tipo, params, { seed, reputacao: rep }).map((l) => l.clube);
  const liga = (c: string[]) => nomeLiga(c[0] as string);
  const primeira = ordem(liga(atual.primeira), "liga");
  const segunda = ordem(liga(atual.segunda), "liga");
  const terceira = ordem(liga(atual.terceira), "liga");
  const cp = Object.fromEntries(SERIES.map((s) => [s, ordem(`CP Série ${s}`, "promocao")])) as Record<SerieCP, string[]>;
  const promovidos = (gruposDaPromocao(repo, epoca) ?? []).flatMap((g) => {
    const jogos = repo.jogosDaCompeticao(nomeGrupoPromocao(g.serie), epoca).map((j) => ({ casa: j.casa, fora: j.fora, golosCasa: j.golosCasa, golosFora: j.golosFora }));
    return promovidosDoGrupo(g, classificarGrupo(g, jogos, epoca, seed, params, rep), params);
  });
  const ctx = { distritoDe: (c: string) => dados.clubes.find((x) => x.id === c)!.distrito, serieDoDistrito: serieDoDistrito(dados) };
  const r = aplicarMovimentos(atual, { primeira, segunda, terceira, cp, promovidosFasePromocao: promovidos }, params, ctx);

  const campeoes = [primeira, segunda, terceira, ...SERIES.map((s) => cp[s])].map((t) => ({ liga: nomeLiga(t[0] as string), clube: t[0] as string, nome: nome.get(t[0] as string) ?? "" }));
  repo.transacao(() => {
    for (const c of campeoes) repo.acrescentarEvento({ tipo: "CAMPEAO", data: hoje, epoca, vis: "publico", origem: "jogo", entidades: [{ k: "clube", id: c.clube, papel: "campeao" }, { k: "competicao", id: c.liga }], dados: { liga: c.liga } });
    for (const m of r.movimentos) {
      const para = m.para.startsWith("cp-") ? `CP Série ${m.para.slice(3)}` : m.para;
      repo.acrescentarEvento({ tipo: m.motivo === "descida" ? "DESCIDA" : "SUBIDA", data: hoje, epoca, vis: "publico", origem: "jogo", entidades: [{ k: "clube", id: m.clube }], dados: { de: m.de, para, motivo: m.motivo } });
    }
    guardarPiramide(repo, epoca + 1, r.piramide);
    repo.definirMeta("epoca", String(epoca + 1));
    repo.definirMeta("data.hoje", criarData(params.calendario.anoInicial + epoca, params.calendario.mesInicioEpoca, 1));
  });
  prepararEpoca(repo, dadosDaEpoca(repo, dados), params);
  return { epoca, campeoes, movimentos: r.movimentos.map((m) => ({ ...m, nome: nome.get(m.clube) ?? m.clube })), avisos: r.avisos };
}
