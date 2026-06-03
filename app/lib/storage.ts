import type { Plan } from './types'

const KEY = 'furnisher.plan.v1'

export function defaultPlan(): Plan {
  return {
    units: 'imperial',
    viewMode: 'sim',
    roomLabels: 'hover',
    width: 1200, // 12 m ≈ 39 ft
    height: 900, // 9 m  ≈ 29 ft
    rooms: [
      { id: 'starter', name: 'Living Room', x: 150, y: 150, w: 500, h: 400 },
    ],
    doors: [],
    furniture: [],
  }
}

export function loadPlan(): Plan {
  if (typeof window === 'undefined') return defaultPlan()
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return defaultPlan()
    const parsed = JSON.parse(raw) as Plan
    // Light validation — fall back to default on anything malformed.
    if (!parsed || !Array.isArray(parsed.rooms)) return defaultPlan()
    return {
      units: parsed.units === 'metric' ? 'metric' : 'imperial',
      viewMode: parsed.viewMode === 'schematic' ? 'schematic' : 'sim',
      roomLabels: parsed.roomLabels === 'always' ? 'always' : 'hover',
      width: parsed.width || 1200,
      height: parsed.height || 900,
      rooms: parsed.rooms ?? [],
      doors: parsed.doors ?? [],
      furniture: parsed.furniture ?? [],
    }
  } catch {
    return defaultPlan()
  }
}

export function savePlan(plan: Plan): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(KEY, JSON.stringify(plan))
  } catch {
    /* quota / private mode — ignore */
  }
}
