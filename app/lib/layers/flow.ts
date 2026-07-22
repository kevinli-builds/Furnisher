// ── L2 — Flow & desire paths ─────────────────────────────────────
// The daily routes you actually walk — bed→bathroom, entry→kitchen, sofa→fridge
// — traced over the free floor as worn-path lines, with a length on each and a
// flag wherever the route squeezes below a comfortable 70cm ("your morning route
// squeezes past the dining table"). The circulation sibling of the Doorway Test.
// Pure; the wall-aware grid + pathfinding live in walkGrid.ts.

import type { Plan, Furniture, Pt } from '../types'
import { furnitureType, type FurnitureType } from '../furniture'
import { roomAtPoint, roomCorners, pointInPolygon } from '../geometry'
import { formatLength } from '../units'
import type { InsightLayer, LayerResult, Overlay, PanelRow } from './types'
import { buildWalkGrid, cellCenter, nearestWalkable, findPath, distPointToSeg, distPointToFurniture, type WalkGrid, type Seg } from './walkGrid'

const PINCH = 70 // cm: a walkway narrower than this reads as a pinch point
const OPEN = 95 // cm: if one side clears this, the spot is open — not a pinch
const DOOR_NEAR = 45 // cm: don't flag a pinch inside a doorway (expected-narrow)
const EPS = 14 // cm off a door to sample which side is the room

// Overlay colours — CODE CONSTANTS (never plan data).
const PATH_STROKE = 'rgba(150, 110, 80, 0.45)'
const PATH_TEXT = '#6b4f36'
const PINCH_FILL = 'rgba(168, 70, 60, 0.9)'
const PINCH_TEXT = '#a8463c'

interface Endpoint {
  point: Pt
  id?: string // the furniture id (so clearance can ignore your own bed/sofa)
}

function firstOfType(plan: Plan, types: FurnitureType[]): Endpoint | null {
  for (const t of types) {
    const f = plan.furniture.find((p) => furnitureType(p.type) === t)
    if (f) return { point: { x: f.x + f.w / 2, y: f.y + f.h / 2 }, id: f.id }
  }
  return null
}

// A point just inside the room at the front door (a door with the outside on one
// side). Falls back to null when no such door exists.
function entryPoint(plan: Plan): Endpoint | null {
  for (const d of plan.doors) {
    if ((d.type ?? 'swing') === 'window') continue
    let inside: Pt | null = null
    if (d.orientation === 'h') {
      const mx = d.x + d.length / 2
      const a = roomAtPoint(mx, d.y - EPS, plan.rooms)
      const b = roomAtPoint(mx, d.y + EPS, plan.rooms)
      if (a && !b) inside = { x: mx, y: d.y - 25 }
      else if (b && !a) inside = { x: mx, y: d.y + 25 }
    } else {
      const my = d.y + d.length / 2
      const a = roomAtPoint(d.x - EPS, my, plan.rooms)
      const b = roomAtPoint(d.x + EPS, my, plan.rooms)
      if (a && !b) inside = { x: d.x - 25, y: my }
      else if (b && !a) inside = { x: d.x + 25, y: my }
    }
    if (inside) return { point: inside }
  }
  return null
}

// Is a world point free floor? (inside a room, not inside a non-excluded piece).
// Returns the piece it hit, so a pinch can name the furniture that squeezes it.
function probeFree(x: number, y: number, plan: Plan, obstacles: Furniture[], exclude: Set<string>): { free: boolean; name?: string; id?: string } {
  if (!plan.rooms.some((r) => pointInPolygon(x, y, roomCorners(r)))) return { free: false } // hit a wall / outside
  for (const f of obstacles) {
    if (exclude.has(f.id)) continue
    if (distPointToFurniture(x, y, f) < 0.0001) return { free: false, name: f.name || 'a piece', id: f.id }
  }
  return { free: true }
}

// March perpendicular from a path point until the free floor ends. Distance to
// the corridor edge on that side, plus what stopped it. Caps at OPEN — a side
// that clears OPEN counts as open (no wall to squeeze against there).
function marchSide(p: Pt, nx: number, ny: number, plan: Plan, obstacles: Furniture[], exclude: Set<string>): { dist: number; name?: string; id?: string } {
  const STEP = 5
  for (let t = STEP; t <= OPEN; t += STEP) {
    const r = probeFree(p.x + nx * t, p.y + ny * t, plan, obstacles, exclude)
    if (!r.free) return { dist: t, name: r.name, id: r.id }
  }
  return { dist: OPEN }
}

// Corridor WIDTH across the direction of travel at a path point (left reach +
// right reach). A pinch is narrow on BOTH sides — a path merely running near one
// wall, open on the other, is not a pinch. Returns null when either side is open.
function corridorWidthAt(prev: Pt, p: Pt, next: Pt, plan: Plan, obstacles: Furniture[], exclude: Set<string>): { width: number; name: string | null; id: string | null } | null {
  const dx = next.x - prev.x
  const dy = next.y - prev.y
  const len = Math.hypot(dx, dy) || 1
  const nx = -dy / len // unit perpendicular to travel
  const ny = dx / len
  const left = marchSide(p, nx, ny, plan, obstacles, exclude)
  const right = marchSide(p, -nx, -ny, plan, obstacles, exclude)
  if (left.dist >= OPEN || right.dist >= OPEN) return null // open on a side
  const hit = left.name ? left : right.name ? right : null // prefer a named piece
  return { width: left.dist + right.dist, name: hit?.name ?? null, id: hit?.id ?? null }
}

