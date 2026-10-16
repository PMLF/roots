/**
 * Notícias e caixa de entrada (RZ-118; docs/TOM_E_UX.md, docs/HISTORICO_EVENTOS.md §4). Tudo sai dos eventos públicos do
 * histórico — nada se grava à parte, por isso as notícias são sempre reconstruíveis. O motor devolve dados estruturados
 * (tipo, variante, valores, ligações); quem traduz e escreve a frase é a interface (pt-PT e inglês), com o tom realista da
 * imprensa desportiva. A variante escolhe-se pelo id do evento (estável: a mesma notícia lê-se sempre igual).
 */
import type { DadosBase } from "../dados/tipos";
import type { Repositorio } from "../persistencia/repositorio";
import type { Evento } from "../persistencia/tipos";
import type { Data } from "../persistencia/tipos";

export type TipoNoticia =
  | "hattrick" | "vermelho" | "expulsao_dois_amarelos" | "goleada" | "golo_reviravolta" | "golo_descontos" | "lesao_grave"
  | "campeao" | "subida" | "descida" | "localidade" | "cidade_evento"
  | "resultado" | "lesao" | "demissao" | "contratado";

export type LigacaoNoticia = { k: "clube" | "pessoa" | "localidade" | "competicao" | "cidade"; id: string; nome: string };

export type Noticia = {
  /** Id do evento que a originou. */
  id: number;
  data: Data;
  epoca: number;
  tipo: TipoNoticia;
  /** 1…VARIANTES[tipo]: qual das frases usar. */
  variante: number;
  valores: Record<string, string | number>;
  ligacoes: LigacaoNoticia[];
  /** Envolve o clube do gamer. */
  doTeuClube: boolean;
};

export type Mensagem = Noticia & { lida: boolean };

/** Quantas variantes de texto existem por tipo (a interface tem as frases `noticia.<tipo>.<n>.titulo|corpo`). */
export const VARIANTES: Record<TipoNoticia, number> = {
  hattrick: 2, vermelho: 2, expulsao_dois_amarelos: 2, goleada: 2, golo_reviravolta: 2, golo_descontos: 2, lesao_grave: 2,
  campeao: 2, subida: 2, descida: 2, localidade: 1, cidade_evento: 1, resultado: 2, lesao: 2, demissao: 1, contratado: 1,
};

/** Tipos de evento que dão notícia para toda a gente. */
const EVENTOS_NOTICIA = ["HATTRICK", "CARTAO_VERMELHO", "GOLEADA", "GOLO_NOTAVEL", "LESAO", "CAMPEAO", "SUBIDA", "DESCIDA", "LOCALIDADE_ESTATUTO", "CIDADE_EVENTO"] as const;
/** A caixa de entrada junta o que é pessoal: o resultado do teu jogo, qualquer lesão do teu plantel, a tua carreira. */
const EVENTOS_CAIXA = [...EVENTOS_NOTICIA, "JOGO_JOGADO", "GAMER_DEMISSAO", "GAMER_CONTRATADO"] as const;
/** Lesões a partir desta gravidade são notícia no mundo; no teu plantel, todas. */
const GRAVIDADE_NOTICIA = 4;

export type EscopoNoticias = "clube" | "liga" | "mundo";

type Contexto = {
  repo: Repositorio;
  dados: DadosBase;
  clube?: string;
  liga?: string;
  /** O gamer já não está no clube: só vê o que sai na imprensa (nada de resultados nem lesões internas). */
  externo?: boolean;
  nomeClube: (id: string) => string;
  nomePessoa: (id: string) => string;
};

const ESCALAO_DO_LOCAL: Record<string, string> = { primeira: "primeiraLiga", segunda: "segundaLiga", terceira: "terceiraLiga" };

/** Nome da divisão a partir do código de `movimentos.ts` (primeira, cp-A, distrital-Braga). */
export function nomeDoLocal(local: string, dados: DadosBase): string {
  if (local.startsWith("cp-")) return `CP Série ${local.slice(3)}`;
  if (local.startsWith("distrital-")) {
    const d = local.slice(10);
    return dados.clubes.find((c) => c.escalao === "distrital" && (c.distrito === d || c.liga.endsWith(d)))?.liga ?? `Distrital ${d}`;
  }
  const escalao = ESCALAO_DO_LOCAL[local];
  return dados.clubes.find((c) => c.escalao === escalao)?.liga ?? local;
}

