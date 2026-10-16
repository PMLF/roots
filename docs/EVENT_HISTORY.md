# Raízes — Histórico, eventos e base de dados (RZ-005)

Define **onde e como** se guardam o mundo, a história e o que cada pessoa sabe. Substitui a ideia inicial de "só ficheiros" (decisão D4 atualizada no BACKLOG).

## 0. Requisitos que mandam

1. **Qualquer página lê rápido** o que precisa: a ficha de um jogador com toda a carreira, os marcadores de uma jornada, o confronto direto entre dois clubes, a história de um clube. Sem percorrer ficheiros.
2. **Nada se perde na passagem de época.** A época é só uma coluna; nada é "arquivado e esquecido". Promessas, investigações, castigos, contratos, obras e memórias atravessam épocas.
3. **Regras que dependem do passado** ("primeira subida em 40 anos", "terceira derrota seguida em dérbis", "caso de 2028 que rebenta em 2031") consultam o histórico com perguntas simples.
4. **Informação tem dono.** O que o jogo *sabe* (a verdade) não é o que o gamer *vê*. Golos, cartões, lesões e resultados de **todos** os clubes são públicos; personalidades, atributos e finanças só aparecem com observação.
5. **Longo prazo:** dezenas de épocas, ~300 clubes, milhões de factos, sem o save inchar nem ficar lento.
6. **Testável sem interface** (D2): o mesmo esquema corre no harness Node e no browser.

## 1. Decisão: SQLite em vez de ficheiros

| Opção | Prós | Contras | |
|---|---|---|---|
| Ficheiros JSON por época | Simples, legível | Pesquisa lenta, sem índices, um bug a meio do guardar corrompe o save, ligar épocas é manual | ✗ |
| IndexedDB | Nativo no browser | API pobre para consultas relacionais; difícil de testar em Node | ✗ |
| **SQLite** (WASM no browser, `better-sqlite3` no Node) | SQL e índices, transações (um "Avançar" é atómico), um único ficheiro por save, mesmo esquema no harness, migrações por `user_version`, escala a milhões de linhas | Um pouco de arranque (worker + OPFS) | ✓ |

- **Browser:** `sqlite-wasm` num *Web Worker* com armazenamento OPFS (VFS `opfs-sahpool`, que não exige cabeçalhos especiais). A UI fala com o worker por mensagens.
- **Node (testes/harness):** `better-sqlite3`, mesmo SQL.
- O **motor continua TypeScript puro**: só conhece uma interface `Repositorio` (portas e adaptadores). Há um adaptador em memória para testes rápidos e dois SQLite.
- **Um save = um ficheiro `.sqlite`.** Exportar = descarregar o ficheiro; opcionalmente também o log de eventos em NDJSON (cronicas, partilha, depuração).
- **Futuro:** o mesmo esquema serve para um servidor (cloud saves, ligas partilhadas) sem reescrever o modelo.

## 2. Camadas de dados

```
VERDADE         estado atual do mundo (pessoas, clubes, contratos…)         ← o motor lê/escreve
HISTÓRIA        factos que aconteceram, append-only                          ← nunca se altera
DERIVADAS       estatísticas e classificações calculadas dos factos          ← reconstruíveis
PROCESSOS       objetos de vida longa: promessas, casos, sanções, obras…    ← atravessam épocas
CONHECIMENTO    observações: o que cada clube/jogador sabe                   ← a UI só lê daqui + público
```

### 2.1 História (append-only)

