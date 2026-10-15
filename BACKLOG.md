# Raízes — Backlog

> Nome provisório do jogo. Estado em **14-10-2026**. Este ficheiro é a fonte de verdade do projeto.
> **Regra para o Claude em cada sessão:** lê este ficheiro, `docs/DESIGN_REGRAS.md` e `CLAUDE.md`; pega no primeiro item **P1** por fazer da fase atual; não implementes nada que não esteja aqui; ideias novas vão para o *Parking lot* (§11) e só entram numa fase quando a anterior estiver a funcionar.

**Legenda.** Prioridade: **P1** = necessário no MVP da fase · **P2** = logo a seguir · **P3** = bem depois do MVP. Tamanho: **S** ≤ 3 h · **M** 4-10 h · **L** 10-25 h · **XL** > 25 h (horas de trabalho conjunto). Estado: `[ ]` por fazer · `[~]` em curso · `[x]` feito. `→` = depende de.

---

## 1. Visão

Um jogo de **histórias** mais do que de simulação. Ciclo central: **descobrir talento → desenvolvê-lo → ver o clube crescer → a cidade reage → a cidade devolve ao clube**. Gosto central do Pedro: descobrir jogadores novos (de clubes rivais, de países "estranhos"), vê-los evoluir; negociações e contratos; ver divisões inferiores e ligas estrangeiras; histórias de *underdogs* que sobem por boas decisões e filosofia própria; staff; cidade, Câmara, empresas e adeptos com peso real; política regional e nacional a afetar tudo. A **tática é secundária** (algumas opções simples).

**Glossário:** *gamer* = quem joga o jogo; *jogador* = futebolista.

**Papel do gamer:** presidente + diretor desportivo, com **poder de treinador que vai perdendo** à medida que o clube cresce. Nas distritais és o faz-tudo (treinador, olheiro, presidente); ao crescer delegas. Mantém um "poder extra" (intervir na formação/estilo em jogos decisivos), mas interferir demais gasta a confiança do treinador.

**Ligação ao Football Manager:** o mundo base é a base "Portugal Alternativo" (Pedro) — 58 clubes originais + 240 novos (CP e distritais), agora em `data/`.

## 2. Decisões já tomadas

| # | Decisão | Razão |
|---|---|---|
| D1 | Jogo de **browser** em Next.js + TypeScript + React, sem backend | O Pedro domina esta stack; jogo é sobretudo ecrãs de dados |
| D2 | **Motor de simulação em TypeScript puro**, separado da UI | Testável sem interface (50 épocas em segundos) e portável (desktop/Godot) |
| D3 | **Não usar Unity** | Interface/dados é o que pesa; o Claude não corre o editor do Unity nem faz a ligação visual; o motor testável em TS é a vantagem |
| D4 | Persistência em **SQLite** (WASM + OPFS no browser; `better-sqlite3` no harness), um ficheiro por save, exportável; **histórico append-only** com derivadas reconstruíveis (`docs/HISTORICO_EVENTOS.md`) | Consultas rápidas para as páginas, nada se perde entre épocas, informação pública vs. oculta |
| D5 | **Mundo largo mas raso** (níveis de detalhe) | Simular ao pormenor só o que interessa; resto estatístico |
| D6 | Clubes fictícios; o gamer pode importar a sua própria base | Evita problemas de licenciamento |
| D7 | Cidade = **painel de variáveis e obras**, não *city builder* com ruas | Evita derrapar para outro jogo |
| D8 | Personalidade (traços + memória) num **sistema único** para toda a gente | Barato e gera enredo |
| D9 | Pirâmide de 5 escalões, 20 distritos, **Fase de Promoção** (8 sobem ao CP por ano), prémio do Estado (2 M€ livres), distritais variáveis | `docs/DESIGN_REGRAS.md` |
| D10 | Ideias novas só entram via Parking lot | Evitar *scope creep* |
| D11 | Git: `main` (estável/publicado), `develop` (integração) e `feature/rz-xxx` (a atual); docs podem ir direto para `develop` | Projeto a solo; fluxo simples |
| D12 | Jogos do teu clube **ao vivo, minuto a minuto**; outros jogos só golos, vermelhos e melhor em campo; o simulador é **retomável** (para mudar tática/substituições ao vivo mais tarde) | Pedido do Pedro, 15-10-2026 |
| D13 | Tom realista como a imprensa real, com ironia pontual e imprensa cor-de-rosa; nomes de clubes realistas; UI densa e organizada, pouca ilustração | `docs/TOM_E_UX.md` |
| D16 | Cidade = painel de variáveis e projetos; o gamer **influencia** (propõe, negoceia, cofinancia), o autarca decide; cidade do gamer mensal, as outras anual; sem partidos reais; clubes não desaparecem no MVP; estádio do clube, municipal ou partilhado; novo estádio com escolha do local | `docs/CIDADE.md` |
| D15 | **Gamer** = quem joga; **jogador** = futebolista. Mundo gerado por save (seed), pessoas diferentes em cada save; i18n pt-PT/EN desde o início; saves em ficheiros `.raizes` com autosave de 7 em 7 dias | `docs/GERACAO_MUNDO.md` |
| D14 | Arquitetura aberta à expansão: motor num **Web Worker**, repositório por interface, textos por chave (i18n), dados de conteúdo fora do código; **sem dados do FM** no jogo | Permite Steam (casca desktop), inglês, 2D e mapa mais tarde (§10b) |

