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
import { evoluirCidades } from "../cidade/cidades";
import type { ResultadosClubes } from "../cidade/evolucao";
import { tabelaDaCompeticao } from "../competicao/tabela";
import type { Repositorio } from "../persistencia/repositorio";
import type { Data } from "../persistencia/tipos";
import { calendarioDoGrupo, classificarGrupo, formarGrupos, promovidosDoGrupo } from "./fasePromocao";
import { aplicarMovimentos, SERIES, type Movimento } from "./movimentos";
import { parametrosDoSave } from "./anoDoSave";
import { campeaoDoCp } from "./faseFinalCp";
import { despedirPorDescida } from "./mercadoTreinadores";
import { ajustarDistritais, estaNaSegundaDistrital, type SegundaDistrital } from "./distritais";
import { fatoresDeDistrito, valorDoPremio, type TipoPremio } from "./premiosCompeticao";
import { anosSeguidos, premiadosPorDistrito, type ClubeClassificado } from "./premioEstado";
import { dadosDaEpoca, guardarPiramide, lerPiramide, ligasDaPiramide } from "./piramideEpoca";
import { nomeGrupoPromocao, gruposDaPromocao, prepararEpoca } from "./preparar";

export type ResumoEpoca = {
  epoca: number;
  campeoes: { liga: string; clube: string; nome: string }[];
  movimentos: (Movimento & { nome: string })[];
  avisos: string[];
};

const serieDoDistrito = (dados: DadosBase) => (d: string): SerieCP => dados.distritos.find((x) => x.id === d || x.nome === d)?.serieCP ?? "A";

