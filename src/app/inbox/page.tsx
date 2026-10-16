"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { Mensagem } from "@/engine/noticias/noticias";
import { ItemNoticia } from "@/ui/components/ItemNoticia";
import { useT } from "@/ui/i18n/LocaleProvider";
import { useMotor } from "@/ui/MotorProvider";

const POR_PAGINA = 25;

/** Caixa de entrada (RZ-118): resultados do teu jogo, lesões do plantel, a tua carreira. Cada mensagem pode marcar-se como lida ou por ler; há um botão para marcar todas. */
export default function PaginaCaixa() {
  const { t } = useT();
  const motor = useMotor();
  const [mensagens, setMensagens] = useState<Mensagem[] | undefined>(undefined);
  const [naoLidas, setNaoLidas] = useState(0);
  const [fim, setFim] = useState(false);
  const [desempregado, setDesempregado] = useState(false);

  const carregar = useCallback(async (antesDe?: number) => {
    if (!motor) return;
    const c = await motor.chamar("caixa", { limite: POR_PAGINA, ...(antesDe !== undefined ? { antesDe } : {}) });
    setMensagens((antes) => (antesDe === undefined ? c.mensagens : [...(antes ?? []), ...c.mensagens]));
    if (antesDe === undefined) setNaoLidas(c.naoLidas);
    setFim(c.mensagens.length < POR_PAGINA);
  }, [motor]);
  useEffect(() => {
    void carregar().catch(() => setMensagens([]));
    motor?.chamar("ofertas", null).then((o) => setDesempregado(o.desempregado)).catch(() => undefined);
  }, [carregar, motor]);

  const marcar = async () => {
    await motor?.chamar("marcarCaixaLida", null);
    window.dispatchEvent(new Event("raizes:caixa"));
    setMensagens((m) => m?.map((x) => ({ ...x, lida: true })));
    setNaoLidas(0);
  };
  const alternar = async (m: Mensagem) => {
    const lida = !m.lida;
    await motor?.chamar("marcarMensagem", { id: m.id, lida });
    window.dispatchEvent(new Event("raizes:caixa"));
    setMensagens((l) => l?.map((x) => (x.id === m.id ? { ...x, lida } : x)));
    setNaoLidas((n) => Math.max(0, n + (lida ? -1 : 1)));
  };

  return (
    <section className="pagina-noticias">
      <h1>{t("caixa.titulo")}</h1>
      <div className="acoes">
        <b>{t("caixa.naoLidas", { n: naoLidas })}</b>
        <button type="button" onClick={() => void marcar()} disabled={naoLidas === 0}>{t("caixa.marcarLidas")}</button>
        {desempregado && <Link href="/">{t("caixa.verOfertas")}</Link>}
      </div>
      {mensagens === undefined ? <p>{t("ficha.aCarregar")}</p> : mensagens.length === 0 ? <p className="vazio">{t("caixa.vazio")}</p> : (
        <div className="noticias">
          {mensagens.map((m) => <ItemNoticia key={m.id} n={m} naoLida={!m.lida} aoAlternarLida={() => void alternar(m)} />)}
          {!fim && <button type="button" onClick={() => void carregar(mensagens.at(-1)!.id)}>{t("caixa.maisAntigas")}</button>}
        </div>
      )}
    </section>
  );
}
