import type { LightCone, LightGlow } from '../lib/sun'

interface Props {
  cones: LightCone[]
  glows: LightGlow[]
  coneColor: string // sun colour for the cones (background is left unchanged)
}

// The lighting overlay: window sun-cones + lamp glows, each a radial gradient
// clipped to its room. The cones' colour shifts with time of day; the plan
// background itself is never recoloured.
export default function LightingLayer({ cones, glows, coneColor }: Props) {
  return (
    <g pointerEvents="none">
      <defs>
        {cones.map((c, i) => (
          <radialGradient key={`cg${i}`} id={`cone-${i}`} gradientUnits="userSpaceOnUse" cx={c.ax} cy={c.ay} r={c.r}>
            <stop offset="0%" stopColor={coneColor} stopOpacity={c.op} />
            <stop offset="55%" stopColor={coneColor} stopOpacity={c.op * 0.4} />
            <stop offset="100%" stopColor={coneColor} stopOpacity={0} />
          </radialGradient>
        ))}
        {cones.map((c, i) => c.clip && (
          <clipPath key={`cc${i}`} id={`coneClip-${i}`}>
            <polygon points={c.clip} />
          </clipPath>
        ))}
        {glows.map((g, i) => (
          <radialGradient key={`gg${i}`} id={`glow-${i}`} gradientUnits="userSpaceOnUse" cx={g.x} cy={g.y} r={g.r}>
            <stop offset="0%" stopColor={g.color} stopOpacity={g.op} />
            <stop offset="70%" stopColor={g.color} stopOpacity={g.op * 0.3} />
            <stop offset="100%" stopColor={g.color} stopOpacity={0} />
          </radialGradient>
        ))}
        {glows.map((g, i) => g.clip && (
          <clipPath key={`gc${i}`} id={`glowClip-${i}`}>
            <polygon points={g.clip} />
          </clipPath>
        ))}
      </defs>

      {cones.map((c, i) => (
        <polygon key={`cone${i}`} points={c.poly} fill={`url(#cone-${i})`} clipPath={c.clip ? `url(#coneClip-${i})` : undefined} />
      ))}
      {glows.map((g, i) => (
        <circle key={`glow${i}`} cx={g.x} cy={g.y} r={g.r} fill={`url(#glow-${i})`} clipPath={g.clip ? `url(#glowClip-${i})` : undefined} />
      ))}
    </g>
  )
}
