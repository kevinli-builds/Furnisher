'use client'

import type { FurnitureType } from '../lib/furniture'

interface Props {
  type: FurnitureType
  x: number
  y: number
  w: number
  h: number
  color: string
  round?: boolean // draw the circular variant (for round-shaped pieces)
}

// A little top-view furniture icon, drawn in a 0..100 box and stretched to fill
// the piece's footprint. Strokes are non-scaling so they stay crisp at any zoom
// or footprint size.
export default function FurnitureGlyph({ type, x, y, w, h, color, round }: Props) {
  // The 0..100 box maps onto the footprint. Rectangular icons are drawn with a
  // small internal margin, so we over-scale a touch to reach the edges. Round
  // icons are drawn edge-to-edge (r≈50), so they map 1:1 onto the ellipse.
  const pad = round ? 1.0 : 1.2
  const sx = (w * pad) / 100
  const sy = (h * pad) / 100
  const tx = x + (w * (1 - pad)) / 2
  const ty = y + (h * (1 - pad)) / 2
  return (
    <g transform={`translate(${tx} ${ty}) scale(${sx} ${sy})`} pointerEvents="none">
      {round ? <RoundIcon type={type} color={color} /> : <Icon type={type} color={color} />}
    </g>
  )
}

// Circular top-view icons for round pieces — filled to the footprint's ellipse
// (r≈49 of the 0..100 box) so they fully fill the shape, with a type-specific
// inner motif where it reads (rugs, tables, lamps, plants).
function RoundIcon({ type, color }: { type: FurnitureType; color: string }) {
  const S = '#6b5f4f'
  const line = { stroke: S, strokeWidth: 1.5, fill: 'none', vectorEffect: 'non-scaling-stroke', strokeLinecap: 'round', strokeLinejoin: 'round' } as const
  const fill = { ...line, fill: color, fillOpacity: 0.5 } as const
  const base = <circle cx={50} cy={50} r={49} {...fill} />
  switch (type) {
    case 'rug':
      return (
        <>
          <circle cx={50} cy={50} r={49} {...fill} fillOpacity={0.32} />
          <circle cx={50} cy={50} r={35} {...line} strokeDasharray="4 3" />
          <circle cx={50} cy={50} r={21} {...line} strokeDasharray="4 3" />
        </>
      )
    case 'table':
    case 'diningTable':
      return (
        <>
          {base}
          <circle cx={50} cy={50} r={36} {...line} />
        </>
      )
    case 'lamp':
      return (
        <>
          {base}
          <circle cx={50} cy={50} r={13} {...line} />
        </>
      )
    case 'plant':
      return (
        <>
          {base}
          <circle cx={50} cy={50} r={20} {...line} />
        </>
      )
    default:
      return (
        <>
          {base}
          <circle cx={50} cy={50} r={33} {...line} strokeOpacity={0.5} />
        </>
      )
  }
}