const papel = (e: Evento, k: string, p?: string) => e.entidades.find((x) => x.k === k && (p === undefined || x.papel === p));

function construir(e: Evento, c: Contexto, soCaixa: boolean): Noticia | undefined {
  const clubes = e.entidades.filter((x) => x.k === "clube");
  const nosso = c.clube !== undefined && !c.externo && clubes.some((x) => x.id === c.clube);
  const base = (tipo: TipoNoticia, valores: Record<string, string | number>, ligacoes: LigacaoNoticia[]): Noticia => ({
    id: e.id, data: e.data, epoca: e.epoca, tipo, variante: (e.id % VARIANTES[tipo]) + 1, valores, ligacoes, doTeuClube: nosso,
  });
  const lc = (id: string): LigacaoNoticia => ({ k: "clube", id, nome: c.nomeClube(id) });
  const lp = (id: string): LigacaoNoticia => ({ k: "pessoa", id, nome: c.nomePessoa(id) });
  const d = e.dados as Record<string, unknown>;
  const num = (x: unknown) => (typeof x === "number" ? x : 0);
  const pessoa = e.entidades.find((x) => x.k === "pessoa");
  const clube = clubes[0];
  switch (e.tipo) {
    case "HATTRICK":
      return pessoa && clube ? base("hattrick", { jogador: c.nomePessoa(pessoa.id), clube: c.nomeClube(clube.id), golos: num(d.golos) }, [lp(pessoa.id), lc(clube.id)]) : undefined;
    case "CARTAO_VERMELHO": {
      if (!pessoa || !clube) return undefined;
      const tipo: TipoNoticia = d.segundoAmarelo ? "expulsao_dois_amarelos" : "vermelho";
      return base(tipo, { jogador: c.nomePessoa(pessoa.id), clube: c.nomeClube(clube.id), minuto: Math.floor(num(d.minuto)) }, [lp(pessoa.id), lc(clube.id)]);
    }
    case "GOLEADA": {
      const v = papel(e, "clube", "vencedor");
      const x = papel(e, "clube", "vencido");
      return v && x ? base("goleada", { vencedor: c.nomeClube(v.id), vencido: c.nomeClube(x.id), golosVencedor: num(d.golosVencedor), golosVencido: num(d.golosVencido) }, [lc(v.id), lc(x.id)]) : undefined;
    }
    case "GOLO_NOTAVEL": {
      if (!pessoa || !clube) return undefined;
      const tipo: TipoNoticia = d.motivo === "reviravolta" ? "golo_reviravolta" : "golo_descontos";
      return base(tipo, { jogador: c.nomePessoa(pessoa.id), clube: c.nomeClube(clube.id), minuto: Math.floor(num(d.minuto)), golosCasa: num(d.golosCasa), golosFora: num(d.golosFora) }, [lp(pessoa.id), lc(clube.id)]);
    }
    case "LESAO": {
      if (!pessoa || !clube) return undefined;
      const grave = num(d.gravidade) >= GRAVIDADE_NOTICIA;
      const tipo: TipoNoticia | undefined = soCaixa && nosso ? "lesao" : grave ? "lesao_grave" : undefined;
      if (!tipo) return undefined;
      return base(tipo, { jogador: c.nomePessoa(pessoa.id), clube: c.nomeClube(clube.id), dias: num(d.dias), gravidade: num(d.gravidade) }, [lp(pessoa.id), lc(clube.id)]);
    }
    case "CAMPEAO":
      return clube ? base("campeao", { clube: c.nomeClube(clube.id), liga: String(d.liga ?? "") }, [lc(clube.id)]) : undefined;
    case "SUBIDA": case "DESCIDA":
      return clube ? base(e.tipo === "SUBIDA" ? "subida" : "descida", { clube: c.nomeClube(clube.id), liga: nomeDoLocal(String(d.para ?? ""), c.dados) }, [lc(clube.id)]) : undefined;
    case "CIDADE_EVENTO": {
      const cidades = e.entidades.filter((x) => x.k === "cidade");
      if (cidades.length === 0) return undefined;
      const nomeCidade = (id: string) => c.dados.cidades.find((x) => x.id === id)?.nome ?? id;
      const regional = d.regional === true;
      const ligacoes = (regional ? cidades.slice(0, 4) : cidades).map((x): LigacaoNoticia => ({ k: "cidade" as const, id: x.id, nome: nomeCidade(x.id) }));
      return base("cidade_evento", { evento: String(d.evento ?? ""), cidade: regional ? String(d.polo ?? "") : nomeCidade(cidades[0]!.id), regional: regional ? 1 : 0 }, ligacoes);
    }
    case "LOCALIDADE_ESTATUTO": {
      const l = papel(e, "localidade");
      if (!l) return undefined;
      const nome = c.dados.localidades.find((x) => x.id === l.id)?.nome ?? l.id;
      return base("localidade", { localidade: nome, de: String(d.de ?? ""), para: String(d.para ?? "") }, [{ k: "localidade", id: l.id, nome }]);
    }
    case "JOGO_JOGADO": {
      if (!soCaixa || !nosso || !c.clube) return undefined;
      const casa = papel(e, "clube", "casa");
      const fora = papel(e, "clube", "fora");
      if (!casa || !fora) return undefined;
      const gc = num(d.golosCasa);
      const gf = num(d.golosFora);
      const meus = casa.id === c.clube ? gc : gf;
      const deles = casa.id === c.clube ? gf : gc;
      const competicao = papel(e, "competicao");
      return base("resultado", { casa: c.nomeClube(casa.id), fora: c.nomeClube(fora.id), golosCasa: gc, golosFora: gf, resultado: meus > deles ? "vitoria" : meus === deles ? "empate" : "derrota", competicao: competicao?.id ?? "" }, [lc(casa.id), lc(fora.id)]);
    }
    case "GAMER_DEMISSAO":
      return soCaixa && clube ? base("demissao", { clube: c.nomeClube(clube.id) }, [lc(clube.id)]) : undefined;
    case "GAMER_CONTRATADO":
      return soCaixa && clube ? base("contratado", { clube: c.nomeClube(clube.id) }, [lc(clube.id)]) : undefined;
    default:
      return undefined;
  }
}

