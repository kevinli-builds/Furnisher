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
// door; "might be tight" when it just barely does. v2 (below) adds the
// corridor-turn sweep: pieces that clear every door but can't make a bend.

const OUTSIDE = '__outside__'
const TIGHT_MARGIN = 5 // cm of slack below which a doorway reads as "tight"
const EPS = 12 // cm off a wall to sample which room sits on each side of a door

export interface MoveInIssue {
  id: string // furniture id
  name: string
  cross: number // smallest cross-section (cm)
  doorway: number // narrowest doorway on the best route (cm)
  verdict: 'wont' | 'tight' | 'turn' // turn = clears every door but can't make a bend (v2)
  roomName?: string // (turn) the destination room
  length?: number // (turn) the piece's long side (cm)
  maxLength?: number // (turn) longest piece of this width that CAN reach the room, carried flat
}

interface DoorEdge {
  a: string // room id or OUTSIDE
  b: string
  w: number // clear opening width (cm)
  id: string // door id
  o: 'h' | 'v' // wall the opening sits on (drives travel direction through it)
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
    if (a && b && a !== b) edges.push({ a, b, w: d.length, id: d.id, o: d.orientation })
    else if (a && !b) edges.push({ a, b: OUTSIDE, w: d.length, id: d.id, o: d.orientation })
    else if (!a && b) edges.push({ a: b, b: OUTSIDE, w: d.length, id: d.id, o: d.orientation })
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

// ── v2: corner turns (the corridor-turn sweep) ──────────────────
// v1 answers "is the piece narrower than every door on the way in?" —
// necessary but not sufficient: a long rigid piece can clear every doorway
// yet be impossible to TURN where the route bends (the piano-mover's corner).
//
// Model (2D, carried flat): the piece is a rigid a×b rectangle (a = min(w,h)).
// Moving along a corridor "leg" it is either ALIGNED (long axis along travel —
// presents a at doors and across the leg) or SIDEWAYS (presents b). At a
// right-angle bend it can either
//   • rotate through the corner staying aligned — feasible iff b ≤ the classic
//     "longest rod of width a around a right-angle corner" bound, or
//   • translate around the bend without rotating (its orientation relative to
//     travel flips) — what lets square-ish pieces round roomy corners that the
//     rotation bound alone would wrongly flag.
// A room's legs are approximated by its bounding box: a door on a horizontal
// wall implies vertical travel in a leg as wide as the room's x-extent, and
// vice versa. Honest limitations, stated rather than papered over: polygon
// rooms are treated as their bbox (draw an elbow as two rooms + a door to
// model its corner), and 3D escapes (standing a piece on end, tilting) are
// deliberately not modelled — the UI copy suggests them instead.

// Longest rigid piece of cross-section `a` that can round a right-angle bend
// between corridors of widths c1 and c2, ending aligned with the new corridor.
// min over θ∈(0,π/2) of (c1 − a·cosθ)/sinθ + (c2 − a·sinθ)/cosθ — the standard
// ladder-around-a-corner result generalised to a rod of nonzero width. Sampled
// densely rather than solved (the minimum is interior and flat; 720 steps puts
// the error far below a centimetre).
export function cornerAllowedLength(c1: number, c2: number, a: number): number {
  if (a >= c1 || a >= c2) return 0
  let best = Infinity
  const N = 720
  for (let i = 1; i < N; i++) {
    const t = (Math.PI / 2) * (i / N)
    const s = Math.sin(t)
    const c = Math.cos(t)
    const v = (c1 - a * c) / s + (c2 - a * s) / c
    if (v < best) best = v
  }
  return best
}

// Can an a×b piece reach `target` from outside, doors AND corners considered?
// BFS over states (door entered through, room entered, orientation). Feasibility
// is monotone in b (every constraint is "b ≤ something" or b-independent), which
// maxTurnLength relies on.
function reachableWithTurns(
  target: string,
  aDim: number,
  bDim: number,
  doors: DoorEdge[],
  roomsById: Map<string, { w: number; h: number }>,
): boolean {
  const dim = (sideways: boolean) => (sideways ? bDim : aDim)
  // Width of the corridor leg served by a door of orientation o inside a room:
  // h-wall door → vertical travel → leg width = room x-extent, and vice versa.
  const legW = (roomId: string, o: 'h' | 'v') => {
    const r = roomsById.get(roomId)
    return r ? (o === 'h' ? r.w : r.h) : Infinity
  }
  const fits = (sideways: boolean, d: DoorEdge, roomId: string) =>
    dim(sideways) <= d.w && dim(sideways) <= legW(roomId, d.o)

  const seen = new Set<string>()
  const queue: { d: DoorEdge; room: string; sideways: boolean }[] = []
  const push = (d: DoorEdge, room: string, sideways: boolean) => {
    const k = `${d.id}|${room}|${sideways}`
    if (seen.has(k)) return
    seen.add(k)
    queue.push({ d, room, sideways })
  }
  // Entry states: any door with the outside on one side.
  for (const d of doors) {
    const inward = d.a === OUTSIDE ? d.b : d.b === OUTSIDE ? d.a : null
    if (!inward) continue
    for (const sideways of [false, true]) if (fits(sideways, d, inward)) push(d, inward, sideways)
  }
  for (let i = 0; i < queue.length; i++) {
    const { d, room, sideways } = queue[i]
    if (room === target) return true
    for (const d2 of doors) {
      if (d2.id === d.id) continue
      const next = d2.a === room ? d2.b : d2.b === room ? d2.a : null
      if (next === null || next === OUTSIDE) continue
      if (d2.o === d.o) {
        // Straight run across the room — orientation unchanged.
        if (fits(sideways, d2, next)) push(d2, next, sideways)
      } else {
        // Rotate through the bend (stays aligned): the corner lives inside the
        // current room, between its two legs.
        if (
          !sideways &&
          fits(false, d2, next) &&
          bDim <= cornerAllowedLength(legW(room, d.o), legW(room, d2.o), aDim)
        )
          push(d2, next, false)
        // Translate around the bend (orientation flips): the long side must fit
        // the corner region of the current room and the receiving leg + door.
        if (dim(!sideways) <= legW(room, d2.o) && fits(!sideways, d2, next)) push(d2, next, !sideways)
      }
    }
  }
  return false
}

// Longest piece of cross-section `a` that can still reach the room, carried
// flat — binary search on the monotone feasibility above. 0 when even a
// square a×a piece can't make it (an intermediate leg is narrower than a).
function maxTurnLength(
  target: string,
  aDim: number,
  upper: number,
  doors: DoorEdge[],
  roomsById: Map<string, { w: number; h: number }>,
): number {
  if (!reachableWithTurns(target, aDim, aDim, doors, roomsById)) return 0
  let lo = aDim // feasible
  let hi = upper // infeasible (caller only asks when the piece itself failed)
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2
    if (reachableWithTurns(target, aDim, mid, doors, roomsById)) lo = mid
    else hi = mid
  }
  return Math.floor(lo)
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

