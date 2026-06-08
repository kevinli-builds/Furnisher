'use client'

import type { Furniture, Units } from '../lib/types'
import { furnitureType } from '../lib/furniture'
import { formatSize } from '../lib/units'
import FurnitureGlyph from './FurnitureGlyph'

interface Props {
  f: Furniture
  active: boolean
  schematic: boolean
  showLabel: boolean
  units: Units
  onDown: (e: React.PointerEvent, id: string) => void
  onEnter: (id: string) => void
  onLeave: (id: string) => void
  handles: React.ReactNode // resize handles (rendered by Canvas) when single-selected
  warn?: boolean // collision / out-of-room — draw a red outline
}

// One placed furniture piece: rotated footprint (rect or round ellipse), the
// top-view glyph (sim mode), an upright name/size label, and resize handles.
// Presentational — drag/select/resize behaviour lives in Canvas via the handlers.
export default function FurniturePiece({ f, active, schematic, showLabel, units, onDown, onEnter, onLeave, handles, warn }: Props) {
  const cx = f.x + f.w / 2
  const cy = f.y + f.h / 2
  const t = furnitureType(f.type)
  const stroke = warn ? '#d4564f' : active ? '#b5714e' : schematic ? '#7a6e5b' : '#cabfa9'
  const sw = warn || active ? 3 : schematic ? 1.5 : 1.2
  // Top of the rotated footprint, for an upright label above the piece.
  const rad = (f.rotation * Math.PI) / 180
  const cs = Math.cos(rad)
  const sn = Math.sin(rad)
  const ys = [f.x, f.x + f.w].flatMap((px) => [f.y, f.y + f.h].map((py) => cy + (px - cx) * sn + (py - cy) * cs))
  const labelY = Math.min(...ys) - 8
  return (
    <g>
      <g
        transform={`rotate(${f.rotation} ${cx} ${cy})`}
        style={{ cursor: 'move' }}
        onPointerDown={(e) => onDown(e, f.id)}
        onPointerEnter={() => onEnter(f.id)}
        onPointerLeave={() => onLeave(f.id)}
      >
        {schematic ? (
          f.shape === 'round' ? (
            <ellipse cx={cx} cy={cy} rx={f.w / 2} ry={f.h / 2} fill={f.color} fillOpacity={0.85} stroke={stroke} strokeWidth={sw} vectorEffect="non-scaling-stroke" />
          ) : (
            <rect x={f.x} y={f.y} width={f.w} height={f.h} rx={6} fill={f.color} fillOpacity={0.85} stroke={stroke} strokeWidth={sw} vectorEffect="non-scaling-stroke" />
          )
        ) : f.shape === 'round' ? (
          <>
            <ellipse cx={cx} cy={cy} rx={f.w / 2} ry={f.h / 2} fill={f.color} fillOpacity={0.16} stroke={stroke} strokeWidth={sw} vectorEffect="non-scaling-stroke" />
            <FurnitureGlyph type={t} x={f.x} y={f.y} w={f.w} h={f.h} color={f.color} round />
          </>
        ) : (
          <>
            <rect x={f.x} y={f.y} width={f.w} height={f.h} rx={6} fill={f.color} fillOpacity={0.16} stroke={stroke} strokeWidth={sw} vectorEffect="non-scaling-stroke" />
            <FurnitureGlyph type={t} x={f.x} y={f.y} w={f.w} h={f.h} color={f.color} />
          </>
        )}
        {handles}
      </g>
      {/* Upright label above the (rotated) piece */}
      {showLabel && (
        <>
          <text x={cx} y={labelY - 12} fontSize={13} fill="#8a7e6b" fontWeight={500} textAnchor="middle" pointerEvents="none">
            {f.name}
          </text>
          <text x={cx} y={labelY} fontSize={11} fill="#a89c88" textAnchor="middle" pointerEvents="none">
            {formatSize(f.w, f.h, units)}
          </text>
        </>
      )}
    </g>
  )
}
