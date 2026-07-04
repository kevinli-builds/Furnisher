// Collision & clearance checks: furniture that overlaps other furniture or sits
// outside every room, and swing doors whose arc is blocked by furniture.

import type { Plan, Door } from './types'
import { furnitureType } from './furniture'
import { overlaps, roomAtPoint, type Box } from './geometry'
import { inRoom } from './stats'

// A too-narrow walkway between two facing edges. Drawn as a red dimension line.
export interface ClearanceGap {
  x1: number
  y1: number
  x2: number
  y2: number
  dist: number // gap width in cm
}

export interface Warnings {
  furniture: Set<string>
  doors: Set<string>
}

export const CLEARANCE = 90 // comfortable walkway (cm ≈ 36")
const MIN_GAP = 8 // below this, pieces read as flush/touching — not a walkway

// The facing gap between two axis-aligned boxes, if they overlap on one axis and
// are separated by a too-narrow margin on the other. Null when flush, far apart,
// or not facing. Returns the dimension line spanning the gap at the overlap mid.
function facingGap(a: Box, b: Box): ClearanceGap | null {
  const oy1 = Math.max(a.y, b.y)
  const oy2 = Math.min(a.y + a.h, b.y + b.h)
  if (oy2 - oy1 > MIN_GAP) {
    const y = (oy1 + oy2) / 2
    if (b.x >= a.x + a.w) {
      const g = b.x - (a.x + a.w)
      if (g > MIN_GAP && g < CLEARANCE) return { x1: a.x + a.w, y1: y, x2: b.x, y2: y, dist: g }
    } else if (a.x >= b.x + b.w) {
      const g = a.x - (b.x + b.w)
      if (g > MIN_GAP && g < CLEARANCE) return { x1: b.x + b.w, y1: y, x2: a.x, y2: y, dist: g }
    }
  }
  const ox1 = Math.max(a.x, b.x)
  const ox2 = Math.min(a.x + a.w, b.x + b.w)
  if (ox2 - ox1 > MIN_GAP) {
    const x = (ox1 + ox2) / 2
    if (b.y >= a.y + a.h) {
      const g = b.y - (a.y + a.h)
      if (g > MIN_GAP && g < CLEARANCE) return { x1: x, y1: a.y + a.h, x2: x, y2: b.y, dist: g }
    } else if (a.y >= b.y + b.h) {
      const g = a.y - (b.y + b.h)
      if (g > MIN_GAP && g < CLEARANCE) return { x1: x, y1: b.y + b.h, x2: x, y2: a.y, dist: g }
    }
  }
  return null
}

// The square a swing door's leaf sweeps into the room (approximate bbox).
function swingBox(d: Door): Box {
  const L = d.length
  if (d.orientation === 'h') {
    return { x: d.x, y: d.swing > 0 ? d.y : d.y - L, w: L, h: L }
  }
  return { x: d.swing > 0 ? d.x : d.x - L, y: d.y, w: L, h: L }
}

export function computeWarnings(plan: Plan): Warnings {
  const furniture = new Set<string>()
  // Rugs are meant to sit under things — exclude them from collisions.
  const solids = plan.furniture.filter((f) => furnitureType(f.type) !== 'rug')
  const box = (o: { x: number; y: number; w: number; h: number }): Box => ({ x: o.x, y: o.y, w: o.w, h: o.h })

  for (let i = 0; i < solids.length; i++) {
    for (let j = i + 1; j < solids.length; j++) {
      if (overlaps(box(solids[i]), box(solids[j]))) {
        furniture.add(solids[i].id)
        furniture.add(solids[j].id)
      }
    }
  }
  // Pieces whose centre falls outside every room (only flag when rooms exist).
  if (plan.rooms.length) {
    for (const f of solids) {
      const cx = f.x + f.w / 2
      const cy = f.y + f.h / 2
      if (!plan.rooms.some((r) => inRoom(cx, cy, r))) furniture.add(f.id)
    }
  }

  const doors = new Set<string>()
  for (const d of plan.doors) {
    if ((d.type ?? 'swing') !== 'swing') continue
    const sb = swingBox(d)
    if (solids.some((f) => overlaps(sb, box(f)))) doors.add(d.id)
  }

  return { furniture, doors }
}

