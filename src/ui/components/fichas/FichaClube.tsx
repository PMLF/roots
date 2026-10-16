"use client";
import { useState } from "react";
import type { FichaClubeDados } from "@/engine/api/contratos";
import type { PessoaVista } from "@/engine/vista/tipos";
import { Chip } from "@/ui/components/Atributos";
import { AmostraClube } from "@/ui/components/AmostraClube";
import { Cartao, Dados, Topo } from "@/ui/components/Cartao";
import { Ficha } from "@/ui/components/Ficha";
import { GraficoDivisoes } from "@/ui/components/GraficoDivisoes";
import { Ligacao } from "@/ui/components/Ligacao";
import { OrcamentoClube } from "@/ui/components/fichas/OrcamentoClube";
import { Tabela } from "@/ui/components/Tabela";
import { Valor } from "@/ui/components/Valor";
import type { Chave } from "@/ui/i18n";
import { useT } from "@/ui/i18n/LocaleProvider";
import { siglaPosicao } from "@/ui/i18n/posicao";
import type { Coluna } from "@/ui/tabela/logica";
import { usePaises } from "@/ui/usePaises";
import { mostrarEstimativa } from "@/ui/valor";

/** Barra 0-100 (qualidade de um aspeto do estádio). */
function Barra({ valor }: { valor: number }) {
  return (
    <span className="barra-medida" title={`${valor}/100`}>
      <span style={{ width: `${Math.max(0, Math.min(100, valor))}%` }} />
    </span>
  );
}