/** Gera a Fase de Promoção (calendário gravado) quando as ligas acabaram. Devolve os grupos. */
export function gerarFasePromocao(repo: Repositorio, dados: DadosBase, paramsBase: Parametros, epoca: number) {
  const params = parametrosDoSave(repo, paramsBase);
  const seed = repo.meta("seed") ?? "?";
  const rep = new Map(dados.clubes.map((c) => [c.id, c.reputacao] as const));
  const campeoes = [...new Set(dados.clubes.filter((c) => c.escalao === "distrital" && !estaNaSegundaDistrital(c.liga)).map((c) => c.liga))].flatMap((liga) => {
    const tabela = tabelaDaCompeticao(repo, liga, epoca, "promocao", params, { seed, reputacao: rep });
    const clube = tabela[0]?.clube;
    return clube ? [{ clube, distrito: dados.clubes.find((c) => c.id === clube)!.distrito }] : [];
  });
  const { grupos } = formarGrupos(campeoes, serieDoDistrito(dados), params);
  const fimDistritais = params.calendario.ultimaJornadaPorEscalao.distrital ?? params.calendario.ultimaJornadaAte;
  const fimDasLigas = criarData(params.calendario.anoInicial + epoca, fimDistritais.mes, fimDistritais.dia);
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
export function fecharEpoca(repo: Repositorio, dados: DadosBase, paramsBase: Parametros, epoca: number): ResumoEpoca {
  const params = parametrosDoSave(repo, paramsBase);
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
  const vencedoresDosGrupos: string[] = [];
  const promovidos = (gruposDaPromocao(repo, epoca) ?? []).flatMap((g) => {
    const jogos = repo.jogosDaCompeticao(nomeGrupoPromocao(g.serie), epoca).map((j) => ({ casa: j.casa, fora: j.fora, golosCasa: j.golosCasa, golosFora: j.golosFora }));
    const ordem = classificarGrupo(g, jogos, epoca, seed, params, rep);
    if (jogos.length > 0 && ordem[0]) vencedoresDosGrupos.push(ordem[0]);
    return promovidosDoGrupo(g, ordem, params);
  });
  const ctx = { distritoDe: (c: string) => dados.clubes.find((x) => x.id === c)!.distrito, serieDoDistrito: serieDoDistrito(dados) };
  const r = aplicarMovimentos(atual, { primeira, segunda, terceira, cp, promovidosFasePromocao: promovidos }, params, ctx);

  // Prémio do Estado (passo 2 do DESIGN_REGRAS §2): sobre as classificações finais, antes de qualquer movimento
  const classificados: ClubeClassificado[] = [];
  const competicoes = new Map([...ligas.values()].map((l) => [l.liga, l.escalao] as const));
  for (const [competicao, escalao] of competicoes) {
    for (const l of tabelaDaCompeticao(repo, competicao, epoca, escalao === "cp" || escalao === "distrital" ? "promocao" : "liga", params, { seed, reputacao: rep })) {
      const cd = dados.clubes.find((x) => x.id === l.clube);
      if (cd) classificados.push({ clube: l.clube, distrito: cd.distrito, escalao, posicao: l.posicao, jogos: l.jogos, pontos: l.pontos, diferenca: l.diferenca, golosMarcados: l.golosMarcados, reputacao: cd.reputacao });
    }
  }
  const premiados = premiadosPorDistrito(classificados);
  const cidadeDe0 = new Map(dados.clubes.map((c) => [c.id, c.cidade] as const));

  // Distritais de tamanho variável e segunda distrital (RZ-113): depois dos movimentos, ajusta-se cada distrito a [min, max]
  const brutoSegunda = repo.meta("segundaDistrital");
  const segundaAntes: SegundaDistrital = brutoSegunda ? (JSON.parse(brutoSegunda) as SegundaDistrital) : {};
  const finaisDistritais: Record<string, string[]> = {};
  for (const x of [...classificados].filter((c) => c.escalao === "distrital").sort((a, b) => a.posicao - b.posicao)) (finaisDistritais[x.distrito] ??= []).push(x.clube);
  const despromovidosDoCp = new Set(r.movimentos.filter((m) => m.de.startsWith("cp-") && m.para.startsWith("distrital-")).map((m) => m.clube));
  const ajuste = ajustarDistritais(r.piramide.distritais, { finais: finaisDistritais, protegidos: despromovidosDoCp, segunda: segundaAntes, epoca }, params);
  r.piramide.distritais = ajuste.distritais;
  r.avisos.push(...ajuste.avisos);

  const campeoes = [primeira, segunda, terceira, ...SERIES.map((s) => cp[s])].map((t) => ({ liga: nomeLiga(t[0] as string), clube: t[0] as string, nome: nome.get(t[0] as string) ?? "" }));
  const campeaoCp = campeaoDoCp(repo, params, epoca);
  repo.transacao(() => {
    for (const c of campeoes) repo.acrescentarEvento({ tipo: "CAMPEAO", data: hoje, epoca, vis: "publico", origem: "jogo", entidades: [{ k: "clube", id: c.clube, papel: "campeao" }, { k: "competicao", id: c.liga }], dados: { liga: c.liga } });
    if (campeaoCp) repo.acrescentarEvento({ tipo: "CAMPEAO", data: hoje, epoca, vis: "publico", origem: "jogo", entidades: [{ k: "clube", id: campeaoCp, papel: "campeao" }, { k: "competicao", id: "Campeonato de Portugal" }], dados: { liga: "Campeonato de Portugal" } });
    // prémio por vencer cada competição (RZ-216)
    const fatores = fatoresDeDistrito(dados.cidades, params);
    const distritoDe2 = new Map(dados.clubes.map((c) => [c.id, c.distrito] as const));
    const premiar = (tipo: TipoPremio, clube: string, competicao: string, distrito?: string) => {
      const fator = distrito ? fatores.get(distrito) ?? 1 : 1;
      const cidade = cidadeDe0.get(clube);
      repo.acrescentarEvento({ tipo: "PREMIO_COMPETICAO", data: hoje, epoca, vis: "publico", origem: "jogo", entidades: [{ k: "clube", id: clube, papel: "premiado" }, { k: "competicao", id: competicao }, ...(cidade ? [{ k: "cidade" as const, id: cidade, papel: "sede" }] : [])], dados: { competicao, tipo, valor: valorDoPremio(tipo, params, fator), fatorDistrito: distrito ? fator : undefined, posicao: 1 } });
    };
    const tipoDaLiga: TipoPremio[] = ["primeiraLiga", "segundaLiga", "terceiraLiga", "serieCp", "serieCp", "serieCp", "serieCp"];
    campeoes.forEach((c, i) => premiar(tipoDaLiga[i] as TipoPremio, c.clube, c.liga));
    if (campeaoCp) premiar("vencedorCp", campeaoCp, "Campeonato de Portugal");
    for (const [distrito, tabela] of Object.entries(finaisDistritais)) if (tabela[0]) premiar("distrital", tabela[0], `Distrital ${distrito}`, distrito);
    for (const c of vencedoresDosGrupos) premiar("fasePromocao", c, "Fase de Promoção", distritoDe2.get(c));
    for (const m of r.movimentos) {
      const para = m.para.startsWith("cp-") ? `CP Série ${m.para.slice(3)}` : m.para;
      repo.acrescentarEvento({ tipo: m.motivo === "descida" ? "DESCIDA" : "SUBIDA", data: hoje, epoca, vis: "publico", origem: "jogo", entidades: [{ k: "clube", id: m.clube }], dados: { de: m.de, para, motivo: m.motivo } });
    }
    for (const p of premiados) {
      const chave = `premio.${p.distrito}`;
      const anterior = repo.meta(chave) ? (JSON.parse(repo.meta(chave) as string) as { clube: string; seguidos: number }) : undefined;
      const seguidos = anosSeguidos(anterior, p.clube);
      repo.definirMeta(chave, JSON.stringify({ clube: p.clube, seguidos, epoca }));
      const cidade = cidadeDe0.get(p.clube);
      repo.acrescentarEvento({ tipo: "PREMIO_ESTADO", data: hoje, epoca, vis: "publico", origem: "jogo", entidades: [{ k: "clube", id: p.clube, papel: "premiado" }, ...(cidade ? [{ k: "cidade" as const, id: cidade, papel: "camara" }] : [])], dados: { distrito: p.distrito, valorClube: params.premios.clube, valorCidade: params.premios.cidade, seguidos } });
    }
    repo.definirMeta("segundaDistrital", JSON.stringify(ajuste.segunda));
    for (const a of ajuste.ajustes) repo.acrescentarEvento({ tipo: a.tipo === "descida" ? "DESCIDA_SEGUNDA_DISTRITAL" : "REGRESSO_DISTRITAL", data: hoje, epoca, vis: "publico", origem: "jogo", entidades: [{ k: "clube", id: a.clube }], dados: { distrito: a.distrito } });
    // as cidades reagem aos resultados dos clubes e ao que lhes acontece (RZ-133)
    const cidadeDe = new Map(dados.clubes.map((c) => [c.id, c.cidade] as const));
    const resultados = new Map<string, ResultadosClubes>();
    const somar = (clube: string, campo: keyof ResultadosClubes) => {
      const cid = cidadeDe.get(clube);
      if (cid) resultados.set(cid, { campeoes: 0, subidas: 0, descidas: 0, ...resultados.get(cid), [campo]: (resultados.get(cid)?.[campo] ?? 0) + 1 });
    };
    for (const c of campeoes) somar(c.clube, "campeoes");
    for (const m of r.movimentos) somar(m.clube, m.motivo === "descida" ? "descidas" : "subidas");
    evoluirCidades(repo, dados, params, epoca, hoje, resultados);
    guardarPiramide(repo, epoca + 1, r.piramide);
    repo.definirMeta("epoca", String(epoca + 1));
    repo.definirMeta("data.hoje", criarData(params.calendario.anoInicial + epoca, params.calendario.mesInicioEpoca, 1));
  });
  prepararEpoca(repo, dadosDaEpoca(repo, dados), paramsBase);
  // o clube do gamer que desceu à segunda distrital é despedido (deixa de ser jogável até voltar à pirâmide)
  const gamer = repo.meta("clube.gamer");
  if (gamer && ajuste.ajustes.some((a) => a.tipo === "descida" && a.clube === gamer)) despedirPorDescida(repo, dadosDaEpoca(repo, dados), params, gamer, repo.meta("data.hoje") as Data, epoca);
  return { epoca, campeoes, movimentos: r.movimentos.map((m) => ({ ...m, nome: nome.get(m.clube) ?? m.clube })), avisos: r.avisos };
}