function contexto(repo: Repositorio, dados: DadosBase): Contexto {
  const clube = repo.meta("clube.gamer") || undefined;
  const nomes = new Map(dados.clubes.map((x) => [x.id, x] as const));
  return {
    repo, dados,
    ...(clube ? { clube } : {}),
    ...(clube && nomes.get(clube) ? { liga: nomes.get(clube)!.liga } : {}),
    nomeClube: (id) => nomes.get(id)?.nome ?? id,
    nomePessoa: (id) => repo.pessoaPublica(id)?.nomeDesportivo ?? id,
  };
}

type Fonte = { clubes?: readonly string[] };

/** Os eventos mais recentes (de uns clubes, ou de todo o mundo), do mais novo para o mais velho, sem repetidos. */
function eventos(c: Contexto, tipos: readonly string[], fonte: Fonte, limite: number, antesDe: number | undefined, depoisDe: number | undefined): Evento[] {
  const filtro = { apenasPublicos: true as const, ...(antesDe !== undefined ? { antesDe } : {}), ...(depoisDe !== undefined ? { depoisDe } : {}) };
  if (!fonte.clubes) return c.repo.eventosRecentes({ tipos, ...filtro, limite });
  const porId = new Map<number, Evento>();
  for (const id of fonte.clubes) for (const e of c.repo.eventosDe({ k: "clube", id }, { ...filtro, limite })) if (tipos.includes(e.tipo)) porId.set(e.id, e);
  return [...porId.values()].sort((a, b) => b.id - a.id).slice(0, limite);
}

/** Notícias a partir dos eventos, até `limite`: lê em lotes até chegar (ou acabarem os eventos). */
function recolher(c: Contexto, tipos: readonly string[], soCaixa: boolean, limite: number, antesDe: number | undefined, aceita: (n: Noticia) => boolean, fonte: Fonte = {}, depoisDe?: number): Noticia[] {
  const out: Noticia[] = [];
  let corte = antesDe;
  for (let rondas = 0; rondas < 40 && out.length < limite; rondas++) {
    const lote = eventos(c, tipos, fonte, 100, corte, depoisDe);
    if (lote.length === 0) break;
    for (const e of lote) {
      const n = construir(e, c, soCaixa);
      if (n && aceita(n)) { out.push(n); if (out.length >= limite) break; }
    }
    corte = lote[lote.length - 1]!.id;
  }
  return out;
}

