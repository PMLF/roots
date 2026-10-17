# Raízes — contexto para o Claude (repositório: PMLF/roots)

Jogo de browser de gestão de futebol português com **clubes ligados a cidades** (histórias de *underdogs*, descoberta de talento, Câmara, adeptos, política). Dono: Pedro (front-end dev, Portugal). Comunicar em português de Portugal.

## Glossário
- **Gamer** = quem joga o jogo. **Jogador** (`player` no código) = jogador de futebol. Nunca usar "jogador" para o gamer; no código `gamer` é quem joga.

## Ler primeiro
1. `BACKLOG.md` — fonte de verdade: o que fazer, por fases e prioridade.
2. `docs/DESIGN_RULES.md` (pirâmide, prémio, distritais, sinergias), `docs/DATA_MODEL.md`, `docs/PERSONALITY.md`, `docs/EVENT_HISTORY.md`, `docs/TONE_AND_UX.md`, `docs/UI_SYSTEM.md`, `docs/GAME_ENGINE.md`, `docs/WORLD_GENERATION.md`, `docs/CITY.md`.
3. `data/` — 300 clubes, 276 concelhos, rivalidades. Fontes editáveis em `data/src/`; `python3 tools/build_data.py` regenera e valida; `python3 tools/build_xlsx.py` gera `Clubs_Raizes.xlsx`.

## Stack e convenções
- Next.js + TypeScript + React; sem backend; persistência em **SQLite** (WASM/OPFS no browser, better-sqlite3 em Node) — ver `docs/EVENT_HISTORY.md`.
- Bibliotecas SQLite só nos drivers (`src/node`, `src/engine/worker`); o motor fala com a interface `Repository` (`src/engine/persistence`).
- **Motor de simulação em TypeScript puro** (`src/engine`), sem imports de React/DOM, testável headless. UI em `src/ui`.
- Tudo o que tem números (assistência, golos, lesões, prémios) tem parâmetros em ficheiro de configuração e passa no harness de calibração antes de ser dado como feito.
- Histórico = log de eventos append-only + factos de jogo; derivadas reconstruíveis; nada se apaga na passagem de época.
- A UI só lê através de `View` (público + observações); nunca a "verdade" oculta (personalidade, atributos, finanças).
- **Código e BD em inglês** (incluindo nomes de ficheiros, scripts/comandos, variáveis de ambiente e pastas geradas; só os textos para o gamer ficam em pt-PT): tudo o que se guarda (códigos, enums, tipos de evento, colunas) em inglês; a interface traduz pelo idioma (ex.: posições GK/CB/LW…, `src/ui/i18n/position.ts`). Migração feita no RZ-143: nomes de ficheiros e pastas, identificadores, códigos guardados, colunas, cabeçalhos CSV, comandos e chaves i18n já estão em inglês (comentários e documentação ficam em português). Código novo nasce em inglês.
- Personalidade = um sistema único (traços + memória) para todas as pessoas e entidades.

## Comandos
`pnpm dev` · `pnpm typecheck` · `pnpm lint` (inclui fronteiras: motor sem React/DOM; UI sem `truth`/`repository`/`worker`) · `pnpm test` (rápidos, dia a dia) · `pnpm test:slow` (calibração e simulações de várias épocas, ficheiros `*.slow.test.ts`) · `pnpm test:all` · `pnpm build` · `pnpm run ci` (corre tudo). Teste novo que simule várias épocas ou muitos jogos nasce como `*.slow.test.ts`; durante o trabalho corre-se `pnpm test` + os ficheiros lentos tocados, e o CI completo só antes do merge. Parâmetros de regras só em `src/engine/config/parameters.ts`.

## Regras de trabalho
- **Git:** `main` = estável, `develop` = integração, `feature/rz-xxx` = trabalho atual (um de cada vez). Docs podem ir direto para `develop`; `main` só recebe merges de marcos. Commits terminam com as linhas de atribuição pedidas pelo ambiente.
- Nomes de clubes realistas (sigla + localidade/gentílico); humor fica na alcunha/mascote. Tom das notícias: realista (`docs/TONE_AND_UX.md`).
- Nunca usar dados do FM nem nomes de pessoas reais no jogo.
- Pega no primeiro item P1 por fazer da fase atual; atualiza o estado no backlog no fim.
- Não implementes nada fora do backlog; ideias novas vão para o Parking lot.
- Clubes e pessoas são fictícios; não usar nomes de clubes reais.