// Bulky pieces that act as real circulation obstacles — clearance only checks
// gaps BETWEEN two of these. Seating, accent, and floor pieces are excluded:
// chairs tuck under tables, nightstands hug beds, coffee tables sit by sofas,
// etc. — all intentional adjacencies that made the old check far too noisy.
const OBSTACLE: ReadonlySet<string> = new Set(['sofa', 'bed', 'diningTable', 'desk', 'dresser', 'wardrobe', 'bookshelf', 'fridge', 'stove', 'bathtub'])

// Clearance check (opt-in): too-narrow walkways between two bulky pieces. No
// furniture-to-wall check — a piece sitting near a wall is normal and was the
// biggest false-positive source (e.g. a bed beside a wall).
export function computeClearance(plan: Plan): ClearanceGap[] {
  const obstacles = plan.furniture.filter((f) => OBSTACLE.has(furnitureType(f.type)))
  const box = (o: { x: number; y: number; w: number; h: number }): Box => ({ x: o.x, y: o.y, w: o.w, h: o.h })
  const gaps: ClearanceGap[] = []
  for (let i = 0; i < obstacles.length; i++) {
    for (let j = i + 1; j < obstacles.length; j++) {
      const g = facingGap(box(obstacles[i]), box(obstacles[j]))
      if (g) gaps.push(g)
    }
  }
  return gaps
}

// ── The Doorway Test (opt-in "Move-in check") ─────────────────
// "Can the sofa actually get IN?" A piece must pass through a doorway to reach
// the room it's placed in — and through every doorway on the route from the
// entry. v1 heuristic: compare each piece's smallest cross-section (min(w,h) —
// the narrowest way you can turn it through an opening) against the narrowest
// doorway on the *widest available route* from outside to its room. Honest about
// certainty: "won't fit" only when it can't clear the best route's tightest
// door; "might be tight" when it just barely does. A full piano-mover's rotation
// / corridor-turn sweep is v2.

const OUTSIDE = '__outside__'
const TIGHT_MARGIN = 5 // cm of slack below which a doorway reads as "tight"
const EPS = 12 // cm off a wall to sample which room sits on each side of a door

export interface MoveInIssue {
  id: string // furniture id
  name: string
  cross: number // smallest cross-section (cm)
  doorway: number // narrowest doorway on the best route (cm)
  verdict: 'wont' | 'tight'
}

interface DoorEdge {
  a: string // room id or OUTSIDE
  b: string
  w: number // clear opening width (cm)
}

// Which two spaces a (non-window) door connects: two rooms, or a room and the
// OUTSIDE. Sampled just off each side of the opening's midpoint.
function doorEdges(plan: Plan): DoorEdge[] {
  const edges: DoorEdge[] = []
  for (const d of plan.doors) {
    if ((d.type ?? 'swing') === 'window') continue // you don't carry a couch through a window
    let p1: { x: number; y: number }
    let p2: { x: number; y: number }
    if (d.orientation === 'h') {
      const mx = d.x + d.length / 2
      p1 = { x: mx, y: d.y - EPS }
      p2 = { x: mx, y: d.y + EPS }
    } else {
      const my = d.y + d.length / 2
      p1 = { x: d.x - EPS, y: my }
      p2 = { x: d.x + EPS, y: my }
    }
    const a = roomAtPoint(p1.x, p1.y, plan.rooms)?.id
    const b = roomAtPoint(p2.x, p2.y, plan.rooms)?.id
    if (a && b && a !== b) edges.push({ a, b, w: d.length })
    else if (a && !b) edges.push({ a, b: OUTSIDE, w: d.length })
    else if (!a && b) edges.push({ a: b, b: OUTSIDE, w: d.length })
    // both sides in the same room (or both outside) → not a connecting door
  }
  return edges
}

