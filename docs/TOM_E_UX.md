# Raízes — Tom, nomes e princípios de interface

Decisões do Pedro a 15-10-2026.

## 1. Tom

- **Realista, como a imprensa desportiva portuguesa.** Notícias sérias e profissionais por omissão: títulos informativos, linguagem de jornal, citações plausíveis.
- **Ironia e humor pontuais.** Alguns artigos mais leves ou irónicos, como acontece na imprensa real; nunca como regra.
- **Imprensa cor-de-rosa e sensacionalista.** Quando algo gera falatório (relações, festas, polémicas, dinheiro gasto, escândalos de bastidores), pode sair uma peça de revista de sociedade sobre a vida pessoal de jogadores, staff ou dirigentes. Dispara-se a partir de eventos e da personalidade (vaidade, temperamento, integridade). Todas as pessoas são **fictícias**; nunca se usam pessoas reais.
- **O futebol está sempre sob escrutínio:** resultados, decisões, finanças e corrupção geram cobertura. Quanto maior o escalão, mais cobertura.

## 2. Nomes de clubes

- Nome **realista**: sigla + localidade ou gentílico (`GD Vinhais`, `AC Esposendense`, `UD Alcobaça`). Prefixos: GD, CD, AD, UD, SC, FC, AC; variantes `Académico de X`, `Juventude de X`, `Sporting de X`.
- **Humor e identidade local ficam na alcunha e na mascote**, nunca no nome (por isso `Alcobaça Monges FC` passou a `UD Alcobaça`, alcunha *Monges*).
- Mascotes: ligadas à terra, plausíveis (um lobo, um pescador, um cavaleiro), evitando objetos gigantes e piadas.
- Em ilhas pequenas, nome simples (`Corvos FC`).
- Migração aplicada: `tools/migracoes/2026-10-15_renomear_clubes.py` (219 nomes novos + 13 mascotes).

## 3. Interface: denso, organizado, agradável

O FM26 tem muita informação mal organizada. Aqui a regra é **muita informação, fácil de digerir**:

1. **Poucas ilustrações.** Peso no layout, tipografia, tabelas e cor funcional.
2. **Tudo é uma ficha.** Clube, cidade, pessoa, competição e jogo têm uma ficha com a **mesma estrutura**: cabeçalho (identidade + números-chave), separadores fixos e sempre pela mesma ordem, e uma coluna lateral de ligações.
3. **Tudo é uma ligação.** Qualquer nome (clube, jogador, autarca, cidade, competição) abre a sua ficha. Voltar atrás e migalhas de pão sempre visíveis.
4. **Pesquisa global** (`/` ou ⌘K) por qualquer entidade.
5. **Máximo 2 níveis de menu.** Menu à esquerda por secção; separadores dentro da página; nada escondido em menus de 4 níveis.
6. **Uma só tabela.** Um componente de tabela denso com ordenação, filtros, conjuntos de colunas guardados e exportação; usado em todo o jogo.
7. **O que sabes e o que não sabes é visível.** Valores exatos, estimativas (`≈ 14-16`) e dados desatualizados (`visto há 2 épocas`) têm aspeto diferente (ver `HISTORICO_EVENTOS` §5).
8. **Página «Início» (antes «Hoje»).** O que vem a seguir em cima; por baixo, o que exige decisão, a caixa de entrada e as notícias; no rodapé, a fita de resultados. «Avançar» está sempre em baixo à direita (`docs/UI_SISTEMA.md` §3e).
9. **Densidade ajustável** (compacta/normal) e teclado primeiro (atalhos, setas nas tabelas).
10. **Textos sem excesso:** títulos curtos, números alinhados, cor só para estado (bom/mau/aviso).

## 4. Jogo ao vivo

- **O teu clube:** jogo **minuto a minuto**, com notificação de cada evento (golos, cartões, penáltis, lesões, substituições, lances perigosos), controlo de velocidade e pausa. Depois do MVP: **mudar a tática e fazer substituições durante o jogo**.
- **Outros jogos:** só golos (minuto e marcador), cartões vermelhos e melhor jogador em campo. (A base de dados guarda sempre tudo e é pública; isto é só o que a interface destaca.)
