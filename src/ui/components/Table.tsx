"use client";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { save, read } from "@/ui/storage";
import { useT } from "@/ui/i18n/LocaleProvider";
import { presetColumns, filter, sort, nextOrder, type Column, type Order } from "@/ui/table/logic";

type Props<L> = {
  /** Identifica a tabela para guardar as colunas escolhidas. */
  id: string;
  columns: readonly Column<L>[];
  lines: readonly L[];
  rowKey: (l: L) => string;
  /** Como mostrar uma célula (por omissão, o valor da coluna). Usar `<Ligacao>` para nomes. */
  cell?: Partial<Record<string, (l: L) => ReactNode>>;
  /** Controlos extra no início da barra (por exemplo a escolha de vista). */
  toolbar?: ReactNode;
  initialOrder?: Order;
  /** Sem filtro, escolha de colunas nem exportação (tabelas pequenas em cartões). */
  simple?: boolean;
  /** Classe CSS por linha (ex.: zonas da classificação). */
  lineClass?: (l: L) => string | undefined;
};

function readOrder(v: string | null, columns: readonly { id: string }[]): Order | undefined {
  const [column, direction] = (v ?? "").split(":");
  return column && (direction === "asc" || direction === "desc") && columns.some((c) => c.id === column) ? { column, direction } : undefined;
}

const isTextList = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");

/** A tabela única do jogo (TOM_E_UX §3.6): ordenar, filtrar, escolher colunas, exportar, setas e Enter. */
export function Table<L>({ id, columns, lines, rowKey, cell = {}, toolbar, initialOrder = null, simple = false, lineClass }: Props<L>) {
  const { t } = useT();
  const params = useSearchParams();
  // A ordenação escolhida fica no URL (`sort=coluna:asc|desc`, sem nova entrada no histórico) para sobreviver a «Voltar».
  const [order, setStateOrder] = useState<Order>(() => readOrder(params.get("sort"), columns) ?? initialOrder);
  const setOrder = (f: (o: Order) => Order) => {
    const fresh = f(order);
    setStateOrder(fresh);
    const url = new URL(window.location.href);
    if (fresh) url.searchParams.set("sort", `${fresh.column}:${fresh.direction}`);
    else url.searchParams.delete("sort");
    window.history.replaceState(window.history.state, "", url);
  };
  const [text, setText] = useState("");
  const [visible, setVisible] = useState<string[] | undefined>(undefined);
  const [choose, setChoose] = useState(false);
  const body = useRef<HTMLTableSectionElement>(null);
  const selector = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!choose) return;
    const away = (e: MouseEvent) => { if (!selector.current?.contains(e.target as Node)) setChoose(false); };
    const tier = (e: globalThis.KeyboardEvent) => { if (e.key === "Escape") setChoose(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", tier);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", tier); };
  }, [choose]);
  const setColumns = (fresh: string[] | undefined) => {
    setVisible(fresh);
    save(`raizes.columns.${id}`, fresh ?? null);
  };

  useEffect(() => {
    setVisible(read(`raizes.columns.${id}`, isTextList));
  }, [id]);

  const visibleColumns = useMemo(() => presetColumns(columns, visible ? { name: "saved", columns: visible } : undefined), [columns, visible]);
  const shown = useMemo(() => sort(filter(lines, visibleColumns, text), visibleColumns, order), [lines, visibleColumns, text, order]);

  const toggle = (columnId: string) => {
    const current = visibleColumns.map((c) => c.id);
    const fresh = current.includes(columnId) ? current.filter((x) => x !== columnId) : columns.map((c) => c.id).filter((x) => x === columnId || current.includes(x));
    if (fresh.length === 0) return;
    setVisible(fresh);
    save(`raizes.columns.${id}`, fresh);
  };

  const hotkeys = (e: KeyboardEvent<HTMLTableSectionElement>) => {
    const domLines = Array.from(body.current?.querySelectorAll<HTMLTableRowElement>("tr") ?? []);
    const i = domLines.findIndex((r) => r === document.activeElement);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const j = e.key === "ArrowDown" ? Math.min(domLines.length - 1, i + 1) : Math.max(0, i - 1);
      domLines[j < 0 ? 0 : j]?.focus();
    } else if (e.key === "Enter" && i >= 0) {
      domLines[i]?.querySelector<HTMLAnchorElement>("a")?.click();
    }
  };

  return (
    <div className="tabela-caixa">
      {!simple && <div className="tabela-barra">
        {toolbar}
        <input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder={t("table.filter")} aria-label={t("table.filter")} />
        <span className="suave">{t("table.lines", { n: shown.length, total: lines.length })}</span>
        <div className="seletor-ligas seletor-tabela" ref={selector}>
          <button type="button" aria-expanded={choose} aria-haspopup="true" onClick={() => setChoose((v) => !v)}>
            {t("table.columns")} ({visibleColumns.length}/{columns.length}) <span aria-hidden="true">▾</span>
          </button>
          {choose && (
            <div className="seletor-painel" role="group" aria-label={t("table.columns")}>
              <div className="seletor-acoes">
                <button type="button" onClick={() => setColumns(columns.map((c) => c.id))}>{t("table.allColumns")}</button>
                <button type="button" onClick={() => setColumns(undefined)}>{t("table.reset")}</button>
              </div>
              <fieldset className="seletor-colunas">
                {columns.map((c) => (
                  <label key={c.id}>
                    <input type="checkbox" checked={visibleColumns.some((v) => v.id === c.id)} onChange={() => toggle(c.id)} /> {c.title}
                  </label>
                ))}
              </fieldset>
            </div>
          )}
        </div>
      </div>}
      <table className="tabela densa">
        <thead>
          <tr>
            {visibleColumns.map((c) => (
              <th key={c.id} className={c.numeric ? "within" : undefined} aria-sort={order?.column === c.id ? (order.direction === "asc" ? "ascending" : "descending") : "none"}>
                <button type="button" className="cabecalho" onClick={() => setOrder((o) => nextOrder(o, c.id))}>
                  {c.title}
                  <span className="seta" aria-hidden="true">{order?.column === c.id ? (order.direction === "asc" ? "▲" : "▼") : "↕"}</span>
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody ref={body} onKeyDown={hotkeys}>
          {shown.map((l) => (
            <tr key={rowKey(l)} tabIndex={0} className={lineClass?.(l)}>
              {visibleColumns.map((c) => (
                <td key={c.id} className={c.numeric ? "within" : undefined}>{cell[c.id] ? cell[c.id]!(l) : c.value(l)}</td>
              ))}
            </tr>
          ))}
          {shown.length === 0 && (
            <tr><td colSpan={visibleColumns.length} className="vazio">{t("table.empty")}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
