/**
 * Harness de calibração headless (RZ-123): cria um mundo, joga N épocas seguidas pelo mesmo caminho do jogo (`avancar`) e
 * devolve um relatório com os números que têm de ficar plausíveis: golos por jogo, vantagem de jogar em casa, ocupação dos
 * estádios, lesões e cartões por jogo, rotatividade do CP, tamanho das distritais e dinheiro por escalão.
 * Só lê o repositório; não altera regras. Os limites aceitáveis estão em `LIMITES_CALIBRACAO`.
 */
import type { Servicos } from "../api/handler";
import { tratar } from "../api/handler";
import type { DadosBase } from "../dados/tipos";
import { importarDados } from "../dados/importar";
import type { Repositorio } from "../persistencia/repositorio";
import { dadosDaPiramide, lerPiramide, ligasDaPiramide } from "../epoca/piramideEpoca";
import { competicoesDoMundo } from "./laboratorio";

export type EscalaoRelatorio = "primeiraLiga" | "segundaLiga" | "terceiraLiga" | "cp" | "distrital";
const ESCALOES: EscalaoRelatorio[] = ["primeiraLiga", "segundaLiga", "terceiraLiga", "cp", "distrital"];

export type EpocaRelatorio = {
  epoca: number;
  jogos: number;
  golosPorJogo: Record<EscalaoRelatorio, number>;
  vitoriaCasa: number;
  empates: number;
  ocupacao: Record<EscalaoRelatorio, number>;
  lesoesPorJogo: number;
  amarelosPorJogo: number;
  vermelhosPorJogo: number;
  /** Fração dos 40 clubes do CP que saem dele no fim da época (sobem ou descem). */
  rotatividadeCp: number;
  distritais: { min: number; max: number; media: number };
  /** Saldo mediano (€) por escalão no fim da época. */
  saldoMediano: Record<EscalaoRelatorio, number>;
  clubesNegativos: number;
  avisos: string[];
};

export type RelatorioCalibracao = { seed: string; epocas: EpocaRelatorio[]; ms: number };

/** Intervalos plausíveis (média sobre todas as épocas). Ajustar aqui, não nos testes. */
export const LIMITES_CALIBRACAO = {
  golosPorJogo: [2.0, 3.4],
  vitoriaCasa: [0.38, 0.55],
  empates: [0.18, 0.32],
  ocupacao: [0.15, 0.95],
  rotatividadeCp: [0.15, 0.45],
  distritais: [6, 16],
  clubesNegativos: 0.1,
} as const;

const mediana = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)] ?? 0;
const media = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0);
const zero = (): Record<EscalaoRelatorio, number> => ({ primeiraLiga: 0, segundaLiga: 0, terceiraLiga: 0, cp: 0, distrital: 0 });

function medirEpoca(repo: Repositorio, dados: DadosBase, epoca: number, ligas: Map<string, EscalaoRelatorio>, capacidade: Map<string, number>, lesoesAntes: number): Omit<EpocaRelatorio, "rotatividadeCp" | "distritais" | "saldoMediano" | "clubesNegativos" | "avisos"> {
  const golos = zero(), jogosPor = zero(), ocup = zero(), ocupN = zero();
  let jogos = 0, casa = 0, empates = 0, amarelos = 0, vermelhos = 0;
  for (const [competicao, esc] of ligas) {
    for (const j of repo.jogosDaCompeticao(competicao, epoca)) {
      jogos++; jogosPor[esc]++; golos[esc] += j.golosCasa + j.golosFora;
      if (j.golosCasa > j.golosFora) casa++; else if (j.golosCasa === j.golosFora) empates++;
      const cap = capacidade.get(j.casa);
      if (j.assistencia && cap) { ocup[esc] += j.assistencia / cap; ocupN[esc]++; }
    }
    for (const s of repo.playerStatsForCompetition(competicao, epoca)) { amarelos += s.amarelos; vermelhos += s.vermelhos; }
  }
  const por = (a: Record<EscalaoRelatorio, number>, b: Record<EscalaoRelatorio, number>) => Object.fromEntries(ESCALOES.map((e) => [e, b[e] ? a[e] / b[e] : 0])) as Record<EscalaoRelatorio, number>;
  return {
    epoca, jogos,
    golosPorJogo: por(golos, jogosPor),
    vitoriaCasa: jogos ? casa / jogos : 0,
    empates: jogos ? empates / jogos : 0,
    ocupacao: por(ocup, ocupN),
    lesoesPorJogo: jogos ? (repo.contar("LESAO") - lesoesAntes) / jogos : 0,
    amarelosPorJogo: jogos ? amarelos / jogos : 0,
    vermelhosPorJogo: jogos ? vermelhos / jogos : 0,
  };
}

