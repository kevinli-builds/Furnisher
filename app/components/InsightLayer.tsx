'use client'

import { cornersToPoints } from '../lib/geometry'
import type { Overlay } from '../lib/layers/types'

// The one renderer every insight layer draws through. Overlays are simple
// primitives in canonical cm (SVG user space); colours come from the layer's
// own code constants (never plan data — see lib/layers/types.ts). Purely
// presentational and non-interactive: it sits under the furniture and never
// eats a pointer event.
export default function InsightLayer({ overlays, scale }: { overlays: Overlay[]; scale: number }) {
  return (
    <g className="insight-layer export-hide" pointerEvents="none">
      {overlays.map((o, i) => {
        switch (o.kind) {
          case 'polygon':
            return (
              <polygon
                key={i}
                points={cornersToPoints(o.points)}
                fill={o.fill ?? 'none'}
                stroke={o.stroke ?? 'none'}
                strokeWidth={1}
                opacity={o.opacity ?? 1}
                vectorEffect="non-scaling-stroke"
              />
            )
          case 'rect':
            return (
              <rect
                key={i}
                x={o.x}
                y={o.y}
                width={o.w}
                height={o.h}
                fill={o.fill ?? 'none'}
                stroke={o.stroke ?? 'none'}
                strokeWidth={1}
                opacity={o.opacity ?? 1}
                vectorEffect="non-scaling-stroke"
                transform={o.rotation ? `rotate(${o.rotation} ${o.x + o.w / 2} ${o.y + o.h / 2})` : undefined}
              />
            )
          case 'path':
            return (
              <polyline
                key={i}
                points={cornersToPoints(o.points)}
                fill="none"
                stroke={o.stroke ?? '#b5714e'}
                strokeWidth={o.width != null ? o.width : 1.5}
                strokeDasharray={o.dash}
                opacity={o.opacity ?? 1}
                vectorEffect={o.width != null ? undefined : 'non-scaling-stroke'}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            )
          case 'badge':
            return (
              <text
                key={i}
                x={o.x}
                y={o.y}
                fontSize={12 / scale}
                fill={o.color ?? '#6b5b4a'}
                fontWeight={600}
                textAnchor="middle"
                dominantBaseline="central"
                style={{ paintOrder: 'stroke' }}
                stroke="#fdfbf7"
                strokeWidth={3.5 / scale}
                strokeLinejoin="round"
              >
                {o.text}
              </text>
            )
        }
      })}
    </g>
  )
}
