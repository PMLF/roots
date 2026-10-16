"use client";
import type { FichaCidadeDados, NivelCidadeVista } from "@/engine/api/contratos";
import { Chip } from "@/ui/components/Atributos";
import { Cartao, Dados, Topo } from "@/ui/components/Cartao";
import { Ficha } from "@/ui/components/Ficha";
import { Ligacao } from "@/ui/components/Ligacao";
import type { Chave } from "@/ui/i18n";
import { useT } from "@/ui/i18n/LocaleProvider";

/** Cinco segmentos: quantos estão cheios diz o nível; a palavra vem sempre ao lado. */
function NivelBarra({ nivel }: { nivel: NivelCidadeVista }) {
  return (
    <span className="nivel-barra" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((i) => <span key={i} className={i <= nivel ? "cheio" : ""} />)}
    </span>
  );
}

const SETA = { sobe: "↑", estavel: "→", desce: "↓" } as const;

/** Evolução de um número ao longo das épocas (linha simples, sem eixos). */
function GraficoPopulacao({ pontos }: { pontos: { label: string; populacao: number }[] }) {
  const { t, locale } = useT();
  const L = 560, A = 170, ex = 76, dx = 24, topo = 16, base = A - 30;
  const min = Math.min(...pontos.map((p) => p.populacao));
  const max = Math.max(...pontos.map((p) => p.populacao));
  const n = Math.max(pontos.length, 2);
  const x = (i: number) => ex + (i * (L - ex - dx)) / (n - 1);
  const y = (v: number) => (max === min ? (topo + base) / 2 : base - ((v - min) / (max - min)) * (base - topo));
  const fmt = new Intl.NumberFormat(locale);
  if (pontos.length < 2) return <p className="suave">{t("cidade.graficoVazio", { n: fmt.format(pontos[0]?.populacao ?? 0) })}</p>;
  return (
    <figure className="grafico">
      <svg viewBox={`0 0 ${L} ${A}`} role="img" aria-label={t("cidade.graficoPopulacao")}>
        {[...new Set([min, max])].map((v) => (
          <g key={v}>
            <line x1={ex - 8} x2={L - dx + 8} y1={y(v)} y2={y(v)} className="grafico-grelha" />
            <text x={ex - 14} y={y(v) + 4} textAnchor="end" className="grafico-eixo">{fmt.format(v)}</text>
          </g>
        ))}
        {pontos.slice(1).map((p, i) => <line key={p.label} x1={x(i)} y1={y((pontos[i] as { populacao: number }).populacao)} x2={x(i + 1)} y2={y(p.populacao)} className="grafico-linha grafico-igual" />)}
        {pontos.map((p, i) => (
          <g key={p.label}>
            <circle cx={x(i)} cy={y(p.populacao)} r={4} className="grafico-ponto"><title>{`${p.label} · ${fmt.format(p.populacao)}`}</title></circle>
            {(pontos.length <= 8 || i % Math.ceil(pontos.length / 8) === 0 || i === pontos.length - 1) && <text x={x(i)} y={A - 8} textAnchor="middle" className="grafico-eixo">{p.label}</text>}
          </g>
        ))}
      </svg>
    </figure>
  );
}

