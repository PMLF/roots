/** O desenho do relvado e das linhas do campo (partilhado pelo campo de táticas e pelo do jogo). */
export function PitchSurface() {
  return (
    <svg className="campo-desenho" viewBox="0 0 100 150" preserveAspectRatio="none" aria-hidden="true">
      {[0, 1, 2, 3, 4, 5].map((i) => <rect key={i} x="0" y={i * 25} width="100" height="25" className={i % 2 === 0 ? "relva-a" : "relva-b"} />)}
      <g className="linhas">
        <rect x="3" y="3" width="94" height="144" />
        <line x1="3" y1="75" x2="97" y2="75" />
        <circle cx="50" cy="75" r="11" />
        <rect x="22" y="3" width="56" height="22" />
        <rect x="36" y="3" width="28" height="9" />
        <rect x="22" y="125" width="56" height="22" />
        <rect x="36" y="138" width="28" height="9" />
        <path d="M 39 25 A 11 11 0 0 0 61 25" />
        <path d="M 39 125 A 11 11 0 0 1 61 125" />
      </g>
    </svg>
  );
}
