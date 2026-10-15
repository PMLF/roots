/** Ícones de traço simples (24×24), sem dependências. Decorativos: o texto ao lado diz o que é. */
const CAMINHOS = {
  hoje: "M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z",
  clube: "M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6z",
  plantel: "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20c0-3.3 2.7-5.5 6-5.5s6 2.200 6 5.500M16 5.200a3 3 0 0 1 0 5.600M18 14.800c1.800.7 3 2.400 3 5.200",
  tatica: "M4 5h16v14H4zM12 5v14M4 12h16M9 12a3 3 0 1 0 6 0 3 3 0 0 0-6 0",
  jogos: "M4 6h16M4 12h16M4 18h10",
  competicoes: "M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a2 2 0 0 0 2 4M16 6h3a2 2 0 0 1-2 4M12 13v4M8.500 20h7",
  cidade: "M4 20V9l5-3v14M9 20V4l6 3v13M15 20v-8l5 2v6M3 20h18",
  mundo: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c2.500 2.500 3.500 5.500 3.500 9s-1 6.500-3.500 9c-2.500-2.500-3.500-5.500-3.500-9s1-6.500 3.500-9z",
  laboratorio: "M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.800 3h10.400a2 2 0 0 0 1.800-3l-5-9V3M8 15h8",
  olho: "M2 12s3.500-6.500 10-6.500S22 12 22 12s-3.500 6.500-10 6.500S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  pesquisa: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4",
  raiz: "M12 21v-8M12 13c0-3 2.500-5 6-5 0 3.500-2.500 5-6 5zM12 16c0-2.500-2-4-5-4 0 3 2 4 5 4z",
} as const;

export type NomeIcone = keyof typeof CAMINHOS;

export function Icone({ nome }: { nome: NomeIcone }) {
  return (
    <svg className="icone" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={CAMINHOS[nome]} />
    </svg>
  );
}
