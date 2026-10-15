# Raízes — Sistema de interface (RZ-009)

Concretiza `docs/TOM_E_UX.md` §3. Tudo o que está aqui existe em `src/ui` e tem testes de lógica (a parte pura) ou teste no navegador.

## 1. Rotas (exportação estática, sem servidor)

| Rota | O que é |
|---|---|
| `/` | **Hoje**: o que mudou · o que exige decisão · a seguir (ações a um clique; «Avançar» entra com o motor de jogo) |
| `/ficha/?k=<tipo>&id=<id>` | Ficha de qualquer entidade (`clube`, `pessoa`, `cidade`, `competicao`). Os dados vivem no motor, por isso a ficha é uma rota única com *query string* (uma rota por id não é possível numa exportação estática) |
| `/mundo/` | Criar o mundo do save e diagnóstico técnico |

Menu à esquerda com **no máximo 2 níveis** (secção no menu, separadores na página). Migalhas de pão e «← Voltar» em todas as páginas que não são «Hoje».

## 2. Componentes

- **`Ligacao`** (`<Ligacao k id>`): qualquer nome de clube, pessoa, cidade ou competição é uma ligação para a ficha. `hrefFicha`/`lerFicha` em `ligacoes.ts`.
- **`Ficha`**: cabeçalho (tipo, nome, números-chave), **separadores fixos e pela mesma ordem** por tipo (`SEPARADORES`: todos começam em *Resumo* e acabam em *História*), coluna de ligações. Separadores sem conteúdo aparecem na mesma, como «Em breve», para a estrutura não mudar quando o jogo crescer. Setas esquerda/direita mudam de separador.
- **`Tabela`** (a única): ordenar (cabeçalho: asc → desc → nada, estável, sem acentos), filtro de texto, **escolher colunas** (guardado por tabela no `localStorage`), **exportar CSV** (`;` e BOM, para o Excel em pt-PT), setas ↑↓ entre linhas e Enter para abrir a ligação da linha. Lógica pura em `tabela/logica.ts`.
- **`Valor`** + `valor.ts`: o que sabes e o que não sabes. *Exato* (`14`), *estimado* (`≈ 14-16`, itálico, sublinhado a ponteado) e *desatualizado* (`≈ 14-16 · visto há 2 épocas`, mais esbatido, sublinhado a tracejado). Vem sempre de uma `Estimativa` da Vista.
- **`Pesquisa`**: `/` ou Ctrl/⌘+K em qualquer página; resultados por clube, cidade e pessoa (nome sem acentos; título exato > prefixo > palavras > contém > nome completo); setas e Enter. O índice é construído no motor (`src/engine/pesquisa`).
- **Densidade** compacta/normal (botão no topo, guardada), **foco visível** e leitores de ecrã (`aria-sort`, `role=tab`, `aria-current`).

## 3. Regras de dados

- A UI só lê o que o motor responde ao pedido (`fichaClube`, `fichaPessoa`, `pesquisar`, `paises`, `estadoMundo`…), e a ficha de pessoa vem da `Vista`: factos públicos sempre; atributos, potencial e personalidade só se foram observados, com margem. Um jogador que ninguém observou mostra «ainda não conheces…» e nunca números.
- A personalidade mostra-se só como rótulos de traços extremos (`traco.<traço>.<alta|baixa>`), nunca como números.
- Um só motor (Web Worker) para a aplicação inteira (`MotorProvider`): navegar não reabre a base de dados.
- Textos sempre por `t()` com chaves em pt-PT e inglês (atributos, funções, traços, separadores e entidades incluídos).

## 4. Fica para depois

Fichas de **cidade** (RZ-133) e **competição** (RZ-110) — as ligações já existem e abrem uma ficha «em breve»; separadores *Jogos*, *Carreira*, *História* (precisam de jogos e eventos); conjuntos de colunas com nome; atalhos por secção; «Caixa»/jornal e barra inferior com dados (RZ-120).