```sql
CREATE TABLE evento (
  id        INTEGER PRIMARY KEY,           -- sequencial, nunca reutilizado
  tipo      TEXT    NOT NULL,              -- 'TRANSFERENCIA', 'PROPOSTA_ILICITA'…
  v         INTEGER NOT NULL,              -- versão do esquema deste tipo
  data      TEXT    NOT NULL,              -- 'AAAA-MM-DD' (calendário do jogo)
  epoca     INTEGER NOT NULL, jornada INTEGER,
  vis       INTEGER NOT NULL,              -- 0 público · 1 privado · 2 secreto
  causa     INTEGER REFERENCES evento(id), -- cadeia de causa e efeito
  corrige   INTEGER REFERENCES evento(id), -- só em eventos CORRECAO
  origem    TEXT NOT NULL DEFAULT 'jogo',  -- 'jogo' | 'gerado' (pré-história sintética)
  dados     TEXT NOT NULL                  -- JSON específico do tipo
);
CREATE TABLE evento_entidade (               -- "tudo o que envolve X"
  k TEXT NOT NULL, id TEXT NOT NULL, evento INTEGER NOT NULL, papel TEXT,
  PRIMARY KEY (k, id, evento)
) WITHOUT ROWID;
CREATE INDEX ix_evento_tipo_epoca ON evento(tipo, epoca);
-- triggers: BEFORE UPDATE/DELETE em evento → RAISE(ABORT)
```

**Factos de jogo em tabelas compactas** (milhares por época; não vale a pena um JSON por golo):

```sql
CREATE TABLE jogo (
  id TEXT PRIMARY KEY, competicao TEXT, epoca INTEGER, jornada INTEGER, data TEXT,
  casa TEXT, fora TEXT, golos_casa INTEGER, golos_fora INTEGER,
  xg_casa REAL, xg_fora REAL, posse_casa REAL, assistencia INTEGER, receita INTEGER,
  importancia REAL, arbitro TEXT, evento INTEGER REFERENCES evento(id)
);
CREATE TABLE jogo_facto (            -- golos, cartões, lesões, substituições, penáltis
  jogo TEXT, minuto INTEGER, tipo TEXT,        -- G, A(ssist), CA, CV, L, S, P…
  jogador TEXT, clube TEXT, extra TEXT          -- ex.: 'penalti', 'auto', 'gravidade:3'
);
CREATE TABLE participacao (          -- quem jogou e quanto
  jogo TEXT, jogador TEXT, clube TEXT, titular INTEGER, minutos INTEGER, nota REAL
);
```

Cada jogo também gera **um** evento `JOGO_JOGADO` (ligado a `jogo`) e eventos próprios para o que é notícia (hat-trick, vermelho, lesão grave, goleada…). Uma vista `v_historico` junta tudo numa linha do tempo por entidade.

### 2.2 Derivadas (reconstruíveis)

`classificacao`, `stat_jogador_epoca`, `stat_clube_epoca`, `carreira_jogador`, `titulo`, `marco`, `confronto_direto`. Atualizam-se **na mesma transação** que escreve o facto e podem ser **reconstruídas do zero** a partir da história (teste de consistência, §9). Servem para as páginas lerem sem somar milhões de linhas.

### 2.3 Processos de vida longa

Cada um tem `estado`, datas e referências próprias; **não pertencem a uma época**:

`contrato`, `promessa`, `obra`, `caso_corrupcao`, `sancao`, `memoria`, `relacao`, `emprestimo`, `candidatura`/mandato autárquico, `investigacao`.

O fim de época nunca os fecha: só fecha o que é de época (`competicao`, `classificacao` final, janela de transferências) e **avalia** o que tem prazo (promessas vencidas, mandatos, contratos a terminar).

### 2.4 Conhecimento

```sql
CREATE TABLE observacao (
  id INTEGER PRIMARY KEY, observador TEXT,       -- clube/jogador que sabe
  alvo_k TEXT, alvo_id TEXT,
  grupo TEXT,                                    -- atributos | personalidade | potencial | financas | contrato
  valores TEXT,                                  -- JSON: estimativas com intervalo ou rótulos
  qualidade REAL, fonte TEXT,                    -- olheiro, agente, treino, jogo, imprensa
  data TEXT, epoca INTEGER
);
```

Ver §5.

## 3. Eventos — envelope e regras

```ts
type Evento = {
  id: number; tipo: TipoEvento; v: number;
  data: Data; epoca: number; jornada?: number;
  vis: 'publico' | 'privado' | 'secreto';
  entidades: { k: 'clube'|'pessoa'|'cidade'|'competicao'|'jogo'; id: string; papel?: string }[];
  causa?: number;      // evento que o originou
  corrige?: number;    // só em CORRECAO
  origem: 'jogo' | 'gerado';
  dados: object;
};
```

Regras:

