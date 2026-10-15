"use client";
import { useEffect, useMemo, useState } from "react";
import type { ClubeResumo, CompeticaoResumo, JogoLab, LigaLab } from "@/engine/api/contratos";
import { FORMACAO_IDS, ESTILOS } from "@/engine/jogo/formacoes";
import type { Estilo, FormacaoId, Lado } from "@/engine/jogo/tipos";
import type { Chave } from "@/ui/i18n";
import { useT } from "@/ui/i18n/LocaleProvider";
import { siglaPosicao } from "@/ui/i18n/posicao";
import type { MotorCliente } from "@/ui/engineClient";
import { momentoEmTexto } from "@/ui/jogo/momentos";
import { Ligacao } from "@/ui/components/Ligacao";

const novaSemente = () => Math.random().toString(36).slice(2, 10);
const um = (x: number) => x.toFixed(1);
const dois = (x: number) => x.toFixed(2);

type Separador = "jogo" | "liga";

/** Sandbox para dar feedback (RZ-139): simula sem gravar nada no save. */
export function Laboratorio({ motor }: { motor: MotorCliente }) {
  const { t } = useT();
  const [sep, setSep] = useState<Separador>("jogo");
  const [competicoes, setCompeticoes] = useState<CompeticaoResumo[] | null>(null);
  const [clubes, setClubes] = useState<ClubeResumo[]>([]);
  const [semMundo, setSemMundo] = useState(false);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const mundo = await motor.chamar("estadoMundo", null);
      if (!vivo) return;
      if (!mundo) return setSemMundo(true);
      const [c, l] = await Promise.all([motor.chamar("competicoes", null), motor.chamar("clubes", null)]);
      if (vivo) { setCompeticoes(c); setClubes(l); }
    })().catch(() => vivo && setSemMundo(true));
    return () => { vivo = false; };
  }, [motor]);

  return (
    <section>
      <h1>{t("lab.titulo")}</h1>
      <p className="suave">{t("lab.intro")}</p>
      {semMundo && <p data-testid="lab-sem-mundo">{t("lab.semMundo")}</p>}
      {competicoes && (
        <>
          <div className="separadores" role="tablist">
            {(["jogo", "liga"] as const).map((s) => (
              <button key={s} type="button" role="tab" aria-selected={sep === s} onClick={() => setSep(s)}>{t(`lab.sep.${s}` as Chave)}</button>
            ))}
          </div>
          {sep === "jogo" ? <UmJogo motor={motor} competicoes={competicoes} clubes={clubes} /> : <UmaLiga motor={motor} competicoes={competicoes} />}
        </>
      )}
    </section>
  );
}

function SeletorCompeticao({ competicoes, valor, aoMudar }: { competicoes: CompeticaoResumo[]; valor: string; aoMudar: (v: string) => void }) {
  const { t } = useT();
  return (
    <label>
      {t("lab.competicao")}{" "}
      <select value={valor} onChange={(e) => aoMudar(e.target.value)}>
        {competicoes.map((c) => <option key={c.liga} value={c.liga}>{c.liga} ({t("lab.clubesN", { n: c.clubes })})</option>)}
      </select>
    </label>
  );
}

type LadoCfg = { liga: string; clube: string; formacao: FormacaoId; estilo: Estilo };