export async function correrEpocas(servicos: Servicos, seed: string, epocas: number, aoProgredir: (e: EpocaRelatorio) => void = () => undefined): Promise<RelatorioCalibracao> {
  const t0 = Date.now();
  await tratar({ id: 1, tipo: "criarMundo", entrada: { seed } }, servicos);
  const { repositorio: repo } = await servicos.abrirRepositorio();
  const imp = importarDados(await servicos.carregarDados());
  if (!imp.ok) throw new Error(imp.erros.join("\n"));
  const dadosBase = imp.dados;
  const capacidade = new Map(dadosBase.clubes.map((c) => [c.id, c.estadio.capacidade] as const));
  const saida: EpocaRelatorio[] = [];
  let id = 10;
  for (let n = 1; n <= epocas; n++) {
    const lesoesAntes = repo.contar("LESAO");
    let resumo;
    for (let guarda = 0; !resumo && guarda < 120; guarda++) resumo = (await tratar({ id: id++, tipo: "avancar", entrada: { modo: "semana" } }, servicos)).resumoEpoca;
    if (!resumo) throw new Error(`a época ${n} não fechou em 120 semanas`);
    // as ligas da época que acabou (antes de a pirâmide mudar já está gravada a seguinte, por isso usa-se o resumo)
    const ligas = new Map<string, EscalaoRelatorio>();
    for (const c of competicoesDoMundo(dadosDaEpocaAnterior(repo, dadosBase, n))) ligas.set(c.liga, c.escalao as EscalaoRelatorio);
    const base = medirEpoca(repo, dadosBase, n, ligas, capacidade, lesoesAntes);
    const cpMov = resumo.movimentos.filter((m) => m.de.startsWith("cp-")).length;
    const dist = Object.values(lerPiramideDistritais(repo, dadosBase, n + 1)).map((l) => l.length);
    const saldos = zero(), porEsc = new Map<EscalaoRelatorio, number[]>();
    let negativos = 0, total = 0;
    const escDoClube = escalaoPorClube(repo, dadosBase, n);
    for (const [c, esc] of escDoClube) {
      const s = Number(repo.meta(`saldo.${c}`) ?? 0);
      (porEsc.get(esc) ?? porEsc.set(esc, []).get(esc)!).push(s);
      if (s < 0) negativos++;
      total++;
    }
    for (const e of ESCALOES) saldos[e] = mediana(porEsc.get(e) ?? []);
    const r: EpocaRelatorio = { ...base, rotatividadeCp: cpMov / 40, distritais: { min: Math.min(...dist), max: Math.max(...dist), media: media(dist) }, saldoMediano: saldos, clubesNegativos: total ? negativos / total : 0, avisos: resumo.avisos };
    saida.push(r);
    aoProgredir(r);
  }
  return { seed, epocas: saida, ms: Date.now() - t0 };
}

const dadosDaEpocaAnterior = (repo: Repositorio, dados: DadosBase, epoca: number) => dadosDaPiramide(repo, dados, epoca);
const lerPiramideDistritais = (repo: Repositorio, dadosBase0: DadosBase, epoca: number) => lerPiramide(repo, dadosBase0, epoca).distritais;
function escalaoPorClube(repo: Repositorio, dados: DadosBase, epoca: number): Map<string, EscalaoRelatorio> {
  return new Map([...ligasDaPiramide(lerPiramide(repo, dados, epoca), dados)].map(([c, l]) => [c, l.escalao as EscalaoRelatorio] as const));
}

