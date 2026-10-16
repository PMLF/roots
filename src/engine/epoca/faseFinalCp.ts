/**
 * Fase final do Campeonato de Portugal: meias-finais e final, a jogo único, entre os campeões das quatro séries.
 * Joga-se em domingos, em duas competições («CP Meias-Finais» e «CP Final», porque cada calendário se grava de uma vez), depois de acabarem as séries e tem de acabar em maio. Os campeões das séries sobem à Terceira Liga
 * na mesma; a fase final decide só o campeão do CP. Se o jogo acaba empatado, decidem os penáltis (função pura, estável
 * por seed e jogo, por isso nada se guarda além do resultado).
 */
import { Rng } from "../aleatorio/rng";
import { somarDias, proximoDiaDaSemana } from "../calendario/datas";
import type { Parametros } from "../config/parametros";
import type { ClubeId, DadosBase, SerieCP } from "../dados/tipos";
import { tabelaDaCompeticao } from "../competicao/tabela";
import type { Repositorio } from "../persistencia/repositorio";
import type { Data, JogoAgendado } from "../persistencia/tipos";
import { SERIES } from "./movimentos";

export const COMPETICAO_MEIAS_FINAIS_CP = "CP Meias-Finais";
export const COMPETICAO_FINAL_CP = "CP Final";
export const COMPETICOES_FASE_FINAL_CP = [COMPETICAO_MEIAS_FINAIS_CP, COMPETICAO_FINAL_CP] as const;
export const idJogoFaseFinal = (epoca: number, ronda: "meia1" | "meia2" | "final") => `e${epoca}-cp-fase-final-${ronda}`;

export type CampeaoDeSerie = { serie: SerieCP; clube: ClubeId; jogos: number; pontos: number; diferenca: number; golosMarcados: number; reputacao: number };

/** Os campeões ordenados do melhor para o pior: pontos por jogo, diferença de golos, golos marcados, menor reputação, id. */
export function ordenarCampeoes(campeoes: readonly CampeaoDeSerie[]): CampeaoDeSerie[] {
  const ppg = (c: CampeaoDeSerie) => (c.jogos > 0 ? c.pontos / c.jogos : 0);
  return [...campeoes].sort((a, b) => ppg(b) - ppg(a) || b.diferenca - a.diferenca || b.golosMarcados - a.golosMarcados || a.reputacao - b.reputacao || (a.clube < b.clube ? -1 : 1));
}

/** Meias-finais: o melhor com o pior e o segundo com o terceiro; joga em casa o melhor classificado. */
export function emparelharMeiasFinais(campeoes: readonly CampeaoDeSerie[]): [{ casa: ClubeId; fora: ClubeId }, { casa: ClubeId; fora: ClubeId }] {
  const [a, b, c, d] = ordenarCampeoes(campeoes);
  if (!a || !b || !c || !d) throw new Error("A fase final do CP precisa dos campeões das quatro séries");
  return [{ casa: a.clube, fora: d.clube }, { casa: b.clube, fora: c.clube }];
}

/** Quem passa num jogo a eliminar e, se foi para penáltis, o resultado desses. Determinístico por seed e jogo. */
export function vencedorEliminatoria(j: { seed: string; id: string; casa: ClubeId; fora: ClubeId; golosCasa: number; golosFora: number }, params: Parametros): { vencedor: ClubeId; penaltis?: { casa: number; fora: number } } {
  if (j.golosCasa !== j.golosFora) return { vencedor: j.golosCasa > j.golosFora ? j.casa : j.fora };
  const { iniciais, probGolo } = params.eliminatorias.penaltis;
  const rng = new Rng(j.seed, `penaltis/${j.id}`);
  let casa = 0;
  let fora = 0;
  for (let i = 0; i < iniciais; i++) {
    if (rng.float() < probGolo) casa++;
    if (rng.float() < probGolo) fora++;
    // decidido antes do fim: a equipa que fica atrás já não alcança
    const restam = iniciais - 1 - i;
    if (casa > fora + restam || fora > casa + restam) return { vencedor: casa > fora ? j.casa : j.fora, penaltis: { casa, fora } };
  }
  while (casa === fora) {
    if (rng.float() < probGolo) casa++;
    if (rng.float() < probGolo) fora++;
  }
  return { vencedor: casa > fora ? j.casa : j.fora, penaltis: { casa, fora } };
}

/** Datas: meias-finais no primeiro domingo `diasAposSeries` depois do último jogo das séries; a final `diasEntreRondas` depois. */
export function datasDaFaseFinal(ultimoJogoDasSeries: Data, params: Parametros): { meiasFinais: Data; final: Data } {
  const c = params.calendario.faseFinalCp;
  const meiasFinais = proximoDiaDaSemana(somarDias(ultimoJogoDasSeries, c.diasAposSeries), 0);
  return { meiasFinais, final: proximoDiaDaSemana(somarDias(meiasFinais, c.diasEntreRondas), 0) };
}