/** Notícias do clube do gamer, da liga dele ou do mundo todo. Mais recentes primeiro. */
export function noticias(repo: Repositorio, dados: DadosBase, opcoes: { escopo: EscopoNoticias; limite?: number; antesDe?: number }): Noticia[] {
  const c = contexto(repo, dados);
  const limite = opcoes.limite ?? 30;
  const ligaDe = new Map(dados.clubes.map((x) => [x.id, x.liga] as const));
  const naLiga = (n: Noticia) => n.ligacoes.some((l) => l.k === "clube" && ligaDe.get(l.id) === c.liga);
  const aceita = (n: Noticia) => opcoes.escopo === "mundo" || (opcoes.escopo === "clube" ? n.doTeuClube : c.liga !== undefined && (n.doTeuClube || naLiga(n)));
  const clubes = opcoes.escopo === "mundo" ? undefined : opcoes.escopo === "clube" ? (c.clube ? [c.clube] : []) : dados.clubes.filter((x) => x.liga === c.liga).map((x) => x.id);
  if (clubes && (clubes.length === 0)) return [];
  return recolher(c, EVENTOS_NOTICIA, false, limite, opcoes.antesDe, aceita, clubes ? { clubes } : {});
}

/** Caixa de entrada: o que se passou com o teu clube e contigo. */
export function caixa(repo: Repositorio, dados: DadosBase, opcoes: { limite?: number; antesDe?: number } = {}): { mensagens: Mensagem[]; naoLidas: number } {
  const c = contexto(repo, dados);
  if (!c.clube && !repo.meta("gamer.anterior")) return { mensagens: [], naoLidas: 0 };
  const lida = Number(repo.meta("caixa.lida") ?? 0);
  const ex = excecoesDaCaixa(repo);
  const estaLida = (id: number) => (ex.lidas.has(id) ? true : ex.naoLidas.has(id) ? false : id <= lida);
  // sem clube (demitido): a tua carreira e só o que a imprensa conta do clube que deixaste (sem pormenores internos)
  const alvo = c.clube ?? repo.meta("gamer.anterior");
  const externo = alvo !== undefined && alvo !== c.clube;
  const cx: Contexto = externo ? { ...c, clube: alvo, externo: true } : c;
  const aceita = externo ? (n: Noticia) => n.ligacoes.some((l) => l.k === "clube" && l.id === alvo) : (n: Noticia) => n.doTeuClube;
  const fonte = { clubes: alvo ? [alvo] : [] };
  const todas = recolher(cx, EVENTOS_CAIXA, true, opcoes.limite ?? 40, opcoes.antesDe, aceita, fonte);
  const mensagens = todas.map((n): Mensagem => ({ ...n, lida: estaLida(n.id) }));
  const novas = recolher(cx, EVENTOS_CAIXA, true, 99, undefined, aceita, fonte, lida).filter((n) => !ex.lidas.has(n.id)).length;
  const naoLidas = novas + [...ex.naoLidas].filter((id) => id <= lida).length;
  return { mensagens, naoLidas };
}

/** Exceções ao «tudo até ao último evento lido»: mensagens que o gamer marcou à mão como lidas ou por ler. */
function excecoesDaCaixa(repo: Repositorio): { lidas: Set<number>; naoLidas: Set<number> } {
  try {
    const x = JSON.parse(repo.meta("caixa.excecoes") || "{}") as { lidas?: number[]; naoLidas?: number[] };
    return { lidas: new Set(x.lidas ?? []), naoLidas: new Set(x.naoLidas ?? []) };
  } catch {
    return { lidas: new Set(), naoLidas: new Set() };
  }
}

/** Marca tudo como lido (até ao último evento) e esquece as marcas individuais. */
export function marcarCaixaLida(repo: Repositorio): void {
  repo.definirMeta("caixa.lida", String(repo.totalEventos()));
  repo.definirMeta("caixa.excecoes", "");
}

/** Marca uma mensagem como lida ou por ler (RZ-167). */
export function marcarMensagem(repo: Repositorio, id: number, lida: boolean): void {
  const ex = excecoesDaCaixa(repo);
  ex.lidas.delete(id);
  ex.naoLidas.delete(id);
  const marca = Number(repo.meta("caixa.lida") ?? 0);
  // só é exceção se contrariar a marca-d'água
  if (lida && id > marca) ex.lidas.add(id);
  if (!lida && id <= marca) ex.naoLidas.add(id);
  repo.definirMeta("caixa.excecoes", JSON.stringify({ lidas: [...ex.lidas], naoLidas: [...ex.naoLidas] }));
}
