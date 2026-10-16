import { backgroundColours, readColours } from "@/ui/cores";

/** Retângulo com as cores do clube (lisa, dividida, em maioria ou às riscas) seguido do nome. */
export function Colours({ text }: { text: string }) {
  return (
    <span className="cores">
      <span className="cores-amostra" style={{ background: backgroundColours(readColours(text)) }} aria-hidden="true" />
      {text}
    </span>
  );
}
