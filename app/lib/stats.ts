// Plan statistics: room areas, furniture footprint, and free floor space.
// Areas are computed in cm² and formatted to the plan's display units.

import type { Plan, Room, Units } from './types'
import { furnitureType } from './furniture'

export function roomArea(r: Room): number {
  if (r.points && r.points.length >= 3) {
    // Shoelace formula for polygon rooms.
    let a = 0
    for (let i = 0; i < r.points.length; i++) {
      const p = r.points[i]
      const q = r.points[(i + 1) % r.points.length]
      a += p.x * q.y - q.x * p.y
    }
    return Math.abs(a) / 2
  }
  return r.w * r.h
}

// Is a point inside a room (polygon if present, else its rectangle)?
export function inRoom(x: number, y: number, r: Room): boolean {
  if (r.points && r.points.length >= 3) {
    let inside = false
    const pts = r.points
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const a = pts[i]
      const b = pts[j]
      if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside
    }
    return inside
  }
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h
}

export interface RoomStat {
  id: string
  name: string
  area: number // cm²
  furnArea: number // cm² of solid furniture whose centre sits in this room
  freePct: number // 0..100
}
export interface Stats {
  totalArea: number
  furnArea: number
  freePct: number
  rooms: RoomStat[]
}

export function computeStats(plan: Plan): Stats {
  const rooms: RoomStat[] = plan.rooms.map((r) => ({ id: r.id, name: r.name, area: roomArea(r), furnArea: 0, freePct: 100 }))
  const byId = new Map(rooms.map((s) => [s.id, s]))
  for (const f of plan.furniture) {
    if (furnitureType(f.type) === 'rug') continue // rugs cover the floor, don't consume it
    const cx = f.x + f.w / 2
    const cy = f.y + f.h / 2
    const room = plan.rooms.find((r) => inRoom(cx, cy, r))
    if (room) byId.get(room.id)!.furnArea += f.w * f.h
  }
  for (const s of rooms) s.freePct = s.area > 0 ? Math.max(0, Math.round((1 - s.furnArea / s.area) * 100)) : 0
  const totalArea = rooms.reduce((a, s) => a + s.area, 0)
  const furnArea = rooms.reduce((a, s) => a + s.furnArea, 0)
  const freePct = totalArea > 0 ? Math.max(0, Math.round((1 - furnArea / totalArea) * 100)) : 0
  return { totalArea, furnArea, freePct, rooms }
}

// Format a cm² area to m² (metric) or ft² (imperial).
export function formatArea(cm2: number, units: Units): string {
  if (units === 'imperial') {
    const ft2 = cm2 / 929.0304
    return `${ft2.toFixed(ft2 < 100 ? 1 : 0)} ft²`
  }
  const m2 = cm2 / 10000
  return `${m2.toFixed(m2 < 100 ? 1 : 0)} m²`
}
