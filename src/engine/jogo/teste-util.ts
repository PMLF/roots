/** Equipas sintéticas para testar o motor de jogo (só testes). */
import { ATRIBUTOS, type Atributos, type Posicao } from "../mundo/tipos";
import { FORMACAO_PADRAO } from "./equipa";
import type { EquipaJogo, JogadorEmCampo } from "./tipos";

/** Equipa em que todos os atributos valem `nivel` (guarda-redes incluídos, os de campo com 2 nos de GR). */
export function equipaSintetica(clube: string, nivel: number, ajuste: Partial<Atributos> = {}): EquipaJogo {
  const onze: JogadorEmCampo[] = FORMACAO_PADRAO.map((posicao: Posicao, i) => {
    const atributos = {} as Atributos;
    for (const a of ATRIBUTOS) atributos[a] = nivel;
    Object.assign(atributos, ajuste);
    return { id: `${clube}-${i}`, posicao, atributos, alturaCm: 180, forma: 1 };
  });
  return { clube, onze };
}
