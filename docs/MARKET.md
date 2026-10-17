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
