import type { Plan } from './types'

const KEY = 'furnisher.plan.v1'

export function defaultPlan(): Plan {
  return {
    units: 'imperial',
    viewMode: 'sim',
    roomLabels: 'hover',
    furnitureLabels: 'always',
    showGrid: true,
    lighting: false,
    northDeg: 0,
    sunTime: 12,
    latitude: 40,
    width: 1200, // 12 m ≈ 39 ft
    height: 900, // 9 m  ≈ 29 ft
    rooms: [
      { id: 'starter', name: 'Living Room', x: 150, y: 150, w: 500, h: 400 },
    ],
    doors: [],
    furniture: [],
    markers: [],
    stairs: [],
    lights: [],
    inventory: { furniture: [], rooms: [], markers: [], groups: ['General'] },
  }
}

// Coerce any stored/loaded plan shape (older versions, cloud rows, missing
// fields) into a complete Plan. EVERY plan entering the app must pass through
// here — plans saved before a field existed (e.g. `lights`) would otherwise
// crash the canvas on `.map` of undefined.
export function normalizePlan(parsed: Partial<Plan> | null | undefined): Plan {
  if (!parsed || !Array.isArray(parsed.rooms)) return defaultPlan()
  return {
    units: parsed.units === 'metric' ? 'metric' : 'imperial',
    viewMode: parsed.viewMode === 'schematic' ? 'schematic' : 'sim',
    roomLabels: parsed.roomLabels === 'always' ? 'always' : 'hover',
    furnitureLabels: parsed.furnitureLabels === 'hover' ? 'hover' : 'always',
    showGrid: parsed.showGrid !== false,
    lighting: parsed.lighting === true,
    northDeg: typeof parsed.northDeg === 'number' ? parsed.northDeg : 0,
    sunTime: typeof parsed.sunTime === 'number' ? parsed.sunTime : 12,
    latitude: typeof parsed.latitude === 'number' ? parsed.latitude : 40,
    snapAll: parsed.snapAll === true,
    warnings: parsed.warnings !== false,
    blueprintUrl: typeof parsed.blueprintUrl === 'string' ? parsed.blueprintUrl : undefined,
    width: parsed.width || 1200,
    height: parsed.height || 900,
    rooms: parsed.rooms ?? [],
    doors: parsed.doors ?? [],
    furniture: parsed.furniture ?? [],
    markers: parsed.markers ?? [],
    stairs: parsed.stairs ?? [],
    lights: parsed.lights ?? [],
    inventory: {
      furniture: parsed.inventory?.furniture ?? [],
      rooms: parsed.inventory?.rooms ?? [],
      markers: parsed.inventory?.markers ?? [],
      groups: parsed.inventory?.groups ?? ['General'],
    },
  }
}

export function loadPlan(): Plan {
  if (typeof window === 'undefined') return defaultPlan()
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return defaultPlan()
    return normalizePlan(JSON.parse(raw) as Partial<Plan>)
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
