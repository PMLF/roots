"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { MouseEvent } from "react";
import type { CompetitionPage } from "@/engine/api/contratos";
import { Ligacao } from "@/ui/components/Ligacao";
import { useT } from "@/ui/i18n/LocaleProvider";
import { SEPARADOR_URL } from "@/ui/ligacoes";

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

export function ListaJogadores({ titulo, itens, fmt }: { titulo: string; itens: Jogador[]; fmt?: (v: number) => string }) {
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

export function ListaEquipas({ titulo, itens }: { titulo: string; itens: Equipa[] }) {
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
 * Cartão horizontal e baixo, sem título, com o primeiro de cada estatística. Carregar nele (ou em «Ver mais») leva ao
 * separador Estatísticas da mesma página, onde há espaço para as listas completas.
 */
export function PainelDestaques({ h }: { h: H }) {
  const { t } = useT();
  const router = useRouter();
  const caminho = usePathname();
  const params = useSearchParams();
  const abrir = () => {
    const novos = new URLSearchParams(params.toString());
    novos.set("tab", SEPARADOR_URL["estatisticas"] ?? "stats");
    novos.delete("sort");
    router.push(`${caminho}?${novos.toString()}`, { scroll: false });
  };
  const aoCarregar = (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest("a, button")) return; // as ligações dentro do cartão não o abrem
    abrir();
  };
  return (
    <section className="cartao cartao-destaques larga" onClick={aoCarregar}>
      <div className="destaque-mosaicos">
        <Mosaico rotulo={t("destaques.melhorMarcador")}>{jogador(h.topScorers[0])}</Mosaico>
        <Mosaico rotulo={t("destaques.melhorAssistente")}>{jogador(h.topAssists[0])}</Mosaico>
        <Mosaico rotulo={t("destaques.melhorJogador")}>{jogador(h.bestRated[0], nota)}</Mosaico>
        <Mosaico rotulo={t("destaques.maisAmarelos")}>{jogador(h.mostYellow[0])}</Mosaico>
        <Mosaico rotulo={t("destaques.maisVermelhos")}>{jogador(h.mostRed[0])}</Mosaico>
        <Mosaico rotulo={t("competicoes.melhorAtaque")}>{equipa(h.bestAttack)}</Mosaico>
        <Mosaico rotulo={t("competicoes.melhorDefesa")}>{equipa(h.bestDefence)}</Mosaico>
      </div>
      <button type="button" className="cartao-destaques-mais" onClick={abrir}>{t("destaques.verMais")} ›</button>
    </section>
  );
}