- **Imutável.** Corrigir = novo evento `CORRECAO { corrige: id, dados }`. Sanções retroativas (anular pontos de uma época passada) são eventos novos com **ajuste** (`classificacao_ajuste`) e recalculam as derivadas; o passado fica tal como foi escrito.
- **Causa.** `causa` forma cadeias para a crónica e para regras: promessa falhada → queixa → pedido de saída → transferência.
- **Pré-história.** Ao criar o mundo, gera-se uma história sintética (`origem='gerado'`): resumo de ~30 épocas por clube (classificações finais, títulos, últimas subidas). Sem isto, "primeira subida em 40 anos" não existe.
- **Versões.** `v` por tipo + migradores; `PRAGMA user_version` para o esquema.

## 4. Catálogo de eventos do MVP

| Grupo | Tipos | Visibilidade típica |
|---|---|---|
| Jogo | `JOGO_JOGADO`, `GOLO_NOTAVEL`, `HATTRICK`, `CARTAO_VERMELHO`, `LESAO` (dados em MOTOR_JOGO §9; a recuperação deriva de `ate`, sem evento próprio), `LESAO_RECUPERADA` (reservado), `SUSPENSAO`, `SUSPENSAO_CUMPRIDA`, `JOGO_ADIADO`; `JOGO_RIVAL` (privado, ligado ao `JOGO_JOGADO` por `causa`: marca os resultados que vão para a caixa do gamer, ver `caixa.*`) | público |
| Competição | `INICIO_EPOCA`, `CALENDARIO_GERADO`, `CLASSIFICACAO_FINAL`, `TITULO`, `SUBIDA`, `DESCIDA`, `FASE_PROMOCAO`, `CLUBE_NOVO`, `DISTRITAL_REDIMENSIONADA`, `LICENCA_NEGADA`, `FIM_EPOCA` | público |
| Dinheiro | `PREMIO_ESTADO`, `PREMIO_COMPETICAO`, `DESTINO_PREMIO_CAMARA`, `PATROCINIO_ASSINADO`, `FECHO_FINANCEIRO` (mensal, por clube, privado; `{receitas, despesas, saldo, mes}` com o resumo por categoria) | prémios públicos; resto privado |
| Pessoas | `JOGADOR_GERADO`, `CONTRATO_ASSINADO`, `CONTRATO_TERMINADO`, `TRANSFERENCIA`, `EMPRESTIMO`, `RENOVACAO`, `PEDIDO_SAIDA`, `TREINADOR_CONTRATADO`, `TREINADOR_DEMITIDO`, `REFORMA` | transferência pública (valor aproximado); termos do contrato privados |
| Promessas | `PROMESSA_FEITA`, `PROMESSA_CUMPRIDA`, `PROMESSA_FALHADA`, `QUEIXA_PUBLICA` | privado; queixa pública |
| Cidade | `ELEICAO`, `APOIO_CAMARA`, `CORTE_APOIO`, `OBRA_INICIADA`, `OBRA_CONCLUIDA`, `EVENTO_CONTEXTO` (baralho político/económico), `MARCO_CIDADE` | público |
| Personalidade | `MARCO_PERSONALIDADE` | privado |
| Corrupção | `PROPOSTA_ILICITA`, `PROPOSTA_ACEITE`, `PROPOSTA_RECUSADA`, `ACAO_ILICITA`, `ALERTA_SUSPEITO`, `DENUNCIA`, `INVESTIGACAO_ABERTA`, `PROVA_REVELADA`, `ESCANDALO_REVELADO`, `ABSOLVICAO`, `SANCAO` | secreto até revelação; depois público |
| Sistema | `CORRECAO`, `SAVE_MIGRADO`, `PARAMETROS_ALTERADOS` | privado |

### Exemplos de `dados`

