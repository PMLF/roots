# Raízes — Sistema de interface (RZ-009)

Concretiza `docs/TONE_AND_UX.md` §3. Tudo o que está aqui existe em `src/ui` e tem testes de lógica (a parte pura) ou teste no navegador.

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
| `/` | **Início** (RZ-166): **A seguir** num cartão horizontal baixo no topo; por baixo, lado a lado, **Exige decisão** · **Caixa de entrada** · **Notícias**; no rodapé da página, a **fita de resultados** (resultados e marcadores do último avanço, a correr sem parar; só aparece se houver resultados) |
| `/ficha/?k=<tipo>&id=<id>` | Ficha de qualquer entidade (`clube`, `pessoa`, `localidade`, `cidade`, `competicao`). Os dados vivem no motor, por isso a ficha é uma rota única com *query string* (uma rota por id não é possível numa exportação estática) |
| `/mundo/` | Criar o mundo do save, **reiniciá-lo** (apaga o save e gera outro com seed nova, com confirmação) e diagnóstico técnico |

Menu à esquerda com **no máximo 2 níveis** (secção no menu, separadores na página). Migalhas de pão e «← Voltar» em todas as páginas que não são o «Início». A **Caixa de entrada** deixou o menu: vive no «Início» (o contador de por ler está no item «Início»); a lista completa continua em `/inbox/`.

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

A ficha de clube liga à **localidade** (aldeia, vila ou cidade) e ao **concelho**. A ficha da localidade (`k=localidade`) mostra estatuto, população, clubes e as mudanças de estatuto (`docs/CITY.md` §6b). A pesquisa encontra as localidades que não são sede de concelho.

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

## 3e. Competições e rotas
- **Rotas (em inglês):** `/profile/?type=person|club|city|locality|competition&id=…&tab=…&sort=coluna:dir`, `/competitions/`, `/world/`, `/lab/`. Cada separador entra no histórico (`tab`); ordenação (`sort`) e jornada (`round`) substituem a entrada atual.
- **Competições** (`/competitions/`): cartões compactos (no máximo três lado a lado, 364 px) com a classificação das ligas escolhidas e, no topo de cada um, melhor marcador, melhor jogador (nota média), melhor ataque e melhor defesa. O nome da liga é a ligação para a página. Seletor «Ligas» em dropdown (guardado no browser), com **mínimo de três**; por omissão as três ligas profissionais.
- **Página da liga** (`type=competition`): cartão horizontal «Destaques da competição» no topo (primeiro de cada estatística); carregar nele abre o top 10 de cada lista e a classificação de todas as equipas em ataque e defesa. Por baixo, à esquerda a classificação com zonas (campeão dourado, subida verde, descida vermelha) e à direita as duas jornadas empilhadas (a mais antiga em cima) com «Anterior/Seguinte». Separadores: Resumo, Clubes, História.
- Sem época a correr (antes do RZ-119) o calendário é uma **prévia** e a tabela segue a reputação; um aviso di-lo. Destaques ficam vazios até haver jogos. Competições a eliminar: RZ-151.

- **Estatísticas (RZ-153):** o cartão de destaques não tem título; carregar nele ou em «Ver mais» abre o separador `tab=stats` (top 10, equipas, jogadores). O conteúdo ocupa a largura toda de `<main>`; cartões lado a lado esticam à mesma altura. Segunda Liga com 20 clubes.

## 4. Fica para depois

Fichas de **cidade** (RZ-133) e **competição** (RZ-110) — as ligações já existem e abrem uma ficha «em breve»; separadores *Jogos*, *Carreira*, *História* (precisam de jogos e eventos); conjuntos de colunas com nome; atalhos por secção; «Caixa»/jornal e barra inferior com dados (RZ-120).

## 3e. «Avançar» e hierarquia das páginas (RZ-166, 16-10-2026)

- **Avançar é global**: botão dividido em baixo à direita (barra de estado), em todas as páginas. Por defeito passa **um dia**; a seta escolhe **um dia, uma semana ou até ao próximo jogo** (a escolha fica guardada no browser). A **barra de espaço** conta como clicar, menos dentro de campos de texto, sobre botões e ligações, e na página do jogo. Sem clube não há «próximo jogo». Quando há jogo do teu clube por preparar, o botão passa a «Jogo de hoje» e leva à decisão (Confirmar e jogar): o tempo nunca passa por cima de uma decisão.
- **Regra para todas as páginas**: o mais importante primeiro e em cima; o resto agrupado em cartões com função clara e em sítios previsíveis; ações no mesmo lugar em todo o lado; listas compactas com «Ver tudo» para a página completa. Antes de dar uma página por feita, perguntar «o que é que o gamer precisa de ver primeiro?».
- **Fita de resultados**: só golos (sem cartões nem lesões); pára com o rato ou com o foco; com «reduzir movimento» fica estática e rola-se à mão.

