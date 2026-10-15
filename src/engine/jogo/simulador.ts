/**
 * Motor de jogo por oportunidades (RZ-104; docs/MOTOR_JOGO.md).
 *
 * Cada minuto é um passo independente: o seu fluxo aleatório vem de `jogo/<id>/m<minuto>`, por isso
 * `simularAte(45)` seguido de `simularAte(90)` dá exatamente o mesmo jogo que `simularAte(90)` (retomável),
 * e mudar a equipa a meio (`alterarEquipa`) só afeta os minutos seguintes.
 * Puro e determinístico: sem relógio, sem DOM, sem base de dados.
 */
import { Rng, limitar } from "../aleatorio/rng";
import type { Parametros } from "../config/parametros";
import { forcaEquipa, type ForcaEquipa } from "./equipa";
import { riscoPor90, sortearLesao } from "../lesoes/lesao";
import { TATICA_PADRAO, fadigaEm, multiplicadorFaltas } from "./formacoes";
import { outroLado, type EntradaJogo, type EquipaJogo, type EstatLado, type EventoJogo, type JogadorEmCampo, type Lado, type Origem, type ResumoJogo, type Tatica } from "./tipos";

const logit = (p: number): number => Math.log(p / (1 - p));
const sigmoide = (x: number): number => 1 / (1 + Math.exp(-x));

const novoLado = (): EstatLado => ({ golos: 0, oportunidades: 0, remates: 0, aBaliza: 0, bloqueados: 0, xg: 0, cantos: 0, faltas: 0, minutosPosse: 0, amarelos: 0, vermelhos: 0, lesoes: 0 });

function escolherPonderado<T>(rng: Rng, itens: readonly T[], peso: (x: T) => number): T {
  let total = 0;
  const pesos = itens.map((x) => {
    const w = Math.max(0, peso(x));
    total += w;
    return w;
  });
  if (total <= 0) return itens[rng.inteiro(0, itens.length - 1)] as T;
  let r = rng.float() * total;
  for (let i = 0; i < itens.length; i++) {
    r -= pesos[i] as number;
    if (r < 0) return itens[i] as T;
  }
  return itens[itens.length - 1] as T;
}

export class SimuladorJogo {
  readonly duracao: number;
  private readonly rng: Rng;
  private readonly p: Parametros["jogo"];
  private readonly params: Parametros;
  private equipas: Record<Lado, EquipaJogo>;
  private forcas: Record<Lado, ForcaEquipa>;
  /** Força em cada minuto: a base menos o cansaço (RZ-108). */
  private efetivas: Record<Lado, ForcaEquipa>;
  private ultimo = 0;
  /** Expulsos de cada lado: não voltam a jogar, nem com `alterarEquipa`. */
  private readonly expulsos: Record<Lado, Set<string>> = { casa: new Set(), fora: new Set() };
  /** Lesionados sem suplente: jogam menos um (penalização igual à de um expulso). */
  private readonly semSuplente: Record<Lado, number> = { casa: 0, fora: 0 };
  private readonly relvado: number;
  /** Quem se lesionou neste jogo não volta. */
  private readonly riscosBase: Record<Lado, number[] | undefined> = { casa: undefined, fora: undefined };
  private readonly lesionados: Record<Lado, Set<string>> = { casa: new Set(), fora: new Set() };
  private readonly amarelos: Record<Lado, Set<string>> = { casa: new Set(), fora: new Set() };
  private readonly stats: Record<Lado, EstatLado> = { casa: novoLado(), fora: novoLado() };

  constructor(entrada: EntradaJogo, params: Parametros) {
    this.p = params.jogo;
    this.params = params;
    this.relvado = entrada.relvado ?? 0.5;
    this.rng = new Rng(entrada.seed, `jogo/${entrada.id}`);
    const a = this.p.acrescimos;
    this.duracao = this.p.duracao + this.rng.derivar("acrescimos").inteiro(a.min, a.max);
    this.equipas = { casa: entrada.casa, fora: entrada.fora };
    this.forcas = { casa: this.calcularForca(entrada.casa), fora: this.calcularForca(entrada.fora) };
    this.efetivas = { casa: this.forcas.casa, fora: this.forcas.fora };
  }

  private calcularForca(eq: EquipaJogo): ForcaEquipa {
    return forcaEquipa(eq.onze, eq.tatica ?? TATICA_PADRAO, this.params);
  }
  private tatica(lado: Lado): Tatica {
    return this.equipas[lado].tatica ?? TATICA_PADRAO;
  }

