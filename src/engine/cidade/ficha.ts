/** Ficha pública de uma cidade (RZ-133): converte o estado verdadeiro em níveis em palavras e tendências. */
import type { FichaCidadeDados, NivelCidadeVista } from "../api/contratos";
import type { Parametros } from "../config/parametros";
import type { DadosBase } from "../dados/tipos";
import { nomeDaEpoca } from "../calendario/nomeEpoca";
import type { Repositorio } from "../persistencia/repositorio";
import type { Vista } from "../vista/vista";
import { historicoDaCidade } from "./cidades";
import { INDICADORES, nivelDe, tendenciaDe } from "./estado";

/** Atitude da Câmara perante o desporto (1-10 nos dados) em cinco níveis. */
const nivelApoio = (v: number): NivelCidadeVista => (v <= 2 ? 1 : v <= 4 ? 2 : v <= 6 ? 3 : v <= 8 ? 4 : 5);

/** Quintil do valor entre todos (1 = os 20 % mais baixos). */
const quintil = (valor: number, todos: readonly number[]): NivelCidadeVista => {
  const abaixo = todos.filter((x) => x < valor).length;
  return (Math.min(4, Math.floor((abaixo / Math.max(1, todos.length)) * 5)) + 1) as NivelCidadeVista;
};

export function fichaCidade(repo: Repositorio, dados: DadosBase, base: DadosBase, params: Parametros, vista: Vista, id: string): FichaCidadeDados | null {
  const c = base.cidades.find((x) => x.id === id);
  if (!c) return null;
  const hist = historicoDaCidade(repo, base, params, id);
  const agora = hist[hist.length - 1]!;
  const antes = hist[hist.length - 2];
  const rotulo = (epoca: number) => nomeDaEpoca(epoca, params.calendario.anoInicial);

  const perCapita = (x: { orcamentoMunicipal: number; populacao: number }) => x.orcamentoMunicipal / Math.max(1, x.populacao);
  const autarca = vista.cargos({ cidade: id }).find((p) => p.funcao === "autarca");
  const { vaidade, ambicao } = c.autarca.tracos;
  const perfil: NonNullable<FichaCidadeDados["autarca"]>["perfil"] = [];
  if (vaidade >= 15) perfil.push("vaidoso"); else if (vaidade <= 6) perfil.push("discreto");
  if (ambicao >= 15) perfil.push("ambicioso");
  // mandato fixo no MVP: as eleições autárquicas (RZ-308) ainda não mudam o autarca
  const desde = params.cidade.mandatoDesde;

  return {
    id: c.id, nome: c.nome, distrito: c.distrito, polo: c.polo, ilha: c.ilha, setor: c.setor, setorSecundario: c.tag2,
    populacao: agora.estado.populacao,
    populacaoHistorico: hist.map((h) => ({ epoca: h.epoca, label: rotulo(h.epoca), populacao: h.estado.populacao })),
    indicadores: INDICADORES.map((i) => ({
      id: i,
      nivel: nivelDe(agora.estado[i], params),
      tendencia: tendenciaDe(antes?.estado[i], agora.estado[i], params),
      historico: hist.map((h) => ({ epoca: h.epoca, label: rotulo(h.epoca), nivel: nivelDe(h.estado[i], params) })),
    })),
    orcamento: quintil(perCapita({ orcamentoMunicipal: c.orcamentoMunicipal, populacao: agora.estado.populacao }), base.cidades.map(perCapita)),
    ...(autarca
      ? { autarca: { pessoa: { k: "pessoa" as const, id: autarca.id, nome: autarca.nomeDesportivo }, mandatoDesde: desde, mandatoAte: desde + params.cidade.eleicoesAutarquicasAnos, apoioDesporto: nivelApoio(c.autarca.apoioDesporto), perfil } }
      : {}),
    localidades: base.localidades
      .filter((l) => l.cidade === id)
      .map((l) => {
        const reg = repo.localidade(l.id);
        return { ref: { k: "localidade" as const, id: l.id, nome: l.nome }, estatuto: reg?.estatuto ?? l.estatuto, populacao: reg?.populacao ?? l.populacao };
      }),
    clubes: dados.clubes
      .filter((x) => x.cidade === id)
      .map((x) => ({ ref: { k: "clube" as const, id: x.id, nome: x.nome }, liga: x.liga, escalao: x.escalao, estadio: { nome: x.estadio.nome, capacidade: x.estadio.capacidade, propriedade: x.estadio.propriedade } })),
    acontecimentos: repo
      .eventosDe({ k: "cidade", id }, { tipo: "CIDADE_EVENTO", apenasPublicos: true, limite: 10 })
      .map((e) => ({ data: e.data, epoca: e.epoca, label: rotulo(e.epoca), tipo: String(e.dados.evento), regional: e.dados.regional === true, ...(typeof e.dados.polo === "string" ? { polo: e.dados.polo } : {}) })),
  };
}
