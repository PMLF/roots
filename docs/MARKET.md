# Mercado de transferências (RZ-205 / RZ-213)

Código em `src/engine/market/`; parâmetros em `market` (`src/engine/config/parameters.ts`). Por agora só entre clubes da IA; o clube do gamer nem compra nem vende (as propostas ao gamer chegam com RZ-164/165).

## Janelas e rondas
Verão (1 jul – 1 set) e inverno (1 – 31 jan). Corre uma ronda à segunda-feira, no dia de abertura e no último dia (`isMarketDay`), chamada por `advanceDay`.

## Decisão de um clube (por ronda)
1. Age com probabilidade `actProbability` (mais no último dia); no máximo `maxSigningsPerWindow` contratações por janela; só se o plantel tiver menos de alvo + folga.
2. Necessidade: a posição por preencher ou, senão, a posição com o titular mais fraco face à qualidade desejada do clube (escalão + reputação).
3. Candidatos: jogadores de outros clubes e livres dessa posição, com qualidade acima do titular mais fraco (+`minUpgrade`) e até `desired + qualityCeiling`; custa tem de caber na verba de transferências e o ordenado na massa salarial (`budget.ts`, com `wageSlack`).
4. O vendedor pede `valor × (askBase + ganância do presidente) ` (×1,25 se for titular) e não vende se ficar com menos de alvo − 2 jogadores; o comprador sobe até `counterTolerance` acima do valor.
5. O jogador consente consoante o escalão de destino (sobe / igual / desce), a ambição, a lealdade e a subida de ordenado.
6. Com o plantel completo, o reforço desloca o suplente mais fraco se o contrato dele acaba em 12 meses (fica livre).

## Dinheiro
`transfers` no livro de ambos (conservação testada); o vendedor passa a poder gastar `saleToBudget` do que recebeu. Livres não pagam fee. Eventos `TRANSFER` (jogador, vendedor, comprador, fee, ordenado, anos) e `PLAYER_SIGNED` (livres).

## Valor de mercado
`ordenado anual × múltiplo da idade (interpolado) × prémio do potencial (jovens) × peso do contrato restante` (`value.ts`).

## Agentes (RZ-206)
- Cada jogador pode ter um **agente** (pessoa com a função `agent`, personalidade própria; campo `agent` do jogador, migração V7). A quota por escalão do clube está em `market.agents.share` (1.ª Liga ~85 %, distritais ~4 %). A atribuição (`agent/assign.ts`, `assignAgents`) corre na criação do mundo e na passagem de época para os novos jogadores; favorece agentes com mais clientes (`popularity`), por isso uns ficam muito maiores que outros.
- **Ganância** do agente: sobe o ordenado pedido (`wageByGreed`) e a comissão (`commissionRate` do ordenado anual × `commissionByGreed`). A comissão paga-se pelo orçamento de transferências do clube e **sai do circuito dos clubes** (livro `transfers`); o evento `TRANSFER`/`PLAYER_SIGNED` traz o agente como entidade e a `commission` nos dados.
- **Ganância** alta e **lealdade** baixa do agente empurram o jogador a aceitar sair (`consentByGreed`, `consentByLoyalty`).
- Falta: agentes por ocupação/idade e reforma, mudança de agente, comissões escondidas e propostas ao gamer (RZ-165/207).

## Cláusula de revenda (RZ-207, fatia a)
- O contrato passa a ter `clauses` (JSON, migração V8). Primeira cláusula: `resale { club, pct }` — o clube que vendeu o jogador fica com `pct` (8-20 %) de uma venda futura.
- Ao vender, o vendedor negoceia a cláusula com probabilidade `market.clauses.resaleProbability` (sobe com a ganância do presidente). No contrato novo fica só a cláusula mais recente.
- Numa venda com cláusula, o clube de origem recebe `pct × valor` e o vendedor recebe o resto (o dinheiro continua a conservar-se); o evento `TRANSFER` traz o clube de origem (`roleKind: "resale"`) e `resaleCut`.
- Próximas fatias: cláusula de rescisão, bónus por golos, «regresso à terra» e a compensação de formação (Parking lot).