```jsonc
// GOLO_NOTAVEL (só os notáveis; todos os golos estão em jogo_facto)
{ "jogo": "j-2027-PL-014-03", "minuto": 90, "jogador": "p-001234", "clube": "sc-cascais",
  "contexto": "golo da vitória aos 90'+3", "assistente": "p-000871" }

// TRANSFERENCIA (público)
{ "jogador": "p-001234", "de": "ud-vimioso", "para": "sc-cascais",
  "valor": 180000, "valorPublico": "≈ 200 mil €", "contrato": "ct-009912",
  "clausulaRevenda": 0.15 }                  // a cláusula fica no contrato (privado)

// PROPOSTA_ILICITA (secreto)
{ "tipo": "resultado_combinado", "de": "p-0070", "para": "p-0121", "jogo": "j-2028-S2-021-07",
  "oferta": 25000, "efeito": "perder", "caso": "cc-0007" }
```

## 5. Visibilidade: o que se vê e o que se descobre

Dois mecanismos diferentes:

**A. Visibilidade de eventos (`vis`)** — quem pode ler o facto.

| `vis` | Significado | Exemplos |
|---|---|---|
| `publico` | A comunicação social e qualquer interessado vê, de qualquer clube | resultados, marcadores, assistências, cartões, lesões e duração prevista, suspensões, classificações, transferências concluídas, subidas e descidas, prémios, eleições, obras, sanções |
| `privado` | As partes envolvidas (e quem elas contarem) | termos de contratos, promessas em privado, reuniões, finanças internas |
| `secreto` | Só os participantes do ato ilícito, até à revelação | propostas ilícitas, subornos, resultados combinados |

**B. Conhecimento de atributos (`observacao`)** — o que se sabe sobre o *estado* de alguém. Mesmo com o facto público (um jogador marcou 12 golos), **não** se vê:

- atributos e potencial de jogadores e staff, **personalidade**, forma interna e moral;
- **finanças** dos clubes e termos dos contratos: só se vê um **estado descritivo** ("Rico", "Em risco"…, §5.1), com possibilidade de erro;
- qualidade real do staff.

Como se descobre: olheiros, agentes, relatórios, jogar contra, treinar com, tempo de convívio. Cada observação guarda **estimativa com margem** e fica **desatualizada** com o tempo (a ficha mostra "visto há 2 épocas"). O teu próprio clube sabe mais (atributos conhecidos em semanas; personalidade em rótulos, ver `PERSONALITY.md` §7).

**Anti-fuga.** A UI **nunca** lê as tabelas da verdade. Há um módulo único `Vista` (`src/engine/vista`) que devolve `{ publico, conhecido? }` para cada entidade, aplicando `vis` e `observacao`. Uma regra de lint proíbe importar o repositório de "verdade" em `src/ui`, e há teste que tenta ler campos ocultos sem observação e tem de falhar.

### 5.1 Estimativa pública das finanças (em palavras, como no FM)

A imprensa só publica uma **palavra** sobre cada clube. Calcula-se a partir de duas medidas, e a palavra depende do escalão.

**1. Saúde (absoluta; tem prioridade)**, medida em meses de folga: `folga = (saldo − dívida de curto prazo) / custos mensais`.

| Estado | Condição |
|---|---|
| **À beira da falência** | `folga < 0` e dívida > 50 % das receitas anuais, ou salários em atraso há ≥ 3 meses |
| **Em risco** | `folga < 1` ou saldo negativo |
| **Apertado** | `1 ≤ folga < 3` |
| *(sem aviso)* | `folga ≥ 3` → mostra-se a riqueza |

**2. Riqueza (relativa ao escalão)**: percentil de `recursos = receitas anuais + saldo` entre os clubes **do mesmo escalão** (todas as distritais juntas). Por isso 2 M€ fazem de um clube distrital **Rico**, e na Primeira Liga são **Pobre**.

| Percentil | Primeira Liga | Segunda / Terceira Liga | CP | Distrital |
|---|---|---|---|---|
| ≥ 90 | Poderoso | Muito rico | Rico | Rico |
| 70-90 | Rico | Rico | Folgado | Folgado |
| 40-70 | Remediado | Estável | Estável | Estável |
| 15-40 | Modesto | Modesto | Modesto | Modesto |
| < 15 | Pobre | Pobre | Pobre | Pobre |

**Regras de apresentação**

