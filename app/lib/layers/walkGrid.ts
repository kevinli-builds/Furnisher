// ── Walkability grid (shared layer machinery) ────────────────────
// A wall-aware occupancy grid over the plan's free floor, plus pathfinding on
// it. Built once per plan (memoised by identity) and reused by any layer that
// reasons about circulation — L2 flow/desire-paths today, L6 accessibility
// later. Everything is a PURE function of the plan; canonical cm throughout.
//
// The wall model is what makes routes credible: two adjacent rooms share a wall
// edge, so their interior cells are grid-neighbours across it. We forbid a step
// that crosses a SOLID wall segment (a room edge with the door openings cut out)
// — so travel between rooms only happens through doorways, never through walls.

import type { Plan, Furniture, Pt } from '../types'
import { furnitureType } from '../furniture'
import { roomCorners, pointInPolygon, type Box } from '../geometry'

const SQRT2 = Math.SQRT2
const WALL_TOL = 1.5 // cm: a door counts as "on" a wall within this of its line

export interface Seg {
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface WalkGrid {
  cell: number // cm per cell
  cols: number
  rows: number
  ox: number // world x of the grid's left edge
  oy: number // world y of the grid's top edge
  walkable: Uint8Array // cols*rows: 1 = free floor
  adj: Uint8Array // cols*rows: 8-bit passability mask (see DIRS order)
  walls: Seg[] // solid wall segments (edges minus door gaps)
  obstacles: Furniture[] // non-rug footprints (for clearance queries)
}

// Neighbour directions. Orthogonals first (bits 0–3) so the diagonals (4–7) can
// require their two orthogonal components to be open (no cutting a wall corner).
const DIRS: Array<{ dx: number; dy: number; cost: number; orth: [number, number] | null }> = [
  { dx: 1, dy: 0, cost: 1, orth: null },
  { dx: -1, dy: 0, cost: 1, orth: null },
  { dx: 0, dy: 1, cost: 1, orth: null },
  { dx: 0, dy: -1, cost: 1, orth: null },
  { dx: 1, dy: 1, cost: SQRT2, orth: [0, 2] },
  { dx: 1, dy: -1, cost: SQRT2, orth: [0, 3] },
  { dx: -1, dy: 1, cost: SQRT2, orth: [1, 2] },
  { dx: -1, dy: -1, cost: SQRT2, orth: [1, 3] },
]

// ── geometry helpers (exported for the clearance sampler in flow.ts) ──

// Proper segment intersection (excludes mere endpoint touching / collinearity).
function ccw(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): boolean {
  return (cy - ay) * (bx - ax) > (by - ay) * (cx - ax)
}
export function segmentsCross(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number): boolean {
  return ccw(ax, ay, cx, cy, dx, dy) !== ccw(bx, by, cx, cy, dx, dy) && ccw(ax, ay, bx, by, cx, cy) !== ccw(ax, ay, bx, by, dx, dy)
}

export function distPointToSeg(px: number, py: number, s: Seg): number {
  const vx = s.x2 - s.x1
  const vy = s.y2 - s.y1
  const len2 = vx * vx + vy * vy
  let t = len2 === 0 ? 0 : ((px - s.x1) * vx + (py - s.y1) * vy) / len2
  t = Math.max(0, Math.min(1, t))
  const cx = s.x1 + t * vx
  const cy = s.y1 + t * vy
  return Math.hypot(px - cx, py - cy)
}

// Distance from a point to a (possibly rotated) furniture footprint; 0 if inside.
export function distPointToFurniture(px: number, py: number, f: Furniture): number {
  const cx = f.x + f.w / 2
  const cy = f.y + f.h / 2
  const r = (f.rotation * Math.PI) / 180
  const cos = Math.cos(r)
  const sin = Math.sin(r)
  const dx = px - cx
  const dy = py - cy
  const lx = dx * cos + dy * sin // world → local (inverse of the cw rotation)
  const ly = -dx * sin + dy * cos
  const ox = Math.max(Math.abs(lx) - f.w / 2, 0)
  const oy = Math.max(Math.abs(ly) - f.h / 2, 0)
  return Math.hypot(ox, oy)
}

function pointInFurniture(px: number, py: number, f: Furniture): boolean {
  return distPointToFurniture(px, py, f) < 0.0001
}

// Subtract covered intervals from [lo,hi], returning the remaining solid spans.
function subtractSpans(lo: number, hi: number, spans: Array<[number, number]>): Array<[number, number]> {
  const cuts = spans
    .map(([a, b]) => [Math.max(lo, Math.min(a, b)), Math.min(hi, Math.max(a, b))] as [number, number])
    .filter(([a, b]) => b > a)
    .sort((a, b) => a[0] - b[0])
  const out: Array<[number, number]> = []
  let cur = lo
  for (const [a, b] of cuts) {
    if (a > cur) out.push([cur, a])
    cur = Math.max(cur, b)
  }
  if (cur < hi) out.push([cur, hi])
  return out
}

// Room edges with door openings cut out. Windows stay solid (you can't walk
// through a window); diagonal edges are kept whole (doors never snap to them).
export function solidWalls(plan: Plan): Seg[] {
  const doors = plan.doors.filter((d) => (d.type ?? 'swing') !== 'window')
  const segs: Seg[] = []
  for (const room of plan.rooms) {
    const cs = roomCorners(room)
    for (let i = 0; i < cs.length; i++) {
      const a = cs[i]
      const b = cs[(i + 1) % cs.length]
      if (Math.abs(a.y - b.y) < 0.5) {
        const y = a.y
        const lo = Math.min(a.x, b.x)
        const hi = Math.max(a.x, b.x)
        const spans = doors
          .filter((d) => d.orientation === 'h' && Math.abs(d.y - y) < WALL_TOL)
          .map((d) => [d.x, d.x + d.length] as [number, number])
        for (const [s, e] of subtractSpans(lo, hi, spans)) segs.push({ x1: s, y1: y, x2: e, y2: y })
      } else if (Math.abs(a.x - b.x) < 0.5) {
        const x = a.x
        const lo = Math.min(a.y, b.y)
        const hi = Math.max(a.y, b.y)
        const spans = doors
          .filter((d) => d.orientation === 'v' && Math.abs(d.x - x) < WALL_TOL)
          .map((d) => [d.y, d.y + d.length] as [number, number])
        for (const [s, e] of subtractSpans(lo, hi, spans)) segs.push({ x1: x, y1: s, x2: x, y2: e })
      } else {
        segs.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y }) // diagonal wall, kept whole
      }
    }
  }
  return segs
}

