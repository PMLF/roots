"use client";
import { Suspense, useCallback, useEffect, useState } from "react";
import type { PlanoVista } from "@/engine/api/contratos";
import type { Estilo, FormacaoId, Tatica } from "@/engine/jogo/tipos";
import { Cartao } from "@/ui/components/Cartao";
import { ComClube } from "@/ui/components/ComClube";
import type { Chave } from "@/ui/i18n";
import { useT } from "@/ui/i18n/LocaleProvider";
import { siglaPosicao } from "@/ui/i18n/posicao";
import { useMotor } from "@/ui/MotorProvider";

const ESTILOS: Estilo[] = ["bonito", "equilibrado", "direto", "contraAtaque"];
const NIVEIS = [1, 2, 3, 4, 5] as const;
const CAMPOS_NIVEL = ["intensidade", "linha", "ritmo", "fairPlay"] as const;

function Conteudo() {
  const { t } = useT();
  const motor = useMotor();
  const [plano, setPlano] = useState<PlanoVista | null | undefined>(undefined);
  const [erro, setErro] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!motor) return;
    let vivo = true;
    motor.chamar("plano", null).then((p) => vivo && setPlano(p)).catch(() => vivo && setPlano(null));
    return () => { vivo = false; };
  }, [motor]);

  const guardar = useCallback(async (tatica: Tatica, onze: { jogador: string; posicao: string }[] | null) => {
    if (!motor) return;
    try {
      const p = await motor.chamar("guardarPlano", { tatica, onze: onze as never });
      setPlano(p);
      setErro(undefined);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }, [motor]);

  if (plano === undefined) return <p>{t("ficha.aCarregar")}</p>;
  if (plano === null) return <p className="vazio">{t("meuClube.vazio")}</p>;

  const onzeAtual = plano.onze.map((o) => ({ jogador: o.jogador, posicao: o.posicao }));
  const trocar = (i: number, jogador: string) => {
    const novo = onzeAtual.map((o) => ({ ...o }));
    const j = novo.findIndex((o) => o.jogador === jogador);
    if (j >= 0 && j !== i) novo[j] = { jogador: novo[i]!.jogador, posicao: novo[j]!.posicao }; // quem já está noutra posição troca
    novo[i] = { jogador, posicao: novo[i]!.posicao };
    void guardar(plano.tatica, novo);
  };
  const estado = (id: string) => plano.plantel.find((p) => p.jogador === id);
  const aptidao = (id: string, pos: string) => estado(id)?.posicoes.find((p) => p.pos === pos)?.aptidao;
  const marca = (id: string) => {
    const e = estado(id);
    return e?.indisponivel ? ` — ${t(`tatica.${e.indisponivel}` as Chave)}` : "";
  };

  return (
    <div className="cartoes">
      {plano.proximoJogo && (
        <Cartao titulo={t("tatica.proximoJogo")} larga>
          <p>
            <b>{plano.proximoJogo.emCasa ? "" : "@ "}{plano.proximoJogo.adversario}</b> <span className="suave">· {plano.proximoJogo.data} · {plano.proximoJogo.competicao}</span>
            {plano.proximoJogo.confirmado && <span className="suave"> · {t("tatica.confirmado")}</span>}
          </p>
        </Cartao>
      )}
      <Cartao titulo={t("tatica.titulo")}>
        <div className="formulario">
          <label>{t("lab.formacao")}{" "}
            <select value={plano.tatica.formacao} onChange={(e) => void guardar({ ...plano.tatica, formacao: e.target.value as FormacaoId }, null)}>
              {plano.formacoes.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </label>
          <label>{t("lab.estilo")}{" "}
            <select value={plano.tatica.estilo} onChange={(e) => void guardar({ ...plano.tatica, estilo: e.target.value as Estilo }, plano.automatico ? null : onzeAtual)}>
              {ESTILOS.map((s) => <option key={s} value={s}>{t(`lab.estilo.${s}` as Chave)}</option>)}
            </select>
          </label>
          {CAMPOS_NIVEL.map((k) => (
            <label key={k}>{t(`tatica.${k}` as Chave)}{" "}
              <select value={plano.tatica[k]} onChange={(e) => void guardar({ ...plano.tatica, [k]: Number(e.target.value) as 1 }, plano.automatico ? null : onzeAtual)}>
                {NIVEIS.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          ))}
        </div>
        <p className="suave">{t("tatica.formacaoAviso")}</p>
      </Cartao>
      <Cartao titulo={t("tatica.onze")}>
        {plano.automatico && <p className="suave">{t("tatica.automatico")}</p>}
        <table className="tabela densa">
          <tbody>
            {plano.onze.map((o, i) => (
              <tr key={`${o.posicao}-${i}`}>
                <td>{siglaPosicao(t, o.posicao)}</td>
                <td>
                  <select value={o.jogador} onChange={(e) => trocar(i, e.target.value)} aria-label={t(`posicao.nome.${o.posicao}` as Chave)}>
                    {plano.plantel.map((p) => <option key={p.jogador} value={p.jogador}>{p.nome}{marca(p.jogador)}</option>)}
                  </select>
                </td>
                <td className="num suave" title={t("tatica.aptidao")}>{aptidao(o.jogador, o.posicao) ?? "—"}</td>
                <td>{estado(o.jogador)?.indisponivel ? <span className="erro">{t(`tatica.${estado(o.jogador)!.indisponivel}` as Chave)}</span> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="acoes"><button type="button" disabled={plano.automatico} onClick={() => void guardar(plano.tatica, null)}>{t("tatica.onzeAutomatico")}</button></p>
        {erro && <p className="erro">{erro}</p>}
      </Cartao>
    </div>
  );
}

/** Tática (RZ-158): formação, estilo, níveis e onze do clube do gamer; pode alterar-se a qualquer momento. */
export default function PaginaTatica() {
  const { t } = useT();
  return <Suspense fallback={null}><ComClube titulo={t("menu.tatica")}>{() => <Conteudo />}</ComClube></Suspense>;
}
