# Empresas e patrocínios (RZ-219, RZ-311)

Fatia fina do motor. Código em `src/engine/company/`; parâmetros em `companies` (`src/engine/config/parameters.ts`).

## Entidades
- **Empresa** (`company`): id `coNNNNN`, nome fictício, `sector` (construction, banking, retail, food, industry, technology, tourism, media, energy, transport, agriculture, health), `scale` (local, regional, national, international), cidade, dono (pessoa com cargo `businessperson`), `capital` (verdade oculta: capacidade de negócio), ano de fundação, estado `active|closed`.
- **Patrocínio** (`sponsorship`): empresa ↔ clube, tipo `shirt|stadium|stand|youth` (`stadium` dá o nome ao estádio, `stand` dá o nome a uma bancada; os extras de estádio também nomeiam bancadas), valor anual, início, fim (30 de junho), `ended` se rescindido.

## Geração
- Nº de empresas por cidade = `base + porDécada × log10(população / 15 000)`; setor pesado pelo setor da cidade (`CITY_BIAS`), escala pelo tamanho da cidade.
- Os 500 empresários já gerados no mundo ficam donos das primeiras empresas da sua cidade; os restantes donos são criados.

## Patrocínios
- Valor total de um clube por ano = fórmula por escalão × reputação (`annualFixedRevenues`); reparte-se pelos tipos que o escalão oferece (`slots`, `kindShare`).
- A empresa escolhe-se por sorteio com peso `escala×escalão · visibilidade do setor · proximidade · capacidade`. Uma empresa nunca ocupa dois tipos no mesmo clube.
- Duração 1-3 épocas. No fim de cada época: renovação (prob. `renewBase`, +`renewPromoted`/`renewRelegated` se o clube mudou de escalão) ou o tipo fica livre e preenche-se.
- Finanças: `monthlySponsorship` soma os contratos vigentes /12; sem empresas no mundo (testes sem mundo) usa a fórmula antiga.

## Evolução anual (fim de época)
`capital × exp(crescimento + efeito da economia da cidade + ruído)`; probabilidade de falência base mais acréscimo com capital muito baixo; faltas face ao número-alvo da cidade são preenchidas com `foundingRate`. Falir rescinde os patrocínios.

## Calibração
Testes: os patrocínios rendem 80-115 % da fórmula no arranque e 75-120 % após 8 épocas; todos os clubes têm todos os tipos do escalão.

## Direitos de transmissão (RZ-218)
- Emissoras = empresas dos setores `television`, `radio`, `streaming`. No arranque criam-se as nacionais (`broadcast.national`, na maior cidade); as locais/regionais saem da geração normal por cidade. Também podem patrocinar.
- **Leilão anual** (início de cada época): um pacote por escalão e um por distrito nas distritais. Licitantes sorteados por interesse (`broadcast.interest`, depende do escalão, do tipo e da escala; locais só se o distrito coincide), proposta = valor de referência × ajuste × ruído, limitada pela capacidade. Ganha a mais alta e paga o segundo preço (mínimo = reserva); abaixo da reserva fica por vender (comum nas distritais). Bónus de quem já tinha os direitos.
- Valor de referência = `annualCommercial` do escalão × `packageShareOfCommercial`; o resto continua em «comercial». O pacote reparte-se pelos clubes por reputação em contratos `broadcast` de uma época, lançados em `broadcasting`.
- **Jogos de interesse**: por jornada, os `featuredPerRound` jogos de maior interesse (reputação das duas equipas, dérbi, eliminatória) pagam `matchFee × interesse` aos dois clubes (metade cada). Taça: 2 por ronda; Supertaça: sempre.
- Calibração: comercial restante + pacote fica entre 85 % e 110 % do comercial antigo por escalão.
- Aposta nos jovens: ver `squad/youthFocus.ts` (presidente paciente → mais formação; ambicioso → contrata feito; clubes pequenos apostam mais).
