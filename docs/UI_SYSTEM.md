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
| `/` | **Início** (RZ-166): **A seguir** num cartão horizontal baixo no topo; por baixo, lado a lado, **Caixa de entrada** · **Notícias** (não há «Exige decisão»: o que pede resposta — jogo de hoje, propostas, negociações — está no topo da Caixa, e uma proposta em aberto é **um só** cartão alto com o botão «Responder», sem aviso duplicado; propostas e camadas jovens são cartões altos `TallCard`: faixa e fundo com a cor do clube, título maior, posição e estrelas quando se sabem); no rodapé da página, a **fita de resultados** (resultados e marcadores do último avanço, a correr sem parar; só aparece se houver resultados) |
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

- **Taças e história (RZ-244):** a Taça de Portugal aparece em `/competitions/` (cartão com navegação por ronda) e tem ficha própria (`type=competition&id=Taça de Portugal`: rondas e História). Cada linha de resultado mostra a cor do clube e, nas pontas, o escalão (1L, 2L, 3L, CP, Dist.); prolongamento e penáltis aparecem sob o marcador. O separador História (ligas e taças) tem cartões: pódios por época, mais títulos, mais pódios, mais pontos de sempre, melhores marcadores/assistentes, mais jogos, cartões e recordes (goleada, jogo com mais golos, melhor ataque/defesa, mais golos numa época). O clube tem um cartão «Competições» (liga: posição; taças: fase ou estado).

## 4. Fica para depois

Fichas de **cidade** (RZ-133) e **competição** (RZ-110) — as ligações já existem e abrem uma ficha «em breve»; separadores *Jogos*, *Carreira*, *História* (precisam de jogos e eventos); conjuntos de colunas com nome; atalhos por secção; «Caixa»/jornal e barra inferior com dados (RZ-120).

## 3e. «Avançar» e hierarquia das páginas (RZ-166, 16-10-2026)

- **Avançar é global**: botão dividido em baixo à direita (barra de estado), em todas as páginas. Por defeito passa **um dia**; a seta escolhe **um dia, uma semana ou até ao próximo jogo** (a escolha fica guardada no browser). A **barra de espaço** conta como clicar, menos dentro de campos de texto, sobre botões e ligações, e na página do jogo. Sem clube não há «próximo jogo». Quando há jogo do teu clube por preparar, o botão passa a «Jogo de hoje» e leva à decisão (Confirmar e jogar): o tempo nunca passa por cima de uma decisão.
- **Regra para todas as páginas**: o mais importante primeiro e em cima; o resto agrupado em cartões com função clara e em sítios previsíveis; ações no mesmo lugar em todo o lado; listas compactas com «Ver tudo» para a página completa. Antes de dar uma página por feita, perguntar «o que é que o gamer precisa de ver primeiro?».
- **Fita de resultados**: só golos (sem cartões nem lesões); pára com o rato ou com o foco; com «reduzir movimento» fica estática e rola-se à mão.