  get minuto(): number {
    return this.ultimo;
  }
  get terminado(): boolean {
    return this.ultimo >= this.duracao;
  }

  /** Muda a equipa (substituições, tática…) a partir do minuto seguinte. */
  alterarEquipa(lado: Lado, equipa: EquipaJogo): void {
    const fora = (j: JogadorEmCampo) => this.expulsos[lado].has(j.id) || this.lesionados[lado].has(j.id);
    this.equipas[lado] = { ...equipa, onze: equipa.onze.filter((j) => !fora(j)), ...(equipa.banco ? { banco: equipa.banco.filter((j) => !fora(j)) } : {}) };
    this.forcas[lado] = this.calcularForca(this.equipas[lado]);
    this.riscosBase[lado] = undefined;
  }

  /** Simula até ao minuto indicado (inclusive) e devolve os eventos novos, por ordem. */
  simularAte(minuto: number): EventoJogo[] {
    const alvo = Math.min(Math.floor(minuto), this.duracao);
    const eventos: EventoJogo[] = [];
    while (this.ultimo < alvo) {
      this.ultimo++;
      this.passo(this.ultimo, eventos);
    }
    return eventos;
  }

  resumo(): ResumoJogo {
    const total = this.stats.casa.minutosPosse + this.stats.fora.minutosPosse;
    return {
      minuto: this.ultimo,
      duracao: this.duracao,
      terminado: this.terminado,
      casa: { ...this.stats.casa },
      fora: { ...this.stats.fora },
      posseCasa: total > 0 ? this.stats.casa.minutosPosse / total : 0.5,
    };
  }

  // ---------- um minuto
  /** Fração das oportunidades que cabe a `lado`: logística da diferença de controlo (com a vantagem da casa). */
  private quota(lado: Lado): number {
    const c = this.efetivas.casa.controlo + this.p.vantagemCasa - this.efetivas.fora.controlo;
    const casa = sigmoide(c / this.p.escalaControlo);
    return lado === "casa" ? casa : 1 - casa;
  }

  /** Força de cada lado neste minuto: base, cansaço, jogadores expulsos e estilos que reagem ao adversário. */
  private atualizarEfetivas(m: number): void {
    const pen = this.p.cartoes.penalizacaoExpulso;
    for (const lado of ["casa", "fora"] as const) {
      const f = fadigaEm(m, this.duracao, this.tatica(lado), this.params.tatica);
      const b = this.forcas[lado];
      const x = this.expulsos[lado].size + this.semSuplente[lado];
      this.efetivas[lado] = { ...b, ataque: b.ataque - f * 0.5 - pen.ataque * x, controlo: b.controlo - f - pen.controlo * x, defesa: b.defesa - f - pen.defesa * x };
    }
    // estilos que reagem ao adversário: o contra-ataque rende mais quanto mais bola o outro tem; o jogo direto explora linhas altas
    for (const lado of ["casa", "fora"] as const) {
      if (this.tatica(lado).estilo === "direto") {
        const e = this.efetivas[lado];
        this.efetivas[lado] = { ...e, ataque: e.ataque + this.params.tatica.diretoAtaquePorLinha * Math.max(0, this.tatica(outroLado(lado)).linha - 3) };
        continue;
      }
      if (this.tatica(lado).estilo !== "contraAtaque") continue;
      const c = this.params.tatica.contraAtaque;
      const falta = limitar(this.efetivas[outroLado(lado)].controlo - this.efetivas[lado].controlo, 0, c.max);
      const e = this.efetivas[lado];
      this.efetivas[lado] = { ...e, ataque: e.ataque + c.ataquePorPonto * falta, defesa: e.defesa + c.defesaPorPonto * falta };
    }
  }

  private passo(m: number, out: EventoJogo[]): void {
    const r = this.rng.derivar(`m${m}`);
    this.atualizarEfetivas(m);
    const ritmo = 1 + (this.params.tatica.ritmo.oportunidades * (this.tatica("casa").ritmo + this.tatica("fora").ritmo - 6)) / 2;
    this.stats[r.prob(this.quota("casa")) ? "casa" : "fora"].minutosPosse++;
    for (const lado of ["casa", "fora"] as const) {
      const lambda = (2 * this.p.oportunidadesPorEquipa * ritmo * this.quota(lado)) / this.duracao;
      if (r.prob(lambda)) this.oportunidade(r, m, lado, out);
    }
    for (const lado of ["casa", "fora"] as const) {
      if (r.prob((this.p.faltas.porEquipa * multiplicadorFaltas(this.tatica(lado), this.params.tatica)) / this.duracao)) this.falta(r, m, lado, out);
    }
    for (const lado of ["casa", "fora"] as const) this.possivelLesao(r, m, lado, out);
  }

