"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { ResultadoPesquisa } from "@/engine/api/contratos";
import type { Chave } from "@/ui/i18n";
import { useT } from "@/ui/i18n/LocaleProvider";
import { hrefFicha } from "@/ui/ligacoes";
import { useMotor } from "@/ui/MotorProvider";

/** Pesquisa global (TOM_E_UX §3.4): "/" ou Ctrl/⌘+K em qualquer página; setas e Enter. */
export function Pesquisa() {
  const { t } = useT();
  const motor = useMotor();
  const router = useRouter();
  const [aberta, setAberta] = useState(false);
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState<ResultadoPesquisa[]>([]);
  const [i, setI] = useState(0);
  const entrada = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement | null;
      const aEscrever = alvo && (alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA" || alvo.tagName === "SELECT" || alvo.isContentEditable);
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !aEscrever)) {
        e.preventDefault();
        setAberta(true);
      } else if (e.key === "Escape") setAberta(false);
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, []);

  useEffect(() => {
    if (aberta) entrada.current?.focus();
    else {
      setQ("");
      setResultados([]);
    }
  }, [aberta]);

  useEffect(() => {
    if (!aberta || !motor || q.trim().length < 2) {
      setResultados([]);
      return;
    }
    let vivo = true;
    const espera = setTimeout(() => {
      motor.chamar("pesquisar", { q }).then((r) => {
        if (!vivo) return;
        setResultados(r);
        setI(0);
      }).catch(() => vivo && setResultados([]));
    }, 120);
    return () => { vivo = false; clearTimeout(espera); };
  }, [q, aberta, motor]);

  const abrir = (r: ResultadoPesquisa) => {
    setAberta(false);
    router.push(hrefFicha(r.k, r.id));
  };

  const teclas = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setI((x) => Math.min(resultados.length - 1, x + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setI((x) => Math.max(0, x - 1)); }
    else if (e.key === "Enter" && resultados[i]) abrir(resultados[i]);
  };

  return (
    <>
      <button type="button" className="pesquisa-botao" onClick={() => setAberta(true)} data-testid="pesquisa-abrir">
        {t("pesquisa.abrir")} <kbd>/</kbd>
      </button>
      {aberta && (
        <div className="pesquisa-fundo" onMouseDown={() => setAberta(false)}>
          <div className="pesquisa" role="dialog" aria-modal="true" aria-label={t("pesquisa.titulo")} onMouseDown={(e) => e.stopPropagation()} onKeyDown={teclas}>
            <input ref={entrada} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("pesquisa.placeholder")} aria-label={t("pesquisa.titulo")} role="combobox" aria-expanded={resultados.length > 0} aria-controls="pesquisa-lista" data-testid="pesquisa-entrada" />
            <ul id="pesquisa-lista" role="listbox">
              {resultados.map((r, n) => (
                <li key={`${r.k}:${r.id}`} role="option" aria-selected={n === i} className={n === i ? "ativo" : undefined} onMouseEnter={() => setI(n)} onClick={() => abrir(r)}>
                  <span className="pesquisa-tipo">{t(`entidade.${r.k}` as Chave)}</span>
                  <strong>{r.titulo}</strong>
                  <span className="suave">{r.subtitulo}</span>
                </li>
              ))}
              {q.trim().length >= 2 && resultados.length === 0 && <li className="vazio">{t("pesquisa.nada")}</li>}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
