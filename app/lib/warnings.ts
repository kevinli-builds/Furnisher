// Collision & clearance checks: furniture that overlaps other furniture or sits
// outside every room, and swing doors whose arc is blocked by furniture.

import type { Plan, Door } from './types'
import { furnitureType } from './furniture'
import { overlaps, type Box } from './geometry'
import { inRoom } from './stats'

export interface Warnings {
  furniture: Set<string>
  doors: Set<string>
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
  return { furniture, doors }
}