## 3f. Jogo, pré-jogo, caixa e cores dos clubes (RZ-167 a RZ-171, 16-10-2026)
- **Ir a jogo**: com jogo do teu clube por jogar, «Avançar» (e o botão do cartão «Exige decisão») passam a «Ir a jogo» e levam ao ecrã **pré-jogo** (`/prematch/`): confronto, botão «Confirmar e começar o jogo» e o mesmo editor de tática e onze da página «Tática» (`EditorTatica`). Já em jogo, o botão diz «Continuar jogo».
- **Ecrã do jogo** (`/match/`): placar grande com cores dos clubes, relógio e controlos (começar/pausa, velocidade num seletor, «Alterar tática», «só os lances importantes»; «Ir para o fim» só no modo developer; espaço pausa/continua). Três colunas, para que **tabela** e **outros jogos** apareçam logo ao arrancar: eventos | tabela | outros jogos + estatísticas (14). Os outros jogos têm cartão próprio e nunca entram no feed. «Alterar tática» pausa o jogo ao abrir e devolve-o ao estado anterior ao fechar; a mudança conta a partir do minuto seguinte.
- **Depois do jogo** a mesma página abre em modo consulta: resultado final, eventos, tabela, outros resultados e estatísticas; sem controlos de reprodução.
- **Caixa de entrada**: cada mensagem tem o seu botão (lida/por ler) e há «Marcar todas como lidas» no topo; no cartão do Início, o ponto da mensagem faz de botão. Nada se marca sozinho.
- **Cores dos clubes**: `AmostraClube` (retângulo 12×8 px, discreto) vem antes do nome em toda a `Ligacao` de clube; as cores vêm do motor uma só vez (`useCoresClubes`).

## Telemóvel (RZ-223)
- **Em pé (≤ 900 px):** o menu completo é uma gaveta aberta pelo hambúrguer (Esc, toque no fundo ou escolher uma secção fecham-na; o foco vai para o botão de fechar). Em baixo ficam 5 abas (Início, Clube, Plantel, Tática, Jogos) com ícone e texto, 56 px de altura, por cima da barra de data e «Avançar». Alvos de toque ≥ 44 px.
- **Deitado (pouca altura):** barra lateral só com ícones, sem abas nem gaveta.
- **Não forçamos o modo deitado:** o browser só permite bloquear a orientação em ecrã inteiro e o iOS Safari não o suporta; desenha-se primeiro para estar em pé, e o deitado é uma adaptação, não um requisito.
- **Tabelas:** deslizam na horizontal dentro do cartão, com a primeira coluna (o nome) fixa. Onde faltar espaço, mostra-se o essencial e o resto fica na ficha (entrar mais a fundo).
- Auditoria: Chromium a 320, 375, 768, 812×375 e 1280 px; nenhum ecrã do menu pode ter scroll horizontal da página nem conteúdo cortado dentro de cartões.

## Separadores sem «Em breve» (17-10-2026)
- **Clube:** *Jogos* mostra o calendário e os resultados da liga (o mesmo componente da página Jogos, `ClubMatches`); *História* tem o gráfico de subidas e descidas e a tabela de épocas (saiu do Resumo).
- **Pessoa:** *Carreira* tem as estatísticas por época (saíram do Resumo; para quem não é jogador diz que não há jogos); *História* tem o percurso: transferências (de → para, valor), contratações livres, renovações, saídas e reforma, a partir dos eventos públicos.
- O separador ativo desliza sempre para a vista em ecrãs estreitos.
- Regra: um separador só existe se tiver conteúdo; senão, retira-se de `TABS` (`ui/links.ts`). Todas as fichas continuam a acabar em *História*.


## Elementos sem dados removidos (RZ-fill-gaps)
Linhas que mostravam sempre «?»/«—» porque o motor não tem o dado foram retiradas: clube (fundação, adeptos, sócios), pessoa (valor de mercado, forma, condição, moral), barra (orçamento, humor da cidade). «Lesionados» passa a contar `extraSquad[].injured`; «Patrocínios» lista `sponsors`. Voltam quando o motor tiver o dado.
