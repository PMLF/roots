"use client";
import { useCallback, useEffect, useState } from "react";
import type { EscopoNoticias, Noticia } from "@/engine/noticias/noticias";
import { ItemNoticia } from "@/ui/components/ItemNoticia";
import { guardar, ler } from "@/ui/armazenamento";
import type { Chave } from "@/ui/i18n";
import { useT } from "@/ui/i18n/LocaleProvider";
import { useMotor } from "@/ui/MotorProvider";

const POR_PAGINA = 20;
const ESCOPOS: EscopoNoticias[] = ["clube", "liga", "mundo"];
const CHAVE = "raizes.news.scope";
const eEscopo = (v: unknown): v is EscopoNoticias => v === "clube" || v === "liga" || v === "mundo";

/** Notícias (RZ-118): o que se passa com o teu clube, na tua liga e no mundo, tiradas do histórico. */
export default function PaginaNoticias() {
  const { t } = useT();
  const motor = useMotor();
  const [escopo, setEscopo] = useState<EscopoNoticias>("liga");
  const [lista, setLista] = useState<Noticia[] | undefined>(undefined);
  const [fim, setFim] = useState(false);
  useEffect(() => { const g = ler(CHAVE, eEscopo); if (g) setEscopo(g); }, []);

  const carregar = useCallback(async (antesDe?: number) => {
    if (!motor) return;
    const novas = await motor.chamar("noticias", { escopo, limite: POR_PAGINA, ...(antesDe !== undefined ? { antesDe } : {}) });
    setLista((antes) => (antesDe === undefined ? novas : [...(antes ?? []), ...novas]));
    setFim(novas.length < POR_PAGINA);
  }, [motor, escopo]);
  useEffect(() => {
    setLista(undefined);
    void carregar().catch(() => setLista([]));
    const recarregar = () => { void carregar().catch(() => undefined); };
    window.addEventListener("raizes:tempo", recarregar);
    return () => window.removeEventListener("raizes:tempo", recarregar);
  }, [carregar]);

  return (
    <section className="pagina-noticias">
      <h1>{t("noticias.titulo")}</h1>
      <div className="acoes" role="tablist" aria-label={t("noticias.titulo")}>
        {ESCOPOS.map((e) => (
          <button key={e} type="button" role="tab" aria-selected={escopo === e} className={escopo === e ? "ativo" : undefined} onClick={() => { setEscopo(e); guardar(CHAVE, e); }}>{t(`noticias.escopo.${e}` as Chave)}</button>
        ))}
      </div>
      {lista === undefined ? <p>{t("ficha.aCarregar")}</p> : lista.length === 0 ? <p className="vazio">{t("noticias.vazio")}</p> : (
        <div className="noticias">
          {lista.map((n) => <ItemNoticia key={n.id} n={n} />)}
          {fim ? <p className="suave">{t("noticias.semMais")}</p> : <button type="button" onClick={() => void carregar(lista.at(-1)!.id)}>{t("noticias.maisAntigas")}</button>}
        </div>
      )}
    </section>
  );
}
