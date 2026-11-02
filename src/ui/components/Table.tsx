"use client";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { save, read } from "@/ui/storage";
import { useT } from "@/ui/i18n/LocaleProvider";
import { presetColumns, filter, sort, nextOrder, type Column, type Order } from "@/ui/table/logic";

/** Linhas desenhadas de cada vez. */
const PAGE = 100;

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
  /** Colunas que se mostram por omissão num telemóvel (≤700 px), enquanto o gamer não escolher outras. */
  phoneColumns?: readonly string[];
  /** Sem filtro, escolha de colunas nem exportação (tabelas pequenas em cartões). */
  simple?: boolean;
  /** Classe CSS por linha (ex.: zonas da classificação). */
  lineClass?: (l: L) => string | undefined;
};

function readOrder(v: string | null, columns: readonly { id: string }[]): Order | undefined {
  const [column, direction] = (v ?? "").split(":");
  return column && (direction === "asc" || direction === "desc") && columns.some((c) => c.id === column) ? { column, direction } : undefined;
}

const isWidths = (v: unknown): v is Record<string, number> => typeof v === "object" && v !== null && !Array.isArray(v) && Object.values(v).every((x) => typeof x === "number");
const isTextList = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");

/** A tabela única do jogo (TOM_E_UX §3.6): ordenar, filtrar, escolher colunas, exportar, setas e Enter. */
export function Table<L>({ id, columns, lines, rowKey, cell = {}, toolbar, initialOrder = null, simple = false, lineClass, phoneColumns }: Props<L>) {
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
  // larguras das colunas, ajustáveis a arrastar a borda do cabeçalho (como no Excel); guardam-se por tabela
  const [widths, setWidths] = useState<Record<string, number>>({});
  const tableRef = useRef<HTMLTableElement>(null);
  useEffect(() => { setWidths(read(`raizes.widths.${id}`, isWidths) ?? {}); }, [id]);
  const startResize = (e: PointerEvent<HTMLSpanElement>, columnId: string) => {
    const head = tableRef.current?.querySelectorAll<HTMLTableCellElement>("thead th");
    if (!head) return;
    e.preventDefault();
    e.stopPropagation();
    const start: Record<string, number> = {};
    visibleColumns.forEach((c, i) => { start[c.id] = widths[c.id] ?? Math.round(head[i]?.getBoundingClientRect().width ?? 100); });
    const x0 = e.clientX;
    const from = start[columnId] ?? 100;
    let last = start;
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    // a largura total da tabela não muda: o que uma coluna ganha, tira-o à vizinha (à anterior, se for a última)
    const ids = visibleColumns.map((c) => c.id);
    const i = ids.indexOf(columnId);
    const neighbour = ids[i + 1] ?? ids[i - 1];
    const move = (ev: globalThis.PointerEvent) => {
      if (neighbour === undefined) return;
      const other = start[neighbour] ?? 100;
      const dx = Math.max(40 - from, Math.min(other - 40, Math.round(ev.clientX - x0)));
      last = { ...start, [columnId]: from + dx, [neighbour]: other - dx };
      setWidths(last);
    };
    const end = () => { handle.removeEventListener("pointermove", move); handle.removeEventListener("pointerup", end); handle.removeEventListener("pointercancel", end); save(`raizes.widths.${id}`, last); };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
  };
  const resetWidths = () => { setWidths({}); save(`raizes.widths.${id}`, null); };
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
    const phone = typeof window !== "undefined" && window.matchMedia("(max-width: 700px)").matches;
    setVisible(read(`raizes.columns.${id}`, isTextList) ?? (phone && phoneColumns ? [...phoneColumns] : undefined));
  }, [id]);

  const visibleColumns = useMemo(() => presetColumns(columns, visible ? { name: "saved", columns: visible } : undefined), [columns, visible]);
  const shown = useMemo(() => sort(filter(lines, visibleColumns, text), visibleColumns, order), [lines, visibleColumns, text, order]);

  // tabelas grandes (ex.: olheiros, 3000+ linhas) mostram-se por páginas: desenhar tudo de uma vez bloqueia o ecrã durante segundos
  const [limit, setLimit] = useState(PAGE);
  useEffect(() => { setLimit(PAGE); }, [text, order, id]);
  const page = useMemo(() => shown.slice(0, limit), [shown, limit]);

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
      <table ref={tableRef} className="tabela densa" style={visibleColumns.every((c) => widths[c.id] !== undefined) ? { tableLayout: "fixed", width: "100%" } : undefined}>
        <thead>
          <tr>
            {visibleColumns.map((c) => (
              <th key={c.id} className={`${c.numeric ? "within " : ""}com-redimensao`} style={widths[c.id] !== undefined ? { width: widths[c.id] } : undefined} aria-sort={order?.column === c.id ? (order.direction === "asc" ? "ascending" : "descending") : "none"}>
                <button type="button" className="cabecalho" onClick={() => setOrder((o) => nextOrder(o, c.id))}>
                  {c.title}
                  <span className="seta" aria-hidden="true">{order?.column === c.id ? (order.direction === "asc" ? "▲" : "▼") : "↕"}</span>
                </button>
                <span className="redimensionar" role="separator" aria-orientation="vertical" aria-label={t("table.resize", { column: c.title })} onPointerDown={(e) => startResize(e, c.id)} onDoubleClick={resetWidths} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody ref={body} onKeyDown={hotkeys}>
          {page.map((l) => (
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
      {shown.length > page.length && (
        <div className="tabela-mais">
          <span className="suave">{t("table.showing", { n: page.length, total: shown.length })}</span>
          <button type="button" onClick={() => setLimit((n) => n + PAGE)} data-testid="tabela-mais">{t("table.more", { n: Math.min(PAGE, shown.length - page.length) })}</button>
        </div>
      )}
    </div>
  );
}