const nomesSeries = SERIES.map((s) => `CP Série ${s}`);

/** As séries do CP acabaram (nada por jogar) e ainda não há fase final: marca as meias-finais. */
export function gerarMeiasFinaisCp(repo: Repositorio, dados: DadosBase, params: Parametros, epoca: number): boolean {
  if (repo.meta(`cpFinal.${epoca}`)) return false;
  const seed = repo.meta("seed") ?? "?";
  const rep = new Map(dados.clubes.map((c) => [c.id, c.reputacao] as const));
  let ultimo: Data = "";
  const campeoes: CampeaoDeSerie[] = [];
  for (const [i, serie] of SERIES.entries()) {
    const competicao = nomesSeries[i] as string;
    const cal = repo.calendario(competicao, epoca).jogos;
    const jogados = new Set(repo.jogosDaCompeticao(competicao, epoca).map((j) => j.id));
    if (cal.length === 0 || cal.some((j) => !jogados.has(j.id))) return false;
    for (const j of cal) if (j.data > ultimo) ultimo = j.data;
    const linha = tabelaDaCompeticao(repo, competicao, epoca, "promocao", params, { seed, reputacao: rep })[0];
    if (!linha) return false;
    campeoes.push({ serie, clube: linha.clube, jogos: linha.jogos, pontos: linha.pontos, diferenca: linha.diferenca, golosMarcados: linha.golosMarcados, reputacao: rep.get(linha.clube) ?? 0 });
  }
  const [m1, m2] = emparelharMeiasFinais(campeoes);
  const datas = datasDaFaseFinal(ultimo, params);
  const jogo = (id: string, casa: ClubeId, fora: ClubeId, data: Data): JogoAgendado => ({ id, competicao: COMPETICAO_MEIAS_FINAIS_CP, epoca, jornada: 1, data, casa, fora });
  repo.transacao(() => {
    repo.guardarCalendario([jogo(idJogoFaseFinal(epoca, "meia1"), m1.casa, m1.fora, datas.meiasFinais), jogo(idJogoFaseFinal(epoca, "meia2"), m2.casa, m2.fora, datas.meiasFinais)], []);
    repo.definirMeta(`cpFinal.${epoca}`, JSON.stringify({ campeoes: ordenarCampeoes(campeoes).map((c) => c.clube), final: datas.final }));
  });
  return true;
}

/** Quem passou em cada meia-final, se as duas já se jogaram. */
function finalistas(repo: Repositorio, params: Parametros, epoca: number): [ClubeId, ClubeId] | undefined {
  const seed = repo.meta("seed") ?? "?";
  const out: ClubeId[] = [];
  for (const r of ["meia1", "meia2"] as const) {
    const id = idJogoFaseFinal(epoca, r);
    const j = repo.jogo(id);
    if (!j) return undefined;
    out.push(vencedorEliminatoria({ seed, id, casa: j.casa, fora: j.fora, golosCasa: j.golosCasa, golosFora: j.golosFora }, params).vencedor);
  }
  return [out[0] as ClubeId, out[1] as ClubeId];
}

/** Jogadas as meias-finais, marca a final (joga em casa o melhor classificado nas séries). */
export function gerarFinalCp(repo: Repositorio, params: Parametros, epoca: number): boolean {
  const bruto = repo.meta(`cpFinal.${epoca}`);
  if (!bruto || repo.calendario(COMPETICAO_FINAL_CP, epoca).jogos.length > 0) return false;
  const par = finalistas(repo, params, epoca);
  if (!par) return false;
  const { campeoes, final } = JSON.parse(bruto) as { campeoes: ClubeId[]; final: Data };
  const [casa, fora] = campeoes.indexOf(par[0]) <= campeoes.indexOf(par[1]) ? par : ([par[1], par[0]] as [ClubeId, ClubeId]);
  repo.guardarCalendario([{ id: idJogoFaseFinal(epoca, "final"), competicao: COMPETICAO_FINAL_CP, epoca, jornada: 1, data: final, casa, fora }], []);
  return true;
}

/** O campeão do CP, depois da final. */
export function campeaoDoCp(repo: Repositorio, params: Parametros, epoca: number): ClubeId | undefined {
  const j = repo.jogo(idJogoFaseFinal(epoca, "final"));
  return j ? vencedorEliminatoria({ seed: repo.meta("seed") ?? "?", id: j.id, casa: j.casa, fora: j.fora, golosCasa: j.golosCasa, golosFora: j.golosFora }, params).vencedor : undefined;
}
