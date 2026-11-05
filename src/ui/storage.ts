/** localStorage seguro: pode não existir (janela privada, bloqueado). Só para conveniências por pessoa. */
export function read<T>(rowKey: string, valid: (v: unknown) => v is T): T | undefined {
  try {
    const raw = window.localStorage.getItem(rowKey);
    if (raw === null) return undefined;
    const v: unknown = JSON.parse(raw);
    return valid(v) ? v : undefined;
  } catch {
    return undefined;
  }
}
export function save(rowKey: string, value: unknown): void {
  try {
    window.localStorage.setItem(rowKey, JSON.stringify(value));
  } catch {
    /* sem armazenamento: só não se lembra */
  }
}