## 3f. Jogo, pré-jogo, caixa e cores dos clubes (RZ-167 a RZ-171, 16-10-2026)
- **Táticas (RZ-248)**: campo de futebol em vetor com os 11 lugares da formação (`PITCH_LAYOUT`, representação habitual de cada sistema); cartões com as cores do clube, estrelas e posição, e um halo desfocado verde/amarelo/vermelho conforme o rendimento na posição. Escolhe-se por arrastar e largar (ou tocar no jogador e depois no lugar / «Pôr aqui»), entre campo, suplentes (7) e reservas; a tabela mostra jogos, nota média dos últimos 5, energia, nível, idade e golos. **Não há onze automático**: o campo começa vazio, mudar de formação só mantém quem tem lugar igual, e «Confirmar e começar» recusa (`startMatch`/`confirmMatch` com `strict`) sem 11 completos e disponíveis. Só as simulações sem interface (dev, testes) completam o onze sozinhas.
- **Táticas (RZ-249)**: página em duas faixas. Em cima, um cartão horizontal com a formação, sete escalas de cinco passos (`TacticControls`: título, nível escolhido, cinco passos e os dois extremos) e a área a explorar (cinco opções); o mesmo componente serve o popup do jogo e o Laboratório. Em baixo, campo e plantel lado a lado **com a mesma altura** (o campo dimensiona-se à altura da janela; a tabela rola por dentro com o cabeçalho fixo), de forma a caber em 1440×900 sem scroll da página. Arrastar um jogador mostra um **cartão pequeno** (`dragCard.ts`: posição com as cores do clube e nome), não a linha da tabela nem a ligação; os cartões do campo são `div role=button` (o Firefox não arrasta `<button>`) e arrastam-se para outro lugar (troca), para o banco ou para as reservas.
- **Ir a jogo**: com jogo do teu clube por jogar, «Avançar» (e o botão da decisão no topo da Caixa de entrada) passam a «Ir a jogo» e levam ao ecrã **pré-jogo** (`/prematch/`): confronto, botão «Confirmar e começar o jogo» e o mesmo editor de tática e onze da página «Tática» (`EditorTatica`). Já em jogo, o botão diz «Continuar jogo».
- **Ecrã do jogo** (`/match/`): placar grande com cores dos clubes, relógio e controlos (começar/pausa, velocidade num seletor, «Alterar tática», «só os lances importantes»; «Ir para o fim» só no modo developer; espaço pausa/continua). Três colunas, para que **tabela** e **outros jogos** apareçam logo ao arrancar: eventos | tabela | outros jogos + estatísticas (14). Os outros jogos têm cartão próprio e nunca entram no feed. «Alterar tática» pausa o jogo ao abrir e devolve-o ao estado anterior ao fechar; a mudança conta a partir do minuto seguinte.
- **Depois do jogo** a mesma página abre em modo consulta: resultado final, eventos, tabela, outros resultados e estatísticas; sem controlos de reprodução.
- **Caixa de entrada**: cada mensagem tem o seu botão (lida/por ler) e há «Marcar todas como lidas» no topo; no cartão do Início, o ponto da mensagem faz de botão. Nada se marca sozinho.
- **Cores dos clubes**: `AmostraClube` (retângulo 12×8 px, discreto) vem antes do nome em toda a `Ligacao` de clube; as cores vêm do motor uma só vez (`useCoresClubes`).

## Telemóvel (RZ-223)
- **Em pé (≤ 900 px):** o menu completo é uma gaveta aberta pelo hambúrguer (Esc, toque no fundo ou escolher uma secção fecham-na; o foco vai para o botão de fechar). Em baixo ficam 5 abas (Início, Clube, Plantel, Tática, Jogos) com ícone e texto, 56 px de altura, por cima da barra de data e «Avançar». Alvos de toque ≥ 44 px.
- **Navegação (19-10-2026):** 4 abas (Início, Clube, Plantel, Tática) + **«Mais»**, que abre a gaveta com todas as secções (Competições, Olheiros, Jogos, Cidade…). Segue a convenção de iOS/Material: até 5 destinos em baixo e o resto atrás de «Mais»; «Mais» fica ativa nas páginas que só se alcançam pela gaveta.
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

## Feedback de UI (17-10-2026)
- **Voltar**: a mudança de separador usa `router.replace`, por isso «Voltar» (`router.back()`) sai da ficha para a página onde estávamos antes de abrir a pessoa/clube/cidade, em vez de saltar entre separadores.
- **Separadores** sem scroll horizontal (em ecrãs estreitos repartem a largura).
- **Cidade**: o cartão da Câmara (autarca + orçamento) é o primeiro do resumo e já não há separador «Autarca»; «O que o setor traz à cidade» (lista horizontal) divide a linha com «Acontecimentos»; a história dos indicadores usa as barras 1-5. As barras estavam vazias porque o CSS esperava `.cheio` e o componente punha `.full`.
- **Finanças do teu clube**: o orçamento é decidido pelo presidente; a UI só mostra orçamento salarial total, margem salarial e verba de transferências que resta (o `setBudget` fica no motor).
- **Renovações**: já não há ecrã. O plantel mostra «Renovar» nos contratos que acabam esta época e abre `RenewalDialog`.