- O que se mostra é **uma palavra**, sem números. O teu clube vê tudo exato.
- Para clubes rivais, a palavra pode vir **uma banda ao lado** com probabilidade `p = 25 %` (reduz com a qualidade da fonte). Uma observação de `grupo='financas'` (relatório, contacto no clube) elimina o erro e dá um **intervalo** ("entre 300 e 500 mil €").
- As palavras e percentis são parâmetros (RZ-006), a calibrar com o harness.
- Eventos públicos de dinheiro (`PREMIO_ESTADO`, obras anunciadas, patrocínios) mudam o estado de imediato na próxima atualização mensal.

### 5.2 Implementação da Vista (RZ-129)

- `src/engine/vista/` só **lê**: eventos (públicos de todos + privados/secretos em que *nós* participamos, filtro por `vis` feito no repositório), jogos, marcadores, classificações e estatísticas de jogo (factos públicos) e **conhecimento** (observações). Não importa a verdade nem o módulo que cria observações (lint). A interface não importa `persistencia`, `conhecimento`, `verdade` nem `worker`.
- `src/engine/conhecimento/observar.ts` é a ponte da verdade para o conhecimento: recebe os valores verdadeiros como argumento, soma ruído com desvio `σ(qualidade)` (interpolação entre `sigmaPiorQualidade` e `sigmaMelhorQualidade`, parâmetros) e grava só a estimativa em `observacao` (`{ campos: {nome: {est, sigma}}, rotulos }`).
- **Combinar observações:** média ponderada pelo inverso da variância; a incerteza de cada observação cresce `1 + k × épocas`. Mais observações → margem menor; observações velhas pesam menos. `margem = z·σ` (z = 1,28 → intervalo a ~80 %, verificado por teste).
- **Frescura:** `vistoEm`, `epocasDesde` e `desatualizado` (≥ 2 épocas, parâmetro).
- **Personalidade:** só rótulos dos traços extremos (≤ 5 ou ≥ 15), máximo 3, os mais marcados primeiro; a faixa pode vir trocada com probabilidade `0,35 × (1 − qualidade)`.
- `qualidadePorFonte` (parâmetros): próprio clube 0,9, olheiro 0,6, agente 0,4, jogo contra 0,35, imprensa 0,15; um olheiro concreto traz a sua qualidade (RZ-201).

## 6. Corrupção v1 (RZ-127)

Quatro tipos no MVP, todos ligados a `integridade` e a um **caso** de vida longa:

| Tipo | Quem | O que acontece |
|---|---|---|
| **Licenciamento** | Câmara / entidade licenciadora | favor para passar a licença do estádio |
| **Obra amiga** | autarca | desvia parte do prémio de 1 M€ para uma obra do amigo |
| **Comissões escondidas** | agente | comissão oculta numa transferência |
| **Resultados combinados** | árbitro, jogadores, treinador, rival, apostadores | alguém é pago para influenciar um jogo |

### 6.1 Ciclo de vida de um caso

```
PROPOSTA_ILICITA (secreto) → PROPOSTA_ACEITE | PROPOSTA_RECUSADA
   ↓ (se aceite)
ACAO_ILICITA (secreto; liga-se ao jogo/obra/contrato)  → caso_corrupcao.evidencia sobe
   ↓ (cada jornada/mês)
risco de descoberta: ALERTA_SUSPEITO (público, p. ex. resultado muito fora do xG)
                     DENUNCIA (alguém com integridade alta)
   ↓
INVESTIGACAO_ABERTA (público) → PROVA_REVELADA → ESCANDALO_REVELADO (público; tudo o que era secreto passa a público)
   ↓
SANCAO | ABSOLVICAO — pode chegar épocas depois e aplicar-se a épocas passadas
```

`caso_corrupcao(id, tipo, estado, partes, valor, evidencia 0-100, aberto_em, revelado_em, sancao)`. A probabilidade de descoberta cresce com `evidencia`, com o número de participantes e com a baixa `integridade` dos cúmplices, e diminui com a lealdade deles.

**Resultados combinados:** o acordo altera o jogo simulado de forma limitada (viés de penáltis/faltas do árbitro, jogador-chave rende menos, xG do beneficiário sobe) e deixa um rasto estatístico (resultado vs. xG) que alimenta o `ALERTA_SUSPEITO`. Exige o árbitro como `Pessoa` mínima no MVP (`integridade` + `experiencia`); o resto de RZ-907 fica para P3.

