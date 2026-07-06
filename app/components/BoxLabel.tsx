'use client'

import type { LabelConfig } from '../lib/types'
import { wrapLabel, layoutLabel, type LabelBox } from '../lib/label'

interface Props {
  box: LabelBox
  text: string
  cfg?: LabelConfig
  fontSize: number
  color: string
  fontWeight?: number
  // When set, the label is draggable (used for `pos: 'custom'` free placement).
  onLabelDown?: (e: React.PointerEvent) => void
}

// Renders a box's text label per its LabelConfig: placement, alignment, wrapping,
// hide. Native SVG <text>/<tspan> (not <foreignObject>) so it survives PNG export.
export default function BoxLabel({ box, text, cfg, fontSize, color, fontWeight = 700, onLabelDown }: Props) {
  if (cfg?.hide) return null
  const lineHeight = fontSize * 1.25
  const lines = wrapLabel(text, box.w, fontSize, !!cfg?.wrap)
  const { x, topY, anchor } = layoutLabel(box, cfg, fontSize, lines.length, lineHeight)
  return (
    <text
      x={x}
      y={topY}
      textAnchor={anchor}
      dominantBaseline="hanging"
      fontSize={fontSize}
      fill={color}
      fontWeight={fontWeight}
      style={onLabelDown ? { cursor: 'move' } : undefined}
      pointerEvents={onLabelDown ? 'auto' : 'none'}
      onPointerDown={onLabelDown}
    >
      {lines.map((ln, i) => (
        <tspan key={i} x={x} y={topY + i * lineHeight}>
          {ln || ' '}
        </tspan>
      ))}
    </text>
  )
}
