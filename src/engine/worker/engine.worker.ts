/// <reference lib="webworker" />
import { tratar, type Servicos } from "../api/handler";
import type { Mensagem, RespostaMotor } from "../api/contratos";
import { RepositorioSqlite } from "../persistencia/repositorioSqlite";
import { abrirWasm, urlPublica } from "./driverWasm";

// Casca fina: recebe pedidos da interface, chama o motor e responde. Toda a lógica está em ../api e no resto do motor.
const ctx = self as unknown as DedicatedWorkerGlobalScope;

let aberto: ReturnType<Servicos["abrirRepositorio"]> | undefined;
const urlDados = (f: string) => urlPublica(`dados/${f}`);
const buscar = async (f: string) => {
  const r = await fetch(urlDados(f));
  if (!r.ok) throw new Error(`Não consegui carregar ${f} (${r.status})`);
  return r.text();
};

const servicos: Servicos = {
  async carregarDados() {
    const [clubes, cidades, localidades, rivalidades, distritos, paises] = await Promise.all(["clubes", "cidades", "localidades", "rivalidades", "distritos", "paises"].map((n) => buscar(`${n}.csv`)));
    return { clubes: clubes as string, cidades: cidades as string, localidades: localidades as string, rivalidades: rivalidades as string, distritos: distritos as string, paises: paises as string };
  },
  // Abre a base uma só vez por worker. O save "ativo" por omissão chama-se "atual" (ranhuras: RZ-134).
  abrirRepositorio() {
    aberto ??= abrirWasm("atual").then((b) => ({
      repositorio: new RepositorioSqlite(b.driver),
      backend: b.backend,
      versaoSqlite: b.versaoSqlite,
      ...(b.motivoMemoria !== undefined ? { motivoMemoria: b.motivoMemoria } : {}),
    }));
    return aberto;
  },
};

ctx.onmessage = async (ev: MessageEvent<Mensagem>) => {
  const m = ev.data;
  let resposta: RespostaMotor;
  let ultimo = 0;
  try {
    // o progresso vai-se emitindo (no máximo ~10 por segundo) enquanto o pedido corre
    const progresso = (p: { fase: string; feito: number; total: number }) => {
      const agora = Date.now();
      if (agora - ultimo < 100 && p.feito < p.total) return;
      ultimo = agora;
      ctx.postMessage({ id: m.id, progresso: p } satisfies RespostaMotor);
    };
    resposta = { id: m.id, ok: true, saida: await tratar(m, servicos, progresso) };
  } catch (e) {
    resposta = { id: m.id, ok: false, erro: e instanceof Error ? e.message : String(e) };
  }
  ctx.postMessage(resposta);
};