**Sanções:** coima, perda de pontos (época em curso ou ajuste retroativo), descida administrativa, perda de licença, suspensão de pessoas por N épocas, queda de reputação, corte de apoio da Câmara.

### 6.2 Como atinge o gamer (como presidente/diretor)

1. **Propostas que recebes:** um rival ou apostador quer que percas um jogo; um agente propõe comissão oculta; um autarca oferece favor na licença. Aceitar dá benefício imediato e cria um caso com prova a acumular.
2. **Propostas que podes fazer:** corromper um árbitro ou jogadores adversários, pedir um favor ao autarca. A resposta depende da `integridade` do alvo: se for alta, **denuncia** e o escândalo cai em cima de ti.
3. **À tua volta sem o saberes:** um jogador, treinador ou dirigente teu aceita dinheiro e o evento é `secreto`; só vês sinais (resultados estranhos, relatório do olheiro, queda de confiança). Podes investigar internamente.
4. **Consequências:** se o caso rebentar, o clube e o presidente (tu) sofrem sanções: **perda de reputação** e **coima**, sempre. O **despedimento** é possível mas **muito raro**: exige um caso muito grave (p. ex. resultado combinado com prova alta) **ou** uma posição já frágil por outras razões (confiança do conselho, da Câmara e dos adeptos baixa, resultados e finanças maus). Ser despedido não acaba o jogo: ficas sem o clube, com a reputação afetada, e podes aceitar outro.

## 7. Passagem de época sem perdas

O fim de época corre numa **única transação** (DESIGN_REGRAS §2). Invariantes:

- Nenhuma tabela de história é apagada nem reescrita; só se acrescenta (`FIM_EPOCA`, `CLASSIFICACAO_FINAL`, `SUBIDA`, `DESCIDA`…).
- Processos de vida longa mantêm `estado` e datas; só mudam por eventos próprios.
- Memórias e relações continuam a decair pela **data**, não pela época.
- Contratos, empréstimos e castigos continuam pelas suas datas; um castigo de 3 épocas conta entre épocas.
- Cálculos de fim de época só leem o histórico (via `Historico`, abaixo), nunca variáveis temporárias da época que acabou.
- Os jogadores gerados no ano seguinte nascem com `JOGADOR_GERADO` e ligação à cidade/clube de origem.

### API de consulta do passado

```ts
Historico.contar(tipo, entidade, { desdeEpoca, ateEpoca })
Historico.ultimo(tipo, entidade)               // p. ex. última SUBIDA do clube
Historico.ultimos(tipo, entidade, n)            // os n mais recentes (3 derrotas seguidas…); no código: Repositorio.ultimos
Historico.cadeia(eventoId)                     // causa → efeitos
Historico.marcoNovo(clube, 'subida')           // "primeira subida em 40 anos" (inclui pré-história)
```

## 8. Consultas típicas das páginas

```sql
-- Ficha do jogador: carreira por época (derivada, instantânea)
SELECT epoca, clube, competicao, jogos, minutos, golos, assist, amarelos, vermelhos FROM stat_jogador_epoca WHERE jogador = ? ORDER BY epoca;

-- Marcadores de uma jornada (público)
SELECT jf.jogador, jf.clube, jf.minuto FROM jogo_facto jf JOIN jogo j ON j.id = jf.jogo
WHERE j.competicao = ? AND j.epoca = ? AND j.jornada = ? AND jf.tipo = 'G';

-- Tudo o que envolveu um clube, mais recente primeiro (público)
SELECT e.* FROM evento_entidade x JOIN evento e ON e.id = x.evento
WHERE x.k = 'clube' AND x.id = ? AND e.vis = 0 ORDER BY e.id DESC LIMIT 50;

-- Confronto direto
SELECT * FROM confronto_direto WHERE (a = ? AND b = ?) OR (a = ? AND b = ?);
```

## 9. Testes de aceitação