## 3. Plataforma e processo

**Recomendação: GitHub** (repositório privado `raizes`).
- Este `BACKLOG.md`, `CLAUDE.md` (contexto e convenções para o Claude), `docs/`, `data/`, `src/` vivem todos no repo; o Claude lê e escreve o repo em cada sessão e o histórico de commits é a memória do projeto.
- Opcional quando crescer: **GitHub Issues + Projects** (um issue por item `RZ-xxx`, quadro Kanban). Não vale a pena Linear/Jira/Notion: mais atrito para um projeto a solo, e o Claude trabalha melhor com ficheiros no repo.
- Ligação: no claude.ai, *Definições → Conectores → GitHub*; depois criar o repo e dar acesso. Alternativa sem ligação: pasta local ligada à app de desktop.
- Rotina de sessão: ler backlog → escolher item → implementar com testes → atualizar estado aqui → commit.
- **Definição de feito:** código + testes do motor + sem erros de TypeScript + backlog atualizado + dados novos registados no histórico.
- **Calibração:** qualquer regra com números (assistência, golos, lesões, prémios) tem de passar no harness headless (RZ-123) antes de ser dada como feita.

## 4. Fases

| Fase | Meta | Tempo (8-10 h/semana) |
|---|---|---|
| F0 | Fundações: repo, modelo de dados, formato do histórico | ~1 semana |
| F1 | **MVP jogável**: botão Avançar viciante, época completa, pirâmide a funcionar | 4-6 semanas |
| F2 | Descoberta, mercado, staff | 4-6 semanas |
| F3 | Cidade, pessoas, política | 4-6 semanas |
| F4 | Equilíbrio, mapa, ligas estrangeiras, conteúdo | 4+ semanas |

Estimativa de custo (plano Claude + nada mais; ver conversa): MVP ~40-200 $; visão completa ~300-450 $.

---

## 5. F0 — Fundações

- [x] **RZ-001** (P1, S) Criar repo privado `roots` (nome final do repo: PMLF/roots) no GitHub com a estrutura: `src/engine`, `src/ui`, `data/`, `docs/`, `tools/`, `BACKLOG.md`, `CLAUDE.md`.
- [x] **RZ-002** (P1, S) Ligar o GitHub ao Claude (conector ou pasta local) e fazer o primeiro commit com `data/`, `docs/` e este backlog.
- [x] **RZ-003** (P1, L) Documento de design da fase 0: **modelo de dados** de jogador, clube, estádio (por setores), cidade/concelho, pessoa, staff, contrato, competição, evento do histórico. Escrever em `docs/MODELO_DADOS.md`.
- [x] **RZ-004** (P1, M) Especificar o **sistema de personalidade** único (traços: ambição, lealdade, vaidade, paciência, integridade…, mais memória de promessas cumpridas/falhadas) usado por jogadores, treinadores, agentes, presidentes da Câmara, empresários, adeptos. → `docs/PERSONALIDADE.md`
- [x] **RZ-005** (P1, M) Formato do **histórico** e da base de dados: eventos append-only versionados, factos de jogo compactos, derivadas reconstruíveis, processos de vida longa, camada de conhecimento (público vs. oculto), transição de épocas sem perdas. → `docs/HISTORICO_EVENTOS.md`
- [ ] **RZ-006** (P1, S) Ficheiro de **parâmetros** central (`PREMIO_CLUBE`, `PREMIO_CIDADE`, `DIST_*`, `CP_*`, pesos de assistência…). Valores iniciais em `Clubes_Raizes.xlsx` › Parâmetros e `docs/DESIGN_REGRAS.md`.
- [ ] **RZ-007** (P1, M) Importador dos CSV (`data/clubes.csv`, `cidades.csv`, `rivalidades.csv`, `distritos.csv`) para o modelo, com validação (os mesmos testes de `tools/build_dados.py`).
- [ ] **RZ-008** (P3, S) Ver se o Editor do FM exporta jogadores e nomes da base "Portugal Alternativo". **Só para testes privados**: dados do FM não entram no jogo (direitos; ver §10b). O jogo gera jogadores com listas de nomes próprias.
- [ ] **RZ-009** (P1, M) Sistema de interface: princípios de navegação e componentes (ficha comum, tabela densa única, pesquisa global, ligações em tudo, página "Hoje"), segundo `docs/TOM_E_UX.md`. Antes de RZ-120.
- [ ] **RZ-010** (P2, S) Rever com o Pedro os dados: reputação/finanças dos clubes novos e as alcunhas/mascotes preenchidas à pressa nos originais (`data/src/existentes_preenchimento.txt`). *(Serpa Atlético Clube já passou para Serpa.)*