function Icon({ type, color }: { type: FurnitureType; color: string }) {
  const S = '#6b5f4f'
  const line = {
    stroke: S,
    strokeWidth: 1.5,
    fill: 'none',
    vectorEffect: 'non-scaling-stroke',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  } as const
  const fill = { ...line, fill: color, fillOpacity: 0.5 } as const

  switch (type) {
    case 'sofa':
      return (
        <>
          <rect x={8} y={8} width={84} height={20} rx={6} {...fill} />
          <rect x={8} y={8} width={17} height={84} rx={6} {...fill} />
          <rect x={75} y={8} width={17} height={84} rx={6} {...fill} />
          <rect x={27} y={30} width={46} height={58} rx={4} {...fill} />
          <line x1={50} y1={32} x2={50} y2={88} {...line} />
        </>
      )
    case 'bed':
      return (
        <>
          <rect x={6} y={6} width={88} height={88} rx={6} {...fill} />
          <rect x={13} y={13} width={32} height={20} rx={4} {...line} />
          <rect x={55} y={13} width={32} height={20} rx={4} {...line} />
          <line x1={6} y1={42} x2={94} y2={42} {...line} />
        </>
      )
    case 'chair':
      return (
        <>
          <rect x={12} y={34} width={76} height={54} rx={8} {...fill} />
          <rect x={12} y={12} width={76} height={20} rx={6} {...fill} />
        </>
      )
    case 'diningTable':
      return (
        <>
          <rect x={12} y={14} width={76} height={72} rx={8} {...fill} />
          <rect x={28} y={6} width={18} height={9} rx={3} {...line} />
          <rect x={54} y={6} width={18} height={9} rx={3} {...line} />
          <rect x={28} y={85} width={18} height={9} rx={3} {...line} />
          <rect x={54} y={85} width={18} height={9} rx={3} {...line} />
        </>
      )
    case 'table':
      return <rect x={10} y={14} width={80} height={72} rx={10} {...fill} />
    case 'desk':
      return (
        <>
          <rect x={8} y={14} width={84} height={72} rx={4} {...fill} />
          <line x1={58} y1={14} x2={58} y2={86} {...line} />
          <circle cx={68} cy={50} r={3} {...line} />
        </>
      )
    case 'dresser':
      return (
        <>
          <rect x={8} y={16} width={84} height={68} rx={4} {...fill} />
          <line x1={36} y1={16} x2={36} y2={84} {...line} />
          <line x1={64} y1={16} x2={64} y2={84} {...line} />
          <circle cx={22} cy={50} r={2.5} {...line} />
          <circle cx={50} cy={50} r={2.5} {...line} />
          <circle cx={78} cy={50} r={2.5} {...line} />
        </>
      )
    case 'wardrobe':
      return (
        <>
          <rect x={8} y={8} width={84} height={84} rx={4} {...fill} />
          <line x1={50} y1={8} x2={50} y2={92} {...line} />
          <circle cx={44} cy={50} r={2.5} {...line} />
          <circle cx={56} cy={50} r={2.5} {...line} />
        </>
      )
    case 'nightstand':
      return (
        <>
          <rect x={12} y={12} width={76} height={76} rx={6} {...fill} />
          <circle cx={50} cy={50} r={3.5} {...line} />
        </>
      )
    case 'bookshelf':
      return (
        <>
          <rect x={8} y={10} width={84} height={80} rx={3} {...fill} />
          <line x1={8} y1={37} x2={92} y2={37} {...line} />
          <line x1={8} y1={63} x2={92} y2={63} {...line} />
        </>
      )
    case 'rug':
      // A rug covers its whole footprint, so fill the box edge-to-edge.
      return (
        <>
          <rect x={8} y={8} width={84} height={84} rx={8} {...fill} fillOpacity={0.32} />
          <rect x={18} y={18} width={64} height={64} rx={5} {...line} strokeDasharray="4 3" />
        </>
      )
    case 'lamp':
      return (
        <>
          <circle cx={50} cy={50} r={46} {...fill} />
          <circle cx={50} cy={50} r={14} {...line} />
        </>
      )
    case 'plant':
      return (
        <>
          <circle cx={50} cy={50} r={45} {...fill} />
          <circle cx={50} cy={50} r={19} {...line} />
        </>
      )
    case 'tv':
      return (
        <>
          <rect x={6} y={20} width={88} height={48} rx={3} {...fill} />
          <line x1={50} y1={68} x2={50} y2={82} {...line} />
          <line x1={34} y1={82} x2={66} y2={82} {...line} />
        </>
      )
    case 'fridge':
      return (
        <>
          <rect x={12} y={8} width={76} height={84} rx={5} {...fill} />
          <line x1={12} y1={42} x2={88} y2={42} {...line} />
          <line x1={78} y1={18} x2={78} y2={32} {...line} strokeWidth={2.5} />
          <line x1={78} y1={52} x2={78} y2={74} {...line} strokeWidth={2.5} />
        </>
      )
    case 'stove':
      return (
        <>
          <rect x={8} y={8} width={84} height={84} rx={5} {...fill} />
          <circle cx={34} cy={34} r={11} {...line} />
          <circle cx={66} cy={34} r={11} {...line} />
          <circle cx={34} cy={66} r={11} {...line} />
          <circle cx={66} cy={66} r={11} {...line} />
        </>
      )
    case 'sink':
      return (
        <>
          <rect x={8} y={10} width={84} height={80} rx={6} {...fill} />
          <ellipse cx={50} cy={56} rx={28} ry={20} {...line} />
          <circle cx={50} cy={24} r={3.5} {...line} />
        </>
      )
    case 'toilet':
      return (
        <>
          <rect x={14} y={8} width={72} height={20} rx={3} {...fill} />
          <ellipse cx={50} cy={58} rx={37} ry={33} {...fill} />
        </>
      )
    case 'bathtub':
      return (
        <>
          <rect x={8} y={6} width={84} height={88} rx={16} {...fill} />
          <rect x={18} y={20} width={64} height={62} rx={14} {...line} />
          <circle cx={50} cy={14} r={3.5} {...line} />
        </>
      )
    case 'box':
    default:
      return <rect x={8} y={8} width={84} height={84} rx={6} {...fill} />
  }
}
