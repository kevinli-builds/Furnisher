import type { Units } from './types'

export const CM_PER_IN = 2.54
export const CM_PER_FT = 30.48

// Format a length (cm) for display in the chosen units.
//   metric   → "250 cm" / "2.5 m"
//   imperial → "8'2\"" (feet & inches)
export function formatLength(cm: number, units: Units): string {
  if (units === 'metric') {
    if (Math.abs(cm) >= 100) {
      const m = cm / 100
      return `${trim(m)} m`
    }
    return `${Math.round(cm)} cm`
  }
  const totalIn = cm / CM_PER_IN
  let ft = Math.floor(totalIn / 12)
  let inch = Math.round(totalIn - ft * 12)
  if (inch === 12) {
    ft += 1
    inch = 0
  }
  if (ft === 0) return `${inch}"`
  if (inch === 0) return `${ft}'`
  return `${ft}'${inch}"`
}

// Format a width × depth pair, e.g. `200 × 90 cm` or `6'7" × 3'`.
export function formatSize(w: number, h: number, units: Units): string {
  return `${formatLength(w, units)} × ${formatLength(h, units)}`
}

// The unit a single input field expects (cm for metric, inches for imperial).
export function inputUnit(units: Units): string {
  return units === 'metric' ? 'cm' : 'in'
}

// Convert a raw input value (in inputUnit) → canonical cm.
export function toCm(value: number, units: Units): number {
  return units === 'metric' ? value : value * CM_PER_IN
}

// Convert canonical cm → a value in inputUnit (for pre-filling inputs).
export function fromCm(cm: number, units: Units): number {
  const v = units === 'metric' ? cm : cm / CM_PER_IN
  return Math.round(v * 10) / 10
}

function trim(n: number): string {
  return (Math.round(n * 100) / 100).toString()
}