## 6. F1 — MVP jogável

**Meta:** jogar 5 épocas seguidas num distrito, com Avançar, jogos com estatísticas completas, subidas e descidas, prémio do Estado e distritais a mudar de tamanho.

### Motor e dados
- [ ] **RZ-101** (P1, M) Esqueleto Next.js, estado do jogo, guardar/carregar local; **motor num Web Worker**, textos por chave (i18n pt-PT), exportação estática (sem servidor). → RZ-003, RZ-128
- [ ] **RZ-102** (P1, M) Calendários (todos contra todos, ida e volta) por liga, com número variável de clubes e folgas por jornada.
- [ ] **RZ-103** (P1, L) **Gerador de pessoas e do mundo** (`docs/GERACAO_MUNDO.md`): nomes por nacionalidade, posições, dados pessoais, atributos, potencial, personalidade, contratos; mix de estrangeiros por escalão e clube; criação de save em 10-30 s num Web Worker com progresso. → RZ-004, RZ-132
- [ ] **RZ-104** (P1, XL) **Motor de jogo por oportunidades** (≈20-30 por equipa): cada remate tem xG; golos, assistências, defesas, cantos, faltas, posse; sem motor visual. **Simulador retomável por minutos** (estado + `simularAte(minuto)`), para permitir mudar tática e substituições ao vivo mais tarde.
- [ ] **RZ-105** (P1, L) **Estatísticas pós-jogo**: golos e minutos, marcadores, assistentes, cartões, lesões, remates (totais e à baliza), xG, posse, cantos, faltas, notas, homem do jogo e momentos-chave em texto.
- [ ] **RZ-106** (P1, M) **Cartões e castigos**: amarelos acumulados, vermelhos, jornadas de suspensão por competição.
- [ ] **RZ-107** (P1, L) **Lesões**: tipo, gravidade, duração, recaídas; risco sobe com fadiga, calendário e relvado, desce com staff médico.
- [ ] **RZ-108** (P1, L) **Tática simples**: 6-8 formações; estilo (jogo bonito ↔ direto/físico, pressão alta, contra-ataque); intensidade, linha, ritmo; **fair play em 5 níveis** (1 cavalheiro · 2 limpo · 3 normal · 4 duro · 5 agressivo; afeta faltas, cartões, lesões adversárias, relação com árbitros e imagem).
- [ ] **RZ-109** (P1, L) **Níveis de detalhe**: jogos do clube do gamer em detalhe; restantes jogos e ligas em modo estatístico, mas coerentes (as histórias continuam a surgir).
- [ ] **RZ-110** (P1, M) Classificações, desempates e controlo de jornadas.

