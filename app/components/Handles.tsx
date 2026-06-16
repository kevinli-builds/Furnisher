'use client'

type OType = 'room' | 'furniture' | 'marker' | 'stair'

interface Props {
  otype: OType
  id: string
  x: number
  y: number
  w: number
  h: number
  scale: number // px per cm — keeps handles a sensible size at any zoom
  compact?: boolean // touch: 4 bigger corner handles instead of 8
  showRotate?: boolean // furniture / stairs get a rotate knob
  onResizeStart: (e: React.PointerEvent, otype: OType, id: string, hx: number, hy: number) => void
  onRotate?: (e: React.PointerEvent, otype: 'furniture' | 'stair', id: string) => void
}

// Selection chrome for a single-selected object: resize handles (corners +,
// on desktop, edge midpoints) and an optional rotate knob. Behaviour lives in
// Canvas via the passed-in handlers.
export default function Handles({ otype, id, x, y, w, h, scale, compact, showRotate, onResizeStart, onRotate }: Props) {
  const HS = compact ? 26 / scale : 16
  const corners = [
    { hx: -1, hy: -1, cx: x, cy: y, cur: 'nwse-resize' },
    { hx: 1, hy: -1, cx: x + w, cy: y, cur: 'nesw-resize' },
    { hx: 1, hy: 1, cx: x + w, cy: y + h, cur: 'nwse-resize' },
    { hx: -1, hy: 1, cx: x, cy: y + h, cur: 'nesw-resize' },
  ]
  const edges = [
    { hx: 0, hy: -1, cx: x + w / 2, cy: y, cur: 'ns-resize' },
    { hx: 1, hy: 0, cx: x + w, cy: y + h / 2, cur: 'ew-resize' },
    { hx: 0, hy: 1, cx: x + w / 2, cy: y + h, cur: 'ns-resize' },
    { hx: -1, hy: 0, cx: x, cy: y + h / 2, cur: 'ew-resize' },
  ]
  const hs = compact ? corners : [...corners, ...edges]
  const rDist = (compact ? 34 : 28) / scale
  const rR = (compact ? 11 : 7) / scale
  return (
    <g className="export-hide">
      {hs.map((g, i) => (
        <rect
          key={`rh${i}`}
          x={g.cx - HS / 2}
          y={g.cy - HS / 2}
          width={HS}
          height={HS}
          rx={compact ? 3 / scale : 2}
          fill="#fff"
          stroke="#b5714e"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
          style={{ cursor: g.cur }}
          onPointerDown={(e) => onResizeStart(e, otype, id, g.hx, g.hy)}
        />
      ))}
      {showRotate && onRotate && (
        <g key="rot">
          <line x1={x + w / 2} y1={y} x2={x + w / 2} y2={y - rDist} stroke="#b5714e" strokeWidth={1.5} vectorEffect="non-scaling-stroke" pointerEvents="none" />
          <circle cx={x + w / 2} cy={y - rDist} r={rR} fill="#fff" stroke="#b5714e" strokeWidth={2} vectorEffect="non-scaling-stroke" style={{ cursor: 'grab' }} onPointerDown={(e) => onRotate(e, otype as 'furniture' | 'stair', id)} />
        </g>
      )}
    </g>
  )
}