  private diferenca(lado: Lado): number {
    return this.efetivas[lado].ataque - this.efetivas[outroLado(lado)].defesa;
  }

  private oportunidade(r: Rng, m: number, lado: Lado, out: EventoJogo[]): void {
    const eq = this.equipas[lado];
    this.stats[lado].oportunidades++;
    const d = this.diferenca(lado);
    const pRemate = sigmoide(logit(this.p.pRemateBase) + (this.p.sensibilidade.remate * d) / 10);
    if (!r.prob(pRemate)) {
      const condutor = escolherPonderado(r, eq.onze, (j) => this.p.pesoAssistencia[j.posicao] ?? 0);
      out.push({ tipo: "lance", minuto: m, lado, jogador: condutor.id });
      if (r.prob(this.p.cantos.pSeBloqueado)) this.canto(r, m, lado, out, 0);
      return;
    }
    const xg0 = this.p.xg.base + this.p.xg.amplitude * Math.pow(r.float(), this.p.xg.expoente);
    const xg = limitar(sigmoide(logit(limitar(xg0, 0.001, 0.999)) + (this.p.sensibilidade.xg * d) / 10), this.p.xg.min, this.p.xg.max);
    const finalizador = escolherPonderado(r, eq.onze, (j) => (this.p.pesoRemate[j.posicao] ?? 0) * Math.pow(j.atributos.finalizacao / 10, 2));
    const assistente = r.prob(this.p.pAssistido)
      ? escolherPonderado(
          r,
          eq.onze.filter((j) => j.id !== finalizador.id),
          (j) => (this.p.pesoAssistencia[j.posicao] ?? 0) * Math.pow((j.atributos.passe + j.atributos.visao + j.atributos.criatividade) / 15, 2),
        )
      : undefined;
    this.remate(r, m, lado, out, finalizador, assistente, xg, "jogada", 0);
  }

  /** Resolve um remate (já escolhido o finalizador e o xG) e o que dele nasce (canto). */
  private remate(r: Rng, m: number, lado: Lado, out: EventoJogo[], fin: JogadorEmCampo, ass: JogadorEmCampo | undefined, xg: number, origem: Origem, profundidade: number): void {
    const est = this.stats[lado];
    const adv = outroLado(lado);
    const gr = this.equipas[adv].onze.find((j) => j.posicao === "GK");
    const habilidade = origem === "penalti" ? fin.atributos.penaltis : origem === "canto" ? (fin.atributos.cabeceamento + fin.atributos.finalizacao) / 2 : fin.atributos.finalizacao;
    est.remates++;
    est.xg += xg;
    const base = { tipo: "remate" as const, minuto: m, lado, jogador: fin.id, ...(ass ? { assistente: ass.id } : {}), xg: Math.round(xg * 1000) / 1000, origem, ...(gr ? { guardaRedes: gr.id } : {}) };
    // bloqueado por um defesa (não há bloqueios em penáltis)
    if (origem !== "penalti" && r.prob(this.p.pBloqueado)) {
      est.bloqueados++;
      out.push({ ...base, resultado: "bloqueado" });
      if (r.prob(this.p.cantos.pSeBloqueado)) this.canto(r, m, lado, out, profundidade);
      return;
    }
    // o xG é a probabilidade de golo antes de bloqueios: depois de um remate não bloqueado vale xg/(1-pBloqueado)
    const pNaoBloq = origem === "penalti" ? 1 : 1 - this.p.pBloqueado;
    const pGolo = sigmoide(logit(limitar(xg / pNaoBloq, 0.001, 0.97)) + (this.p.peso.finalizacao * (habilidade * fin.forma - 10)) / 10 - (this.p.peso.guardaRedes * (this.efetivas[adv].guardaRedes - 10)) / 10);
    if (r.prob(pGolo)) {
      est.golos++;
      est.aBaliza++;
      out.push({ ...base, resultado: "golo" });
      return;
    }
    const pAlvo = Math.min(this.p.aBaliza.max, this.p.aBaliza.base + this.p.aBaliza.porXg * xg);
    const pDefendido = pAlvo > pGolo ? (pAlvo - pGolo) / (1 - pGolo) : 0;
    if (r.prob(pDefendido)) {
      est.aBaliza++;
      out.push({ ...base, resultado: "defendido" });
      if (r.prob(this.p.cantos.pSeDefendido)) this.canto(r, m, lado, out, profundidade);
    } else out.push({ ...base, resultado: "fora" });
  }