function UmJogo({ motor, competicoes, clubes }: { motor: MotorCliente; competicoes: CompeticaoResumo[]; clubes: ClubeResumo[] }) {
  const { t, locale } = useT();
  const inicial = (i: number): LadoCfg => {
    const liga = competicoes[0]?.liga ?? "";
    return { liga, clube: clubes.filter((c) => c.liga === liga)[i]?.id ?? "", formacao: "4-3-3", estilo: "equilibrado" };
  };
  const [casa, setCasa] = useState<LadoCfg>(() => inicial(0));
  const [fora, setFora] = useState<LadoCfg>(() => inicial(1));
  const [seed, setSeed] = useState(novaSemente);
  const [r, setR] = useState<JogoLab | null>(null);
  const [erro, setErro] = useState<string>();
  const [aCorrer, setACorrer] = useState(false);

  const simular = async (semente = seed) => {
    setACorrer(true); setErro(undefined);
    try {
      setR(await motor.chamar("laboratorioJogo", {
        casa: casa.clube, fora: fora.clube, seed: semente,
        taticaCasa: { formacao: casa.formacao, estilo: casa.estilo }, taticaFora: { formacao: fora.formacao, estilo: fora.estilo },
      }));
    } catch (e) { setErro(e instanceof Error ? e.message : String(e)); } finally { setACorrer(false); }
  };

  return (
    <div>
      <div className="lab-lados">
        {([["casa", casa, setCasa], ["fora", fora, setFora]] as const).map(([lado, cfg, set]) => (
          <fieldset key={lado} className="painel">
            <legend>{t(`lab.${lado}` as Chave)}</legend>
            <p><SeletorCompeticao competicoes={competicoes} valor={cfg.liga} aoMudar={(liga) => set({ ...cfg, liga, clube: clubes.find((c) => c.liga === liga)?.id ?? "" })} /></p>
            <p>
              <select aria-label={t(`lab.${lado}` as Chave)} value={cfg.clube} onChange={(e) => set({ ...cfg, clube: e.target.value })} data-testid={`lab-${lado}`}>
                {clubes.filter((c) => c.liga === cfg.liga).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </p>
            <p>
              <label>{t("lab.formacao")}{" "}
                <select value={cfg.formacao} onChange={(e) => set({ ...cfg, formacao: e.target.value as FormacaoId })}>{FORMACAO_IDS.map((f) => <option key={f}>{f}</option>)}</select>
              </label>{" "}
              <label>{t("lab.estilo")}{" "}
                <select value={cfg.estilo} onChange={(e) => set({ ...cfg, estilo: e.target.value as Estilo })}>{ESTILOS.map((s) => <option key={s} value={s}>{t(`lab.estilo.${s}` as Chave)}</option>)}</select>
              </label>
            </p>
          </fieldset>
        ))}
      </div>
      <p className="tabela-barra">
        <label>{t("lab.seed")} <input value={seed} onChange={(e) => setSeed(e.target.value)} /></label>
        <button type="button" onClick={() => setSeed(novaSemente())}>{t("lab.novaSeed")}</button>
        <button type="button" onClick={() => simular()} disabled={aCorrer || !casa.clube || !fora.clube || casa.clube === fora.clube} data-testid="lab-simular-jogo">{aCorrer ? t("lab.aSimular") : t("lab.simular")}</button>
      </p>
      {erro && <p className="erro">{t("lab.erro", { erro })}</p>}
      {r && <ResultadoJogo r={r} locale={locale} />}
    </div>
  );
}

function ResultadoJogo({ r, locale }: { r: JogoLab; locale: "pt-PT" | "en" }) {
  const { t } = useT();
  const rel = r.relatorio;
  const nome = (id: string) => r.nomes[id] ?? id;
  const nomes = { jogador: nome, clube: { casa: r.casa.nome, fora: r.fora.nome } };
  const stat = (k: keyof typeof rel.casa, f: (x: number) => string = String): [string, string, string] => [t(`lab.stat.${String(k)}` as Chave), f(rel.casa[k] as number), f(rel.fora[k] as number)];
  const linhas: [string, string, string][] = [
    [t("lab.posse"), `${Math.round(rel.posseCasa * 100)}%`, `${Math.round((1 - rel.posseCasa) * 100)}%`],
    stat("oportunidades"), stat("remates"), stat("aBaliza"), stat("xg", dois), stat("cantos"), stat("faltas"), stat("amarelos"), stat("vermelhos"), stat("lesoes"),
  ];
  const melhor = rel.jogadores.find((j) => j.id === rel.homemDoJogo);
  const porLado = (lado: Lado) => rel.jogadores.filter((j) => j.lado === lado);
  const posDe = (lado: Lado, id: string) => r.onzes[lado].find((j) => j.id === id)?.posicao;
  return (
    <div data-testid="lab-jogo-resultado">
      <h2 className="lab-marcador">{r.casa.nome} {rel.golosCasa}–{rel.golosFora} {r.fora.nome}</h2>
      <p className="suave">{t("lab.intervalo", { casa: rel.intervalo.casa, fora: rel.intervalo.fora })}{melhor ? ` · ${t("lab.homemDoJogo", { nome: nome(melhor.id), nota: um(melhor.nota) })}` : ""}</p>
      <table className="tabela">
        <tbody>{linhas.map(([k, a, b]) => <tr key={k}><td>{a}</td><th scope="row">{k}</th><td>{b}</td></tr>)}</tbody>
      </table>
      <h3>{t("lab.momentos")}</h3>
      {rel.momentos.length === 0 ? <p className="vazio">{t("lab.semGolos")}</p> : <ul>{rel.momentos.map((m, i) => <li key={i}>{momentoEmTexto(locale, m, nomes)}</li>)}</ul>}
      <h3>{t("lab.historias")}</h3>
      {r.historias.length === 0 ? <p className="vazio">{t("lab.semHistorias")}</p> : <p>{r.historias.map((h) => t(`lab.historia.${h}` as Chave)).join(" · ")}</p>}
      <h3>{t("lab.onzes")}</h3>
      <div className="lab-lados">
        {(["casa", "fora"] as const).map((lado) => (
          <table key={lado} className="tabela">
            <caption>{r[lado].nome} ({r[lado].tatica.formacao})</caption>
            <thead><tr><th>{t("lab.col.jogador")}</th><th>{t("lab.col.min")}</th><th>{t("lab.col.golos")}</th><th>{t("lab.col.assist")}</th><th>{t("lab.col.nota")}</th></tr></thead>
            <tbody>
              {porLado(lado).map((j) => (
                <tr key={j.id}><td>{siglaPosicao(t, posDe(lado, j.id) ?? j.posicao)} {nome(j.id)}</td><td>{j.minutos}</td><td>{j.golos}</td><td>{j.assistencias}</td><td>{um(j.nota)}</td></tr>
              ))}
            </tbody>
          </table>
        ))}
      </div>
    </div>
  );
}

function UmaLiga({ motor, competicoes }: { motor: MotorCliente; competicoes: CompeticaoResumo[] }) {
  const { t } = useT();
  const [liga, setLiga] = useState(competicoes[0]?.liga ?? "");
  const [formacao, setFormacao] = useState<FormacaoId>("4-3-3");
  const [seed, setSeed] = useState(novaSemente);
  const [r, setR] = useState<LigaLab | null>(null);
  const [erro, setErro] = useState<string>();
  const [aCorrer, setACorrer] = useState(false);

  const simular = async () => {
    setACorrer(true); setErro(undefined);
    try { setR(await motor.chamar("laboratorioLiga", { liga, seed, formacao })); } catch (e) { setErro(e instanceof Error ? e.message : String(e)); } finally { setACorrer(false); }
  };
  const tot = useMemo(() => r && ([
    ["lab.total.golos", dois(r.totais.golosPorJogo)], ["lab.total.amarelos", dois(r.totais.amarelosPorJogo)], ["lab.total.vermelhos", dois(r.totais.vermelhosPorJogo)],
    ["lab.total.lesoes", dois(r.totais.lesoesPorJogo)], ["lab.total.goleadas", String(r.totais.goleadas)], ["lab.total.hatTricks", String(r.totais.hatTricks)],
  ] as const), [r]);

  return (
    <div>
      <p className="tabela-barra">
        <SeletorCompeticao competicoes={competicoes} valor={liga} aoMudar={setLiga} />
        <label>{t("lab.todosFormacao")} <select value={formacao} onChange={(e) => setFormacao(e.target.value as FormacaoId)}>{FORMACAO_IDS.map((f) => <option key={f}>{f}</option>)}</select></label>
        <label>{t("lab.seed")} <input value={seed} onChange={(e) => setSeed(e.target.value)} /></label>
        <button type="button" onClick={() => setSeed(novaSemente())}>{t("lab.novaSeed")}</button>
        <button type="button" onClick={simular} disabled={aCorrer} data-testid="lab-simular-liga">{aCorrer ? t("lab.aSimular") : t("lab.simular")}</button>
      </p>
      {erro && <p className="erro">{t("lab.erro", { erro })}</p>}
      {r && (
        <div data-testid="lab-liga-resultado">
          <p className="suave">{t("lab.resumoLiga", { jogos: r.jogos, jornadas: r.jornadas, ms: r.totais.ms })}</p>
          <table className="tabela">
            <thead><tr>{(["pos", "clube", "jogos", "v", "e", "d", "gm", "gs", "dif", "pts", "desempate", "rep"] as const).map((c) => <th key={c}>{t(`lab.col.${c}` as Chave)}</th>)}</tr></thead>
            <tbody>
              {r.tabela.map((l) => (
                <tr key={l.clube}>
                  <td>{l.posicao}</td><td><Ligacao k="clube" id={l.clube}>{l.nome}</Ligacao></td><td>{l.jogos}</td><td>{l.vitorias}</td><td>{l.empates}</td><td>{l.derrotas}</td>
                  <td>{l.golosMarcados}</td><td>{l.golosSofridos}</td><td>{l.diferenca}</td><td><strong>{l.pontos}</strong></td>
                  <td>{l.desempatePor ? t(`lab.desempate.${l.desempatePor}` as Chave) : ""}</td><td>{l.reputacao}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="lab-lados">
            <div>
              <h3>{t("lab.artilheiros")}</h3>
              <table className="tabela">
                <tbody>{r.artilheiros.map((a) => <tr key={a.jogador}><td><Ligacao k="pessoa" id={a.jogador}>{a.nome}</Ligacao></td><td>{a.clube}</td><td>{a.golos}</td></tr>)}</tbody>
              </table>
            </div>
            <div>
              <h3>{t("lab.totais")}</h3>
              <table className="tabela"><tbody>{tot?.map(([k, v]) => <tr key={k}><th scope="row">{t(k)}</th><td>{v}</td></tr>)}</tbody></table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
