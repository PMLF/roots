/** Equipas sintéticas para testar o motor de jogo (só testes). */
import { ATTRIBUTES, type Attributes, type Position } from "../mundo/tipos";
import { DEFAULT_FORMATION } from "./equipa";
import type { MatchTeam, OnPitchPlayer } from "./tipos";

/** Equipa em que todos os atributos valem `nivel` (guarda-redes incluídos, os de campo com 2 nos de GR). */
export function syntheticTeam(club: string, level: number, adjustment: Partial<Attributes> = {}): MatchTeam {
  const lineup: OnPitchPlayer[] = DEFAULT_FORMATION.map((position: Position, i) => {
    const attributes = {} as Attributes;
    for (const a of ATTRIBUTES) attributes[a] = level;
    Object.assign(attributes, adjustment);
    return { id: `${club}-${i}`, position, attributes, heightCm: 180, form: 1 };
  });
  return { club, lineup };
}
