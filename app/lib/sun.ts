// A simple 2D sun model for the lighting overlay (northern-hemisphere
// approximation): sunrise in the east (~6h), south at noon, sunset west (~18h).

import type { Plan } from './types'
import { roomsAt } from './geometry'

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

// A whole-plan wash conveying time of day.
export function timeTint(hour: number): { color: string; opacity: number } {
  if (hour < 5.5 || hour > 18.5) return { color: '#2a3358', opacity: 0.22 } // night (cool, dim)
  const frac = Math.max(0, Math.min(1, (hour - 6) / 12))
  const alt = Math.sin(Math.PI * frac)
  return { color: '#ffb060', opacity: 0.16 * (1 - alt) + 0.02 } // golden near horizon, clear at noon
}

export function formatHour(hour: number): string {
  const h = Math.floor(hour)
  const m = Math.round((hour - h) * 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// Warm light wedges cast inward from windows the sun is shining on.
export function windowBeams(plan: Plan, sun: Sun): { pts: string; op: number }[] {
  const beams: { pts: string; op: number }[] = []
  const L = 320 // beam reach into the room (cm)
  for (const d of plan.doors) {
    if ((d.type ?? 'swing') !== 'window') continue
    const horiz = d.orientation === 'h'
    const ax = d.x
    const ay = d.y
    const bx = horiz ? d.x + d.length : d.x
    const by = horiz ? d.y : d.y + d.length
    const cx = (ax + bx) / 2
    const cy = (ay + by) / 2
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
    const facing = sun.dir.x * nx + sun.dir.y * ny
    if (facing <= 0.05) continue
    const ex = sun.dir.x * L
    const ey = sun.dir.y * L
    beams.push({ pts: `${ax},${ay} ${bx},${by} ${bx + ex},${by + ey} ${ax + ex},${ay + ey}`, op: 0.26 * sun.altitude * facing })
  }
  return beams
}
