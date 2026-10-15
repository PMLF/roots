import type { Mensagem, PedidosMotor, ProgressoMundo, RespostaMotor, TipoPedido } from "@/engine/api/contratos";

/** Cliente da interface para o motor, que corre num Web Worker (a interface nunca bloqueia). */
export class MotorCliente {
  private readonly worker: Worker;
  private seq = 0;
  private readonly pendentes = new Map<number, { ok: (v: unknown) => void; erro: (e: Error) => void; progresso?: (p: ProgressoMundo) => void }>();

  constructor() {
    this.worker = new Worker(new URL("../engine/worker/engine.worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (ev: MessageEvent<RespostaMotor>) => {
      const p = this.pendentes.get(ev.data.id);
      if (!p) return;
      if ("progresso" in ev.data) {
        p.progresso?.(ev.data.progresso);
        return;
      }
      this.pendentes.delete(ev.data.id);
      if (ev.data.ok) p.ok(ev.data.saida);
      else p.erro(new Error(ev.data.erro));
    };
  }

  chamar<K extends TipoPedido>(tipo: K, entrada: PedidosMotor[K]["entrada"], progresso?: (p: ProgressoMundo) => void): Promise<PedidosMotor[K]["saida"]> {
    const id = ++this.seq;
    return new Promise((ok, erro) => {
      this.pendentes.set(id, { ok: ok as (v: unknown) => void, erro, ...(progresso ? { progresso } : {}) });
      this.worker.postMessage({ id, tipo, entrada } as Mensagem);
    });
  }

  terminar() {
    this.worker.terminate();
    this.pendentes.clear();
  }
}