// Distance from a world point to the nearest obstacle edge — a solid wall or a
// non-rug furniture footprint. The radius of the largest empty circle centred
// there; used for wheelchair turning-circle checks (L6).
export function clearanceAt(g: WalkGrid, x: number, y: number): number {
  let d = Infinity
  for (const w of g.walls) {
    const dw = distPointToSeg(x, y, w)
    if (dw < d) d = dw
  }
  for (const f of g.obstacles) {
    const df = distPointToFurniture(x, y, f)
    if (df < d) d = df
  }
  return d
}

export function idx(g: WalkGrid, cx: number, cy: number): number {
  return cy * g.cols + cx
}
export function cellCenter(g: WalkGrid, cx: number, cy: number): Pt {
  return { x: g.ox + cx * g.cell + g.cell / 2, y: g.oy + cy * g.cell + g.cell / 2 }
}
export function worldToCell(g: WalkGrid, x: number, y: number): { cx: number; cy: number } {
  return { cx: Math.floor((x - g.ox) / g.cell), cy: Math.floor((y - g.oy) / g.cell) }
}

function boundsOfRooms(plan: Plan): Box | null {
  if (!plan.rooms.length) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const r of plan.rooms) {
    for (const c of roomCorners(r)) {
      minX = Math.min(minX, c.x)
      minY = Math.min(minY, c.y)
      maxX = Math.max(maxX, c.x)
      maxY = Math.max(maxY, c.y)
    }
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

const buildCache = new WeakMap<Plan, WalkGrid>()

export function buildWalkGrid(plan: Plan): WalkGrid {
  const cached = buildCache.get(plan)
  if (cached) return cached

  const bb = boundsOfRooms(plan)
  const empty: WalkGrid = { cell: 20, cols: 0, rows: 0, ox: 0, oy: 0, walkable: new Uint8Array(0), adj: new Uint8Array(0), walls: [], obstacles: [] }
  if (!bb || bb.w <= 0 || bb.h <= 0) {
    buildCache.set(plan, empty)
    return empty
  }

  // Adaptive cell size → keep the grid near ~2500 cells whatever the plan size.
  const cell = Math.max(12, Math.ceil(Math.sqrt((bb.w * bb.h) / 2500)))
  const cols = Math.max(1, Math.ceil(bb.w / cell) + 1)
  const rows = Math.max(1, Math.ceil(bb.h / cell) + 1)
  const walls = solidWalls(plan)
  const obstacles = plan.furniture.filter((f) => furnitureType(f.type) !== 'rug')

  const g: WalkGrid = { cell, cols, rows, ox: bb.x, oy: bb.y, walkable: new Uint8Array(cols * rows), adj: new Uint8Array(cols * rows), walls, obstacles }

  // Walkable = cell centre inside some room and not inside any solid piece.
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const p = cellCenter(g, cx, cy)
      const inRoom = plan.rooms.some((r) => pointInPolygon(p.x, p.y, roomCorners(r)))
      const blocked = inRoom && obstacles.some((f) => pointInFurniture(p.x, p.y, f))
      g.walkable[idx(g, cx, cy)] = inRoom && !blocked ? 1 : 0
    }
  }

  const crosses = (a: Pt, b: Pt): boolean => walls.some((w) => segmentsCross(a.x, a.y, b.x, b.y, w.x1, w.y1, w.x2, w.y2))

  // Pass 1: orthogonal passability (bits 0–3).
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const i = idx(g, cx, cy)
      if (!g.walkable[i]) continue
      const a = cellCenter(g, cx, cy)
      for (let k = 0; k < 4; k++) {
        const nx = cx + DIRS[k].dx
        const ny = cy + DIRS[k].dy
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue
        if (!g.walkable[idx(g, nx, ny)]) continue
        if (!crosses(a, cellCenter(g, nx, ny))) g.adj[i] |= 1 << k
      }
    }
  }
  // Pass 2: diagonals (bits 4–7) — both orthogonal legs open and no wall cut.
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const i = idx(g, cx, cy)
      if (!g.walkable[i]) continue
      const a = cellCenter(g, cx, cy)
      for (let k = 4; k < 8; k++) {
        const nx = cx + DIRS[k].dx
        const ny = cy + DIRS[k].dy
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue
        if (!g.walkable[idx(g, nx, ny)]) continue
        const [o1, o2] = DIRS[k].orth as [number, number]
        if (!(g.adj[i] & (1 << o1)) || !(g.adj[i] & (1 << o2))) continue // corner-cut guard
        if (!crosses(a, cellCenter(g, nx, ny))) g.adj[i] |= 1 << k
      }
    }
  }

  buildCache.set(plan, g)
  return g
}