## Cláusula de rescisão (RZ-207, fatia b)
- Um contrato novo (assinatura no mercado ou renovação na passagem de época) pode levar `clauses.release`: um valor (1,2-2,2 × o valor de mercado) que **qualquer clube pode pagar sem o vendedor poder recusar**. Probabilidade `market.clauses.releaseProbability`, mais alta com agente ganancioso (`releaseByAgentGreed`, relativo ao pivô).
- No mercado, se o vendedor recusaria (pede mais do que o comprador aceita) mas o comprador pode pagar a cláusula (mais a comissão), a transferência faz-se pelo valor da cláusula (`TRANSFER` com `release: true`). O consentimento do jogador continua a contar.
- É assim que clubes mais ricos levam os melhores jogadores dos pequenos. Falta ligar à compensação de formação e à saída a custo zero.

## Compensação de formação (RZ-207, fatia c)
- O jogador guarda o clube onde se formou (`trainedAt`, migração V9): formação própria na passagem de época e, no arranque, quem tem até 22 anos conta como formado no clube onde está.
- Quem contrata um **livre** com 23 anos ou menos, formado noutro clube, paga-lhe `training.byTier[escalão do clube formador] × ordenado anual do contrato novo` (a pagar pelo orçamento de transferências). Nas **distritais é zero** e no CP quase (`0,08`): a custo zero, como acontece na vida real. A 1.ª Liga leva 1,2 ordenados.
- O evento `PLAYER_SIGNED` traz o clube formador (`roleKind: "trainer"`) e a `compensation`. O dinheiro conserva-se.
- Corrigido de caminho: sem clube do gamer definido, o mercado ignorava os livres (`undefined !== undefined`).
- Falta: solidariedade em transferências com contrato (percentagem para clubes formadores), jovens sem contrato profissional e a decisão do clube formador de renovar a tempo.

## Renovações do clube do gamer (RZ-165, fatia a)
- Os contratos que acabam antes da próxima época aparecem em `renewals` (jogador, ordenado atual, pedido, decisão).
- **Pedido** (`squad/renewals.ts`): fórmula de ordenado do escalão × `renewalWageFactor` × fator do agente (ganância), nunca abaixo de 95 % do ordenado atual; duração `negotiation.askYears`.
- **Aceitação**: o jogador aceita ofertas a partir de `acceptFloor` × pedido; o patamar baixa com a lealdade (`floorByLoyalty`) e se o clube é da terra (`floorNative`), com mínimo `floorMin`. Se recusa, a resposta traz o pedido.
- **Decisão**: `negotiateRenewal` (aceite fica registada) ou `releaseExpiring`; ficam em meta `renewal.<época>.<pessoa>` e a passagem de época aplica-as no clube do gamer. Sem decisão, o clube do gamer continua a renovar ao ordenado de fórmula (comportamento anterior).
- Ainda sem UI.

## Negociação de renovações com o agente (RZ-165, fatia c)
Três variáveis: **ordenado mensal, anos (1-5) e cláusula de rescisão** (ou sem cláusula). Ficaram de fora, para o Parking lot: bónus de assinatura/golos (207d) e estatuto/minutos prometidos.
- Ronda a ronda (`negotiateRenewal`, estado em `renewal.negotiation.<época>.<pessoa>`): o agente **aceita** se o ordenado chega ao patamar (`acceptFloor` × pedido × fator da cláusula), **contrapropõe** (aproxima-se da oferta a `concession^ronda`, corrige os anos se estiverem 2+ longe do pedido e corta cláusulas acima do teto) ou **fecha a porta** (oferta abaixo de `walkAway` × pedido, ou mais de `maxRounds` rondas). Fechada sem acordo, o jogador sai na passagem de época.
- **Cláusula**: mais alta (ou nenhuma) custa ordenado (`clauseWage` por referência acima de 1); a referência é o valor de mercado × meio do intervalo de `market.clauses.releaseFactor`.
- **Interesse** (`renewalInterest`): um jogador muito acima do nível do escalão (`level.margin` desvios), ambicioso e pouco leal não quer renovar; em escalões baixos (`distance.tiers`), quem não é da terra nem do distrito só fica por `distance.wageFactor` × o ordenado médio do escalão. Naturais e leais ficam isentos.
- A decisão aceite guarda `release` e é aplicada em `rollover`. Parâmetros em `squadCycle.contracts.negotiation`.
