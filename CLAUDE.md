# Raízes — contexto para o Claude (repositório: PMLF/roots)

Jogo de browser de gestão de futebol português com **clubes ligados a cidades** (histórias de *underdogs*, descoberta de talento, Câmara, adeptos, política). Dono: Pedro (front-end dev, Portugal). Comunicar em português de Portugal.

## Glossário
- **Gamer** = quem joga o jogo. **Jogador** = jogador de futebol. Nunca usar "jogador" para o gamer.

## Ler primeiro
1. `BACKLOG.md` — fonte de verdade: o que fazer, por fases e prioridade.
2. `docs/DESIGN_REGRAS.md` (pirâmide, prémio, distritais, sinergias), `docs/MODELO_DADOS.md`, `docs/PERSONALIDADE.md`, `docs/HISTORICO_EVENTOS.md`, `docs/TOM_E_UX.md`, `docs/GERACAO_MUNDO.md`, `docs/CIDADE.md`.
3. `data/` — 298 clubes, 276 concelhos, rivalidades. Fontes editáveis em `data/src/`; `python3 tools/build_dados.py` regenera e valida; `python3 tools/build_xlsx.py` gera `Clubes_Raizes.xlsx`.

## Stack e convenções
- Next.js + TypeScript + React; sem backend; persistência em **SQLite** (WASM/OPFS no browser, better-sqlite3 em Node) — ver `docs/HISTORICO_EVENTOS.md`.
- Bibliotecas SQLite só nos drivers (`src/node`, `src/engine/worker`); o motor fala com a interface `Repositorio` (`src/engine/persistencia`).
- **Motor de simulação em TypeScript puro** (`src/engine`), sem imports de React/DOM, testável headless. UI em `src/ui`.
- Tudo o que tem números (assistência, golos, lesões, prémios) tem parâmetros em ficheiro de configuração e passa no harness de calibração antes de ser dado como feito.
- Histórico = log de eventos append-only + factos de jogo; derivadas reconstruíveis; nada se apaga na passagem de época.
- A UI só lê através de `Vista` (público + observações); nunca a "verdade" oculta (personalidade, atributos, finanças).
- Personalidade = um sistema único (traços + memória) para todas as pessoas e entidades.

## Comandos
`pnpm dev` · `pnpm typecheck` · `pnpm lint` (inclui fronteiras: motor sem React/DOM; UI sem `verdade`/`repositorio`/`worker`) · `pnpm test` · `pnpm build` · `pnpm run ci`. Parâmetros de regras só em `src/engine/config/parametros.ts`.

## Regras de trabalho
- **Git:** `main` = estável, `develop` = integração, `feature/rz-xxx` = trabalho atual (um de cada vez). Docs podem ir direto para `develop`; `main` só recebe merges de marcos. Commits terminam com as linhas de atribuição pedidas pelo ambiente.
- Nomes de clubes realistas (sigla + localidade/gentílico); humor fica na alcunha/mascote. Tom das notícias: realista (`docs/TOM_E_UX.md`).
- Nunca usar dados do FM nem nomes de pessoas reais no jogo.
- Pega no primeiro item P1 por fazer da fase atual; atualiza o estado no backlog no fim.
- Não implementes nada fora do backlog; ideias novas vão para o Parking lot.
- Clubes e pessoas são fictícios; não usar nomes de clubes reais.
