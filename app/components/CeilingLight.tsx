'use client'

import type { Light } from '../lib/types'

interface Props {
  l: Light
  active: boolean
  scale: number // px per cm — keeps the fixture a constant screen size
  onDown: (e: React.PointerEvent, id: string) => void
}

// A ceiling-light fixture: a small warm sun-ray dot (greyed out when switched
// off). Point object — no footprint. Presentational; drag/select live in Canvas.
export default function CeilingLight({ l, active, scale, onDown }: Props) {
  const off = l.on === false
  const r = 9 / scale
  const ray = 15 / scale
  return (
    <g style={{ cursor: 'move' }} onPointerDown={(e) => onDown(e, l.id)}>
      <circle cx={l.x} cy={l.y} r={20 / scale} fill="transparent" />
      {!off &&
        [0, 45, 90, 135, 180, 225, 270, 315].map((a) => {
          const rad = (a * Math.PI) / 180
          return (
            <line
              key={a}
              x1={l.x + Math.cos(rad) * r * 1.4}
              y1={l.y + Math.sin(rad) * r * 1.4}
              x2={l.x + Math.cos(rad) * ray}
              y2={l.y + Math.sin(rad) * ray}
              stroke={active ? '#b5714e' : '#d8a44e'}
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
              pointerEvents="none"
            />
          )
        })}
      <circle cx={l.x} cy={l.y} r={r} fill={off ? '#e4ddd0' : active ? '#ffe9b0' : '#ffd87a'} stroke={active ? '#b5714e' : off ? '#aaa091' : '#c79a3e'} strokeWidth={active ? 2.5 : 1.5} vectorEffect="non-scaling-stroke" pointerEvents="none" />
    </g>
  )
}