/** Ficha de uma cidade (concelho; RZ-133): números em palavras, autarca, clubes e acontecimentos. Só o que é público. */
export function FichaCidade({ d }: { d: FichaCidadeDados }) {
  const { t, locale } = useT();
  const n = new Intl.NumberFormat(locale);
  const nivel = (v: NivelCidadeVista) => t(`cidade.nivel.${v}` as Chave);
  const indicador = (id: FichaCidadeDados["indicadores"][number]["id"]) => d.indicadores.find((i) => i.id === id)!;
  const linha = (id: FichaCidadeDados["indicadores"][number]["id"]) => {
    const i = indicador(id);
    return {
      rotulo: t(`cidade.indicador.${id}` as Chave),
      valor: (
        <span className="nivel-linha">
          <NivelBarra nivel={i.nivel} />
          <b>{nivel(i.nivel)}</b>
          <span className={`tendencia tendencia-${i.tendencia}`} title={t(`cidade.tendencia.${i.tendencia}` as Chave)}>
            <span aria-hidden="true">{SETA[i.tendencia]}</span>
            <span className="so-leitor">{t(`cidade.tendencia.${i.tendencia}` as Chave)}</span>
          </span>
        </span>
      ),
    };
  };
  const setorNome = (c: string) => t(`setor.${c}` as Chave);
  const setores = [d.setor, d.setorSecundario].filter((s, i, a) => s !== "" && a.indexOf(s) === i);
  const acontecimento = (a: FichaCidadeDados["acontecimentos"][number]) => (
    <li key={`${a.data}-${a.tipo}`}>
      <b>{t(`cidade.acontecimento.${a.tipo}` as Chave)}</b>
      <span className="suave"> · {a.label}{a.regional && a.polo ? ` · ${t("cidade.regiao", { polo: a.polo })}` : ""}</span>
    </li>
  );

  const etiquetas = (
    <>
      <Chip tom="destaque">{setorNome(d.setor)}</Chip>
      <Chip tom="suave">{d.distrito}</Chip>
      {d.polo && <Chip tom="suave">{d.polo}</Chip>}
      {d.ilha && <Chip tom="suave">{setorNome("ILH")}</Chip>}
    </>
  );
  const identidade = (
    <Dados
      linhas={[
        { rotulo: t("cidade.populacao"), valor: n.format(d.populacao) },
        { rotulo: t("cidade.setor"), valor: setores.map(setorNome).join(" · ") },
        ...(d.autarca ? [{ rotulo: t("cidade.autarca"), valor: <Ligacao k="pessoa" id={d.autarca.pessoa.id}>{d.autarca.pessoa.nome}</Ligacao> }] : []),
        { rotulo: t("cidade.clubes"), valor: d.clubes.length },
      ]}
    />
  );

  const resumo = (
    <div className="cartoes">
      <Cartao titulo={t("cartao.cidadeEconomia")}>
        <Dados linhas={[linha("economia"), linha("emprego"), linha("turismo")]} />
      </Cartao>
      <Cartao titulo={t("cartao.cidadeFutebol")}>
        <Dados linhas={[linha("orgulho"), linha("notoriedade"), linha("culturaFutebol")]} />
      </Cartao>
      <Cartao titulo={t("cartao.camara")}>
        <Dados
          linhas={[
            { rotulo: t("cidade.orcamento"), valor: <span className="nivel-linha"><NivelBarra nivel={d.orcamento} /><b>{nivel(d.orcamento)}</b></span> },
            ...(d.autarca ? [{ rotulo: t("autarca.apoio"), valor: <span className="nivel-linha"><NivelBarra nivel={d.autarca.apoioDesporto} /><b>{nivel(d.autarca.apoioDesporto)}</b></span> }] : []),
          ]}
        />
      </Cartao>
      <Cartao titulo={t("cartao.sinergias")}>
        <ul className="lista-simples">
          {setores.map((s) => <li key={s}><b>{setorNome(s)}</b> <span className="suave">· {t(`sinergia.${s}` as Chave)}</span></li>)}
          {d.ilha && <li><b>{setorNome("ILH")}</b> <span className="suave">· {t("sinergia.ILH")}</span></li>}
        </ul>
      </Cartao>
      <Cartao titulo={t("cartao.acontecimentos")} larga>
        {d.acontecimentos.length > 0 ? <ul className="lista-simples">{d.acontecimentos.map(acontecimento)}</ul> : <p className="vazio">{t("cidade.semAcontecimentos")}</p>}
      </Cartao>
    </div>
  );

  const clubes = (
    <div className="cartoes">
      <Cartao titulo={t("cidade.clubes")} larga>
        {d.clubes.length > 0 ? (
          <table className="tabela">
            <thead><tr><th>{t("coluna.clube")}</th><th>{t("clube.divisao")}</th><th>{t("cartao.estadio")}</th><th className="num">{t("estadio.capacidade")}</th><th>{t("estadio.propriedade")}</th></tr></thead>
            <tbody>
              {d.clubes.map((c) => (
                <tr key={c.ref.id}>
                  <td><Ligacao k="clube" id={c.ref.id}>{c.ref.nome}</Ligacao></td>
                  <td><Ligacao k="competicao" id={c.liga}>{c.liga}</Ligacao></td>
                  <td>{c.estadio.nome}</td>
                  <td className="num">{n.format(c.estadio.capacidade)}</td>
                  <td>{t(`propriedade.${c.estadio.propriedade}` as Chave)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="vazio">{t("cidade.semClubes")}</p>
        )}
      </Cartao>
      <Cartao titulo={t("cidade.localidades")} larga>
        <ul className="ligacoes">
          {d.localidades.map((l) => (
            <li key={l.ref.id}><Ligacao k="localidade" id={l.ref.id}>{l.ref.nome}</Ligacao> <span className="suave">· {t(`estatuto.${l.estatuto}` as Chave)} · {n.format(l.populacao)}</span></li>
          ))}
        </ul>
      </Cartao>
    </div>
  );

  const autarca = d.autarca ? (
    <div className="cartoes">
      <Cartao titulo={d.autarca.pessoa.nome}>
        <Dados
          linhas={[
            { rotulo: t("cidade.autarca"), valor: <Ligacao k="pessoa" id={d.autarca.pessoa.id}>{d.autarca.pessoa.nome}</Ligacao> },
            { rotulo: t("autarca.mandato"), valor: `${d.autarca.mandatoDesde}–${d.autarca.mandatoAte}` },
            { rotulo: t("autarca.apoio"), valor: <span className="nivel-linha"><NivelBarra nivel={d.autarca.apoioDesporto} /><b>{nivel(d.autarca.apoioDesporto)}</b></span> },
            { rotulo: t("autarca.reputacao"), valor: d.autarca.perfil.length > 0 ? d.autarca.perfil.map((p) => t(`autarca.perfil.${p}` as Chave)).join(" · ") : "—" },
          ]}
        />
        <p className="suave">{t("autarca.nota")}</p>
      </Cartao>
    </div>
  ) : (
    <p className="vazio">{t("cidade.semAutarca")}</p>
  );

  const historia = (
    <div className="cartoes">
      <Cartao titulo={t("cidade.historiaPopulacao")} larga>
        <GraficoPopulacao pontos={d.populacaoHistorico} />
      </Cartao>
      <Cartao titulo={t("cidade.historiaIndicadores")} larga>
        <div className="tabela-caixa">
          <table className="tabela">
            <thead>
              <tr><th>{t("coluna.epoca")}</th>{d.indicadores.map((i) => <th key={i.id}>{t(`cidade.indicador.${i.id}` as Chave)}</th>)}</tr>
            </thead>
            <tbody>
              {[...d.populacaoHistorico].reverse().map((p) => (
                <tr key={p.epoca}>
                  <th scope="row">{p.label}</th>
                  {d.indicadores.map((i) => <td key={i.id}>{nivel(i.historico.find((h) => h.epoca === p.epoca)!.nivel)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Cartao>
    </div>
  );

  return <Ficha tipo="cidade" titulo={d.nome} topo={<Topo titulo={d.nome} etiquetas={etiquetas} cartao={identidade} />} separadores={{ resumo, clubes, autarca, historia }} />;
}
