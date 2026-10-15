/// <reference lib="webworker" />
import { tratar, type Servicos } from "../api/handler";
import type { Mensagem, RespostaMotor } from "../api/contratos";
import { RepositorioSqlite } from "../persistencia/repositorioSqlite";
import { abrirWasm } from "./driverWasm";

// Casca fina: recebe pedidos da interface, chama o motor e responde. Toda a lógica está em ../api e no resto do motor.
const ctx = self as unknown as DedicatedWorkerGlobalScope;

let aberto: ReturnType<Servicos["abrirRepositorio"]> | undefined;
const servicos: Servicos = {
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
  try {
    resposta = { id: m.id, ok: true, saida: await tratar(m, servicos) };
  } catch (e) {
    resposta = { id: m.id, ok: false, erro: e instanceof Error ? e.message : String(e) };
  }
  ctx.postMessage(resposta);
};