  const roomsById = new Map(plan.rooms.map((r) => [r.id, { w: r.w, h: r.h }]))
  const issues: MoveInIssue[] = []
  for (const f of plan.furniture) {
    if (!MOVE_BULKY.has(furnitureType(f.type))) continue // only rigid bulky pieces
    const room = plan.rooms.find((r) => inRoom(f.x + f.w / 2, f.y + f.h / 2, r))
    if (!room) continue // not inside any room → nothing to route to
    const doorway = routeWidth.get(room.id) ?? roomWidestDoor.get(room.id)
    if (doorway == null || !Number.isFinite(doorway)) continue // can't assess this room
    const cross = Math.min(f.w, f.h)
    const length = Math.max(f.w, f.h)
    if (cross > doorway) {
      issues.push({ id: f.id, name: f.name, cross, doorway, verdict: 'wont' })
      continue
    }
    // v2 corner pass — only when the room is genuinely routed from outside (the
    // widest-door fallback has no route to walk, so corners are unknowable).
    if (routeWidth.has(room.id) && !reachableWithTurns(room.id, cross, length, edges, roomsById)) {
      issues.push({
        id: f.id,
        name: f.name,
        cross,
        doorway,
        verdict: 'turn',
        roomName: room.name,
        length,
        maxLength: maxTurnLength(room.id, cross, length, edges, roomsById),
      })
      continue // a turn failure outranks a mere width "tight"
    }
    if (doorway - cross <= TIGHT_MARGIN) issues.push({ id: f.id, name: f.name, cross, doorway, verdict: 'tight' })
  }
  // Worst offenders first: hard blockers, then turn blockers, then tight fits.
  const RANK: Record<MoveInIssue['verdict'], number> = { wont: 0, turn: 1, tight: 2 }
  return issues.sort((a, b) => RANK[a.verdict] - RANK[b.verdict] || b.cross - b.doorway - (a.cross - a.doorway))
}
