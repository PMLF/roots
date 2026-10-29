/**
 * Fundo do jogo: uma rede de baliza (malha de hexágonos) deformada por ruído, para ficar imperfeita como uma rede real.
 * Decorativa e fixa; a cor vem de `--rede` (claro/escuro). Fica atrás de tudo e nunca apanha cliques.
 */
const SIDE = 26;
const W = Number((SIDE * Math.sqrt(3)).toFixed(2));
const H = SIDE * 3;
const X = W / 2;
const MESH = `M0 ${1.5 * SIDE}V${SIDE / 2}L${X} 0L${W} ${SIDE / 2}M${W} ${1.5 * SIDE}L${X} ${2 * SIDE}L0 ${1.5 * SIDE}M${X} ${2 * SIDE}V${H}`;

export function GoalNet() {
  return (
    <svg className="fundo-rede" aria-hidden="true" focusable="false" width="100%" height="100%">
      <defs>
        <pattern id="rede-malha" width={W} height={H} patternUnits="userSpaceOnUse">
          <path d={MESH} />
        </pattern>
        <filter id="rede-deforma" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.0055" numOctaves="2" seed="4" result="ruido" />
          <feDisplacementMap in="SourceGraphic" in2="ruido" scale="46" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>
      <rect width="100%" height="100%" fill="url(#rede-malha)" filter="url(#rede-deforma)" />
    </svg>
  );
}
