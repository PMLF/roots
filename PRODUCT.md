# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Gamers (quem joga) who like football management and want a story with roots: a club that lives in a city. They play on desktop and on the phone with equal weight, so every screen has to work in long desktop sessions and in quick phone check-ins. The gamer manages a Portuguese club (underdog stories, scouting local talent, the Câmara, supporters, local politics), and in the game they are the club's decision-maker, never "the player" (the footballers are `player`).

## Product Purpose
Raízes is a Portuguese football-management browser game where clubs are tied to their cities. It lets the gamer run a club and, over time, shape the place around it. Success is a living world the gamer cares about: a small club and its town rise or struggle together across seasons.

## Positioning
Football Manager meets Cities: Skylines, in a simpler form than either. The city (or town, or village) and the club affect each other deeply (stadium, Câmara, economy, pride, youth talent), which neither a pure football manager nor a pure city builder offers. The city side is not built yet and is planned in `docs/CITY.md`. It is also a living world with no backend that works fully offline.

## Operating Context
Static Next.js app; the whole world, the simulation and the history live in the browser (SQLite in WASM/OPFS), with an append-only event log. The gamer reads a World through a View (public information plus their own observations), never the hidden truth (personality, attributes, finances). Season flow: advance day by day or up to the next match, a pre-match tactics screen, a live match with pauses and substitutions, inbox and news, results and tables.

## Capabilities and Constraints
- No backend, no accounts, must work offline; faces are generated in the browser from a seed.
- Clubs, people and places are fictional: 300 clubs, 276 concelhos, real-feeling names, no Football Manager data, no real club or person names.
- Simulation engine is pure TypeScript and testable headless; every number has a parameter in `src/engine/config/parameters.ts` and passes calibration.
- Terminology: gamer = whoever plays; player (`jogador`) = footballer.
- Undecided: the city layer (services, local companies, Câmara, stadium ownership) and its depth.

## Brand Commitments
- Tone is realistic; humour lives only in club nicknames and mascots (`docs/TONE_AND_UX.md`).
- Name: Raízes (roots).
- Language: English is the primary language, with pt-PT translations; more languages may come later. Code, database and keys are in English. Gamer-facing text goes through i18n with identical keys in every language.

## Evidence on Hand
Design docs in `docs/` (DESIGN_RULES, DATA_MODEL, PERSONALITY, EVENT_HISTORY, TONE_AND_UX, UI_SYSTEM, GAME_ENGINE, WORLD_GENERATION, CITY, EUROPE), a prioritised `BACKLOG.md`, and `data/` with the clubs, concelhos and rivalries. No real players, testimonials or usage data exist; do not invent any.

## Product Principles
- Everything visual first: show state with colour, icons, bars and position instead of explanatory sentences, and cut copy to what the gamer needs to act.
- The city and the club are one story: surfaces link them (talent from the town, Câmara support, supporters) rather than treating them as separate games.
- The gamer sees what a real manager could see: public facts and their own observations, never hidden truth.
- Offline and living: nothing depends on a server, and nothing is erased when a season ends.
- Established patterns win: refine alignment, spacing and colour consistently across every page instead of redesigning screen by screen.

## Accessibility & Inclusion
Phone and desktop are equal targets, so touch targets and keyboard use must hold on both. No formal accessibility standard has been confirmed yet (open decision).
