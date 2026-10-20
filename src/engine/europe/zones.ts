/** Zonas europeias da Primeira Liga (RZ-252). Módulo puro: a interface usa-o para colorir as tabelas. */

/** Vagas dadas pela Primeira Liga numa época, pelo lugar de Portugal no ranking. */
export type EuropeSlots = {
  /** Lugar de Portugal no ranking de associações (1 = o melhor). */
  rank: number;
  /** Direto à fase de liga da Liga dos Campeões. */ championsLeague: number;
  /** À pré-eliminatória da Liga dos Campeões (quem perde cai para a Liga Europa). */ championsQualifying: number;
  /** Liga Europa pela liga (além do vencedor da Taça). */ europaLeague: number;
  /** Liga Conferência. */ conferenceLeague: number;
};

/** Zona europeia de uma posição da Primeira Liga (o 1.º é campeão e já tem cor própria). */
export function europeZone(position: number, slots: EuropeSlots): "cl" | "clq" | "el" | "ecl" | undefined {
  if (position <= 1) return undefined;
  let p = position - slots.championsLeague;
  if (p <= 0) return "cl";
  if ((p -= slots.championsQualifying) <= 0) return "clq";
  if ((p -= slots.europaLeague) <= 0) return "el";
  if ((p -= slots.conferenceLeague) <= 0) return "ecl";
  return undefined;
}