### Pirâmide e regras (DESIGN_REGRAS §1-4)
- [ ] **RZ-111** (P1, L) **Motor de fim de época**: promoções/descidas entre escalões, séries do CP por zona, `descem_da_série = promovidos_para_a_série + descidos_da_Terceira_Liga_na_série − 1`. Ordem de operações em DESIGN_REGRAS §2.
- [ ] **RZ-112** (P1, M) **Prémio do Estado por distrito**: 2 M€ ao melhor classificado, 1 M€ à Câmara; critério de desempate; evento no histórico e notícia. → RZ-111
- [ ] **RZ-113** (P1, L) **Distritais variáveis**: `n' = n − p + r` (p = campeão promovido), mínimo 8, máximo 14, **Bolsa distrital**; mínimo duro de 6 no MVP. → RZ-111, 125
- [ ] **RZ-125** (P1, M) **Fase de Promoção**: 20 campeões distritais em 4 grupos de 5 (zonas A-D), todos contra todos a uma volta, 2 sobem por grupo (8 ao todo). → RZ-102
- [ ] **RZ-126** (P2, M) **Gerador de clubes novos** para a Bolsa vazia (nome por modelos, estatísticas, presidente, notícia). → RZ-113
- [ ] **RZ-127** (P1, L) **Corrupção v1** (decidido a 14-10-2026): quatro tipos — licenciamento, obra amiga (desvio do prémio da Câmara), comissões escondidas e **resultados combinados**; casos de vida longa com prova acumulada, alertas, investigação, escândalo e sanções (inclui retroativas). Atinge o gamer como alvo, como autor e como espectador. Árbitro mínimo como `Pessoa`. → RZ-004, RZ-005, RZ-128 Despedimento do gamer só em casos muito graves ou com posição frágil.
- [ ] **RZ-128** (P1, L) **Camada de persistência SQLite**: esquema de `docs/HISTORICO_EVENTOS.md`, interface `Repositorio` (adaptadores memória, Node, browser com worker + OPFS), migrações, exportação `.sqlite` + NDJSON, teste de consistência das derivadas. → RZ-005
- [ ] **RZ-129** (P1, M) **Camada `Vista` (conhecimento)**: tabela de observações, estimativas com margem, desatualização, regra de lint que impede a UI de ler a "verdade"; ligação ao olheiro (RZ-201/202). → RZ-128
- [ ] **RZ-130** (P1, L) **Jogo ao vivo** do teu clube: feed minuto a minuto com notificação de cada evento (golos, cartões, penáltis, lesões, substituições), velocidade e pausa; nos outros jogos só golos (minuto e marcador), vermelhos e melhor em campo. → RZ-104, RZ-105
- [ ] **RZ-131** (P1, M) **Comentário textual** do jogo (modelos de frases por tipo de lance, tom de transmissão). → RZ-130
- [ ] **RZ-132** (P1, M) **Tabela de países** (`data/paises.csv`: população, tradição, infraestrutura), curvas de talento com cauda rara e listas de nomes por país (`MODELO_DADOS` §15). → RZ-103
- [ ] **RZ-133** (P1, M) **Página da cidade (MVP)**: variáveis (`docs/CIDADE.md` §2) com evolução anual simples, autarca, clubes, sinergias, propriedade do estádio; só leitura. → RZ-301 (versão completa em F3)
- [ ] **RZ-134** (P1, M) **Saves**: ranhuras, **Guardar** manual, **autosave de 7 em 7 dias de jogo** (3 rotativos + 1 por início de época), lista de saves com resumo (clube, data, época), exportar/importar ficheiro `.raizes` (SQLite comprimido), pasta real na versão desktop. → RZ-128
- [ ] **RZ-135** (P1, M) **Idiomas**: infraestrutura i18n (ICU MessageFormat) com **pt-PT e inglês** desde o MVP na interface; modelos de notícias/comentário em pt-PT primeiro e inglês logo a seguir; cores como códigos traduzidos na interface. → RZ-101
- [ ] **RZ-124** (P1, M) Testes unitários das regras de pirâmide, prémio e distritais (casos: r=0, r=1, r≥2, excedente, bolsa vazia, empate total no prémio).

### Clube e cidade (versão mínima)
- [ ] **RZ-114** (P1, L) Finanças do clube: bilheteira, patrocínios, prémios, salários, custos; orçamento anual. Inclui o **estado descritivo** público ("Rico", "Em risco"…, `HISTORICO_EVENTOS` §5.1).
- [ ] **RZ-115** (P1, L) **Assistência v1**: bacia de adeptos × forma × **importância do jogo** (final ×2,5, decisão de subida/descida, **grande visitante** puxa mais gente ao estádio pequeno, dérbi) × preço, limitada pela **capacidade do estádio**.
- [ ] **RZ-116** (P1, M) Estádio v1: capacidade por setor e uma obra de ampliação com custo e prazo.
- [ ] **RZ-117** (P1, L) Plantel: fichas, contratos simples, desenvolvimento por época, rescisões.
- [ ] **RZ-121** (P1, M) Personalidade v1 em jogadores e treinador (reage a minutos, promessas, resultados).
- [ ] **RZ-122** (P1, M) Histórico v1: grava jogos, golos, cartões, lesões, transferências, prémios, subidas/descidas. → RZ-005
- [ ] **RZ-118** (P1, M) **Feed de notícias** automático v1 + caixa de entrada.

