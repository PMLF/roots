/** localStorage seguro: pode não existir (janela privada, bloqueado). Só para conveniências por pessoa. */
export function ler<T>(chave: string, valida: (v: unknown) => v is T): T | undefined {
  try {
    const bruto = window.localStorage.getItem(chave);
    if (bruto === null) return undefined;
    const v: unknown = JSON.parse(bruto);
    return valida(v) ? v : undefined;
  } catch {
    return undefined;
  }
}
export function guardar(chave: string, valor: unknown): void {
  try {
    window.localStorage.setItem(chave, JSON.stringify(valor));
  } catch {
    /* sem armazenamento: só não se lembra */
  }
}
