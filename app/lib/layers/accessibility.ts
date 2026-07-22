// ── L6 — Accessibility ───────────────────────────────────────────
// A wheelchair / step-free lens on the plan — the most caring thing the app can
// check. Three tests, all opt-in and independent of the flow layer:
//   • a 150 cm turning circle fits in each key room (largest empty circle ≥ Ø150)
//   • every doorway clears the 81 cm (32") step-free minimum
//   • stairs are flagged — routes across them aren't step-free
// Reuses the walkGrid clearance machinery; pure over the plan.

import type { Plan, Pt } from '../types'
import { roomCorners, pointInPolygon } from '../geometry'
import { formatLength } from '../units'
import type { InsightLayer, LayerResult, Overlay, PanelRow } from './types'
import { buildWalkGrid, clearanceAt, cellCenter, type WalkGrid } from './walkGrid'

const TURN_R = 75 // cm: a 150 cm-diameter wheelchair turning circle
const DOOR_MIN = 81 // cm: step-free clear door width (≈32")
const MIN_ROOM_AREA = 25000 // cm² (2.5 m²): below this a room isn't expected to turn

// Calm blue = meets the standard; danger tint = fails. Code constants only.
const OK_FILL = 'rgba(72, 120, 158, 0.14)'
const OK_STROKE = 'rgba(72, 120, 158, 0.55)'
const BAD_FILL = 'rgba(168, 70, 60, 0.16)'
const BAD_STROKE = 'rgba(168, 70, 60, 0.65)'
const BAD_SOLID = 'rgba(168, 70, 60, 0.9)'
const BAD_TEXT = '#a8463c'

function polygonArea(pts: Pt[]): number {
  let a = 0
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += (pts[j].x + pts[i].x) * (pts[j].y - pts[i].y)
  return Math.abs(a) / 2
}

// The roomiest walkable spot in a room and the largest empty circle there.
function bestTurningSpot(g: WalkGrid, roomCornersPts: Pt[]): { point: Pt; radius: number } | null {
  let best: { point: Pt; radius: number } | null = null
  for (let cy = 0; cy < g.rows; cy++) {
    for (let cx = 0; cx < g.cols; cx++) {
      if (!g.walkable[cy * g.cols + cx]) continue
      const p = cellCenter(g, cx, cy)
      if (!pointInPolygon(p.x, p.y, roomCornersPts)) continue
      const r = clearanceAt(g, p.x, p.y)
      if (!best || r > best.radius) best = { point: p, radius: r }
    }
  }
  return best
}

export function computeAccessibilityLayer(plan: Plan): LayerResult {
  const overlays: Overlay[] = []
  const panelRows: PanelRow[] = []
  const warnings: string[] = []
  const u = plan.units

  const g = buildWalkGrid(plan)
  if (g.cols === 0) {
    return { overlays, panelRows: [{ id: '__norooms__', label: 'Draw rooms to check access', detail: 'Accessibility needs at least one room.', tone: 'ok' }], warnings }
  }

  // 1) Turning circles in each key (large enough) room.
  let roomsChecked = 0
  let roomsPassed = 0
  for (const room of plan.rooms) {
    const cs = roomCorners(room)
    if (polygonArea(cs) < MIN_ROOM_AREA) continue // skip closets / narrow halls
    roomsChecked++
    const spot = bestTurningSpot(g, cs)
    if (!spot) continue
    const fits = spot.radius >= TURN_R
    if (fits) {
      roomsPassed++
      overlays.push({ kind: 'circle', cx: spot.point.x, cy: spot.point.y, r: TURN_R, fill: OK_FILL, stroke: OK_STROKE })
    } else {
      overlays.push({ kind: 'circle', cx: spot.point.x, cy: spot.point.y, r: Math.max(spot.radius, 6), fill: BAD_FILL, stroke: BAD_STROKE })
      overlays.push({ kind: 'badge', x: spot.point.x, y: spot.point.y, text: `Ø${formatLength(spot.radius * 2, u)}`, color: BAD_TEXT })
      panelRows.push({
        id: `turn-${room.id}`,
        label: room.name || 'Room',
        detail: `No 150 cm turning circle — the roomiest spot fits only Ø${formatLength(spot.radius * 2, u)}`,
        tone: 'bad',
      })
    }
  }

  // 2) Door width minimums.
  for (const d of plan.doors) {
    if ((d.type ?? 'swing') === 'window') continue
    if (d.length >= DOOR_MIN) continue
    const mid: Pt = d.orientation === 'h' ? { x: d.x + d.length / 2, y: d.y } : { x: d.x, y: d.y + d.length / 2 }
    overlays.push({
      kind: 'polygon',
      points: [
        { x: mid.x, y: mid.y - 9 },
        { x: mid.x + 9, y: mid.y },
        { x: mid.x, y: mid.y + 9 },
        { x: mid.x - 9, y: mid.y },
      ],
      fill: BAD_SOLID,
    })
    overlays.push({ kind: 'badge', x: mid.x, y: mid.y - 20, text: formatLength(d.length, u), color: BAD_TEXT })
    panelRows.push({
      id: `door-${d.id}`,
      label: 'Narrow doorway',
      detail: `A door is ${formatLength(d.length, u)} — below the ${formatLength(DOOR_MIN, u)} step-free minimum`,
      tone: 'bad',
    })
  }

  // 3) Stairs = a level change; routes over them aren't step-free.
  const stairPieces = plan.stairs ?? []
  if (stairPieces.length) {
    for (const s of stairPieces) {
      overlays.push({ kind: 'rect', x: s.x, y: s.y, w: s.w, h: s.h, rotation: s.rotation, fill: BAD_FILL, stroke: BAD_STROKE })
    }
    // stairs come as entry+exit pairs sharing a link — count flights, not objects.
    const flights = new Set(stairPieces.map((s) => s.link)).size
    panelRows.push({
      id: '__stairs__',
      label: 'Stairs present',
      detail: `${flights} flight${flights > 1 ? 's' : ''} — any route across them isn't step-free`,
      tone: 'warn',
    })
  }

  const fails = panelRows.filter((r) => r.tone === 'bad').length
  const stairWarn = panelRows.some((r) => r.tone === 'warn')
  if (roomsChecked === 0 && plan.doors.length === 0 && !stairWarn && fails === 0) {
    panelRows.push({ id: '__none__', label: 'Nothing to check yet', detail: 'Add rooms, doors or stairs to run the access checks.', tone: 'ok' })
  } else if (fails === 0 && !stairWarn) {
    panelRows.unshift({
      id: '__ok__',
      label: 'Step-free & roomy',
      detail: `${roomsPassed} room${roomsPassed === 1 ? '' : 's'} fit a 150 cm turn; every door ≥ ${formatLength(DOOR_MIN, u)}`,
      tone: 'ok',
    })
  }
  if (fails) warnings.push(`${fails} accessibility issue${fails > 1 ? 's' : ''} (turning space / door width).`)

  return { overlays, panelRows, warnings }
}

export const accessibilityLayer: InsightLayer = {
  id: 'accessibility',
  label: 'Accessibility',
  desc: 'Wheelchair check: 150 cm turning circles, 81 cm door widths, step-free (stairs flagged)',
  icon: '♿',
  compute: computeAccessibilityLayer,
}