### Interface e ferramentas
- [ ] **RZ-119** (P1, M) Botão **Avançar** (dia/semana) e loop de simulação; cada clique enche a caixa de entrada.
- [ ] **RZ-120** (P1, L) UI shell: menu à esquerda, página ao centro, jornal/caixa à direita, barra inferior (data, orçamento, humor da cidade). Secções do MVP: Início, Clube, Plantel, Jogos, Mundo.
- [ ] **RZ-123** (P1, L) **Harness de calibração headless**: 50 épocas; relatório com golos/jogo, assistência vs capacidade, lesões, cartões, rotatividade do CP (≈30% a sair), tamanho das distritais, evolução do dinheiro por distrito.

---

## 7. F2 — Descoberta, mercado e staff

**Meta:** o coração do jogo — encontrar o miúdo da Estónia, negociar, e ver a carreira dele.

- [ ] **RZ-201** (P1, L) **Rede de olheiros** por região e país (custo, alcance, traços); setores `FRO` e `MUL` dão descontos de scouting (DESIGN §5).
- [ ] **RZ-202** (P1, M) **Relatórios** em texto com potencial e margem de erro; o erro depende do olheiro.
- [ ] **RZ-203** (P1, M) **Radar semanal** com talentos escondidos, incluindo os de clubes rivais; shortlists.
- [ ] **RZ-204** (P1, M) **Arquivo "dos que escaparam"**: acompanhas a carreira de quem viste e não contrataste. → RZ-005
- [ ] **RZ-205** (P1, L) **Mercado**: janelas, propostas, contrapropostas, concorrência de outros clubes (IA).
- [ ] **RZ-206** (P1, M) **Agentes com personalidade** (ganância, lealdade, paciência…).
- [ ] **RZ-207** (P1, L) **Contratos com cláusulas**: % de revenda, rescisão, bónus por golos, "regresso à terra"; jogadores ligados à cidade aceitam menos para ficar.
- [ ] **RZ-208** (P1, L) **Staff**: treinadores, olheiros, médicos, responsável de comunidade; traços e filosofia; contratação; fazem carreira noutros clubes.
- [ ] **RZ-209** (P1, M) **Filosofia do clube** (formação própria, talento de países improváveis, jogo direto…) com efeitos reais no desenvolvimento e na identidade.
- [ ] **RZ-210** (P1, M) **Papel do gamer**: poder de treinador que decresce com o crescimento do clube; confiança do treinador; intervenção em jogos decisivos com custo.
- [ ] **RZ-211** (P2, M) **Marcos narrativos de underdog** ("primeira subida em 40 anos", "primeiro dérbi ganho").
- [ ] **RZ-212** (P2, L) Academia/formação: geração e desenvolvimento de jovens, ligada ao viveiro da cidade.
- [ ] **RZ-213** (P2, L) Mercado IA ↔ IA (mundo vivo): transferências entre clubes sem o gamer.
- [ ] **RZ-214** (P2, M) UI: secções Radar, Mercado, Staff.
- [ ] **RZ-215** (P2, L) **Intervenção ao vivo**: mudar tática e fazer substituições durante o jogo. → RZ-104, RZ-130

## 8. F3 — Cidade, pessoas e política

**Meta:** a cidade deixa de ser um número e passa a empurrar o clube para cima ou para baixo.

