// Grid + snapping helpers. Everything is in centimetres.

import type { Room } from './types'

export const SNAP = 10 // snap increment (cm)
export const GRID_MINOR = 50 // light grid line every 50 cm
export const GRID_MAJOR = 100 // heavier line every 1 m

export const MIN_ROOM = 50 // smallest room/marker side (cm)
export const MIN_SCALE = 0.05 // zoom bounds (pixels per cm)
export const MAX_SCALE = 6

export function snap(v: number, step = SNAP): number {
  return Math.round(v / step) * step
}

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

// Axis-aligned box + overlap test (used for marquee hit-testing).
export interface Box {
  x: number
  y: number
  w: number
  h: number
}
export function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

// Adaptive grid spacing (cm) so cells stay a sensible on-screen size at any zoom.
export function gridStep(scale: number): number {
  const steps = [10, 25, 50, 100, 200, 500, 1000, 2000, 5000]
  for (const s of steps) if (s * scale >= 16) return s
  return 10000
}

export function uid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return Math.random().toString(36).slice(2)
}

// Snap a point to the nearest room wall, returning where a door of `length`
// should sit (its start corner), the wall's orientation, and how far the point
// was from that wall. Doors are always glued to a border this way — you just
// slide them along the wall. Returns null when there are no rooms.
export interface WallSnap {
  x: number
  y: number
  orientation: 'h' | 'v'
  dist: number
}

export function snapDoorToWalls(px: number, py: number, length: number, rooms: Room[]): WallSnap | null {
  let best: WallSnap | null = null
  const consider = (s: WallSnap) => {
    if (!best || s.dist < best.dist) best = s
  }
  for (const r of rooms) {
    const x1 = r.x
    const x2 = r.x + r.w
    const y1 = r.y
    const y2 = r.y + r.h
    // Horizontal walls (top & bottom): door slides in x, fixed y.
    for (const wy of [y1, y2]) {
      const cx = clamp(px, x1, x2)
      const start = clamp(snap(cx - length / 2), x1, Math.max(x1, x2 - length))
      consider({ x: start, y: wy, orientation: 'h', dist: Math.hypot(px - cx, py - wy) })
    }
    // Vertical walls (left & right): door slides in y, fixed x.
    for (const wx of [x1, x2]) {
      const cy = clamp(py, y1, y2)
      const start = clamp(snap(cy - length / 2), y1, Math.max(y1, y2 - length))
      consider({ x: wx, y: start, orientation: 'v', dist: Math.hypot(px - wx, py - cy) })
    }
  }
  return best
}
