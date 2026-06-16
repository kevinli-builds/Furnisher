// Collision & clearance checks: furniture that overlaps other furniture or sits
// outside every room, and swing doors whose arc is blocked by furniture.

import type { Plan, Door } from './types'
import { furnitureType } from './furniture'
import { overlaps, type Box } from './geometry'
import { inRoom } from './stats'

// A too-narrow walkway between two facing edges. Drawn as a red dimension line.
export interface ClearanceGap {
  x1: number
  y1: number
  x2: number
  y2: number
  dist: number // gap width in cm
}

export interface Warnings {
  furniture: Set<string>
  doors: Set<string>
  gaps: ClearanceGap[]
}

export const CLEARANCE = 90 // comfortable walkway (cm ≈ 36")
const MIN_GAP = 8 // below this, pieces read as flush/touching — not a walkway

// The facing gap between two axis-aligned boxes, if they overlap on one axis and
// are separated by a too-narrow margin on the other. Null when flush, far apart,
// or not facing. Returns the dimension line spanning the gap at the overlap mid.
function facingGap(a: Box, b: Box): ClearanceGap | null {
  const oy1 = Math.max(a.y, b.y)
  const oy2 = Math.min(a.y + a.h, b.y + b.h)
  if (oy2 - oy1 > MIN_GAP) {
    const y = (oy1 + oy2) / 2
    if (b.x >= a.x + a.w) {
      const g = b.x - (a.x + a.w)
      if (g > MIN_GAP && g < CLEARANCE) return { x1: a.x + a.w, y1: y, x2: b.x, y2: y, dist: g }
    } else if (a.x >= b.x + b.w) {
      const g = a.x - (b.x + b.w)
      if (g > MIN_GAP && g < CLEARANCE) return { x1: b.x + b.w, y1: y, x2: a.x, y2: y, dist: g }
    }
  }
  const ox1 = Math.max(a.x, b.x)
  const ox2 = Math.min(a.x + a.w, b.x + b.w)
  if (ox2 - ox1 > MIN_GAP) {
    const x = (ox1 + ox2) / 2
    if (b.y >= a.y + a.h) {
      const g = b.y - (a.y + a.h)
      if (g > MIN_GAP && g < CLEARANCE) return { x1: x, y1: a.y + a.h, x2: x, y2: b.y, dist: g }
    } else if (a.y >= b.y + b.h) {
      const g = a.y - (b.y + b.h)
      if (g > MIN_GAP && g < CLEARANCE) return { x1: x, y1: b.y + b.h, x2: x, y2: a.y, dist: g }
    }
  }
  return null
}

// The square a swing door's leaf sweeps into the room (approximate bbox).
function swingBox(d: Door): Box {
  const L = d.length
  if (d.orientation === 'h') {
    return { x: d.x, y: d.swing > 0 ? d.y : d.y - L, w: L, h: L }
  }
  return { x: d.swing > 0 ? d.x : d.x - L, y: d.y, w: L, h: L }
}

export function computeWarnings(plan: Plan): Warnings {
  const furniture = new Set<string>()
  // Rugs are meant to sit under things — exclude them from collisions.
  const solids = plan.furniture.filter((f) => furnitureType(f.type) !== 'rug')
  const box = (o: { x: number; y: number; w: number; h: number }): Box => ({ x: o.x, y: o.y, w: o.w, h: o.h })

  for (let i = 0; i < solids.length; i++) {
    for (let j = i + 1; j < solids.length; j++) {
      if (overlaps(box(solids[i]), box(solids[j]))) {
        furniture.add(solids[i].id)
        furniture.add(solids[j].id)
      }
    }
  }
  // Pieces whose centre falls outside every room (only flag when rooms exist).
  if (plan.rooms.length) {
    for (const f of solids) {
      const cx = f.x + f.w / 2
      const cy = f.y + f.h / 2
      if (!plan.rooms.some((r) => inRoom(cx, cy, r))) furniture.add(f.id)
    }
  }

  const doors = new Set<string>()
  for (const d of plan.doors) {
    if ((d.type ?? 'swing') !== 'swing') continue
    const sb = swingBox(d)
    if (solids.some((f) => overlaps(sb, box(f)))) doors.add(d.id)
  }

  // Clearance: too-narrow walkways between facing furniture, and between a piece
  // and the room wall it faces (room bbox — a fair proxy for polygon rooms too).
  const gaps: ClearanceGap[] = []
  for (let i = 0; i < solids.length; i++) {
    for (let j = i + 1; j < solids.length; j++) {
      const g = facingGap(box(solids[i]), box(solids[j]))
      if (g) gaps.push(g)
    }
  }
  for (const f of solids) {
    const fb = box(f)
    const cx = f.x + f.w / 2
    const cy = f.y + f.h / 2
    const r = plan.rooms.find((rm) => inRoom(cx, cy, rm))
    if (!r) continue
    if (cy > r.y && cy < r.y + r.h) {
      const gl = fb.x - r.x
      if (gl > MIN_GAP && gl < CLEARANCE) gaps.push({ x1: r.x, y1: cy, x2: fb.x, y2: cy, dist: gl })
      const gr = r.x + r.w - (fb.x + fb.w)
      if (gr > MIN_GAP && gr < CLEARANCE) gaps.push({ x1: fb.x + fb.w, y1: cy, x2: r.x + r.w, y2: cy, dist: gr })
    }
    if (cx > r.x && cx < r.x + r.w) {
      const gt = fb.y - r.y
      if (gt > MIN_GAP && gt < CLEARANCE) gaps.push({ x1: cx, y1: r.y, x2: cx, y2: fb.y, dist: gt })
      const gb = r.y + r.h - (fb.y + fb.h)
      if (gb > MIN_GAP && gb < CLEARANCE) gaps.push({ x1: cx, y1: fb.y + fb.h, x2: cx, y2: r.y + r.h, dist: gb })
    }
  }
  return { furniture, doors, gaps }
}
