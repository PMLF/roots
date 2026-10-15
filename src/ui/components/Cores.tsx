import { fundoCores, lerCores } from "@/ui/cores";

/** Retângulo com as cores do clube (lisa, dividida, em maioria ou às riscas) seguido do nome. */
export function Cores({ texto }: { texto: string }) {
  return (
    <span className="cores">
      <span className="cores-amostra" style={{ background: fundoCores(lerCores(texto)) }} aria-hidden="true" />
      {texto}
    </span>
  );
}