- [ ] **RZ-301** (P1, L) **Modelo da cidade/concelho**: 12 variáveis (`docs/CIDADE.md` §2) com atualização mensal na cidade do gamer e anual nas outras; `cultura_futebol`; finanças municipais; bacia de adeptos.
- [ ] **RZ-302** (P1, L) **Sinergias** (DESIGN §5): setores e efeitos, marca `ILH`, polos regionais, rivais, concelho partilhado, "Rota do Futebol", voos entre ilhas.
- [ ] **RZ-303** (P1, XL) **Infraestruturas do estádio**: setores (sentados, em pé, visitantes, VIP), relvado, iluminação, acessos, estacionamento, bares, loja; **centro de treinos, academia e centro médico**; obras por fases com custos e apoio municipal. Inclui as **estatísticas de localização e envolvente** (`docs/CIDADE.md` §5.3).
- [ ] **RZ-304** (P1, M) Infraestrutura **fora** do estádio: transportes públicos, hotéis, estacionamento da cidade.
- [ ] **RZ-305** (P1, M) **Requisitos mínimos por escalão** e licenciamento (por omissão, licença provisória de 1 época com coima).
- [ ] **RZ-314** (P1, L) **Novo estádio e escolha do local**: etapas, opções de local (mesmo local, perto, periferia) com custos, prazos, relação com adeptos, transportes e assistência; estádio temporário durante a obra; terreno antigo; inauguração. → RZ-303, RZ-315 (`docs/CIDADE.md` §5)
- [ ] **RZ-315** (P1, M) **Propriedade do estádio** (clube, municipal, partilhada): renda, autorizações da Câmara, mudança de propriedade. → RZ-303 (`docs/CIDADE.md` §4)
- [ ] **RZ-306** (P1, L) **Pessoas**: presidente da Câmara, empresários, associação de adeptos, imprensa local; nível de confiança; reuniões com escolhas e consequências; **promessas** que têm de ser cumpridas.
- [ ] **RZ-307** (P1, M) Decisão da Câmara sobre o **1 M€ do prémio do Estado**: depende de `apoio_desporto`, `ambição` e `vaidade` do autarca. → RZ-112
- [ ] **RZ-308** (P1, L) **Política e contexto**: baralho de eventos com condições; **eleições autárquicas de 4 em 4 anos** (um autarca novo pode cortar ou aumentar o apoio); fundos europeus; crises; fecho de uma fábrica; nova autoestrada; regras das SAD; decisões nacionais/regionais. **Sem partidos reais**: partidos fictícios ou listas independentes com eixo esquerda-centro-direita; eventos regionais afetam todo o polo.
- [ ] **RZ-309** (P1, M) Efeito **cidade → resultados** (moral, apoio, patrocínios) e **clube → cidade** (orgulho, turismo, crescimento da população ao longo dos anos).
- [ ] **RZ-310** (P1, M) **Assistência v2**: tempo/clima, transporte, preço, setor, lotação esgotada que gera notícia e pressão para ampliar.
- [ ] **RZ-311** (P1, M) **Patrocínios locais por setor e empresários com personalidade** (primeira prioridade de F3 a seguir ao núcleo da cidade).
- [ ] **RZ-312** (P2, L) UI: secções Cidade (painel, obras, estádio) e Pessoas.
- [ ] **RZ-313** (P2, M) **Imprensa cor-de-rosa**: artigos sobre a vida pessoal de jogadores, staff e dirigentes (fictícios), disparados por eventos e personalidade. → RZ-004, RZ-118

## 9. F4 — Equilíbrio, mundo e conteúdo

- [ ] **RZ-401** (P1, L) Equilíbrio fino com o harness (assistência, dinheiro, rotatividade, probabilidade de subida de *underdogs*).
- [ ] **RZ-402** (P1, L) **Mapa de Portugal por distritos** (UI) com camadas: clubes, cidades, prémios.
- [ ] **RZ-403** (P2, XL) **4-5 ligas estrangeiras** e alguns países "estranhos" (simulação por níveis de detalhe).
- [ ] **RZ-404** (P2, M) Jornal v2, **hall of fame**, **crónica da época** exportável.
- [ ] **RZ-405** (P2, L) Secção História (arquivo, hall of fame) e rankings.
- [ ] **RZ-406** (P2, XL) Conteúdo: eventos, textos, nomes, histórias de origem (o que mais pesa na sensação do jogo).
- [ ] **RZ-407** (P2, M) Desempenho e saves grandes; layout mobile.
- [ ] **RZ-408** (P2, M) Tutorial / primeira hora.

## 10b. F5 — Amigos, Steam e expansão (decidir depois de F2, com feedback real)

