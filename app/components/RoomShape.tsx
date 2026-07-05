'use client'

import type { Room, Units } from '../lib/types'
import { roomCorners } from '../lib/geometry'
import { roomColor } from '../lib/roomTypes'
import { formatLength, formatSize } from '../lib/units'

const NAME = 15 // label font sizes
const DIM = 12

interface Props {
  r: Room
  active: boolean
  showLabel: boolean
  above: boolean // is there room above the rect to place the label?
  units: Units
  showEdgeLengths: boolean // label each wall with its length (Display toggle)
  showHandles: boolean // active && single selection
  onEnter: (id: string) => void
  onLeave: (id: string) => void
  onDown: (e: React.PointerEvent, id: string) => void
  onNodeDown: (e: React.PointerEvent, id: string, idx: number) => void
  onInsertNode: (e: React.PointerEvent, id: string, edge: number) => void
  onDeleteNode: (e: React.MouseEvent, id: string, idx: number) => void
  rectHandles: React.ReactNode // resize handles (from Canvas) for a rectangular room
}

// A room: rectangle or polygon outline, name/size label, and — when selected —
// either resize handles (rect) or draggable corner/edge nodes (polygon).
// Presentational; drag/select/node-editing live in Canvas via the handlers.
export default function RoomShape({ r, active, showLabel, above, units, showEdgeLengths, showHandles, onEnter, onLeave, onDown, onNodeDown, onInsertNode, onDeleteNode, rectHandles }: Props) {
  const dimY = above ? r.y - 7 : r.y + NAME + DIM + 12
  const nameY = above ? r.y - 7 - (DIM + 3) : r.y + NAME + 6
  const corners = roomCorners(r)
  const isPoly = !!(r.points && r.points.length >= 3)
  const tint = roomColor(r)
  const fill = tint ?? (active ? 'rgba(181,113,78,0.06)' : 'rgba(74,65,54,0.02)')
  const fillOpacity = tint ? (active ? 0.22 : 0.14) : undefined
  const stroke = active ? '#b5714e' : tint ?? '#b3a78f'
  const sw = active ? 3 : 1.75
  return (
    <g onPointerEnter={() => onEnter(r.id)} onPointerLeave={() => onLeave(r.id)}>
      {isPoly ? (
        <polygon points={corners.map((c) => `${c.x},${c.y}`).join(' ')} fill={fill} fillOpacity={fillOpacity} stroke={stroke} strokeWidth={sw} vectorEffect="non-scaling-stroke" style={{ cursor: 'move' }} onPointerDown={(e) => onDown(e, r.id)} />
      ) : (
        <rect x={r.x} y={r.y} width={r.w} height={r.h} fill={fill} fillOpacity={fillOpacity} stroke={stroke} strokeWidth={sw} vectorEffect="non-scaling-stroke" style={{ cursor: 'move' }} onPointerDown={(e) => onDown(e, r.id)} />
      )}
      {showLabel && (
        <>
          <text x={r.x + 10} y={nameY} fontSize={NAME} fill="#8a7e6b" fontWeight={500} pointerEvents="none">
            {r.name}
          </text>
          <text x={r.x + 10} y={dimY} fontSize={DIM} fill="#a89c88" pointerEvents="none">
            {formatSize(r.w, r.h, units)}
          </text>
        </>
      )}
      {showEdgeLengths && isPoly && (
        <g pointerEvents="none">
          {corners.map((a, i) => {
            const b = corners[(i + 1) % corners.length]
            const len = Math.hypot(b.x - a.x, b.y - a.y)
            if (len < 1) return null
            const mx = (a.x + b.x) / 2
            const my = (a.y + b.y) / 2
            // Nudge the label just outside the wall (away from the polygon centroid).
            const cx = corners.reduce((s, c) => s + c.x, 0) / corners.length
            const cy = corners.reduce((s, c) => s + c.y, 0) / corners.length
            const ox = mx - cx
            const oy = my - cy
            const d = Math.hypot(ox, oy) || 1
            return (
              <text
                key={`len${i}`}
                x={mx + (ox / d) * 16}
                y={my + (oy / d) * 16}
                fontSize={DIM}
                fill="#8a7e6b"
                fontWeight={500}
                textAnchor="middle"
                dominantBaseline="middle"
                paintOrder="stroke"
                stroke="#fbf8f1"
                strokeWidth={4}
                strokeLinejoin="round"
              >
                {formatLength(len, units)}
              </text>
            )
          })}
        </g>
      )}
      {showHandles &&
        (isPoly ? (
          <g className="export-hide">
            {/* Edge midpoints: click to insert a corner */}
            {corners.map((a, i) => {
              const b = corners[(i + 1) % corners.length]
              return (
                <circle key={`e${i}`} cx={(a.x + b.x) / 2} cy={(a.y + b.y) / 2} r={9} fill="#fff" stroke="#b5714e" strokeWidth={2} vectorEffect="non-scaling-stroke" style={{ cursor: 'copy' }} onPointerDown={(e) => onInsertNode(e, r.id, i)} />
              )
            })}
            {/* Vertices: drag to move, double-click or right-click to delete */}
            {corners.map((c, i) => (
              <circle key={`v${i}`} cx={c.x} cy={c.y} r={11} fill="#b5714e" vectorEffect="non-scaling-stroke" style={{ cursor: 'move' }} onPointerDown={(e) => onNodeDown(e, r.id, i)} onDoubleClick={(e) => onDeleteNode(e, r.id, i)} onContextMenu={(e) => onDeleteNode(e, r.id, i)} />
            ))}
          </g>
        ) : (
          rectHandles
        ))}
    </g>
  )
}
