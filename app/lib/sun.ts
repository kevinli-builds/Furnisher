// A simple 2D sun model for the lighting overlay (northern-hemisphere
// approximation): sunrise in the east (~6h), south at noon, sunset west (~18h).

import type { Plan, Furniture } from './types'
import { roomsAt, roomAtPoint, roomCorners, cornersToPoints } from './geometry'
import { furnitureType } from './furniture'

export interface Sun {
  dir: { x: number; y: number } // unit direction light travels across the plan
  altitude: number // 0 at horizon → 1 at noon
}

// `dir` is where sunlight travels (opposite the sun's position). `northDeg` is
// the compass bearing that the top of the plan (−y) points toward. `latitude`
// scales the peak sun height (higher latitudes → lower, weaker sun).
export function sunAt(hour: number, northDeg: number, latitude = 40): Sun | null {
  if (hour <= 6 || hour >= 18) return null // night — no direct sun
  const frac = (hour - 6) / 12 // 0..1 across the daylight span
  const azimuth = 90 + frac * 180 // sun bearing: east(90) → south(180) → west(270)
  // Peak noon altitude ≈ 90° − |lat| (ignoring season); scale intensity by it.
  const peak = Math.max(0, Math.sin(((90 - Math.abs(latitude)) * Math.PI) / 180))
  const altitude = Math.sin(Math.PI * frac) * peak
  const lightAz = azimuth + 180 // light travels opposite the sun
  const theta = ((lightAz - northDeg) * Math.PI) / 180 // relative to plan-up, clockwise
  return { dir: { x: Math.sin(theta), y: -Math.cos(theta) }, altitude }
}

// Daylight colour: golden near sunrise/sunset → pale warm at midday. Used to
// tint the light cones (the background itself is left unchanged).
export function sunColor(hour: number): string {
  const frac = Math.max(0, Math.min(1, (hour - 6) / 12))
  const alt = Math.sin(Math.PI * frac) // 0 at horizon → 1 at noon
  const lerp = (a: number, b: number) => Math.round(a + (b - a) * alt)
  return `rgb(${lerp(255, 255)}, ${lerp(176, 238)}, ${lerp(96, 196)})` // #ffb060 → #ffeec4
}

export function formatHour(hour: number): string {
  const h = Math.floor(hour)
  const m = Math.round((hour - h) * 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function isLightSource(f: Furniture): boolean {
  return f.light ?? furnitureType(f.type) === 'lamp' // explicit flag wins; else lamps glow by default
}

const CONE_HALF_ANGLE = (30 * Math.PI) / 180

// A directional cone of daylight fanning from a window into the room it faces.
export interface LightCone {
  ax: number // apex (at the window)
  ay: number
  r: number // reach (cm)
  op: number // peak opacity at the window
  poly: string // cone polygon points
  clip: string | null // room polygon to clip to (keeps light inside the room)
}

export function windowCones(plan: Plan, sun: Sun | null): LightCone[] {
  const cones: LightCone[] = []
  if (!sun || sun.altitude <= 0.02) return cones
  for (const d of plan.doors) {
    if ((d.type ?? 'swing') !== 'window') continue
    const horiz = d.orientation === 'h'
    const ax = d.x
    const ay = d.y
    const bx = horiz ? d.x + d.length : d.x
    const by = horiz ? d.y : d.y + d.length
    const cx = (ax + bx) / 2
    const cy = (ay + by) / 2

    // Which side is interior (has a room)? Light only enters from outside.
    let nx = 0
    let ny = 0
    if (horiz) {
      const down = roomsAt(cx, cy + 12, plan.rooms)
      const up = roomsAt(cx, cy - 12, plan.rooms)
      if (down && !up) ny = 1
      else if (up && !down) ny = -1
      else continue
    } else {
      const right = roomsAt(cx + 12, cy, plan.rooms)
      const left = roomsAt(cx - 12, cy, plan.rooms)
      if (right && !left) nx = 1
      else if (left && !right) nx = -1
      else continue
    }
    // Only if the sun is on the exterior side (light travels toward interior).
    const facing = sun.dir.x * nx + sun.dir.y * ny
    if (facing <= 0.08) continue

    const R = 230 + 300 * sun.altitude
    const farCx = cx + sun.dir.x * R
    const farCy = cy + sun.dir.y * R
    const px = -sun.dir.y // perpendicular to light direction
    const py = sun.dir.x
    const farHalf = d.length / 2 + R * Math.tan(CONE_HALF_ANGLE)
    // Keep the two far points on the same sides as the window's endpoints.
    const sideA = (ax - cx) * px + (ay - cy) * py
    const sign = sideA >= 0 ? 1 : -1
    const aFarX = farCx + px * farHalf * sign
    const aFarY = farCy + py * farHalf * sign
    const bFarX = farCx - px * farHalf * sign
    const bFarY = farCy - py * farHalf * sign

    const room = roomAtPoint(cx + nx * 14, cy + ny * 14, plan.rooms)
    // Keep a visible floor so low-sun (morning/evening) light still reads,
    // while still scaling with sun height + how square-on it hits the window.
    const op = Math.min(0.62, 0.24 + 0.42 * sun.altitude * Math.min(1, facing + 0.2))
    cones.push({
      ax: cx,
      ay: cy,
      r: R,
      op,
      poly: `${ax},${ay} ${bx},${by} ${bFarX},${bFarY} ${aFarX},${aFarY}`,
      clip: room ? cornersToPoints(roomCorners(room)) : null,
    })
  }
  return cones
}

// Radial glow from lamps / light-source furniture (brighter at night).
export interface LightGlow {
  x: number
  y: number
  r: number
  op: number
  clip: string | null
}

export function lampGlows(plan: Plan, sun: Sun | null): LightGlow[] {
  const glows: LightGlow[] = []
  const dim = sun && sun.altitude > 0.05 ? 0.22 : 0.5 // lamps matter most at night
  for (const f of plan.furniture) {
    if (!isLightSource(f)) continue
    const cx = f.x + f.w / 2
    const cy = f.y + f.h / 2
    const room = roomAtPoint(cx, cy, plan.rooms)
    glows.push({ x: cx, y: cy, r: 130 + Math.max(f.w, f.h), op: dim, clip: room ? cornersToPoints(roomCorners(room)) : null })
  }
  // Ceiling lights: a wider wash over the whole room, clipped to it.
  for (const l of plan.lights ?? []) {
    const room = roomAtPoint(l.x, l.y, plan.rooms)
    glows.push({ x: l.x, y: l.y, r: 260, op: dim, clip: room ? cornersToPoints(roomCorners(room)) : null })
  }
  return glows
}
