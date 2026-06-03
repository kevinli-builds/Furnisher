import type { Door } from './types'
import type { Box } from './geometry'

export const DOOR_LEN = 80 // default opening width (cm)
export const SWING_DEADZONE = 25 // cursor must be this far off the wall to flip swing (cm)

// Which way a door should swing given where the cursor is relative to its wall.
// Within the deadzone of the wall line, keep the previous swing (avoids flicker).
export function swingForCursor(
  orientation: 'h' | 'v',
  wall: number,
  cursor: { x: number; y: number },
  prev: 1 | -1,
): 1 | -1 {
  if (orientation === 'h') {
    const dy = cursor.y - wall
    if (dy <= -SWING_DEADZONE) return 1
    if (dy >= SWING_DEADZONE) return -1
  } else {
    const dx = cursor.x - wall
    if (dx >= SWING_DEADZONE) return 1
    if (dx <= -SWING_DEADZONE) return -1
  }
  return prev
}

// A thin hit-box around a door opening, for marquee selection.
export function doorBox(d: Door): Box {
  return d.orientation === 'h'
    ? { x: d.x, y: d.y - 3, w: d.length, h: 6 }
    : { x: d.x - 3, y: d.y, w: 6, h: d.length }
}

// Door symbol: leaf line from the hinge + swing arc to the far jamb.
// swing = which side of the wall it opens; hinge = which end the hinge is on.
export function doorGeom(x: number, y: number, length: number, orientation: 'h' | 'v', swing: number, hinge: number) {
  const ax = x
  const ay = y
  const bx = orientation === 'h' ? x + length : x
  const by = orientation === 'h' ? y : y + length
  const hx = hinge > 0 ? ax : bx
  const hy = hinge > 0 ? ay : by
  const jx = hinge > 0 ? bx : ax
  const jy = hinge > 0 ? by : ay
  const nx = orientation === 'h' ? 0 : swing
  const ny = orientation === 'h' ? -swing : 0
  const tx = hx + nx * length
  const ty = hy + ny * length
  const cross = (tx - hx) * (jy - hy) - (ty - hy) * (jx - hx)
  const sweep = cross > 0 ? 1 : 0
  return {
    leaf: `M ${hx} ${hy} L ${tx} ${ty}`,
    arc: `M ${tx} ${ty} A ${length} ${length} 0 0 ${sweep} ${jx} ${jy}`,
    hx,
    hy,
    ax,
    ay,
    bx,
    by,
  }
}
