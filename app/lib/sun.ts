// A simple 2D sun model for the lighting overlay (northern-hemisphere
// approximation): sunrise in the east (~6h), south at noon, sunset west (~18h).

export interface Sun {
  dir: { x: number; y: number } // unit direction light travels across the plan
  altitude: number // 0 at horizon → 1 at noon
}

// `dir` is where sunlight travels (opposite the sun's position). `northDeg` is
// the compass bearing that the top of the plan (−y) points toward.
export function sunAt(hour: number, northDeg: number): Sun | null {
  if (hour <= 6 || hour >= 18) return null // night — no direct sun
  const frac = (hour - 6) / 12 // 0..1 across the daylight span
  const azimuth = 90 + frac * 180 // sun bearing: east(90) → south(180) → west(270)
  const altitude = Math.sin(Math.PI * frac) // 0 → 1 → 0
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
