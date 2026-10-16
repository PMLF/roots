"use client";
import { Icon } from "@/ui/components/Icone";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { SearchResult } from "@/engine/api/contratos";
import type { Key } from "@/ui/i18n";
import { useT } from "@/ui/i18n/LocaleProvider";
import { profileHref } from "@/ui/ligacoes";
import { useEngine } from "@/ui/MotorProvider";

/** Pesquisa global (TOM_E_UX §3.4): "/" ou Ctrl/⌘+K em qualquer página; setas e Enter. */
export function Search() {
  const { t } = useT();
  const engine = useEngine();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [i, setI] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onPress = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const writing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable);
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !writing)) {
        e.preventDefault();
        setIsOpen(true);
      } else if (e.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("keydown", onPress);
    return () => window.removeEventListener("keydown", onPress);
  }, []);

  useEffect(() => {
    if (isOpen) input.current?.focus();
    else {
      setQ("");
      setResults([]);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !engine || q.trim().length < 2) {
      setResults([]);
      return;
    }
    let live = true;
    const wait = setTimeout(() => {
      engine.call("find", { q }).then((r) => {
        if (!live) return;
        setResults(r);
        setI(0);
      }).catch(() => live && setResults([]));
    }, 120);
    return () => { live = false; clearTimeout(wait); };
  }, [q, isOpen, engine]);

  const open = (r: SearchResult) => {
    setIsOpen(false);
    router.push(profileHref(r.k, r.id));
  };

  const hotkeys = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setI((x) => Math.min(results.length - 1, x + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setI((x) => Math.max(0, x - 1)); }
    else if (e.key === "Enter" && results[i]) open(results[i]);
  };

  return (
    <>
      <button type="button" className="pesquisa-botao" onClick={() => setIsOpen(true)} data-testid="pesquisa-abrir">
        <Icon name="search" />
        {t("pesquisa.abrir")} <kbd>/</kbd>
      </button>
      {isOpen && (
        <div className="pesquisa-fundo" onMouseDown={() => setIsOpen(false)}>
          <div className="pesquisa" role="dialog" aria-modal="true" aria-label={t("pesquisa.titulo")} onMouseDown={(e) => e.stopPropagation()} onKeyDown={hotkeys}>
            <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("pesquisa.placeholder")} aria-label={t("pesquisa.titulo")} role="combobox" aria-expanded={results.length > 0} aria-controls="pesquisa-lista" data-testid="pesquisa-entrada" />
            <ul id="pesquisa-lista" role="listbox">
              {results.map((r, n) => (
                <li key={`${r.k}:${r.id}`} role="option" aria-selected={n === i} className={n === i ? "active" : undefined} onMouseEnter={() => setI(n)} onClick={() => open(r)}>
                  <span className="pesquisa-tipo">{t(`entidade.${r.k}` as Key)}</span>
                  <strong>{r.title}</strong>
                  <span className="suave">{r.subtitle}</span>
                </li>
              ))}
              {q.trim().length >= 2 && results.length === 0 && <li className="vazio">{t("pesquisa.nada")}</li>}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
