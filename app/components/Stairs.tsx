'use client'

import type { Stair } from '../lib/types'

interface Props {
  s: Stair
  active: boolean
  onDown: (e: React.PointerEvent, id: string) => void
  handles: React.ReactNode // resize handles (rendered by Canvas) when single-selected
}

// A stair block: a rotated rectangle with step lines, an up/down arrow, and an
// Entry/Exit label. Presentational — drag/select/resize lives in Canvas.
export default function Stairs({ s, active, onDown, handles }: Props) {
  const cx = s.x + s.w / 2
  const cy = s.y + s.h / 2
  const n = Math.max(3, Math.min(12, Math.round(s.h / 35)))
  const steps = []
  for (let i = 1; i < n; i++) {
    const yy = s.y + (s.h * i) / n
    steps.push(<line key={i} x1={s.x + 6} y1={yy} x2={s.x + s.w - 6} y2={yy} stroke="#9a8c74" strokeWidth={1} vectorEffect="non-scaling-stroke" />)
  }
  const up = s.role === 'entry'
  const base = up ? s.y + 20 : s.y + s.h - 20
  const tip = up ? s.y + 7 : s.y + s.h - 7
  const arrow = `M ${cx - 7} ${base} L ${cx + 7} ${base} L ${cx} ${tip} Z`
  return (
    <g transform={`rotate(${s.rotation} ${cx} ${cy})`} style={{ cursor: 'move' }} onPointerDown={(e) => onDown(e, s.id)}>
      <rect x={s.x} y={s.y} width={s.w} height={s.h} rx={4} fill="#efe7d8" fillOpacity={0.9} stroke={active ? '#b5714e' : '#b3a488'} strokeWidth={active ? 3 : 1.5} vectorEffect="non-scaling-stroke" />
      {steps}
      <path d={arrow} fill="#8a7c66" stroke="none" pointerEvents="none" />
      <text x={cx} y={cy + 4} fontSize={12} fill="#8a7e6b" fontWeight={600} textAnchor="middle" pointerEvents="none">
        {up ? 'Entry' : 'Exit'}
      </text>
      {handles}
    </g>
  )
}
