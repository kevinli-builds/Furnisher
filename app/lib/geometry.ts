// Grid + snapping helpers. Everything is in centimetres.

import type { Room, Units, Pt } from './types'

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
// Imperial steps are foot-based (so cells read as 1 ft); metric stays in cm.
const FT = 30.48
export function gridStep(scale: number, units: Units): number {
  const steps =
    units === 'imperial'
      ? [0.5 * FT, FT, 2 * FT, 5 * FT, 10 * FT, 25 * FT, 50 * FT, 100 * FT]
      : [10, 25, 50, 100, 200, 500, 1000, 2000, 5000]
  for (const s of steps) if (s * scale >= 16) return s
  return steps[steps.length - 1] * 2
}

export function uid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return Math.random().toString(36).slice(2)
}

// A room's polygon corners: its `points` if it's a polygon, else the 4 rect corners.
export function roomCorners(r: { x: number; y: number; w: number; h: number; points?: Pt[] }): Pt[] {
  if (r.points && r.points.length >= 3) return r.points
  return [
    { x: r.x, y: r.y },
    { x: r.x + r.w, y: r.y },
    { x: r.x + r.w, y: r.y + r.h },
    { x: r.x, y: r.y + r.h },
  ]
}

export function bboxOf(pts: Pt[]): Box {
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
}

export function pointInPolygon(px: number, py: number, pts: Pt[]): boolean {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i]
    const b = pts[j]
    if (a.y > py !== b.y > py && px < ((b.x - a.x) * (py - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

export function roomsAt(px: number, py: number, rooms: Room[]): boolean {
  return rooms.some((r) => pointInPolygon(px, py, roomCorners(r)))
}

export function roomAtPoint(px: number, py: number, rooms: Room[]): Room | undefined {
  return rooms.find((r) => pointInPolygon(px, py, roomCorners(r)))
}

export function cornersToPoints(pts: Pt[]): string {
  return pts.map((p) => `${p.x},${p.y}`).join(' ')
}

// Resize a (possibly rotated) box by a handle (hx,hy ∈ -1/0/1) so the opposite
// edge/corner stays anchored. Works in the box's local frame. Returns the new
// unrotated top-left + size (centred on the same rotation pivot).
export function resizeRect(
  ox: number,
  oy: number,
  ow: number,
  oh: number,
  rot: number,
  hx: number,
  hy: number,
  px: number,
  py: number,
  minSz: number,
  lockRatio = false,
): Box {
  const rad = (rot * Math.PI) / 180
  const ux = { x: Math.cos(rad), y: Math.sin(rad) }
  const uy = { x: -Math.sin(rad), y: Math.cos(rad) }
  const cx0 = ox + ow / 2
  const cy0 = oy + oh / 2
  const anchorX = cx0 + (ux.x * (-hx * ow) + uy.x * (-hy * oh)) / 2
  const anchorY = cy0 + (ux.y * (-hx * ow) + uy.y * (-hy * oh)) / 2
  const lx = (px - anchorX) * ux.x + (py - anchorY) * ux.y
  const ly = (px - anchorX) * uy.x + (py - anchorY) * uy.y
  let nw = hx !== 0 ? Math.max(minSz, snap(hx * lx)) : ow
  let nh = hy !== 0 ? Math.max(minSz, snap(hy * ly)) : oh
  // Hold Shift on a corner → keep the original aspect ratio.
  if (lockRatio && hx !== 0 && hy !== 0 && oh > 0) {
    const aspect = ow / oh
    if (nw / ow >= nh / oh) nh = Math.max(minSz, snap(nw / aspect))
    else nw = Math.max(minSz, snap(nh * aspect))
  }
  const ncx = anchorX + (ux.x * (hx * nw) + uy.x * (hy * nh)) / 2
  const ncy = anchorY + (ux.y * (hx * nw) + uy.y * (hy * nh)) / 2
  return { x: snap(ncx - nw / 2), y: snap(ncy - nh / 2), w: nw, h: nh }
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
    const corners = roomCorners(r)
    for (let i = 0; i < corners.length; i++) {
      const a = corners[i]
      const b = corners[(i + 1) % corners.length]
      if (Math.abs(a.y - b.y) < 0.5) {
        // Horizontal wall segment at y = a.y, spanning x in [lo, hi].
        const lo = Math.min(a.x, b.x)
        const hi = Math.max(a.x, b.x)
        const cx = clamp(px, lo, hi)
        const start = clamp(snap(cx - length / 2), lo, Math.max(lo, hi - length))
        consider({ x: start, y: a.y, orientation: 'h', dist: Math.hypot(px - cx, py - a.y) })
      } else if (Math.abs(a.x - b.x) < 0.5) {
        // Vertical wall segment at x = a.x, spanning y in [lo, hi].
        const lo = Math.min(a.y, b.y)
        const hi = Math.max(a.y, b.y)
        const cy = clamp(py, lo, hi)
        const start = clamp(snap(cy - length / 2), lo, Math.max(lo, hi - length))
        consider({ x: a.x, y: start, orientation: 'v', dist: Math.hypot(px - a.x, py - cy) })
      }
      // Diagonal segments don't attract axis-aligned doors (skipped).
    }
  }
  return best
}
