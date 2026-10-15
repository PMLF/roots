"use client";
import type { FichaCompeticaoDados } from "@/engine/api/contratos";
import { Cartao, Dados, Topo } from "@/ui/components/Cartao";
import { Chip } from "@/ui/components/Atributos";
import { Ficha } from "@/ui/components/Ficha";
import { Ligacao } from "@/ui/components/Ligacao";
import { Tabela } from "@/ui/components/Tabela";
import type { Chave } from "@/ui/i18n";
import { useT } from "@/ui/i18n/LocaleProvider";
import type { Coluna } from "@/ui/tabela/logica";

type Linha = FichaCompeticaoDados["tabela"][number];
type ClubeLinha = FichaCompeticaoDados["clubes"][number];

/** Ficha de uma liga ou série (RZ-145): resumo, classificação com desempates, calendário e clubes. */
export function FichaCompeticao({ d }: { d: FichaCompeticaoDados }) {
  const { t, locale } = useT();
  const n = new Intl.NumberFormat(locale);
  const desconhecido = <span className="valor-estimado" title={t("pessoa.desconhecido")}>?</span>;
  const escalao = t(`escalao.${d.escalao}` as Chave);

  const colunas: Coluna<Linha>[] = [
    { id: "pos", titulo: t("lab.col.pos"), valor: (l) => l.posicao, numerica: true },
    { id: "clube", titulo: t("lab.col.clube"), valor: (l) => l.nome },
    { id: "j", titulo: t("lab.col.jogos"), valor: (l) => l.jogos, numerica: true },
    { id: "v", titulo: t("lab.col.v"), valor: (l) => l.vitorias, numerica: true },
    { id: "e", titulo: t("lab.col.e"), valor: (l) => l.empates, numerica: true },
    { id: "d", titulo: t("lab.col.d"), valor: (l) => l.derrotas, numerica: true },
    { id: "gm", titulo: t("lab.col.gm"), valor: (l) => l.golosMarcados, numerica: true },
    { id: "gs", titulo: t("lab.col.gs"), valor: (l) => l.golosSofridos, numerica: true },
    { id: "dif", titulo: t("lab.col.dif"), valor: (l) => l.diferenca, numerica: true },
    { id: "pts", titulo: t("lab.col.pts"), valor: (l) => l.pontos, numerica: true },
  ];
  const colunasClubes: Coluna<ClubeLinha>[] = [
    { id: "clube", titulo: t("lab.col.clube"), valor: (c) => c.nome },
    { id: "localidade", titulo: t("coluna.localidade"), valor: (c) => c.localidade },
    { id: "rep", titulo: t("coluna.rep"), valor: (c) => c.reputacao, numerica: true },
    { id: "estadio", titulo: t("coluna.estadio"), valor: (c) => c.capacidade, numerica: true },
  ];

  const forte = d.clubes[0];
  const modesto = d.clubes.at(-1);
  const maiorEstadio = [...d.clubes].sort((a, b) => b.capacidade - a.capacidade)[0];
  const lider = d.jogosJogados > 0 ? d.tabela[0] : undefined;
  const clube = (id: string, nome: string) => <Ligacao k="clube" id={id}>{nome}</Ligacao>;

  const topo = (
    <Topo
      titulo={d.liga}
      etiquetas={<><Chip tom="destaque">{escalao}</Chip>{d.distrito && <Chip tom="suave">{d.distrito}</Chip>}<Chip tom="suave">{t("competicoes.clubes", { n: d.clubes.length })}</Chip></>}
    />
  );

  const resumo = (
    <div className="cartoes">
      {d.previa && <p className="aviso-previa cartao larga">{t("competicao.previa")}</p>}
      <Cartao titulo={t("cartao.competicao")}>
        <Dados linhas={[
          { rotulo: t("competicao.escalao"), valor: escalao },
          ...(d.distrito ? [{ rotulo: t("competicao.distrito"), valor: d.distrito }] : []),
          { rotulo: t("competicao.clubes"), valor: d.clubes.length },
          { rotulo: t("competicao.jornadas"), valor: d.jornadas.length },
          { rotulo: t("competicao.jogos"), valor: `${d.jogosJogados} / ${d.jogosTotais}` },
          { rotulo: t("competicao.inicio"), valor: d.jornadas[0]?.data ?? desconhecido },
        ]} />
      </Cartao>
      <Cartao titulo={t("cartao.lider")}>
        <Dados linhas={[
          ...(lider ? [{ rotulo: t("competicao.lider"), valor: <>{clube(lider.clube, lider.nome)} <span className="suave">· {lider.pontos} {t("lab.col.pts")}</span></> }] : []),
          ...(forte ? [{ rotulo: t("competicao.maisForte"), valor: clube(forte.id, forte.nome) }] : []),
          ...(modesto ? [{ rotulo: t("competicao.maisModesto"), valor: clube(modesto.id, modesto.nome) }] : []),
          ...(maiorEstadio ? [{ rotulo: t("competicao.estadioMaior"), valor: <>{clube(maiorEstadio.id, maiorEstadio.nome)} <span className="suave">· {n.format(maiorEstadio.capacidade)}</span></> }] : []),
        ]} />
      </Cartao>
      <Cartao titulo={t("cartao.subidasDescidas")}>
        <Dados linhas={[{ rotulo: t("competicao.sobem"), valor: desconhecido }, { rotulo: t("competicao.descem"), valor: desconhecido }]} />
      </Cartao>
      <Cartao titulo={t("competicao.clubesLista")} larga>
        <Tabela id="competicao-clubes" nomeFicheiro={`clubes-${d.liga}`} colunas={colunasClubes} linhas={d.clubes} chave={(c) => c.id} celula={{ clube: (c) => clube(c.id, c.nome), estadio: (c) => n.format(c.capacidade) }} ordemInicial={{ coluna: "rep", direcao: "desc" }} />
      </Cartao>
    </div>
  );

  return (
    <Ficha
      tipo="competicao"
      titulo={d.liga}
      topo={topo}
      separadores={{
        resumo,
        classificacao: (
          <>
            {d.previa && <p className="aviso-previa">{t("competicao.previa")}</p>}
            <Tabela id="competicao-tabela" nomeFicheiro={`classificacao-${d.liga}`} colunas={colunas} linhas={d.tabela} chave={(l) => l.clube} celula={{ clube: (l) => clube(l.clube, l.nome) }} ordemInicial={{ coluna: "pos", direcao: "asc" }} />
          </>
        ),
        jogos: (
          <div className="cartoes">
            {d.previa && <p className="aviso-previa cartao larga">{t("competicao.previa")}</p>}
            {d.jornadas.map((j) => (
              <Cartao key={j.numero} titulo={`${t("competicao.jornada", { n: j.numero })} · ${j.data}`}>
                <ul className="jogos-lista">
                  {j.jogos.map((g) => (
                    <li key={g.id}>
                      {clube(g.casa, g.casaNome)}
                      <b className="resultado">{g.golosCasa !== undefined ? `${g.golosCasa} – ${g.golosFora}` : "–"}</b>
                      {clube(g.fora, g.foraNome)}
                    </li>
                  ))}
                </ul>
                {j.folga && <p className="suave">{t("competicao.folga", { clube: j.folga })}</p>}
              </Cartao>
            ))}
          </div>
        ),
        historia: <p className="vazio">{t("competicao.semHistoria")}</p>,
      }}
    />
  );
}
