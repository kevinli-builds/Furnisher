import type { LightCone, LightGlow } from '../lib/sun'

interface Props {
  cones: LightCone[]
  glows: LightGlow[]
  tint: { color: string; opacity: number }
  left: number
  top: number
  vw: number
  vh: number
}

// The lighting overlay: a time-of-day wash + window sun-cones + lamp glows,
// each rendered with a radial gradient and clipped to its room.
export default function LightingLayer({ cones, glows, tint, left, top, vw, vh }: Props) {
  return (
    <g pointerEvents="none">
      <defs>
        {cones.map((c, i) => (
          <radialGradient key={`cg${i}`} id={`cone-${i}`} gradientUnits="userSpaceOnUse" cx={c.ax} cy={c.ay} r={c.r}>
            <stop offset="0%" stopColor="#ffe39a" stopOpacity={c.op} />
            <stop offset="55%" stopColor="#ffe39a" stopOpacity={c.op * 0.4} />
            <stop offset="100%" stopColor="#ffe39a" stopOpacity={0} />
          </radialGradient>
        ))}
        {cones.map((c, i) => c.clip && (
          <clipPath key={`cc${i}`} id={`coneClip-${i}`}>
            <polygon points={c.clip} />
          </clipPath>
        ))}
        {glows.map((g, i) => (
          <radialGradient key={`gg${i}`} id={`glow-${i}`} gradientUnits="userSpaceOnUse" cx={g.x} cy={g.y} r={g.r}>
            <stop offset="0%" stopColor="#ffdf86" stopOpacity={g.op} />
            <stop offset="70%" stopColor="#ffdf86" stopOpacity={g.op * 0.3} />
            <stop offset="100%" stopColor="#ffdf86" stopOpacity={0} />
          </radialGradient>
        ))}
        {glows.map((g, i) => g.clip && (
          <clipPath key={`gc${i}`} id={`glowClip-${i}`}>
            <polygon points={g.clip} />
          </clipPath>
        ))}
      </defs>

      <rect x={left} y={top} width={vw} height={vh} fill={tint.color} opacity={tint.opacity} />
      {cones.map((c, i) => (
        <polygon key={`cone${i}`} points={c.poly} fill={`url(#cone-${i})`} clipPath={c.clip ? `url(#coneClip-${i})` : undefined} />
      ))}
      {glows.map((g, i) => (
        <circle key={`glow${i}`} cx={g.x} cy={g.y} r={g.r} fill={`url(#glow-${i})`} clipPath={g.clip ? `url(#glowClip-${i})` : undefined} />
      ))}
    </g>
  )
}