  /** Canto a favor de `lado`; pode dar um remate de cabeça (e, no máximo uma vez, outro canto). */
  private canto(r: Rng, m: number, lado: Lado, out: EventoJogo[], profundidade: number): void {
    const eq = this.equipas[lado];
    this.stats[lado].cantos++;
    out.push({ tipo: "canto", minuto: m, lado });
    if (profundidade >= 1 || !r.prob(this.p.cantos.pRemate * this.params.tatica.estilos[this.tatica(lado).estilo].cantoRemate)) return;
    const cabeceador = escolherPonderado(r, eq.onze, (j) => (this.p.pesoCabeceamento[j.posicao] ?? 0) * Math.pow((j.atributos.cabeceamento / 10) * (j.alturaCm / 178), 2));
    const marcador = eq.onze.filter((j) => j.posicao !== "GK").reduce((a, b) => (b.atributos.bolaParada + b.atributos.cruzamento > a.atributos.bolaParada + a.atributos.cruzamento ? b : a));
    const xg0 = this.p.xg.base + this.p.xg.amplitude * this.p.cantos.fatorXg * Math.pow(r.float(), this.p.xg.expoente);
    const xg = limitar(sigmoide(logit(limitar(xg0, 0.001, 0.999)) + (this.p.sensibilidade.xg * this.diferenca(lado)) / 10), this.p.xg.min, this.p.xg.max);
    this.remate(r, m, lado, out, cabeceador, marcador.id === cabeceador.id ? undefined : marcador, xg, "canto", profundidade + 1);
  }

  /** Risco de lesão neste minuto: soma dos riscos individuais; se acontece, escolhe-se quem, ponderado pelo risco. */
  private possivelLesao(r: Rng, m: number, lado: Lado, out: EventoJogo[]): void {
    const eq = this.equipas[lado];
    const t = this.tatica(lado);
    const fadiga = fadigaEm(m, this.duracao, t, this.params.tatica);
    // o cansaço multiplica o risco de todos por igual: calcula-se uma vez por equipa e muda-se só quando a equipa muda
    const base = (this.riscosBase[lado] ??= eq.onze.map(
      (j) =>
        riscoPor90({ forma: j.forma, aptidaoFisica: j.atributos.aptidaoFisica, relvado: this.relvado, medico: eq.medico ?? 10, fairPlayAdversario: this.tatica(outroLado(lado)).fairPlay, intensidade: t.intensidade, recaida: !!j.recaida }, this.params) / this.duracao,
    ));
    const fator = 1 + this.params.lesoes.risco.fadiga * fadiga;
    const riscos = base.map((x) => x * fator);
    const total = riscos.reduce((a, b) => a + b, 0);
    if (!r.prob(total)) return;
    let x = r.float() * total;
    let k = 0;
    for (; k < riscos.length - 1; k++) {
      x -= riscos[k] as number;
      if (x < 0) break;
    }
    const jogador = eq.onze[k] as JogadorEmCampo;
    const lesao = sortearLesao(r, this.params, { medico: eq.medico ?? 10, ...(jogador.recaida ? { recaida: jogador.recaida } : {}) });
    this.stats[lado].lesoes++;
    this.lesionados[lado].add(jogador.id);
    out.push({ tipo: "lesao", minuto: m, lado, jogador: jogador.id, lesao });
    // o suplente: mesma posição se houver; guarda-redes só por guarda-redes
    const banco = eq.banco ?? [];
    const entra =
      banco.find((b) => b.posicao === jogador.posicao) ??
      (jogador.posicao === "GK" ? undefined : banco.filter((b) => b.posicao !== "GK").reduce<JogadorEmCampo | undefined>((a, b) => (!a || b.atributos.finalizacao + b.atributos.desarme + b.atributos.passe > a.atributos.finalizacao + a.atributos.desarme + a.atributos.passe ? b : a), undefined));
    const onze = eq.onze.filter((j) => j.id !== jogador.id);
    if (entra) {
      onze.push({ ...entra, posicao: jogador.posicao });
      this.equipas[lado] = { ...eq, onze, banco: banco.filter((b) => b.id !== entra.id) };
      out.push({ tipo: "substituicao", minuto: m, lado, sai: jogador.id, entra: entra.id, motivo: "lesao" });
    } else {
      this.equipas[lado] = { ...eq, onze };
      this.semSuplente[lado]++;
    }
    this.forcas[lado] = this.calcularForca(this.equipas[lado]);
    this.riscosBase[lado] = undefined;
    this.atualizarEfetivas(m);
  }

