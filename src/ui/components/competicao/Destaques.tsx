"use client";
import { useState, type MouseEvent } from "react";
import type { CompetitionPage } from "@/engine/api/contratos";
import { Cartao } from "@/ui/components/Cartao";
import { Ligacao } from "@/ui/components/Ligacao";
import { useT } from "@/ui/i18n/LocaleProvider";

type H = CompetitionPage["highlights"];
type Jogador = H["topScorers"][number];
type Equipa = { club: string; name: string; value: number };

const nota = (v: number) => v.toFixed(2);

function Mosaico({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="destaque-mosaico">
      <span className="suave">{rotulo}</span>
      <span className="destaque-valor">{children}</span>
    </div>
  );
}

const jogador = (p: Jogador | undefined, fmt?: (v: number) => string) =>
  p ? <><Ligacao k="pessoa" id={p.player}>{p.name}</Ligacao> <b>{fmt ? fmt(p.value) : p.value}</b></> : <span className="suave">—</span>;
const equipa = (c: Equipa | undefined) => (c ? <><Ligacao k="clube" id={c.club}>{c.name}</Ligacao> <b>{c.value}</b></> : <span className="suave">—</span>);

function ListaJogadores({ titulo, itens, fmt }: { titulo: string; itens: Jogador[]; fmt?: (v: number) => string }) {
  const { t } = useT();
  return (
    <section className="bloco-lista">
      <h3>{titulo}</h3>
      {itens.length === 0 ? (
        <p className="vazio">{t("destaques.semDados")}</p>
      ) : (
        <ol className="destaque-lista">
          {itens.map((p) => (
            <li key={p.player}>
              <span><Ligacao k="pessoa" id={p.player}>{p.name}</Ligacao> <span className="suave">· <Ligacao k="clube" id={p.club}>{p.clubName}</Ligacao></span></span>
              <b>{fmt ? fmt(p.value) : p.value}</b>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function ListaEquipas({ titulo, itens }: { titulo: string; itens: Equipa[] }) {
  const { t } = useT();
  return (
    <section className="bloco-lista">
      <h3>{titulo}</h3>
      {itens.length === 0 ? (
        <p className="vazio">{t("destaques.semDados")}</p>
      ) : (
        <ol className="destaque-lista">
          {itens.map((c) => (
            <li key={c.club}><span><Ligacao k="clube" id={c.club}>{c.name}</Ligacao></span><b>{c.value}</b></li>
          ))}
        </ol>
      )}
    </section>
  );
}

/**
 * Cartão horizontal e baixo com o primeiro de cada estatística. Carregar nele (ou em «Ver mais») abre, no próprio cartão,
 * os dez primeiros de cada lista e a classificação de todas as equipas em ataque e defesa.
 */
export function PainelDestaques({ h }: { h: H }) {
  const { t } = useT();
  const [aberto, setAberto] = useState(false);
  const alternar = (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest("a, button")) return; // as ligações dentro do cartão não o abrem
    setAberto((v) => !v);
  };
  return (
    <Cartao titulo={t("destaques.titulo")} larga>
      <div className="painel-destaques" onClick={alternar}>
        <button type="button" className="painel-destaques-botao" aria-expanded={aberto} onClick={() => setAberto((v) => !v)}>
          {aberto ? t("destaques.menos") : t("destaques.mais")} <span aria-hidden="true">{aberto ? "▴" : "▾"}</span>
        </button>
        <div className="destaque-mosaicos">
          <Mosaico rotulo={t("destaques.melhorMarcador")}>{jogador(h.topScorers[0])}</Mosaico>
          <Mosaico rotulo={t("destaques.melhorAssistente")}>{jogador(h.topAssists[0])}</Mosaico>
          <Mosaico rotulo={t("destaques.melhorJogador")}>{jogador(h.bestRated[0], nota)}</Mosaico>
          <Mosaico rotulo={t("destaques.maisAmarelos")}>{jogador(h.mostYellow[0])}</Mosaico>
          <Mosaico rotulo={t("destaques.maisVermelhos")}>{jogador(h.mostRed[0])}</Mosaico>
          <Mosaico rotulo={t("competicoes.melhorAtaque")}>{equipa(h.bestAttack)}</Mosaico>
          <Mosaico rotulo={t("competicoes.melhorDefesa")}>{equipa(h.bestDefence)}</Mosaico>
        </div>
        {aberto && (
          <div className="destaque-detalhe">
            <ListaJogadores titulo={t("destaques.marcadores")} itens={h.topScorers} />
            <ListaJogadores titulo={t("destaques.assistentes")} itens={h.topAssists} />
            <ListaJogadores titulo={t("destaques.melhoresJogadores")} itens={h.bestRated} fmt={nota} />
            <ListaJogadores titulo={t("destaques.amarelos")} itens={h.mostYellow} />
            <ListaJogadores titulo={t("destaques.vermelhos")} itens={h.mostRed} />
            <ListaEquipas titulo={t("destaques.ataques")} itens={h.attackRanking} />
            <ListaEquipas titulo={t("destaques.defesas")} itens={h.defenceRanking} />
          </div>
        )}
      </div>
    </Cartao>
  );
}
