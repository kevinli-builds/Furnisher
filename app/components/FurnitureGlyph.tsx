'use client'

import type { FurnitureType } from '../lib/furniture'

interface Props {
  type: FurnitureType
  x: number
  y: number
  w: number
  h: number
  color: string
}

// A little top-view furniture icon, drawn in a 0..100 box and stretched to fill
// the piece's footprint (with padding). Strokes are non-scaling so they stay
// crisp at any zoom or footprint size.
export default function FurnitureGlyph({ type, x, y, w, h, color }: Props) {
  // Fill the footprint (the icons are drawn with a little internal margin, so a
  // pad slightly over 1 lets them reach the edges and spill a touch).
  const pad = 1.08
  const sx = (w * pad) / 100
  const sy = (h * pad) / 100
  const tx = x + (w * (1 - pad)) / 2
  const ty = y + (h * (1 - pad)) / 2
  return (
    <g transform={`translate(${tx} ${ty}) scale(${sx} ${sy})`} pointerEvents="none">
      <Icon type={type} color={color} />
    </g>
  )
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
          <rect x={10} y={14} width={80} height={18} rx={6} {...fill} />
          <rect x={10} y={14} width={16} height={72} rx={6} {...fill} />
          <rect x={74} y={14} width={16} height={72} rx={6} {...fill} />
          <rect x={26} y={34} width={48} height={52} rx={4} {...fill} />
          <line x1={50} y1={34} x2={50} y2={86} {...line} />
        </>
      )
    case 'bed':
      return (
        <>
          <rect x={12} y={10} width={76} height={80} rx={6} {...fill} />
          <rect x={18} y={16} width={28} height={18} rx={4} {...line} />
          <rect x={54} y={16} width={28} height={18} rx={4} {...line} />
          <line x1={12} y1={40} x2={88} y2={40} {...line} />
        </>
      )
    case 'chair':
      return (
        <>
          <rect x={24} y={30} width={52} height={52} rx={8} {...fill} />
          <rect x={24} y={16} width={52} height={14} rx={5} {...fill} />
        </>
      )
    case 'diningTable':
      return (
        <>
          <rect x={20} y={26} width={60} height={48} rx={8} {...fill} />
          <rect x={28} y={12} width={16} height={10} rx={3} {...line} />
          <rect x={56} y={12} width={16} height={10} rx={3} {...line} />
          <rect x={28} y={78} width={16} height={10} rx={3} {...line} />
          <rect x={56} y={78} width={16} height={10} rx={3} {...line} />
        </>
      )
    case 'table':
      return <rect x={16} y={24} width={68} height={52} rx={10} {...fill} />
    case 'desk':
      return (
        <>
          <rect x={12} y={26} width={76} height={48} rx={4} {...fill} />
          <line x1={58} y1={26} x2={58} y2={74} {...line} />
          <circle cx={66} cy={50} r={3} {...line} />
        </>
      )
    case 'dresser':
      return (
        <>
          <rect x={14} y={28} width={72} height={44} rx={4} {...fill} />
          <line x1={38} y1={28} x2={38} y2={72} {...line} />
          <line x1={62} y1={28} x2={62} y2={72} {...line} />
          <circle cx={26} cy={50} r={2.5} {...line} />
          <circle cx={50} cy={50} r={2.5} {...line} />
          <circle cx={74} cy={50} r={2.5} {...line} />
        </>
      )
    case 'wardrobe':
      return (
        <>
          <rect x={16} y={18} width={68} height={64} rx={4} {...fill} />
          <line x1={50} y1={18} x2={50} y2={82} {...line} />
          <circle cx={44} cy={50} r={2.5} {...line} />
          <circle cx={56} cy={50} r={2.5} {...line} />
        </>
      )
    case 'nightstand':
      return (
        <>
          <rect x={28} y={28} width={44} height={44} rx={5} {...fill} />
          <circle cx={50} cy={50} r={3} {...line} />
        </>
      )
    case 'bookshelf':
      return (
        <>
          <rect x={14} y={26} width={72} height={48} rx={3} {...fill} />
          <line x1={14} y1={42} x2={86} y2={42} {...line} />
          <line x1={14} y1={58} x2={86} y2={58} {...line} />
        </>
      )
    case 'rug':
      return (
        <>
          <rect x={10} y={16} width={80} height={68} rx={8} {...fill} fillOpacity={0.32} />
          <rect x={18} y={24} width={64} height={52} rx={5} {...line} strokeDasharray="4 3" />
        </>
      )
    case 'lamp':
      return (
        <>
          <circle cx={50} cy={50} r={30} {...fill} />
          <circle cx={50} cy={50} r={10} {...line} />
        </>
      )
    case 'plant':
      return (
        <>
          <circle cx={50} cy={40} r={26} {...fill} />
          <rect x={42} y={64} width={16} height={22} rx={2} {...line} />
        </>
      )
    case 'tv':
      return (
        <>
          <rect x={10} y={38} width={80} height={20} rx={3} {...fill} />
          <line x1={50} y1={58} x2={50} y2={68} {...line} />
          <line x1={38} y1={68} x2={62} y2={68} {...line} />
        </>
      )
    case 'fridge':
      return (
        <>
          <rect x={24} y={12} width={52} height={76} rx={5} {...fill} />
          <line x1={24} y1={40} x2={76} y2={40} {...line} />
          <line x1={68} y1={20} x2={68} y2={32} {...line} strokeWidth={2.5} />
          <line x1={68} y1={50} x2={68} y2={70} {...line} strokeWidth={2.5} />
        </>
      )
    case 'stove':
      return (
        <>
          <rect x={16} y={16} width={68} height={68} rx={5} {...fill} />
          <circle cx={38} cy={38} r={9} {...line} />
          <circle cx={62} cy={38} r={9} {...line} />
          <circle cx={38} cy={62} r={9} {...line} />
          <circle cx={62} cy={62} r={9} {...line} />
        </>
      )
    case 'sink':
      return (
        <>
          <rect x={18} y={22} width={64} height={56} rx={6} {...fill} />
          <ellipse cx={50} cy={54} rx={22} ry={16} {...line} />
          <circle cx={50} cy={30} r={3} {...line} />
        </>
      )
    case 'toilet':
      return (
        <>
          <rect x={30} y={12} width={40} height={18} rx={3} {...fill} />
          <ellipse cx={50} cy={56} rx={20} ry={26} {...fill} />
        </>
      )
    case 'bathtub':
      return (
        <>
          <rect x={18} y={10} width={64} height={80} rx={16} {...fill} />
          <rect x={28} y={24} width={44} height={56} rx={14} {...line} />
          <circle cx={50} cy={20} r={3} {...line} />
        </>
      )
    case 'box':
    default:
      return <rect x={18} y={18} width={64} height={64} rx={6} {...fill} />
  }
}