1. Mesma seed → mesma base (hash do log igual).
2. `evento` não aceita `UPDATE`/`DELETE` (trigger).
3. **Consistência:** reconstruir as derivadas do zero dá linhas iguais às guardadas, após 50 épocas.
4. Soma de golos em `stat_jogador_epoca` = nº de `G` em `jogo_facto` = soma dos resultados em `jogo`.
5. Um caso aberto na época 3 e sancionado na época 5 atravessa o fim de época 3 e 4 sem ser tocado, e a sanção ajusta a classificação passada **sem** reescrever eventos.
6. `Vista` sem observação não devolve atributos nem personalidade; com observação devolve intervalo; com 2 épocas sem observação marca "desatualizado".
7. Resumo `FIM_EPOCA` presente em todas as épocas; nenhum processo de vida longa fica órfão (FK válida).
8. Saves de versão anterior migram e passam em 1-7.

## 10. Volumetria (estimativa a validar no harness)

- ~3 300 jogos/época (PL 380 + SL 306 + TL 380 + CP 360 + distritais ~1 800 + Fase de Promoção 40).
- `jogo_facto`: ~7 linhas/jogo → ~23 mil/época; 50 épocas ≈ 1,2 M linhas.
- `participacao`: ~25 linhas/jogo → ~80 mil/época; 50 épocas ≈ 4 M linhas.
- Eventos genéricos: algumas dezenas de milhar/época.
- Ordem de grandeza: **100-300 MB em 50 épocas**. **Decidido: guarda-se tudo, para sempre.** Se o harness (RZ-123) mostrar problemas, a compactação fica como opção futura, configurável.

## 11. Exportar, importar, migrar

- **Exportar:** `.sqlite` (save completo) + `historico.ndjson` (um evento por linha, para crónica/partilha) + CSV opcional de estatísticas.
- **Importar:** só o `.sqlite`; o NDJSON serve para análise (não reconstitui o estado por si só).
- **Migrar:** `PRAGMA user_version` + scripts numerados; eventos com `v` próprios convertidos ao ler.

## 11b. Implementação (RZ-128, 15-10-2026)

- `src/engine/persistencia/`: `Repositorio` (porta síncrona), `RepositorioSqlite` (sobre `DriverSql`), `RepositorioMemoria`, `esquema.ts` (migrações por `user_version`), `validacao.ts` (partilhada). Todos os adaptadores passam na **mesma bateria** (`repositorio.contrato.ts`) e produzem o mesmo NDJSON.
- Drivers: `src/node/driverBetterSqlite.ts` (Node/testes/harness) e `src/engine/worker/driverWasm.ts` (browser: sqlite-wasm + OPFS `opfs-sahpool`, com recurso a memória se o OPFS falhar). O motor não importa nenhuma biblioteca SQLite (regra de lint).
- O sqlite-wasm **não passa pelo bundler**: `tools/copiar-sqlite-wasm.mjs` copia-o para `public/sqlite/` (corre em `pnpm dev` e `pnpm build`) e o worker carrega-o por URL, porque o Turbopack não resolve os `new URL(variável, import.meta.url)` internos do pacote.
- Esquema v1: `meta`, `evento`, `evento_entidade`, `jogo`, `jogo_facto`, `participacao`, `classificacao_ajuste`, `observacao` + derivadas `classificacao` e `stat_jogador_epoca`. Triggers impedem UPDATE/DELETE na história. Os restantes processos de vida longa (contrato, promessa, obra, caso, sanção, memória, relação…) e derivadas (`titulo`, `marco`, `confronto_direto`, `carreira_jogador`) entram, por migração, com as funcionalidades que os usam.
- Convenções: `jogo_facto.clube` em golos é o clube **creditado** (num auto-golo, o adversário do jogador; `extra = 'auto'`); `extra` é um só símbolo. Um jogador "jogou" se `minutos > 0`. Classificação: pontos por parâmetro (`classificacao.pontosVitoria/pontosEmpate`), a derivada `classificacao()` devolve só os totais; a ordenação final com desempates (confronto direto, reputação, sorteio) é feita por `ordenarClassificacao`/`tabelaDaCompeticao` (RZ-110) a partir de `jogosDaCompeticao()`.
- Verificado: 50 épocas simuladas (2 800 jogos) com reconstrução das derivadas igual ao incremental; save exportado reabre; persistência no OPFS entre recarregamentos e entre processos num Chromium real, em `next dev` e na exportação estática.