  /** Cartão por uma falta: vermelho direto, amarelo (e vermelho se já tinha um). O expulso sai do jogo. */
  private cartao(r: Rng, m: number, lado: Lado, out: EventoJogo[], inf: JogadorEmCampo, penalti: boolean): void {
    const c = this.p.cartoes;
    const mult = (this.params.tatica.fairPlay.cartoes[this.tatica(lado).fairPlay - 1] as number) * ((inf.atributos.agressividade + 10) / 20);
    const pVermelho = Math.min(1, (penalti ? c.pVermelhoPenalti : c.pVermelhoDireto) * mult);
    const pAmarelo = Math.min(1, (penalti ? c.pAmareloPenalti : c.pAmarelo) * mult * (this.amarelos[lado].has(inf.id) ? c.jaAmarelo.cartao : 1));
    if (r.prob(pVermelho)) {
      this.expulsar(m, lado, out, inf, false);
    } else if (r.prob(pAmarelo)) {
      this.stats[lado].amarelos++;
      out.push({ tipo: "cartao", minuto: m, lado, jogador: inf.id, cor: "amarelo" });
      if (this.amarelos[lado].has(inf.id)) this.expulsar(m, lado, out, inf, true);
      else this.amarelos[lado].add(inf.id);
    }
  }

  private expulsar(m: number, lado: Lado, out: EventoJogo[], inf: JogadorEmCampo, segundoAmarelo: boolean): void {
    this.stats[lado].vermelhos++;
    out.push({ tipo: "cartao", minuto: m, lado, jogador: inf.id, cor: "vermelho", ...(segundoAmarelo ? { segundoAmarelo: true as const } : {}) });
    this.expulsos[lado].add(inf.id);
    this.equipas[lado] = { ...this.equipas[lado], onze: this.equipas[lado].onze.filter((j) => j.id !== inf.id) };
    this.forcas[lado] = this.calcularForca(this.equipas[lado]);
    this.riscosBase[lado] = undefined;
    this.atualizarEfetivas(m);
  }

  /** Falta de `lado`: pode dar penálti ou livre perigoso a favor do adversário. */
  private falta(r: Rng, m: number, lado: Lado, out: EventoJogo[]): void {
    const eq = this.equipas[lado];
    const adv = outroLado(lado);
    this.stats[lado].faltas++;
    const infrator = escolherPonderado(r, eq.onze, (j) => (j.posicao === "GK" ? 0.05 : 1) * (this.amarelos[lado].has(j.id) ? this.p.cartoes.jaAmarelo.falta : 1) * Math.pow((j.atributos.agressividade + 10) / 20, 2) * Math.sqrt(21 - j.atributos.desarme));
    const penalti = r.prob(this.p.penalti.pPorFalta);
    out.push({ tipo: "falta", minuto: m, lado, jogador: infrator.id, penalti });
    this.cartao(r, m, lado, out, infrator, penalti);
    if (penalti) {
      const cobrador = this.equipas[adv].onze.filter((j) => j.posicao !== "GK").reduce((a, b) => (b.atributos.penaltis * b.forma > a.atributos.penaltis * a.forma ? b : a));
      this.remate(r, m, adv, out, cobrador, undefined, this.p.penalti.xg, "penalti", 1);
    } else if (r.prob(this.p.faltas.pLivreRemate)) {
      const cobrador = escolherPonderado(r, this.equipas[adv].onze, (j) => Math.pow(j.atributos.bolaParada / 10, 3) * (j.posicao === "GK" ? 0 : 1));
      const xg = limitar(sigmoide(logit(0.05) + (this.p.sensibilidade.xg * this.diferenca(adv)) / 10), this.p.xg.min, this.p.xg.max);
      this.remate(r, m, adv, out, cobrador, undefined, xg, "livre", 1);
    }
  }
}

/** Joga o jogo todo de uma vez. */
export function simularJogo(entrada: EntradaJogo, params: Parametros): { eventos: EventoJogo[]; resumo: ResumoJogo } {
  const s = new SimuladorJogo(entrada, params);
  const eventos = s.simularAte(s.duracao);
  return { eventos, resumo: s.resumo() };
}
