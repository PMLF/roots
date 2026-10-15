# Raízes — Sistema de interface (RZ-009)

Concretiza `docs/TOM_E_UX.md` §3. Tudo o que está aqui existe em `src/ui` e tem testes de lógica (a parte pura) ou teste no navegador.

## 0. Desenho visual (RZ-144)

Calmo, claro e informativo; sem cores berrantes nem sombras (só nos pop-ups). Tudo em `src/app/globals.css`, por *tokens* (`--fundo`, `--painel`, `--texto`, `--suave`, `--linha`, `--destaque`, `--aviso`, `--r-s/--r-m`).
- **Cor:** neutros frios com um toque de verde; o verde do relvado é a única cor de marca (menu ativo, ligações, botão primário). Aviso a vermelho só para erros e desatualizações.
- **Tipo:** fonte do sistema, números tabulares, hierarquia por peso e espaço (títulos 28/24/16/14), linhas com menos de ~72 caracteres.
- **Estrutura:** menu à esquerda a toda a altura com marca e ícones simples (`Icone.tsx`); topo com pesquisa, tema e densidade; página ao centro (máx. 1120 px); caixa à direita (some abaixo de 1180 px); barra de estado em baixo. Em ecrãs estreitos o menu passa para o topo.
- **Cartões** (`.painel`, números-chave da ficha) e **tabelas** com raio pequeno, cabeçalho esbatido, linha realçada ao passar.
- **Tema:** automático (segue o sistema), claro ou escuro, guardado por pessoa (`raizes.tema`). Densidade normal/compacta como antes.
- Teclado: foco visível; `prefers-reduced-motion` respeitado.

## 1. Rotas (exportação estática, sem servidor)

| Rota | O que é |
|---|---|
| `/` | **Hoje**: o que mudou · o que exige decisão · a seguir (ações a um clique; «Avançar» entra com o motor de jogo) |
| `/ficha/?k=<tipo>&id=<id>` | Ficha de qualquer entidade (`clube`, `pessoa`, `localidade`, `cidade`, `competicao`). Os dados vivem no motor, por isso a ficha é uma rota única com *query string* (uma rota por id não é possível numa exportação estática) |
| `/mundo/` | Criar o mundo do save, **reiniciá-lo** (apaga o save e gera outro com seed nova, com confirmação) e diagnóstico técnico |

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

## 3b. Localidades

A ficha de clube liga à **localidade** (aldeia, vila ou cidade) e ao **concelho**. A ficha da localidade (`k=localidade`) mostra estatuto, população, clubes e as mudanças de estatuto (`docs/CIDADE.md` §6b). A pesquisa encontra as localidades que não são sede de concelho.

## 3b. Posições e outros códigos

O que se guarda está em **inglês** (posições GK, RB, CB, LB, DM, CM, AM, RW, LW, ST; mais tarde tudo o resto, RZ-143). A interface mostra a **sigla** (`posicao.<código>`: em pt-PT GR, DD, DC, DE, MDC, MC, MO, ED, EE, PL) ou o **nome** (`posicao.nome.<código>`) no idioma escolhido, com `siglaPosicao`/`nomePosicao` (`src/ui/i18n/posicao.ts`). Nunca mostrar um código guardado sem passar por aqui.

## 3c. Modo developer

**Laboratório** e **Mundo** são ferramentas, não jogo: só aparecem no menu no modo developer (`src/ui/dev.ts`: `pnpm dev`, ou build com `NEXT_PUBLIC_RAIZES_DEV=1`, ou `localStorage.setItem("raizes.dev", "true")` no browser). O Laboratório não mostra nada fora desse modo. A rota `/mundo/` continua alcançável pela ligação de «Hoje» enquanto não há mundo, só porque ainda é por onde se cria; o RZ-138 (nova save) passa essa função para o jogo e a página fica só para developers.

## 3d. Fichas ricas e «Ver tudo»
- **Pessoa:** nome + chips (posição, clube) e, ao lado, um cartão de identidade (nascimento, país, corpo, pé, clube, contrato, estado). Corpo em cartões: atributos 1–20 por grupo (bandas de cor), nível e condição, contrato e mercado, personalidade, estatísticas. Atributo desconhecido = «?» ou intervalo (`NivelEstimado`). Outros papéis: cartões Cargo, Qualidades e Personalidade.
- **Clube:** chips (dimensão em palavras, escalão, distrito), cartão de identidade, cartões Dimensão, Finanças, Plantel em números, Estádio, Equipa técnica, Jogos e gráfico de subidas e descidas. Tabela do plantel com posição, idade, nível, país, pé, altura, peso, contrato, estado.
- **Reputação em palavras:** `parametros.reputacao.niveis` (Mundial ≥9000, Continental ≥6500, Nacional ≥3500, Regional ≥2000, Local ≥1000, Obscuro). O número só aparece como detalhe.
- **«Ver tudo» (só developer):** pedido `verTudo` ao motor devolve a verdade oculta em campos `verdade` separados; a UI nunca importa a verdade do motor. Cartões com borda tracejada vermelha.
- **Estrutura da ficha (RZ-148):** sem coluna lateral nem Caixa de entrada; topo = nome + chips numa linha e cartão de identidade por baixo, em colunas; cartões da mesma linha têm a mesma altura; «Ver tudo» é um interruptor no menu (grupo Developer).
- **Cores do clube:** retângulo do tamanho da linha de texto antes do nome: lisa, dividida ao meio, maioria (`Azul 80% e branco`) ou riscas verticais/horizontais.
- Placeholders («?») marcam dados que ainda não existem; a preencher nos itens respetivos.

## 4. Fica para depois

Fichas de **cidade** (RZ-133) e **competição** (RZ-110) — as ligações já existem e abrem uma ficha «em breve»; separadores *Jogos*, *Carreira*, *História* (precisam de jogos e eventos); conjuntos de colunas com nome; atalhos por secção; «Caixa»/jornal e barra inferior com dados (RZ-120).