## Feedback de UI (17-10-2026, 2.ª ronda)
- **Notícias** deixou de ter página e item de menu (o motor e o painel do Início mantêm-se). **Breadcrumbs** removidos: fica só o botão «Voltar». **CSV** removido de todas as tabelas.
- **Data** no canto superior direito de todas as páginas; a **barra de baixo** mostra o essencial do teu clube e cidade (`ClubBar`): próximo jogo, lugar e pontos na liga, caixa, margem salarial, lesionados e apoio da Câmara. Em ecrãs estreitos a barra só tem o botão Avançar.
- **Selects** com a seta afastada da borda; a vista do plantel está na barra da tabela, ao lado do filtro e das colunas (`toolbar`).
- **Popup de renovação**: bloqueado depois da primeira proposta (sem fechar, Esc nem clique fora) até haver acordo, «Deixar sair» ou o agente desistir; depois de desistir só volta a falar um mês depois; ordenado e cláusula são dropdowns com valores sugeridos à medida do jogador (cláusula inclui «Sem cláusula»). O botão «Renovar» está também na ficha do jogador.
- **Pessoas**: sem separador «Carreira» nos que não são jogadores (card «Carreira como jogador» no Resumo, só se houve carreira); «História» tem sempre uma tabela, com pelo menos uma linha (época atual). Localidades também.
- **Jogadores do teu clube** conhecem-se por inteiro: atributos exatos, potencial com margem pequena, ordenado, nível e estrelas, sem depender de observações (`ownProfile`).
- **Substituições**: estrelas de nível de cada jogador (`stars` no `LivePlayer` do clube do gamer), botão de confirmar à direita e as cores de aptidão a funcionar (o CSS usava os nomes antigos `apt-bom/medio/mau`; o código usa `good/average/bad`).
- **Eventos do jogo** traduzidos: as chaves dos comentários ainda eram as portuguesas antigas (`jogo.*`) em vez de `match.*`.

## Jogo e táticas (RZ-254, 20-10-2026)
- **Uma só componente de táticas:** a janela «Tática e substituições» do jogo (`match/LiveTactic.tsx`) converte o jogo ao vivo num `ViewPlan` e usa `TacticControls`, `PitchBoard`, `BenchStrip` e a tabela de Onze/Suplentes da página de Táticas. Aqui o onze e o banco só mudam por substituições (suplente ↔ titular, por clique ou a arrastar), limitadas pelos contadores, e confirmam-se de uma vez; quem sai não volta.
- **Jogo a decorrer:** `useMatchProgress()` (em `GameProgress.tsx`) diz ao `Shell` se há jogo do gamer em curso. Fora da página do jogo aparece «Jogo a decorrer · minuto» a cheio na cor de destaque (topo do menu; no telemóvel, faixa por cima das abas). O gamer navega à vontade; o relógio só corre na página do jogo, por isso sair pausa.
- **Lances que param o tempo:** golo (qualquer equipa), vermelho e lesão pausam 3 s e o lance pisca devagar no feed (verde no golo, vermelho no cartão/lesão; sem animação com `prefers-reduced-motion`). Se for vermelho ou lesão da equipa do gamer, abre-se a seguir a janela de táticas; depois o jogo retoma como estava.

## Retoques do jogo e das táticas (RZ-255, 20-10-2026)
- **Opções táticas:** oito opções em duas filas de quatro (uma, duas ou quatro colunas conforme a largura); a formação, quando existe, fica numa linha à parte por cima.
- **Área a explorar:** mini meio campo com três zonas (ala esquerda, meio, ala direita). Cada toque liga/desliga a zona; nenhuma ligada = a equipa joga em todo o lado (`any`); duas alas = `wings`; o meio exclui as alas e vice-versa. O motor continua a guardar um só valor `Area`.
- **Jogo ao vivo:** o flash dos lances que param o tempo dura ~3 s (0,45 s × 6, forte); o segundo amarelo é um só lance com o cartão vermelho sobreposto ao amarelo; na janela de táticas arrasta-se ou toca-se para trocar titulares de lugar ou passar para um lugar vazio (de borla); a confirmação envia substituições e posições (`substitutionsInMatch.positions`).


## Vida fora do futebol: branco e preto (RZ-318, a implementar)

Tudo o que diz respeito à vida da pessoa **fora do futebol** (profissão dos semi-profissionais e amadores, e mais tarde família, estudos, imprensa cor-de-rosa) usa **fundo branco com letras pretas**, em pills (`Chip`) como as do mercado. Os tokens ficam definidos em `globals.css` quando o RZ-318 for implementado.

## Mercado: amarelo e preto (RZ-257)

Tudo o que é do mercado de transferências usa `--mercado` (amarelo) com `--mercado-texto` (preto): pills «À venda», «Clubes interessados» e «Ofertas feitas» (`Chip tone="mercado"`) e o destaque da mensagem para onde «Avançar» te leva. «Avançar» não passa o tempo enquanto houver mensagens por ler, propostas recebidas por responder ou negociações abertas: leva-te, uma a uma, ao que falta.

## Cartão colapsável das opções táticas (RZ-259)

No pré-jogo e em Táticas (`TacticEditor`) o cartão das opções começa fechado: cabeçalho-botão com resumo e «Alterar» + setas duplas (rodam ao abrir). O popup do jogo ao vivo mantém as opções sempre visíveis.
