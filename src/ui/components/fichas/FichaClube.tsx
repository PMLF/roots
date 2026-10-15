"use client";
import type { FichaClubeDados } from "@/engine/api/contratos";
import type { PessoaVista } from "@/engine/vista/tipos";
import { Chip } from "@/ui/components/Atributos";
import { Cartao, Dados, Topo } from "@/ui/components/Cartao";
import { Ficha } from "@/ui/components/Ficha";
import { GraficoDivisoes } from "@/ui/components/GraficoDivisoes";
import { Ligacao } from "@/ui/components/Ligacao";
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

export function FichaClube({ d, verTudo }: { d: FichaClubeDados; verTudo: boolean }) {
  const { t, locale } = useT();
  const pais = usePaises();
  const n = new Intl.NumberFormat(locale);
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
    { id: "nome", titulo: t("coluna.nome"), valor: (p) => p.nomeDesportivo },
    { id: "pos", titulo: t("coluna.posicao"), valor: (p) => siglaPosicao(t, p.jogador?.posicao ?? "") },
    { id: "idade", titulo: t("coluna.idade"), valor: (p) => p.idade, numerica: true },
    { id: "nivel", titulo: t("coluna.nivel"), valor: (p) => nivelDe(p)?.valor ?? "", numerica: true },
    { id: "pais", titulo: t("coluna.pais"), valor: (p) => pais(p.nacionalidade) },
    { id: "pe", titulo: t("coluna.pe"), valor: (p) => (p.jogador ? t(`pe.${p.jogador.pe}` as Chave) : "") },
    { id: "altura", titulo: t("coluna.altura"), valor: (p) => p.jogador?.alturaCm ?? 0, numerica: true },
    { id: "peso", titulo: t("coluna.peso"), valor: (p) => p.jogador?.pesoKg ?? 0, numerica: true },
    { id: "contrato", titulo: t("coluna.contrato"), valor: (p) => d.plantelExtra[p.id]?.contratoFim ?? "" },
    { id: "estado", titulo: t("coluna.estado"), valor: (p) => (p.jogador ? t(`estado.${p.jogador.estado}` as Chave) : "") },
  ];
  const staff: Coluna<PessoaVista>[] = [
    { id: "nome", titulo: t("coluna.nome"), valor: (p) => p.nomeDesportivo },
    { id: "funcao", titulo: t("coluna.funcao"), valor: (p) => (p.funcao ? t(`funcao.${p.funcao}` as Chave) : "") },
    { id: "idade", titulo: t("coluna.idade"), valor: (p) => p.idade, numerica: true },
    { id: "pais", titulo: t("coluna.pais"), valor: (p) => pais(p.nacionalidade) },
    { id: "qualidade", titulo: t("coluna.qualidade"), valor: (p) => { const q = verdade?.qualidadeStaff[p.id]; return q ? Object.entries(q).map(([k, v]) => `${t(`qualidade.${k}` as Chave)} ${v}`).join(" · ") : "?"; } },
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
      <Chip tom="destaque">{dimensao}</Chip>
      <Chip>{d.liga}</Chip>
      <Chip tom="suave">{d.distrito}</Chip>
    </>
  );
  const identidade = (
    <Dados
      linhas={[
        { rotulo: t("clube.localidade"), valor: <><Ligacao k="localidade" id={d.localidade.id}>{d.localidade.nome}</Ligacao> <span className="suave">({t(`estatuto.${d.localidade.estatuto}` as Chave).toLowerCase()})</span></> },
        { rotulo: t("clube.concelho"), valor: <Ligacao k="cidade" id={d.cidade.id}>{d.cidade.nome}</Ligacao> },
        { rotulo: t("clube.cores"), valor: d.cores },
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
            { rotulo: t("clube.orcamento"), valor: desconhecido },
            { rotulo: t("clube.massaSalarial"), valor: desconhecido },
            { rotulo: t("clube.patrocinios"), valor: desconhecido },
            ...(verdade ? [{ rotulo: t("dev.caixa"), valor: new Intl.NumberFormat(locale, { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(verdade.financas) }] : []),
          ]}
        />
      </Cartao>
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
      <Cartao titulo={t("cartao.jogos")}>
        <Dados linhas={[{ rotulo: t("clube.proximoJogo"), valor: t("clube.semJogos") }, { rotulo: t("clube.ultimosJogos"), valor: "—" }, { rotulo: t("clube.classificacao"), valor: "—" }]} />
      </Cartao>
      <Cartao titulo={t("cartao.divisoes")} larga>
        <GraficoDivisoes pontos={d.historicoDivisoes} />
      </Cartao>
    </div>
  );

  return (
    <Ficha
      tipo="clube"
      titulo={d.nome}
      topo={<Topo titulo={d.nome} etiquetas={etiquetas} cartao={identidade} />}
      separadores={{
        resumo,
        plantel: d.plantel.length > 0 ? (
          <Tabela id="plantel" nomeFicheiro={`plantel-${d.id}`} colunas={plantel} linhas={d.plantel} chave={(p) => p.id} celula={{ nome, nivel: nivelCelula }} ordemInicial={{ coluna: "pos", direcao: "asc" }} />
        ) : (
          <p className="vazio">{t("clube.semMundo")}</p>
        ),
        staff: d.cargos.length > 0 ? (
          <Tabela id="staff" nomeFicheiro={`staff-${d.id}`} colunas={staff} linhas={d.cargos} chave={(p) => p.id} celula={{ nome }} />
        ) : (
          <p className="vazio">{t("clube.semMundo")}</p>
        ),
      }}
      lateral={
        <ul className="ligacoes">
          <li><Ligacao k="localidade" id={d.localidade.id}>{d.localidade.nome}</Ligacao></li>
          <li><Ligacao k="cidade" id={d.cidade.id}>{d.cidade.nome}</Ligacao></li>
          {d.rival && <li><Ligacao k="clube" id={d.rival.id}>{d.rival.nome}</Ligacao></li>}
          {presidente && <li><Ligacao k="pessoa" id={presidente.id}>{presidente.nomeDesportivo}</Ligacao> <span className="suave">· {t("funcao.presidente")}</span></li>}
        </ul>
      }
    />
  );
}
