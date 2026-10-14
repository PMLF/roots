# Raízes — contexto para o Claude (repositório: PMLF/roots)

Jogo de browser de gestão de futebol português com **clubes ligados a cidades** (histórias de *underdogs*, descoberta de talento, Câmara, adeptos, política). Dono: Pedro (front-end dev, Portugal). Comunicar em português de Portugal.

## Ler primeiro
1. `BACKLOG.md` — fonte de verdade: o que fazer, por fases e prioridade.
2. `docs/DESIGN_REGRAS.md` — pirâmide, prémio do Estado, distritais variáveis, sinergias.
3. `data/` — 298 clubes, 276 concelhos, rivalidades. Fontes editáveis em `data/src/`; `python3 tools/build_dados.py` regenera e valida; `python3 tools/build_xlsx.py` gera `Clubes_Raizes.xlsx`.

## Stack e convenções
- Next.js + TypeScript + React; sem backend; persistência local + exportação JSON.
- **Motor de simulação em TypeScript puro** (`src/engine`), sem imports de React/DOM, testável headless. UI em `src/ui`.
- Tudo o que tem números (assistência, golos, lesões, prémios) tem parâmetros em ficheiro de configuração e passa no harness de calibração antes de ser dado como feito.
- Histórico = log de eventos append-only; módulos de arquivo/hall of fame leem daí.
- Personalidade = um sistema único (traços + memória) para todas as pessoas e entidades.

## Regras de trabalho
- Pega no primeiro item P1 por fazer da fase atual; atualiza o estado no backlog no fim.
- Não implementes nada fora do backlog; ideias novas vão para o Parking lot.
- Clubes e pessoas são fictícios; não usar nomes de clubes reais.
