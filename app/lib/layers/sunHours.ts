// ── L3 — Sun-hours heatmap ───────────────────────────────────────
// Where does the sun actually land, and for how long? We march the day hour by
// hour: at each hour the sun has a direction (sun.ts), and every window facing
// it throws a beam of parallel rays onto the floor. A cell's sun-hours = how
// many hours any beam reaches it. Furniture casts shadow for free — a beam ray
// stops when it hits a piece. The "plant map": bright = sun-drenched, blank =
// shade. Season presets tilt the sun via solar declination.
//
// Honest limits (stated, not hidden): a 2D model — all furniture is treated as
// full-height, so a low coffee table shadows like a wardrobe; daylight span is a
// fixed 6am–6pm; seasonal effect is via sun altitude, not a full azimuth sweep.

import type { Plan, Furniture, Pt } from '../types'
import { furnitureType } from '../furniture'
import { roomCorners, pointInPolygon, roomsAt } from '../geometry'
import { sunAt } from '../sun'
import type { InsightLayer, LayerResult, Overlay, PanelRow } from './types'
import { buildWalkGrid, lightWalls, segmentsCross, distPointToFurniture, type WalkGrid, type Seg } from './walkGrid'

export type SunSeason = 'summer' | 'equinox' | 'winter'
const DECLINATION: Record<SunSeason, number> = { summer: 23.5, equinox: 0, winter: -23.5 }

// Usable-daylight window by season — shorter in winter, longer in summer (the
// intuitive seasonal lever in a 2D model). Each hour counts as 1 sun-hour.
const SEASON_HOURS: Record<SunSeason, number[]> = {
  summer: [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17],
  equinox: [8, 9, 10, 11, 12, 13, 14, 15, 16],
  winter: [9, 10, 11, 12, 13, 14, 15],
}
const ALT_MIN = 0.06 // below this the sun is too low to count as direct light
const AFTERNOON = 13 // hour from which sun-on-the-TV counts as glare
const MIN_ROOM_AREA = 20000 // cm²: rooms smaller than this are skipped in the per-room read-out
const HEAT = '242, 170, 58' // warm gold (code constant)

function polygonArea(pts: Pt[]): number {
  let a = 0
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += (pts[j].x + pts[i].x) * (pts[j].y - pts[i].y)
  return Math.abs(a) / 2
}

interface WindowInfo {
  a: Pt
  b: Pt
  nx: number // interior normal
  ny: number
}
function windowInfos(plan: Plan): WindowInfo[] {
  const out: WindowInfo[] = []
  for (const d of plan.doors) {
    if ((d.type ?? 'swing') !== 'window') continue
    const horiz = d.orientation === 'h'
    const a: Pt = { x: d.x, y: d.y }
    const b: Pt = horiz ? { x: d.x + d.length, y: d.y } : { x: d.x, y: d.y + d.length }
    const cx = (a.x + b.x) / 2
    const cy = (a.y + b.y) / 2
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
    out.push({ a, b, nx, ny })
  }
  return out
}

// Can a straight line from p toward the sun leave the building through an opening
// without hitting a solid wall or another piece? (Sun-on-the-TV glare check.)
function seesSun(p: Pt, toSun: Pt, plan: Plan, walls: Seg[], obstacles: Furniture[], excludeId: string, ms: number, maxSteps: number): boolean {
  let cur = { x: p.x, y: p.y }
  for (let s = 0; s < maxSteps; s++) {
    const nxt = { x: cur.x + toSun.x * ms, y: cur.y + toSun.y * ms }
    if (walls.some((w) => segmentsCross(cur.x, cur.y, nxt.x, nxt.y, w.x1, w.y1, w.x2, w.y2))) return false
    if (obstacles.some((f) => f.id !== excludeId && distPointToFurniture(nxt.x, nxt.y, f) < 0.0001)) return false
    if (!plan.rooms.some((r) => pointInPolygon(nxt.x, nxt.y, roomCorners(r)))) return true // reached outside
    cur = nxt
  }
  return false
}

const memo = new WeakMap<Plan, LayerResult>()