export function FichaClube({ d, verTudo, soPlantel = false }: { d: FichaClubeDados; verTudo: boolean; soPlantel?: boolean }) {
  const { t, locale } = useT();
  const pais = usePaises();
  const n = new Intl.NumberFormat(locale);
  const eur = new Intl.NumberFormat(locale, { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  const desconhecido = <span className="valor-estimado" title={t("pessoa.desconhecido")}>?</span>;
  const verdade = verTudo ? d.verdade : undefined;
  const nome = (p: PessoaVista) => <Ligacao k="pessoa" id={p.id}>{p.nomeDesportivo}</Ligacao>;
  const presidente = d.cargos.find((c) => c.funcao === "presidente");
  const equipaTecnica = d.cargos.filter((c) => c.funcao !== "presidente");
  const nivelDe = (p: PessoaVista) => d.plantelExtra[p.id]?.nivel;
  const nivelCelula = (p: PessoaVista) => {
    const v = nivelDe(p);
    return v ? (v.exato ? <b>{v.valor}</b> : <Valor v={mostrarEstimativa({ valor: v.valor, margem: v.margem, intervalo: [v.valor - v.margem, v.valor + v.margem] })} />) : desconhecido;
  };

  const plantel: Coluna<PessoaVista>[] = [
    { id: "name", titulo: t("coluna.nome"), valor: (p) => p.nomeDesportivo },
    { id: "pos", titulo: t("coluna.posicao"), valor: (p) => siglaPosicao(t, p.jogador?.posicao ?? "") },
    { id: "age", titulo: t("coluna.idade"), valor: (p) => p.idade, numerica: true },
    { id: "level", titulo: t("coluna.nivel"), valor: (p) => nivelDe(p)?.valor ?? "", numerica: true },
    { id: "country", titulo: t("coluna.pais"), valor: (p) => pais(p.nacionalidade) },
    { id: "foot", titulo: t("coluna.pe"), valor: (p) => (p.jogador ? t(`pe.${p.jogador.pe}` as Chave) : "") },
    { id: "height", titulo: t("coluna.altura"), valor: (p) => p.jogador?.alturaCm ?? 0, numerica: true },
    { id: "weight", titulo: t("coluna.peso"), valor: (p) => p.jogador?.pesoKg ?? 0, numerica: true },
    { id: "contract", titulo: t("coluna.contrato"), valor: (p) => d.plantelExtra[p.id]?.contratoFim ?? "" },
    { id: "status", titulo: t("coluna.estado"), valor: (p) => (p.jogador ? t(`estado.${p.jogador.estado}` as Chave) : "") },
  ];
  // estatísticas da época atual (RZ-175); o xG por jogador não se guarda
  const ep = (p: PessoaVista) => d.epoca?.players[p.id];
  const dec = (v: number, c = 1) => v.toFixed(c);
  const g90 = (p: PessoaVista) => { const e = ep(p); return e && e.minutes > 0 ? (e.goals * 90) / e.minutes : 0; };
  const numC = (id: string, titulo: Chave, valor: (p: PessoaVista) => number): Coluna<PessoaVista> => ({ id, titulo: t(titulo), valor, numerica: true });
  const base = plantel.filter((c) => ["name", "pos"].includes(c.id));
  const colEpoca: Coluna<PessoaVista>[] = [
    ...base,
    numC("games", "coluna.jogos", (p) => ep(p)?.games ?? 0),
    numC("minutes", "coluna.minutos", (p) => ep(p)?.minutes ?? 0),
    numC("goals", "coluna.golos", (p) => ep(p)?.goals ?? 0),
    numC("assists", "coluna.assistencias", (p) => ep(p)?.assists ?? 0),
    numC("ga", "coluna.ga", (p) => (ep(p)?.goals ?? 0) + (ep(p)?.assists ?? 0)),
    numC("g90", "coluna.golos90", g90),
    numC("rating", "coluna.nota", (p) => ep(p)?.rating ?? 0),
    numC("yellow", "coluna.amarelos", (p) => ep(p)?.yellow ?? 0),
    numC("red", "coluna.vermelhos", (p) => ep(p)?.red ?? 0),
  ];
  const colDisciplina: Coluna<PessoaVista>[] = [
    ...base,
    numC("games", "coluna.jogos", (p) => ep(p)?.games ?? 0),
    numC("minutes", "coluna.minutos", (p) => ep(p)?.minutes ?? 0),
    numC("mpg", "coluna.minPorJogo", (p) => { const e = ep(p); return e && e.games ? Math.round(e.minutes / e.games) : 0; }),
    numC("yellow", "coluna.amarelos", (p) => ep(p)?.yellow ?? 0),
    numC("red", "coluna.vermelhos", (p) => ep(p)?.red ?? 0),
    { id: "status", titulo: t("coluna.estado"), valor: (p) => (p.jogador ? t(`estado.${p.jogador.estado}` as Chave) : "") },
  ];
  const [vista, setVista] = useState<"perfil" | "epoca" | "disciplina">("perfil");
  const colunasVista = vista === "epoca" ? colEpoca : vista === "disciplina" ? colDisciplina : plantel;
  const celulaEpoca = {
    name: nome, level: nivelCelula,
    rating: (p: PessoaVista) => (ep(p)?.rating !== undefined ? dec(ep(p)?.rating ?? 0, 2) : "—"),
    g90: (p: PessoaVista) => (ep(p)?.minutes ? dec(g90(p), 2) : "—"),
  };
  const tabelaPlantel = (
    <>
      <label className="vista-plantel">
        <span>{t("plantel.vista")}</span>
        <select value={vista} onChange={(e) => setVista(e.target.value as typeof vista)} data-testid="plantel-vista">
          <option value="perfil">{t("plantel.vista.perfil")}</option>
          <option value="epoca">{t("plantel.vista.epoca")}</option>
          <option value="disciplina">{t("plantel.vista.disciplina")}</option>
        </select>
      </label>
      <Tabela key={vista} id={`plantel-${vista}`} nomeFicheiro={`plantel-${vista}-${d.id}`} colunas={colunasVista} linhas={d.plantel} chave={(p) => p.id} celula={celulaEpoca} ordemInicial={vista === "perfil" ? { coluna: "pos", direcao: "asc" } : { coluna: vista === "epoca" ? "ga" : "minutes", direcao: "desc" }} />
    </>
  );
  const tp = d.epoca?.tops;
  const linhaTop = (rot: Chave, x: { player: string; name: string; value: number } | undefined, fmt: (v: number) => string = String) =>
    x ? [{ rotulo: t(rot), valor: <><Ligacao k="pessoa" id={x.player}>{x.name}</Ligacao> <b>{fmt(x.value)}</b></> }] : [];
  const topsClube = (
    <Cartao titulo={t("cartao.topsClube")}>
      {tp && Object.keys(tp).length > 0 ? (
        <Dados linhas={[
          ...linhaTop("tops.marcador", tp.scorer), ...linhaTop("tops.assistente", tp.assister), ...linhaTop("tops.ga", tp.goalsAndAssists),
          ...linhaTop("tops.nota", tp.rating, (v) => dec(v, 2)), ...linhaTop("tops.jogos", tp.games), ...linhaTop("tops.minutos", tp.minutes),
          ...linhaTop("tops.amarelos", tp.yellow), ...linhaTop("tops.vermelhos", tp.red),
        ]} />
      ) : (
        <p className="vazio">{t("tops.vazio")}</p>
      )}
    </Cartao>
  );
  const eq = d.epoca?.team;
  const epocaClube = eq ? (
    <Cartao titulo={t("cartao.epocaClube", { epoca: d.epoca?.seasonLabel ?? "" })}>
      <Dados linhas={[
        { rotulo: t("epoca.posicao"), valor: <b>{eq.position}º</b> },
        { rotulo: t("epoca.jogos"), valor: eq.played },
        { rotulo: t("epoca.vde"), valor: `${eq.won} / ${eq.drawn} / ${eq.lost}` },
        { rotulo: t("epoca.golos"), valor: `${eq.goalsFor} / ${eq.goalsAgainst}` },
        { rotulo: t("epoca.pontos"), valor: <b>{eq.points}</b> },
      ]} />
    </Cartao>
  ) : null;
  const staff: Coluna<PessoaVista>[] = [
    { id: "name", titulo: t("coluna.nome"), valor: (p) => p.nomeDesportivo },
    { id: "role", titulo: t("coluna.funcao"), valor: (p) => (p.funcao ? t(`funcao.${p.funcao}` as Chave) : "") },
    { id: "age", titulo: t("coluna.idade"), valor: (p) => p.idade, numerica: true },
    { id: "country", titulo: t("coluna.pais"), valor: (p) => pais(p.nacionalidade) },
    { id: "quality", titulo: t("coluna.qualidade"), valor: (p) => { const q = verdade?.qualidadeStaff[p.id]; return q ? Object.entries(q).map(([k, v]) => `${t(`qualidade.${k}` as Chave)} ${v}`).join(" · ") : "?"; } },
  ];

  // plantel em números
  const idades = d.plantel.map((p) => p.idade);
  const idadeMedia = idades.length ? (idades.reduce((s, x) => s + x, 0) / idades.length).toFixed(1) : undefined;
  const estrangeiros = d.plantel.filter((p) => p.nacionalidade !== "pt").length;
  const guardaRedes = d.plantel.filter((p) => p.jogador?.posicao === "GK").length;
  const niveis = d.plantel.map((p) => nivelDe(p)?.valor).filter((v): v is number => v !== undefined);
  const nivelMedio = niveis.length === d.plantel.length && niveis.length > 0 ? (niveis.reduce((s, x) => s + x, 0) / niveis.length).toFixed(1) : undefined;

  const dimensao = t(`reputacao.nivel.${d.nivelReputacao}` as Chave);
  const etiquetas = (
    <>
      <Chip>{dimensao}</Chip>
      <Chip tom="destaque"><Ligacao k="competicao" id={d.liga}>{d.liga}</Ligacao>{d.epoca?.team ? ` · ${t("clube.lugar", { n: d.epoca.team.position })}` : ""}</Chip>
      <Chip tom="suave">{d.distrito}</Chip>
    </>
  );
  const identidade = (
    <Dados
      linhas={[
        { rotulo: t("clube.localidade"), valor: <><Ligacao k="localidade" id={d.localidade.id}>{d.localidade.nome}</Ligacao> <span className="suave">({t(`estatuto.${d.localidade.estatuto}` as Chave).toLowerCase()})</span></> },
        { rotulo: t("clube.concelho"), valor: <Ligacao k="cidade" id={d.cidade.id}>{d.cidade.nome}</Ligacao> },
        { rotulo: t("clube.alcunha"), valor: `${d.alcunha} · ${d.mascote}` },
        ...(presidente ? [{ rotulo: t("clube.presidente"), valor: nome(presidente) }] : []),
        ...(d.rival ? [{ rotulo: t("clube.rival"), valor: <Ligacao k="clube" id={d.rival.id}>{d.rival.nome}</Ligacao> }] : []),
        { rotulo: t("clube.fundacao"), valor: desconhecido },
      ]}
    />
  );

  const e = d.estadioDetalhe;
  const resumo = (
    <div className="cartoes">
      <Cartao titulo={t("cartao.dimensao")}>
        <Dados
          linhas={[
            { rotulo: t("clube.dimensao"), valor: <b>{dimensao}</b> },
            { rotulo: t("clube.divisao"), valor: t(`escalao.${d.escalao}` as Chave) },
            { rotulo: t("clube.adeptos"), valor: desconhecido },
            { rotulo: t("clube.socios"), valor: desconhecido },
            ...(verdade ? [{ rotulo: t("dev.reputacao"), valor: n.format(verdade.reputacao) }] : []),
          ]}
        />
      </Cartao>
      <Cartao titulo={t("cartao.financas")}>
        <Dados
          linhas={[
            { rotulo: t("financas.estado"), valor: <span title={d.financas.exato ? undefined : t("financas.estimativa")}>{t(`financas.estado.${d.financas.estado}` as Chave)}{d.financas.exato ? "" : " ~"}</span> },
            ...(d.financas.saldo !== undefined ? [{ rotulo: t("financas.saldo"), valor: eur.format(d.financas.saldo) }] : []),
            ...(d.financas.ultimoFecho ? [
              { rotulo: t("financas.receitasMes"), valor: eur.format(d.financas.ultimoFecho.receitas) },
              { rotulo: t("financas.despesasMes"), valor: eur.format(-d.financas.ultimoFecho.despesas) },
            ] : []),
            ...(d.financas.exato ? [] : [
              { rotulo: t("clube.orcamento"), valor: desconhecido },
              { rotulo: t("clube.massaSalarial"), valor: desconhecido },
              { rotulo: t("clube.patrocinios"), valor: desconhecido },
            ]),
          ]}
        />
        {d.financas.orcamento && d.financas.saldo !== undefined && <OrcamentoClube inicial={d.financas.orcamento} saldo={d.financas.saldo} />}
      </Cartao>
      {epocaClube}
      {topsClube}
      <Cartao titulo={t("cartao.plantelNumeros")}>
        <Dados
          linhas={[
            { rotulo: t("clube.plantel"), valor: d.plantel.length },
            { rotulo: t("plantel.idadeMedia"), valor: idadeMedia ?? "—" },
            { rotulo: t("plantel.estrangeiros"), valor: d.plantel.length ? `${estrangeiros} (${Math.round((estrangeiros / d.plantel.length) * 100)}%)` : "—" },
            { rotulo: t("plantel.guardaRedes"), valor: guardaRedes },
            { rotulo: t("plantel.nivelMedio"), valor: nivelMedio ?? desconhecido },
            { rotulo: t("plantel.lesionados"), valor: desconhecido },
          ]}
        />
      </Cartao>
      <Cartao titulo={t("cartao.estadio")}>
        <Dados
          linhas={[
            { rotulo: d.estadio.nome, valor: `${n.format(d.estadio.capacidade)} ${t("estadio.lugares")}` },
            { rotulo: t("estadio.propriedade"), valor: t(`propriedade.${e.propriedade}` as Chave) },
            { rotulo: t("estadio.distancia"), valor: t("estadio.km", { n: e.distanciaCentroKm }) },
            { rotulo: t("estadio.transportes"), valor: <Barra valor={e.transportes} /> },
            { rotulo: t("estadio.acesso"), valor: <Barra valor={e.acessoRodoviario} /> },
            { rotulo: t("estadio.estacionamento"), valor: <Barra valor={e.estacionamento} /> },
            { rotulo: t("estadio.expansao"), valor: <Barra valor={e.terrenoExpansao} /> },
          ]}
        />
      </Cartao>
      <Cartao titulo={t("cartao.equipaTecnica")}>
        {equipaTecnica.length === 0 ? (
          <p className="vazio">{t("clube.semStaff")}</p>
        ) : (
          <Dados linhas={equipaTecnica.map((p) => ({ rotulo: t(`funcao.${p.funcao}` as Chave), valor: nome(p) }))} />
        )}
      </Cartao>
      <Cartao titulo={t("cartao.divisoes")} larga>
        <GraficoDivisoes pontos={d.historicoDivisoes} />
      </Cartao>
    </div>
  );

  if (soPlantel) {
    return d.plantel.length > 0 ? (
      tabelaPlantel
    ) : (
      <p className="vazio">{t("clube.semMundo")}</p>
    );
  }

  return (
    <Ficha
      tipo="clube"
      titulo={d.nome}
      topo={<Topo titulo={d.nome} emblema={<AmostraClube cores={d.cores} className="amostra-titulo" />} etiquetas={etiquetas} cartao={identidade} />}
      separadores={{
        resumo,
        plantel: d.plantel.length > 0 ? (
          tabelaPlantel
        ) : (
          <p className="vazio">{t("clube.semMundo")}</p>
        ),
        staff: d.cargos.length > 0 ? (
          <Tabela id="staff" nomeFicheiro={`staff-${d.id}`} colunas={staff} linhas={d.cargos} chave={(p) => p.id} celula={{ name: nome }} />
        ) : (
          <p className="vazio">{t("clube.semMundo")}</p>
        ),
      }}
    />
  );
}