- [ ] **RZ-501** (P1, M) **Versão para amigos**: build estático em Vercel (ou GitHub Pages), link privado, exportar/importar save, lembrete de backup (o armazenamento do browser pode ser apagado, sobretudo no Safari).
- [ ] **RZ-502** (P2, L) **Casca desktop** (Electron ou Tauri) com SQLite nativo; mesmo motor e mesma interface.
- [ ] **RZ-503** (P2, L) **Integração Steam** (Steamworks: conquistas, saves na nuvem), loja, imagens, taxa de lançamento. → RZ-502
- [ ] **RZ-504** (P2, M) Afinar o **inglês** e acrescentar outros idiomas se houver procura (a base está em RZ-135). → RZ-911
- [ ] **RZ-505** (P3, XL) **Jogo em 2D** (vista tipo FM): primeiro uma repetição dos lances do motor, depois, se valer a pena, posições simuladas só para o jogo visto. Renderização em Canvas/PixiJS.
- [ ] **RZ-506** (P3, L) **Mapa da cidade do gamer**: vista 2D de cima, **só de visualização**, apenas para a cidade que o gamer controla; acompanha a evolução (obras, população, infraestrutura). Não é um *city builder*.

## 10. Bem depois do MVP (P3)

- [ ] **RZ-901** (P3, L) Taças: Taça de Portugal, taças distritais, Supertaça.
- [ ] **RZ-902** (P3, L) Competições europeias.
- [ ] **RZ-903** (P3, M) Dividir os Açores nas 3 associações (Angra, Horta, Ponta Delgada).
- [ ] **RZ-904** (P3, L) Importar base de dados do gamer (clubes reais ou fictícios) e editor de base dentro do jogo.
- [ ] **RZ-905** (P3, XL) Versão desktop (Tauri/Electron) ou portagem do motor para Godot.
- [ ] **RZ-906** (P3, M) Gerador de emblemas e retratos (ou integração com a arte do Pedro).
- [ ] **RZ-907** (P3, L) Árbitros com personalidade; relação com o fair play.
- [ ] **RZ-908** (P3, L) SAD, venda de clubes, dívidas e falência; clube refundado.
- [ ] **RZ-909** (P3, M) Imprensa e redes sociais simuladas; adeptos individuais com nome.
- [ ] **RZ-910** (P3, M) Múltiplos saves, partilha de crónicas, modos de dificuldade.
- [ ] **RZ-911** (P3, M) Tradução para outros idiomas.
- [ ] **RZ-912** (P3, M) Estatísticas avançadas (por jogador, por época, comparações históricas).
- [ ] **RZ-913** (P3, M) Jogos particulares, estágios (sinergia `TER`), clima como sistema próprio.
- [ ] **RZ-914** (P3, M) Indexação do prémio do Estado à inflação; prémios por mérito (primeira vez, subida de escalão).
- [ ] **RZ-915** (P3, S) Rever `PROMO_POR_GRUPO` (1-3) e `CP_TAMANHO_SERIE` depois de simular 50 épocas.

## 11. Parking lot (ideias por entrar)

- **App companheira da save do FM**: acompanha a evolução fictícia da Charneca, de Caldas e do Machico (população, turismo, estádios, infraestrutura) — teste barato antes de investir no jogo todo.
- Modos desafio / cenários (clubes em dificuldades, cidades específicas).
- Regiões (polos) como atores com orçamento e presidente próprios, Governos Regionais com personalidade.
- O gamer candidatar-se à Câmara.
- Importar os Censos 2021 do INE para população e economia.
- *Mods* da comunidade (pacotes de clubes/ligas).

## 12. Perguntas em aberto

1. ~~Nome do jogo~~ — fica **Raízes** por agora.
2. **Licenciamento de estádios**: sanção por omissão (licença provisória + coima) serve?
3. ~~Fair play~~ — 5 níveis.
4. A base do FM exporta jogadores? (só para testes privados; RZ-008, P3)
5. ~~Formato da Fase de Promoção~~ — uma volta, 4 jogos por grupo, confirmado.

*Resolvidas a 15-10-2026:* cidade (autarca decide, gamer influencia; variáveis; propriedade do estádio; lado negativo; política fictícia; empresas depois do MVP; estimativas aceites); formato da Fase de Promoção (uma volta); cidade com mapa só para o gamer (visualização); idiomas pt/en; saves com autosave de 7 dias; fair play em 5 níveis; jogos ao vivo minuto a minuto (outros jogos: golos, vermelhos, melhor em campo); calendário agosto-maio e janelas julho-agosto + janeiro; Avançar = 1 dia com paragem em eventos; escolha livre do clube; nomes de clubes realistas e tom realista; UI densa e organizada; geração de jogadores por país com cauda rara; nome Raízes; branches main/develop/feature; licenciamento por omissão (licença provisória + coima).