export function computeSunHoursLayer(plan: Plan): LayerResult {
  const cached = memo.get(plan)
  if (cached) return cached

  const overlays: Overlay[] = []
  const panelRows: PanelRow[] = []
  const warnings: string[] = []

  const g: WalkGrid = buildWalkGrid(plan)
  if (g.cols === 0) {
    const r = { overlays, panelRows: [{ id: '__norooms__', label: 'Draw rooms to map the sun', detail: 'Sun-hours needs at least one room.', tone: 'ok' as const }], warnings }
    memo.set(plan, r)
    return r
  }

  const windows = windowInfos(plan)
  if (windows.length === 0) {
    const r = { overlays, panelRows: [{ id: '__nowin__', label: 'No windows yet', detail: 'Add a window (⊟) — the sun only gets in through windows.', tone: 'ok' as const }], warnings }
    memo.set(plan, r)
    return r
  }

  const north = plan.northDeg ?? 0
  const season: SunSeason = plan.sunSeason ?? 'equinox'
  const effLat = (plan.latitude ?? 40) - DECLINATION[season]
  const walls = lightWalls(plan)
  const obstacles = g.obstacles
  const ms = Math.max(6, g.cell * 0.6)
  const diag = Math.hypot(g.cols * g.cell, g.rows * g.cell)
  const maxSteps = Math.min(400, Math.ceil(diag / ms) + 2)

  const n = g.cols * g.rows
  const counts = new Float32Array(n)
  const lastSample = new Int32Array(n).fill(-1)
  const afternoonLit = new Uint8Array(n)
  const tvs = plan.furniture.filter((f) => furnitureType(f.type) === 'tv')
  const glareTVs = new Map<string, string>() // id → name
  const HOURS = SEASON_HOURS[season]

  const markAlong = (start: Pt, dir: Pt, sample: number, isAfternoon: boolean) => {
    let cur = { x: start.x, y: start.y }
    for (let s = 0; s < maxSteps; s++) {
      const cx = Math.floor((cur.x - g.ox) / g.cell)
      const cy = Math.floor((cur.y - g.oy) / g.cell)
      if (cx >= 0 && cy >= 0 && cx < g.cols && cy < g.rows) {
        const i = cy * g.cols + cx
        if (g.walkable[i] && lastSample[i] !== sample) {
          lastSample[i] = sample
          counts[i] += 1
          if (isAfternoon) afternoonLit[i] = 1
        }
      }
      const nxt = { x: cur.x + dir.x * ms, y: cur.y + dir.y * ms }
      if (walls.some((w) => segmentsCross(cur.x, cur.y, nxt.x, nxt.y, w.x1, w.y1, w.x2, w.y2))) break
      if (obstacles.some((f) => distPointToFurniture(nxt.x, nxt.y, f) < 0.0001)) break // furniture shadow
      if (!plan.rooms.some((r) => pointInPolygon(nxt.x, nxt.y, roomCorners(r)))) break // left the room
      cur = nxt
    }
  }

  HOURS.forEach((hour, sample) => {
    const sun = sunAt(hour, north, effLat)
    if (!sun || sun.altitude < ALT_MIN) return
    const isAfternoon = hour >= AFTERNOON
    for (const w of windows) {
      const facing = sun.dir.x * w.nx + sun.dir.y * w.ny
      if (facing <= 0.08) continue // sun is on the wrong side of this window
      const len = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y)
      const ux = len ? (w.b.x - w.a.x) / len : 0
      const uy = len ? (w.b.y - w.a.y) / len : 0
      for (let s = 0; s <= len; s += ms) {
        const seed: Pt = { x: w.a.x + ux * s + w.nx * ms, y: w.a.y + uy * s + w.ny * ms } // nudge inside
        markAlong(seed, sun.dir, sample, isAfternoon)
      }
    }
    if (isAfternoon && tvs.length) {
      const toSun = { x: -sun.dir.x, y: -sun.dir.y }
      for (const tv of tvs) {
        if (glareTVs.has(tv.id)) continue
        const c = { x: tv.x + tv.w / 2, y: tv.y + tv.h / 2 }
        if (seesSun(c, toSun, plan, walls, obstacles, tv.id, ms, maxSteps)) glareTVs.set(tv.id, tv.name || 'TV')
      }
    }
  })

  let maxH = 0
  for (let i = 0; i < n; i++) if (counts[i] > maxH) maxH = counts[i]
  if (maxH === 0) {
    const r = { overlays, panelRows: [{ id: '__noSun__', label: 'No direct sun reaches the floor', detail: 'The windows face away from the sun’s path, or furniture blocks it.', tone: 'warn' as const }], warnings }
    memo.set(plan, r)
    return r
  }

  // Heatmap: run-length-merge equal-hour cells per row into a few rects.
  for (let cy = 0; cy < g.rows; cy++) {
    let cx = 0
    while (cx < g.cols) {
      const v = counts[cy * g.cols + cx]
      if (v <= 0) {
        cx++
        continue
      }
      let end = cx + 1
      while (end < g.cols && counts[cy * g.cols + end] === v) end++
      const alpha = (0.1 + 0.42 * (v / maxH)).toFixed(3)
      overlays.push({ kind: 'rect', x: g.ox + cx * g.cell, y: g.oy + cy * g.cell, w: (end - cx) * g.cell, h: g.cell, fill: `rgba(${HEAT}, ${alpha})` })
      cx = end
    }
  }

  // Read-out: brightest spot, per-room best, glare.
  panelRows.push({ id: '__peak__', label: 'Brightest spot', detail: `up to ${maxH}h of direct sun (${season})`, tone: 'ok' })
  for (const room of plan.rooms) {
    const cs = roomCorners(room)
    if (polygonArea(cs) < MIN_ROOM_AREA) continue
    let best = 0
    for (let cy = 0; cy < g.rows; cy++) {
      for (let cx = 0; cx < g.cols; cx++) {
        const i = cy * g.cols + cx
        if (counts[i] <= best) continue
        const p = { x: g.ox + cx * g.cell + g.cell / 2, y: g.oy + cy * g.cell + g.cell / 2 }
        if (pointInPolygon(p.x, p.y, cs)) best = counts[i]
      }
    }
    panelRows.push({
      id: `room-${room.id}`,
      label: room.name || 'Room',
      detail: best > 0 ? `up to ${best}h of direct sun` : 'no direct sun',
      tone: best > 0 ? 'ok' : 'warn',
    })
  }
  for (const [id, name] of glareTVs) {
    panelRows.push({ id: `glare-${id}`, label: 'Screen glare', detail: `Afternoon sun falls on ${name}`, tone: 'warn', targetId: id })
  }

  const shadeless = panelRows.filter((r) => r.tone === 'warn').length
  if (shadeless) warnings.push(`${shadeless} sun note${shadeless > 1 ? 's' : ''} (dark room / screen glare).`)

  const result = { overlays, panelRows, warnings }
  memo.set(plan, result)
  return result
}

export const sunHoursLayer: InsightLayer = {
  id: 'sun-hours',
  label: 'Sun-hours heatmap',
  desc: 'Where direct sun lands over a day (the “plant map”), with season presets + screen-glare flags',
  icon: '☀️',
  compute: computeSunHoursLayer,
}
