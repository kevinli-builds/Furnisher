// Grid + snapping helpers. Everything is in centimetres.

export const SNAP = 10 // snap increment (cm)
export const GRID_MINOR = 50 // light grid line every 50 cm
export const GRID_MAJOR = 100 // heavier line every 1 m

export function snap(v: number, step = SNAP): number {
  return Math.round(v / step) * step
}

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

export function uid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return Math.random().toString(36).slice(2)
}