## 12. Decisões tomadas (14-10-2026)

1. **Sanções ao gamer (presidente):** perda de reputação + coima; despedimento só em casos muito graves ou com posição já frágil (§6.2).
2. **Finanças dos rivais:** estado descritivo em palavras, relativo ao escalão (§5.1).
3. **Histórico:** guarda-se tudo, sem compactação por omissão (§10).

Sem perguntas em aberto neste documento.

### 11c. Calendário (RZ-102)
- Migração 2: `calendario_jogo` (jogos marcados, `id` igual ao do `jogo` quando for jogado) e `calendario_folga` (uma por jornada em ligas com nº ímpar de clubes). Não são história imutável: o calendário é planeado, o resultado é que fica na história.
- `Repositorio`: `guardarCalendario`, `calendario`, `calendarioDoClube`, `proximoJogo`. Recusa um segundo calendário da mesma competição e época.
- Geração: `gerarCalendarioLiga` (determinística por seed, fluxo próprio por competição) e `validarCalendario`; datas, pausas e dias de jogo vêm de `parametros.calendario`.

### 11d. Pessoas (RZ-103)
- Migração 3: `pessoa` (personalidade em JSON, verdade oculta), `jogador` (posições, atributos, potencial, corpo, clube), `contrato` e `cargo` (presidente, autarca, treinador, staff, empresário, agente, árbitro, jornalista…).
- `Repositorio`: `guardarMundo` (uma transação; recusa um segundo mundo), `pessoa/jogador/contrato/cargo/jogadoresDoClube` (verdade, só para o motor) e `pessoaPublica/plantelPublico/cargosPublicos` (factos públicos, os únicos que a `Vista` lê).

### 11e. Localidades e reiniciar (RZ-136, RZ-137)
- Migração 4: `localidade` (`id`, `nome`, `cidade` = concelho, `populacao`, `estatuto` aldeia/vila/cidade, `desde`). É o **estado atual**; a história é o evento público `LOCALIDADE_ESTATUTO` (`{ de, para, populacao }`, entidades `localidade` e `cidade`), por isso a evolução fica reconstruível e nada se apaga.
- `Repositorio`: `guardarLocalidades` (uma só vez), `localidade`, `localidades({ cidade })` e `atualizarLocalidade` (muda população; se o estatuto mudar acrescenta o evento e atualiza `desde`, na mesma transação).
- `reiniciar()`: apaga tudo (incluindo a história) e volta ao esquema vazio. Serve ao botão «Reiniciar o mundo» da página Mundo e aos testes; não se usa a meio de um jogo (ranhuras e saves exportados: RZ-134). O pedido `reiniciarMundo` reinicia e gera logo um mundo com a seed nova.


## Notícias e caixa de entrada (RZ-118)

As notícias **não são guardadas**: derivam dos eventos públicos (`src/engine/noticias/noticias.ts`). Cada evento que dá notícia vira `{ tipo, variante, valores, ligacoes }`; a interface traduz com as chaves `noticia.<tipo>.<n>.titulo|corpo` (`resultado` usa `resultado.<vitoria|empate|derrota>`). A variante é `id do evento % nº de variantes`, por isso a mesma notícia lê-se sempre igual. A caixa de entrada é o subconjunto pessoal do clube do gamer (inclui o resultado de cada jogo e todas as lesões do plantel); o estado de leitura é o meta `caixa.lida` (último evento lido).

## Cidades (RZ-133)

- `CIDADE_EPOCA` (**privado**, uma por cidade e por fecho de época): `{ valida, populacao, emprego, economia, turismo, orgulho, notoriedade, culturaFutebol, acontecimentos[] }`, entidade `cidade`. É o estado verdadeiro; o estado de arranque (época 1) não se grava, reconstrói-se da seed. A interface nunca o lê: recebe níveis e tendências (`fichaCidade`).
- `CIDADE_EVENTO` (**público**): `{ evento, regional, polo? }`, entidades `cidade` (várias nos regionais). Alimenta as notícias (`cidade_evento`) e a lista de acontecimentos da ficha.

