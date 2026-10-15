# Raízes

Jogo de browser de gestão de futebol português ligado às cidades. Ver `BACKLOG.md` (o que fazer) e `docs/` (desenho).

## Comandos

```bash
pnpm install
pnpm dev        # desenvolvimento em http://localhost:3000 (copia antes o sqlite-wasm para public/sqlite/)
pnpm typecheck  # tipos (UI, motor sem DOM, worker)
pnpm lint       # inclui as fronteiras de arquitetura
pnpm test           # testes do motor e da interface
pnpm build      # exportação estática para out/
pnpm run ci         # tudo o que corre na integração contínua
```

Dados em `data/` (regenerar com `python3 tools/build_dados.py`).

## Estrutura

- `src/engine/` motor em TypeScript puro, sem React nem DOM; corre num Web Worker (`src/engine/worker`).
- `src/engine/config/parametros.ts` parâmetros centrais (prémios, pirâmide, calendário, saves…).
- `src/engine/persistencia/` histórico e saves em SQLite (interface `Repositorio`, adaptadores memória e SQLite, migrações). Drivers: `src/node/` (Node) e `src/engine/worker/driverWasm.ts` (browser, OPFS).
- `src/ui/` e `src/app/` interface (Next.js, exportação estática) com i18n pt-PT/en em `src/ui/i18n`.