// Widest-path (maximin) from OUTSIDE: for each room, the largest doorway width
// you're guaranteed on the *best* route in — i.e. maximise the route's minimum
// door. Rooms unreachable from outside are absent from the map.
function widestRouteFromOutside(edges: DoorEdge[]): Map<string, number> {
  const adj = new Map<string, { to: string; w: number }[]>()
  const link = (a: string, b: string, w: number) => {
    if (!adj.has(a)) adj.set(a, [])
    adj.get(a)!.push({ to: b, w })
  }
  for (const e of edges) {
    link(e.a, e.b, e.w)
    link(e.b, e.a, e.w)
  }
  const best = new Map<string, number>()
  if (!adj.has(OUTSIDE)) return best
  best.set(OUTSIDE, Infinity)
  const visited = new Set<string>()
  // Prim/Dijkstra-style: repeatedly settle the reachable node with the widest
  // bottleneck, relaxing its neighbours by min(bottleneck-so-far, door width).
  for (;;) {
    let u: string | null = null
    let uv = -Infinity
    for (const [node, v] of best) if (!visited.has(node) && v > uv) ((uv = v), (u = node))
    if (u === null) break
    visited.add(u)
    for (const { to, w } of adj.get(u) ?? []) {
      const nd = Math.min(best.get(u)!, w)
      if (nd > (best.get(to) ?? -Infinity)) best.set(to, nd)
    }
  }
  best.delete(OUTSIDE)
  return best
}

// Only rigid, carried-upright pieces where the footprint's narrow side is an
// honest hard constraint. Excludes beds (mattresses tilt, frames knock down),
// thin/deformable or small items, and anything that disassembles — checking
// those would produce false "won't fit" alarms and erode trust in the feature.
const MOVE_BULKY: ReadonlySet<string> = new Set(['sofa', 'diningTable', 'desk', 'dresser', 'wardrobe', 'bookshelf', 'fridge', 'bathtub'])

export function moveInCheck(plan: Plan): MoveInIssue[] {
  const edges = doorEdges(plan)
  if (edges.length === 0) return [] // no doorways to reason about

  const routeWidth = widestRouteFromOutside(edges)
  // Fallback for rooms with no route from outside in our graph: a piece must
  // still enter through one of that room's own doors, so the room's *widest*
  // door is a valid necessary bound (best case it uses that one).
  const roomWidestDoor = new Map<string, number>()
  for (const e of edges) {
    for (const node of [e.a, e.b]) {
      if (node === OUTSIDE) continue
      roomWidestDoor.set(node, Math.max(roomWidestDoor.get(node) ?? 0, e.w))
    }
  }

  const issues: MoveInIssue[] = []
  for (const f of plan.furniture) {
    if (!MOVE_BULKY.has(furnitureType(f.type))) continue // only rigid bulky pieces
    const room = plan.rooms.find((r) => inRoom(f.x + f.w / 2, f.y + f.h / 2, r))
    if (!room) continue // not inside any room → nothing to route to
    const doorway = routeWidth.get(room.id) ?? roomWidestDoor.get(room.id)
    if (doorway == null || !Number.isFinite(doorway)) continue // can't assess this room
    const cross = Math.min(f.w, f.h)
    if (cross > doorway) issues.push({ id: f.id, name: f.name, cross, doorway, verdict: 'wont' })
    else if (doorway - cross <= TIGHT_MARGIN) issues.push({ id: f.id, name: f.name, cross, doorway, verdict: 'tight' })
  }
  // Worst offenders first.
  return issues.sort((a, b) => (a.verdict === b.verdict ? b.cross - b.doorway - (a.cross - a.doorway) : a.verdict === 'wont' ? -1 : 1))
}