*Resolvidas a 14-10-2026:* sanções de corrupção ao gamer (reputação + coima; despedimento raro); finanças rivais em palavras relativas ao escalão; histórico guardado na íntegra; prémio de 2 M€ de uso livre; Serpa Atlético é de Serpa; alcunhas/mascotes em falta preenchidos; CP continua 4×10 com Fase de Promoção em vez de 20 subidas diretas.

## 13. Rastreabilidade — nada ficou de fora

| Pedido do Pedro | Onde está |
|---|---|
| Descobrir jogadores de rivais/países estranhos | RZ-103, 201-204, 403 |
| Negociação de transferências e contratos | RZ-205-207, 213 |
| Ver divisões inferiores e ligas estrangeiras | RZ-109, 403, `data/` |
| Tática secundária, básica; formações, fair play, jogo bonito/direto/físico | RZ-108 |
| Staff importante | RZ-208 |
| Underdogs e filosofia própria | RZ-209, 211 |
| Cidade/Câmara/empresas/adeptos apoiam o clube | RZ-301, 306, 307, 311 |
| Interação clube ↔ pessoas da cidade | RZ-306 |
| Cidade afeta resultados; política regional/nacional | RZ-308, 309 |
| Features do City Skylines (transportes, turismo, serviços, solo) | RZ-301, 303, 304 |
| Assistência depende da importância do jogo; grande visitante | RZ-115, 310 |
| Capacidade e infraestruturas dentro/fora do estádio | RZ-116, 303, 304 |
| Histórico em ficheiro lido pelo jogo | RZ-005, 122, 404 |
| Cartões, castigos, lesões | RZ-106, 107 |
| Estatísticas pós-jogo (golos, marcadores, assistentes, cartões, xG, remates…) | RZ-104, 105 |
| Personalidade em cada pessoa/entidade | RZ-004, 121, 206, 306 |
| Papel do gamer (presidente/diretor com poder de treinador) | RZ-210 |
| Custos e subscrição; não usar Unity | §2, §3 |
| Clubes do CP (4×10) e distritais (10 por distrito) | `data/clubes.csv`, DESIGN §1 |
| Sinergias clube ↔ cidade | DESIGN §5, RZ-302 |
| Prémio do Estado: 2 M€ clube + 1 M€ cidade por distrito | DESIGN §3, RZ-112, 307 |
| Distritais variáveis; Fase de Promoção entre campeões de distritos diferentes; várias descidas do mesmo distrito; clube novo | DESIGN §1 e §4, RZ-113, 125, 126, 124 |
| Plataforma/integração | §3, RZ-001-002 |
| Dados de fácil leitura pelas páginas; épocas ligadas sem perdas; base de dados | D4, RZ-005, 128, `docs/HISTORICO_EVENTOS.md` |
| Golos/cartões/lesões de todos os clubes públicos; personalidades, atributos e finanças só com observação | `HISTORICO_EVENTOS` §5, RZ-129, RZ-201-202 |
| Corrupção no MVP, incluindo resultados combinados | RZ-127, `HISTORICO_EVENTOS` §6 |
| Jogos ao vivo minuto a minuto; intervenção ao vivo mais tarde | D12, RZ-130, 131, 215 |
| Tom realista, imprensa cor-de-rosa, nomes realistas | D13, `docs/TOM_E_UX.md`, RZ-313 |
| UI densa e bem organizada | RZ-009, `docs/TOM_E_UX.md` §3 |
| Jogadores de qualquer país com probabilidades diferentes | RZ-132, `MODELO_DADOS` §15 |
| Steam, 2D, mapa da cidade, amigos a jogar | D14, §10b |
| Gerar pessoas e nomes por nacionalidade; saves diferentes; tempo de criação | RZ-103, 132, `docs/GERACAO_MUNDO.md` |
| Página da cidade no MVP; mapa só da cidade do gamer | RZ-133, 506 |
| Português e inglês | D15, RZ-135 |
| Guardar, autosave, exportar/importar saves | RZ-134 |
| Escolha do local de um novo estádio (mesmo local, perto, periferia) e jogar noutro estádio durante a obra | RZ-314, `docs/CIDADE.md` §5 |
| Propriedade do estádio e papel da Câmara | RZ-315, `docs/CIDADE.md` §4 |
