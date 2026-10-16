import type { Message, EngineRequests, WorldProgress, EngineResponse, RequestType } from "@/engine/api/contratos";

/** Cliente da interface para o motor, que corre num Web Worker (a interface nunca bloqueia). */
export class ClientEngine {
  private readonly worker: Worker;
  private seq = 0;
  private readonly pending = new Map<number, { ok: (v: unknown) => void; error: (e: Error) => void; progress?: (p: WorldProgress) => void }>();

  constructor() {
    this.worker = new Worker(new URL("../engine/worker/engine.worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (ev: MessageEvent<EngineResponse>) => {
      const p = this.pending.get(ev.data.id);
      if (!p) return;
      if ("progress" in ev.data) {
        p.progress?.(ev.data.progress);
        return;
      }
      this.pending.delete(ev.data.id);
      if (ev.data.ok) p.ok(ev.data.output);
      else p.error(new Error(ev.data.error));
    };
  }

  call<K extends RequestType>(type: K, input: EngineRequests[K]["input"], progress?: (p: WorldProgress) => void): Promise<EngineRequests[K]["output"]> {
    const id = ++this.seq;
    return new Promise((ok, error) => {
      // Criar ou reiniciar o mundo muda tudo o que as páginas já leram: avisa-as.
      const onEnd = type === "createWorld" || type === "restartWorld" ? () => window.dispatchEvent(new Event("raizes:mundo")) : undefined;
      this.pending.set(id, { ok: ((v: unknown) => { ok(v as never); onEnd?.(); }), error, ...(progress ? { progress } : {}) });
      this.worker.postMessage({ id, type, input } as Message);
    });
  }

  terminate() {
    this.worker.terminate();
    this.pending.clear();
  }
}
