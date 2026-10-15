/// <reference lib="webworker" />
import { tratar } from "../api/handler";
import type { Mensagem, RespostaMotor } from "../api/contratos";

// Casca fina: recebe pedidos da interface, chama o motor e responde. Toda a lógica está em ../api e no resto do motor.
const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (ev: MessageEvent<Mensagem>) => {
  const m = ev.data;
  let resposta: RespostaMotor;
  try {
    resposta = { id: m.id, ok: true, saida: tratar(m) };
  } catch (e) {
    resposta = { id: m.id, ok: false, erro: e instanceof Error ? e.message : String(e) };
  }
  ctx.postMessage(resposta);
};