interface RouteDef {
  from: string
  to: string
  label: string
}
const ROUTES: RouteDef[] = [
  { from: 'bed', to: 'toilet', label: 'Bed → Bathroom' },
  { from: 'entry', to: 'kitchen', label: 'Entry → Kitchen' },
  { from: 'sofa', to: 'kitchen', label: 'Sofa → Kitchen' },
  { from: 'bed', to: 'entry', label: 'Bed → Entry' },
  { from: 'desk', to: 'kitchen', label: 'Desk → Coffee' },
  { from: 'entry', to: 'sofa', label: 'Entry → Sofa' },
]

export function computeFlowLayer(plan: Plan): LayerResult {
  const overlays: Overlay[] = []
  const panelRows: PanelRow[] = []
  const warnings: string[] = []
  const u = plan.units

  const g: WalkGrid = buildWalkGrid(plan)
  if (g.cols === 0) {
    return { overlays, panelRows: [{ id: '__norooms__', label: 'Draw rooms to see routes', detail: 'Daily routes need at least one room.', tone: 'ok' }], warnings }
  }

  const roles: Record<string, Endpoint | null> = {
    bed: firstOfType(plan, ['bed']),
    toilet: firstOfType(plan, ['toilet']),
    sofa: firstOfType(plan, ['sofa']),
    desk: firstOfType(plan, ['desk']),
    kitchen: firstOfType(plan, ['fridge', 'sink', 'stove']),
    entry: entryPoint(plan),
  }

  // Door opening segments (to suppress pinch flags inside doorways).
  const doorSegs: Seg[] = plan.doors
    .filter((d) => (d.type ?? 'swing') !== 'window')
    .map((d) => (d.orientation === 'h' ? { x1: d.x, y1: d.y, x2: d.x + d.length, y2: d.y } : { x1: d.x, y1: d.y, x2: d.x, y2: d.y + d.length }))

  const seenPairs = new Set<string>()
  let drew = 0

  for (const r of ROUTES) {
    const A = roles[r.from]
    const B = roles[r.to]
    if (!A || !B) continue

    const aIdx = nearestWalkable(g, A.point.x, A.point.y)
    const bIdx = nearestWalkable(g, B.point.x, B.point.y)
    if (aIdx < 0 || bIdx < 0 || aIdx === bIdx) continue
    const pairKey = aIdx < bIdx ? `${aIdx}-${bIdx}` : `${bIdx}-${aIdx}`
    if (seenPairs.has(pairKey)) continue
    seenPairs.add(pairKey)

    const cellPath = findPath(g, aIdx, bIdx)
    if (!cellPath) {
      panelRows.push({ id: r.label, label: r.label, detail: 'No clear path — is there a door between the rooms?', tone: 'bad', targetId: A.id ?? B.id })
      continue
    }

    const pts = cellPath.map((c) => cellCenter(g, c % g.cols, (c / g.cols) | 0))
    let length = 0
    for (let i = 1; i < pts.length; i++) length += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)

    // Pinch scan: narrowest corridor width, skipping endpoints and doorways.
    const exclude = new Set<string>([A.id, B.id].filter(Boolean) as string[])
    let worst: { d: number; name: string | null; id: string | null; p: Pt } | null = null
    for (let i = 1; i < pts.length - 1; i++) {
      const p = pts[i]
      if (doorSegs.some((s) => distPointToSeg(p.x, p.y, s) < DOOR_NEAR)) continue
      const c = corridorWidthAt(pts[i - 1], p, pts[i + 1], plan, g.obstacles, exclude)
      if (c && (!worst || c.width < worst.d)) worst = { d: c.width, name: c.name, id: c.id, p }
    }

    // Draw the worn path + its length.
    overlays.push({ kind: 'path', points: pts, stroke: PATH_STROKE, width: 16, opacity: 1 })
    const mid = pts[Math.floor(pts.length / 2)]
    overlays.push({ kind: 'badge', x: mid.x, y: mid.y, text: formatLength(length, u), color: PATH_TEXT })

    if (worst && worst.d < PINCH) {
      // A small danger diamond + the measured width.
      const s = 9
      overlays.push({
        kind: 'polygon',
        points: [
          { x: worst.p.x, y: worst.p.y - s },
          { x: worst.p.x + s, y: worst.p.y },
          { x: worst.p.x, y: worst.p.y + s },
          { x: worst.p.x - s, y: worst.p.y },
        ],
        fill: PINCH_FILL,
      })
      overlays.push({ kind: 'badge', x: worst.p.x, y: worst.p.y - 20, text: formatLength(worst.d, u), color: PINCH_TEXT })
      panelRows.push({
        id: r.label,
        label: r.label,
        detail: `${formatLength(length, u)} · squeezes to ${formatLength(worst.d, u)} ${worst.name ? `past ${worst.name}` : 'past a wall'}`,
        tone: 'warn',
        targetId: worst.id ?? A.id ?? B.id,
      })
    } else {
      panelRows.push({ id: r.label, label: r.label, detail: `${formatLength(length, u)} · clear`, tone: 'ok', targetId: A.id ?? B.id })
    }
    drew++
  }

  if (drew === 0 && panelRows.length === 0) {
    panelRows.push({ id: '__none__', label: 'No daily routes yet', detail: 'Add a bed, sofa or kitchen piece and a front door to trace routes.', tone: 'ok' })
  } else {
    const pinched = panelRows.filter((r) => r.tone === 'warn').length
    if (pinched) warnings.push(`${pinched} route${pinched > 1 ? 's squeeze' : ' squeezes'} below ${formatLength(PINCH, u)}.`)
  }

  return { overlays, panelRows, warnings }
}

export const flowLayer: InsightLayer = {
  id: 'flow-paths',
  label: 'Flow & desire paths',
  desc: 'Daily routes (bed→bath, entry→kitchen…) as worn paths, with pinch points under 70cm',
  icon: '🚶',
  compute: computeFlowLayer,
}
