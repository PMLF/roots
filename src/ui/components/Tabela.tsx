"use client";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { guardar, ler } from "@/ui/armazenamento";
import { useT } from "@/ui/i18n/LocaleProvider";
import { colunasDoConjunto, filtrar, ordenar, paraCsv, proximaOrdem, type Coluna, type Ordem } from "@/ui/tabela/logica";

type Props<L> = {
  /** Identifica a tabela para guardar as colunas escolhidas. */
  id: string;
  colunas: readonly Coluna<L>[];
  linhas: readonly L[];
  chave: (l: L) => string;
  /** Como mostrar uma célula (por omissão, o valor da coluna). Usar `<Ligacao>` para nomes. */
  celula?: Partial<Record<string, (l: L) => ReactNode>>;
  nomeFicheiro?: string;
  ordemInicial?: Ordem;
};

function lerOrdem(v: string | null, colunas: readonly { id: string }[]): Ordem | undefined {
  const [coluna, direcao] = (v ?? "").split(":");
  return coluna && (direcao === "asc" || direcao === "desc") && colunas.some((c) => c.id === coluna) ? { coluna, direcao } : undefined;
}

const eListaDeTexto = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");

/** A tabela única do jogo (TOM_E_UX §3.6): ordenar, filtrar, escolher colunas, exportar, setas e Enter. */
export function Tabela<L>({ id, colunas, linhas, chave, celula = {}, nomeFicheiro, ordemInicial = null }: Props<L>) {
  const { t } = useT();
  const params = useSearchParams();
  // A ordenação escolhida fica no URL (`ord=coluna:asc|desc`, sem nova entrada no histórico) para sobreviver a «Voltar».
  const [ordem, setOrdemEstado] = useState<Ordem>(() => lerOrdem(params.get("ord"), colunas) ?? ordemInicial);
  const setOrdem = (f: (o: Ordem) => Ordem) => {
    const nova = f(ordem);
    setOrdemEstado(nova);
    const url = new URL(window.location.href);
    if (nova) url.searchParams.set("ord", `${nova.coluna}:${nova.direcao}`);
    else url.searchParams.delete("ord");
    window.history.replaceState(window.history.state, "", url);
  };
  const [texto, setTexto] = useState("");
  const [visiveis, setVisiveis] = useState<string[] | undefined>(undefined);
  const [escolher, setEscolher] = useState(false);
  const corpo = useRef<HTMLTableSectionElement>(null);

  useEffect(() => {
    setVisiveis(ler(`raizes.colunas.${id}`, eListaDeTexto));
  }, [id]);

  const colunasVisiveis = useMemo(() => colunasDoConjunto(colunas, visiveis ? { nome: "guardado", colunas: visiveis } : undefined), [colunas, visiveis]);
  const mostradas = useMemo(() => ordenar(filtrar(linhas, colunasVisiveis, texto), colunasVisiveis, ordem), [linhas, colunasVisiveis, texto, ordem]);

  const alternar = (colunaId: string) => {
    const atuais = colunasVisiveis.map((c) => c.id);
    const novas = atuais.includes(colunaId) ? atuais.filter((x) => x !== colunaId) : colunas.map((c) => c.id).filter((x) => x === colunaId || atuais.includes(x));
    if (novas.length === 0) return;
    setVisiveis(novas);
    guardar(`raizes.colunas.${id}`, novas);
  };

  const exportar = () => {
    const blob = new Blob([paraCsv(mostradas, colunasVisiveis)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${nomeFicheiro ?? id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const teclas = (e: KeyboardEvent<HTMLTableSectionElement>) => {
    const linhasDom = Array.from(corpo.current?.querySelectorAll<HTMLTableRowElement>("tr") ?? []);
    const i = linhasDom.findIndex((r) => r === document.activeElement);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const j = e.key === "ArrowDown" ? Math.min(linhasDom.length - 1, i + 1) : Math.max(0, i - 1);
      linhasDom[j < 0 ? 0 : j]?.focus();
    } else if (e.key === "Enter" && i >= 0) {
      linhasDom[i]?.querySelector<HTMLAnchorElement>("a")?.click();
    }
  };

  return (
    <div className="tabela-caixa">
      <div className="tabela-barra">
        <input type="search" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={t("tabela.filtrar")} aria-label={t("tabela.filtrar")} />
        <span className="suave">{t("tabela.linhas", { n: mostradas.length, total: linhas.length })}</span>
        <button type="button" onClick={() => setEscolher((v) => !v)} aria-expanded={escolher}>{t("tabela.colunas")}</button>
        <button type="button" onClick={exportar}>{t("tabela.exportar")}</button>
      </div>
      {escolher && (
        <fieldset className="tabela-colunas">
          <legend>{t("tabela.colunas")}</legend>
          {colunas.map((c) => (
            <label key={c.id}>
              <input type="checkbox" checked={colunasVisiveis.some((v) => v.id === c.id)} onChange={() => alternar(c.id)} /> {c.titulo}
            </label>
          ))}
        </fieldset>
      )}
      <table className="tabela densa">
        <thead>
          <tr>
            {colunasVisiveis.map((c) => (
              <th key={c.id} className={c.numerica ? "num" : undefined} aria-sort={ordem?.coluna === c.id ? (ordem.direcao === "asc" ? "ascending" : "descending") : "none"}>
                <button type="button" className="cabecalho" onClick={() => setOrdem((o) => proximaOrdem(o, c.id))}>
                  {c.titulo}
                  <span className="seta" aria-hidden="true">{ordem?.coluna === c.id ? (ordem.direcao === "asc" ? "▲" : "▼") : "↕"}</span>
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody ref={corpo} onKeyDown={teclas}>
          {mostradas.map((l) => (
            <tr key={chave(l)} tabIndex={0}>
              {colunasVisiveis.map((c) => (
                <td key={c.id} className={c.numerica ? "num" : undefined}>{celula[c.id] ? celula[c.id]!(l) : c.valor(l)}</td>
              ))}
            </tr>
          ))}
          {mostradas.length === 0 && (
            <tr><td colSpan={colunasVisiveis.length} className="vazio">{t("tabela.vazia")}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