export type Falha = { regra: string; valor: number; esperado: string };

/** Compara as médias do relatório com `LIMITES_CALIBRACAO`. */
export function avaliarCalibracao(r: RelatorioCalibracao): Falha[] {
  const L = LIMITES_CALIBRACAO;
  const m = (f: (e: EpocaRelatorio) => number) => media(r.epocas.map(f));
  const falhas: Falha[] = [];
  const dentro = (regra: string, v: number, [a, b]: readonly [number, number] | readonly number[]) => { if (v < (a as number) || v > (b as number)) falhas.push({ regra, valor: v, esperado: `${a}–${b}` }); };
  dentro("golos por jogo (1.ª Liga)", m((e) => e.golosPorJogo.primeiraLiga), L.golosPorJogo);
  dentro("golos por jogo (todos)", m((e) => media(ESCALOES.map((x) => e.golosPorJogo[x]))), L.golosPorJogo);
  dentro("vitórias em casa", m((e) => e.vitoriaCasa), L.vitoriaCasa);
  dentro("empates", m((e) => e.empates), L.empates);
  dentro("ocupação (1.ª Liga)", m((e) => e.ocupacao.primeiraLiga), L.ocupacao);
  dentro("rotatividade do CP", m((e) => e.rotatividadeCp), L.rotatividadeCp);
  dentro("tamanho médio das distritais", m((e) => e.distritais.media), L.distritais);
  const neg = m((e) => e.clubesNegativos);
  if (neg > L.clubesNegativos) falhas.push({ regra: "clubes com saldo negativo", valor: neg, esperado: `≤ ${L.clubesNegativos}` });
  return falhas;
}

export function formatarRelatorio(r: RelatorioCalibracao): string {
  const f = (n: number, d = 2) => n.toFixed(d);
  const linhas = [`Calibração — seed «${r.seed}», ${r.epocas.length} épocas, ${(r.ms / 1000).toFixed(0)} s`, "", "época | jogos | golos/jogo 1.ªL | casa% | emp% | ocup 1.ªL | lesões/jogo | CA/jogo | CV/jogo | rot. CP | distritais min-méd-máx | negativos"];
  for (const e of r.epocas) linhas.push([e.epoca, e.jogos, f(e.golosPorJogo.primeiraLiga), f(e.vitoriaCasa * 100, 0), f(e.empates * 100, 0), f(e.ocupacao.primeiraLiga * 100, 0) + "%", f(e.lesoesPorJogo, 3), f(e.amarelosPorJogo), f(e.vermelhosPorJogo, 3), f(e.rotatividadeCp * 100, 0) + "%", `${e.distritais.min}-${f(e.distritais.media, 1)}-${e.distritais.max}`, f(e.clubesNegativos * 100, 1) + "%"].join(" | "));
  linhas.push("", "Saldo mediano por escalão (€), por época:", "época | " + ESCALOES.join(" | "));
  for (const e of r.epocas) linhas.push([e.epoca, ...ESCALOES.map((x) => Math.round(e.saldoMediano[x]).toLocaleString("pt-PT"))].join(" | "));
  linhas.push("", "Golos por jogo por escalão (média das épocas): " + ESCALOES.map((x) => `${x} ${f(media(r.epocas.map((e) => e.golosPorJogo[x])))}`).join(", "));
  linhas.push("Ocupação por escalão (média): " + ESCALOES.map((x) => `${x} ${f(media(r.epocas.map((e) => e.ocupacao[x])) * 100, 0)}%`).join(", "));
  const falhas = avaliarCalibracao(r);
  linhas.push("", falhas.length ? "FORA DOS LIMITES:" : "Tudo dentro dos limites.", ...falhas.map((x) => `- ${x.regra}: ${f(x.valor, 3)} (esperado ${x.esperado})`));
  const avisos = [...new Set(r.epocas.flatMap((e) => e.avisos))];
  if (avisos.length) linhas.push("", "Avisos do motor:", ...avisos.map((a) => `- ${a}`));
  return linhas.join("\n");
}
