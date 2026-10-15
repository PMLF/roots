# Raízes

Jogo de browser de gestão de futebol português ligado às cidades. Ver `BACKLOG.md` (o que fazer) e `docs/` (desenho).

## Comandos

```bash
npm install
npm run dev        # desenvolvimento em http://localhost:3000
npm run typecheck  # tipos (UI, motor sem DOM, worker)
npm run lint       # inclui as fronteiras de arquitetura
npm test           # testes do motor e da interface
npm run build      # exportação estática para out/
npm run ci         # tudo o que corre na integração contínua
```

Dados em `data/` (regenerar com `python3 tools/build_dados.py`).

## Estrutura

- `src/engine/` motor em TypeScript puro, sem React nem DOM; corre num Web Worker (`src/engine/worker`).
- `src/engine/config/parametros.ts` parâmetros centrais (prémios, pirâmide, calendário, saves…).
- `src/ui/` e `src/app/` interface (Next.js, exportação estática) com i18n pt-PT/en em `src/ui/i18n`.
