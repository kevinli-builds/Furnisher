'use client'

import type { Door } from '../lib/types'
import { doorGeom } from '../lib/door'

interface Props {
  door: Door
  active: boolean
  showHandles: boolean // active && single selection — show the end resize handles
  onDown: (e: React.PointerEvent, id: string) => void
  onResizeStart: (e: React.PointerEvent, id: string, end: 0 | 1) => void
  warn?: boolean // swing arc blocked by furniture — draw in red
}

// A wall opening (swing door / sliding door / window). Presentational: the
// drag/select/resize behaviour lives in Canvas via the passed-in handlers.
export default function Opening({ door: d, active, showHandles, onDown, onResizeStart, warn }: Props) {
  const color = warn ? '#d4564f' : active ? '#b5714e' : '#6b5f4f'
  const type = d.type ?? 'swing'
  const horiz = d.orientation === 'h'
  const ex = horiz ? d.x + d.length : d.x
  const ey = horiz ? d.y : d.y + d.length
  return (
    <g style={{ cursor: 'move' }} onPointerDown={(e) => onDown(e, d.id)}>
      {/* fat invisible hit band — makes thin openings easy to click */}
      <line x1={d.x} y1={d.y} x2={ex} y2={ey} stroke="transparent" strokeWidth={20} strokeLinecap="round" vectorEffect="non-scaling-stroke" pointerEvents="stroke" />
      {/* white wall gap */}
      <line x1={d.x} y1={d.y} x2={ex} y2={ey} stroke="#fdfbf7" strokeWidth={6} vectorEffect="non-scaling-stroke" />
      {type === 'swing' &&
        (() => {
          const g = doorGeom(d.x, d.y, d.length, d.orientation, d.swing, d.hinge ?? 1)
          return (
            <>
              <path d={g.leaf} stroke={color} strokeWidth={3} vectorEffect="non-scaling-stroke" fill="none" />
              <path d={g.arc} stroke={color} strokeWidth={1.5} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" fill="none" />
              {active && <circle cx={g.hx} cy={g.hy} r={6} fill="#b5714e" vectorEffect="non-scaling-stroke" />}
            </>
          )
        })()}
      {type === 'sliding' &&
        (horiz ? (
          <>
            <line x1={d.x} y1={d.y - 3} x2={d.x + d.length * 0.6} y2={d.y - 3} stroke={color} strokeWidth={3} vectorEffect="non-scaling-stroke" />
            <line x1={d.x + d.length * 0.4} y1={d.y + 3} x2={ex} y2={d.y + 3} stroke={color} strokeWidth={3} vectorEffect="non-scaling-stroke" />
          </>
        ) : (
          <>
            <line x1={d.x - 3} y1={d.y} x2={d.x - 3} y2={d.y + d.length * 0.6} stroke={color} strokeWidth={3} vectorEffect="non-scaling-stroke" />
            <line x1={d.x + 3} y1={d.y + d.length * 0.4} x2={d.x + 3} y2={ey} stroke={color} strokeWidth={3} vectorEffect="non-scaling-stroke" />
          </>
        ))}
      {type === 'window' &&
        (horiz ? (
          <>
            <line x1={d.x} y1={d.y - 2} x2={ex} y2={d.y - 2} stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
            <line x1={d.x} y1={d.y + 2} x2={ex} y2={d.y + 2} stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          </>
        ) : (
          <>
            <line x1={d.x - 2} y1={d.y} x2={d.x - 2} y2={ey} stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
            <line x1={d.x + 2} y1={d.y} x2={d.x + 2} y2={ey} stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          </>
        ))}
      {/* Drag either end to resize the opening (like other objects). */}
      {showHandles &&
        (
          [
            { end: 0 as const, cx: d.x, cy: d.y },
            { end: 1 as const, cx: ex, cy: ey },
          ]
        ).map((g) => (
          <rect
            key={`de${g.end}`}
            x={g.cx - 7}
            y={g.cy - 7}
            width={14}
            height={14}
            rx={2}
            fill="#fff"
            stroke="#b5714e"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
            style={{ cursor: horiz ? 'ew-resize' : 'ns-resize' }}
            onPointerDown={(e) => onResizeStart(e, d.id, g.end)}
          />
        ))}
    </g>
  )
}