// Nearest walkable cell index to a world point (spiral out up to maxRing cells).
// Endpoints often sit inside their own furniture, so this finds the free cell to
// start pathing from. Returns -1 if nothing walkable is near.
export function nearestWalkable(g: WalkGrid, x: number, y: number, maxRing = 40): number {
  if (g.cols === 0) return -1
  const { cx, cy } = worldToCell(g, x, y)
  let best = -1
  let bestD = Infinity
  for (let ring = 0; ring <= maxRing; ring++) {
    for (let dy = -ring; dy <= ring; dy++) {
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue // ring perimeter only
        const nx = cx + dx
        const ny = cy + dy
        if (nx < 0 || ny < 0 || nx >= g.cols || ny >= g.rows) continue
        if (!g.walkable[idx(g, nx, ny)]) continue
        const c = cellCenter(g, nx, ny)
        const d = Math.hypot(c.x - x, c.y - y)
        if (d < bestD) {
          bestD = d
          best = idx(g, nx, ny)
        }
      }
    }
    if (best >= 0) return best // nearest ring with any hit wins
  }
  return best
}

// Dijkstra over the precomputed adjacency. Returns the cell-index path
// (inclusive of both ends) or null if unreachable.
export function findPath(g: WalkGrid, startIdx: number, goalIdx: number): number[] | null {
  if (startIdx < 0 || goalIdx < 0) return null
  if (startIdx === goalIdx) return [startIdx]
  const n = g.cols * g.rows
  const dist = new Float32Array(n).fill(Infinity)
  const prev = new Int32Array(n).fill(-1)
  dist[startIdx] = 0

  // Binary min-heap of cell indices keyed by dist.
  const heap: number[] = [startIdx]
  const hpos = new Map<number, number>([[startIdx, 0]])
  const swap = (i: number, j: number) => {
    ;[heap[i], heap[j]] = [heap[j], heap[i]]
    hpos.set(heap[i], i)
    hpos.set(heap[j], j)
  }
  const up = (i: number) => {
    while (i > 0) {
      const p = (i - 1) >> 1
      if (dist[heap[p]] <= dist[heap[i]]) break
      swap(i, p)
      i = p
    }
  }
  const down = (i: number) => {
    for (;;) {
      const l = 2 * i + 1
      const r = 2 * i + 2
      let m = i
      if (l < heap.length && dist[heap[l]] < dist[heap[m]]) m = l
      if (r < heap.length && dist[heap[r]] < dist[heap[m]]) m = r
      if (m === i) break
      swap(i, m)
      i = m
    }
  }
  const push = (c: number) => {
    const pos = hpos.get(c)
    if (pos === undefined) {
      heap.push(c)
      hpos.set(c, heap.length - 1)
      up(heap.length - 1)
    } else up(pos)
  }
  const pop = (): number => {
    const top = heap[0]
    const last = heap.pop() as number
    hpos.delete(top)
    if (heap.length) {
      heap[0] = last
      hpos.set(last, 0)
      down(0)
    }
    return top
  }

  while (heap.length) {
    const u = pop()
    if (u === goalIdx) break
    const cx = u % g.cols
    const cy = (u / g.cols) | 0
    const mask = g.adj[u]
    for (let k = 0; k < 8; k++) {
      if (!(mask & (1 << k))) continue
      const v = idx(g, cx + DIRS[k].dx, cy + DIRS[k].dy)
      const nd = dist[u] + DIRS[k].cost
      if (nd < dist[v]) {
        dist[v] = nd
        prev[v] = u
        push(v)
      }
    }
  }

  if (prev[goalIdx] === -1 && startIdx !== goalIdx) return null
  const path: number[] = []
  for (let c = goalIdx; c !== -1; c = prev[c]) path.push(c)
  return path.reverse()
}
