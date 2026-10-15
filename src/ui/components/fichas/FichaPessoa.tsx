"use client";
import type { FichaPessoaDados } from "@/engine/api/contratos";
import { ATRIBUTOS_FISICOS, ATRIBUTOS_GR, ATRIBUTOS_MENTAIS, ATRIBUTOS_TECNICOS } from "@/engine/mundo/tipos";
import { Atributos, Chip, type GrupoAtributos, type LinhaAtributo } from "@/ui/components/Atributos";
import { Cartao, Dados, Topo } from "@/ui/components/Cartao";
import { Ficha } from "@/ui/components/Ficha";
import { Ligacao } from "@/ui/components/Ligacao";
import { nomeDaEpoca } from "@/ui/components/GraficoDivisoes";
import { Valor } from "@/ui/components/Valor";
import type { Chave } from "@/ui/i18n";
import { useT } from "@/ui/i18n/LocaleProvider";
import { nomePosicao, siglaPosicao } from "@/ui/i18n/posicao";
import { usePaises } from "@/ui/usePaises";
import { mostrarEstimativa } from "@/ui/valor";

const eur = (locale: string, n: number) => new Intl.NumberFormat(locale, { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

/** Ficha de uma pessoa: dados de identidade ao lado do nome; no corpo, o que o gamer sabe (ou «?»), conforme o papel. */
export function FichaPessoa({ d, verTudo }: { d: FichaPessoaDados; verTudo: boolean }) {
  const { t, locale } = useT();
  const pais = usePaises();
  const { publico: p, atributos, potencial, personalidade } = d.ficha;
  const j = p.jogador;
  const verdade = verTudo ? d.verdade : undefined;
  const desconhecido = <span className="valor-estimado" title={t("pessoa.desconhecido")}>?</span>;

  // ---- atributos de 1 a 20
  const linha = (id: string): LinhaAtributo => {
    const nome = t(`atributo.${id}` as Chave);
    const exato = verdade?.atributos?.[id];
    if (exato !== undefined) return { id, nome, texto: String(exato), numero: exato, estado: "exato" };
    const est = atributos?.campos[id];
    if (!est) return { id, nome, texto: "?", estado: "desconhecido", dica: t("pessoa.desconhecido") };
    const v = mostrarEstimativa(est, est);
    return { id, nome, texto: v.texto.replace("≈ ", ""), numero: est.valor, estado: v.estado, dica: v.estado === "desatualizado" ? t("valor.vistoHa", { epocas: est.epocasDesde }) : t("valor.estimado") };
  };
  const grupo = (id: string, ids: readonly string[]): GrupoAtributos => ({ id, titulo: t(`grupo.${id}` as Chave), linhas: ids.map(linha) });
  const grupos: GrupoAtributos[] = j
    ? [grupo("tecnicos", ATRIBUTOS_TECNICOS), grupo("mentais", ATRIBUTOS_MENTAIS), grupo("fisicos", ATRIBUTOS_FISICOS), ...(j.posicao === "GK" ? [grupo("guardaRedes", ATRIBUTOS_GR)] : [])]
    : [];

  const nivel = d.nivel ? (d.nivel.exato ? <b>{d.nivel.valor}</b> : <Valor v={mostrarEstimativa({ valor: d.nivel.valor, margem: d.nivel.margem, intervalo: [d.nivel.valor - d.nivel.margem, d.nivel.valor + d.nivel.margem] })} />) : desconhecido;
  const pot = verdade?.potencial !== undefined ? <b>{verdade.potencial}</b> : potencial?.campos.potencial ? <Valor v={mostrarEstimativa(potencial.campos.potencial, potencial.campos.potencial)} /> : desconhecido;

  // ---- identidade ao lado do nome
  const dados = [
    { rotulo: t("pessoa.nascimento"), valor: `${p.nascimento} (${t("pessoa.anos", { n: p.idade })})` },
    { rotulo: t("coluna.pais"), valor: pais(p.nacionalidade) },
    ...(d.naturalDe ? [{ rotulo: t("pessoa.naturalDe"), valor: <Ligacao k="cidade" id={d.naturalDe.id}>{d.naturalDe.nome}</Ligacao> }] : []),
    ...(j ? [
      { rotulo: t("pessoa.corpo"), valor: `${j.alturaCm} cm · ${j.pesoKg} kg` },
      { rotulo: t("coluna.pe"), valor: t(`pe.${j.pe}` as Chave) },
    ] : []),
    ...(d.clube ? [{ rotulo: t("entidade.clube"), valor: <Ligacao k="clube" id={d.clube.id}>{d.clube.nome}</Ligacao> }] : []),
    ...(d.contrato ? [{ rotulo: t("pessoa.contratoAte"), valor: d.contrato.fim }] : []),
    ...(j ? [{ rotulo: t("pessoa.estado"), valor: t(`estado.${j.estado}` as Chave) }] : []),
  ];
  const etiquetas = (
    <>
      {j && <Chip tom="destaque">{nomePosicao(t, j.posicao)}</Chip>}
      {!j && p.funcao && <Chip tom="destaque">{t(`funcao.${p.funcao}` as Chave)}</Chip>}
      {d.clube && <Chip><Ligacao k="clube" id={d.clube.id}>{d.clube.nome}</Ligacao></Chip>}
      {!d.clube && j?.estado === "livre" && <Chip tom="suave">{t("estado.livre")}</Chip>}
    </>
  );

  // ---- estatísticas de jogo (factos públicos)
  const stats = d.stats;
  const soma = (k: "jogos" | "minutos" | "golos" | "assistencias" | "amarelos" | "vermelhos") => stats.reduce((s, x) => s + x[k], 0);
  const estatisticas = (
    <Cartao titulo={t("cartao.stats")} larga>
      {stats.length === 0 ? (
        <>
          <p className="vazio">{t("pessoa.semStats")}</p>
          <Dados linhas={[{ rotulo: t("stat.jogos"), valor: "—" }, { rotulo: t("stat.golos"), valor: "—" }, { rotulo: t("stat.assistencias"), valor: "—" }, { rotulo: t("stat.nota"), valor: desconhecido }]} />
        </>
      ) : (
        <table className="tabela">
          <thead><tr>{(["epoca", "competicao", "jogos", "minutos", "golos", "assistencias", "amarelos", "vermelhos"] as const).map((c) => <th key={c} className={c === "epoca" || c === "competicao" ? undefined : "num"}>{t(`stat.${c}` as Chave)}</th>)}</tr></thead>
          <tbody>
            {stats.map((s) => (
              <tr key={`${s.epoca}-${s.competicao}-${s.clube}`}>
                <td>{nomeDaEpoca(s.epoca)}</td><td>{s.competicao}</td>
                <td className="num">{s.jogos}</td><td className="num">{s.minutos}</td><td className="num">{s.golos}</td><td className="num">{s.assistencias}</td><td className="num">{s.amarelos}</td><td className="num">{s.vermelhos}</td>
              </tr>
            ))}
            {stats.length > 1 && (
              <tr className="total"><td colSpan={2}>{t("stat.total")}</td>{(["jogos", "minutos", "golos", "assistencias", "amarelos", "vermelhos"] as const).map((k) => <td key={k} className="num">{soma(k)}</td>)}</tr>
            )}
          </tbody>
        </table>
      )}
    </Cartao>
  );

  const contrato = (
    <Cartao titulo={t("cartao.contrato")}>
      <Dados
        linhas={[
          { rotulo: t("pessoa.contratoAte"), valor: d.contrato?.fim ?? desconhecido },
          { rotulo: t("pessoa.noClubeDesde"), valor: d.contrato?.inicio ?? desconhecido },
          { rotulo: t("pessoa.salario"), valor: verdade?.salarioMensal !== undefined ? `${eur(locale, verdade.salarioMensal)}/${t("pessoa.mes")}` : desconhecido },
          { rotulo: t("pessoa.valorMercado"), valor: desconhecido },
          { rotulo: t("pessoa.clausula"), valor: desconhecido },
        ]}
      />
    </Cartao>
  );

  const personalidadeCartao = (
    <Cartao titulo={t("pessoa.personalidade")}>
      {verdade ? (
        <Dados linhas={Object.entries(verdade.personalidade).map(([k, v]) => ({ rotulo: t(`traco.${k}` as Chave), valor: <b className="attr attr-exato" data-banda={v <= 6 ? 1 : v <= 10 ? 2 : v <= 13 ? 3 : v <= 16 ? 4 : 5}>{v}</b> }))} />
      ) : personalidade ? (
        <p>
          {personalidade.rotulos.length > 0 ? personalidade.rotulos.map((r) => t(`traco.${r.traco}.${r.faixa}` as Chave)).join(" · ") : t("pessoa.semTracosMarcados")}
          {personalidade.desatualizado && <small className="valor-nota"> · {t("valor.vistoHa", { epocas: personalidade.epocasDesde })}</small>}
        </p>
      ) : (
        <p className="vazio">{t("pessoa.personalidadeDesconhecida")}</p>
      )}
    </Cartao>
  );

  const devCartao = verdade && (
    <Cartao titulo={t("dev.cartao")} larga dev>
      <Dados
        linhas={[
          { rotulo: t("dev.arquetipo"), valor: verdade.arquetipo },
          { rotulo: t("dev.lod"), valor: verdade.lod },
          ...(verdade.posicoes ? [{ rotulo: t("pessoa.posicoes"), valor: verdade.posicoes.map((x) => `${siglaPosicao(t, x.pos)} ${x.aptidao}`).join(" · ") }] : []),
          ...(verdade.qualidade ? [{ rotulo: t("cargo.qualidades"), valor: Object.entries(verdade.qualidade).map(([k, v]) => `${t(`qualidade.${k}` as Chave)} ${v}`).join(" · ") }] : []),
        ]}
      />
    </Cartao>
  );

  const resumo = j ? (
    <div className="cartoes">
      <Cartao titulo={t("cartao.atributos")} larga>
        {!atributos && !verdade && <p className="suave">{t("pessoa.naoObservadoCurto")}</p>}
        <Atributos grupos={grupos} />
      </Cartao>
      <Cartao titulo={t("cartao.nivel")}>
        <Dados
          linhas={[
            { rotulo: t("pessoa.nivel"), valor: nivel },
            { rotulo: t("pessoa.potencial"), valor: pot },
            { rotulo: t("pessoa.forma"), valor: desconhecido },
            { rotulo: t("pessoa.condicao"), valor: desconhecido },
            { rotulo: t("pessoa.moral"), valor: desconhecido },
          ]}
        />
      </Cartao>
      {contrato}
      {personalidadeCartao}
      {estatisticas}
      {devCartao}
    </div>
  ) : (
    <div className="cartoes">
      <Cartao titulo={t("cartao.cargo")}>
        <Dados
          linhas={[
            { rotulo: t("coluna.funcao"), valor: p.funcao ? t(`funcao.${p.funcao}` as Chave) : desconhecido },
            ...(d.clube ? [{ rotulo: t("pessoa.ondeTrabalha"), valor: <Ligacao k="clube" id={d.clube.id}>{d.clube.nome}</Ligacao> }] : []),
            ...(d.contrato ? [{ rotulo: t("pessoa.noClubeDesde"), valor: d.contrato.inicio }] : []),
          ]}
        />
      </Cartao>
      <Cartao titulo={t("cargo.qualidades")}>
        {verdade?.qualidade ? (
          <Dados linhas={Object.entries(verdade.qualidade).map(([k, v]) => ({ rotulo: t(`qualidade.${k}` as Chave), valor: <b className="attr attr-exato" data-banda={v <= 6 ? 1 : v <= 10 ? 2 : v <= 13 ? 3 : v <= 16 ? 4 : 5}>{v}</b> }))} />
        ) : (
          <p className="vazio">{t("cargo.qualidadesDesconhecidas")}</p>
        )}
      </Cartao>
      {personalidadeCartao}
      {devCartao}
    </div>
  );

  return (
    <Ficha
      tipo="pessoa"
      titulo={p.nomeDesportivo}
      topo={<Topo titulo={p.nomeDesportivo} etiquetas={etiquetas} cartao={<Dados linhas={dados} />} />}
      separadores={{ resumo }}
    />
  );
}
