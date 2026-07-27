// ── L5 — Sightlines & privacy ────────────────────────────────────
// Two questions a floor plan can answer that a photo can't:
//   • Privacy — can someone at the front door (or outside a window) SEE the bed
//     or the toilet? A real apartment-hunting dealbreaker.
//   • TV — is the sofa a comfortable distance from the screen for its size?
// Both are line-of-sight ray-casts over the plan geometry. Pure.

import type { Plan, Furniture, Door, Pt } from '../types'
import { furnitureType } from '../furniture'
import { roomAtPoint } from '../geometry'
import { formatLength } from '../units'
import type { InsightLayer, LayerResult, Overlay, PanelRow } from './types'
import { solidWalls, segmentsCross, type Seg } from './walkGrid'
import { rectCorners } from './clearance'

const PRIVACY_LINE = 'rgba(168, 70, 60, 0.8)'
const PRIVACY_TEXT = '#a8463c'
const TV_LINE = 'rgba(74, 120, 158, 0.75)'
const TV_TEXT = '#3f6a8c'
const VIEW_MIN = 1.5 // × screen diagonal — closer than this feels cramped
const VIEW_MAX = 2.5 // × screen diagonal — further than this feels distant

const center = (f: Furniture): Pt => ({ x: f.x + f.w / 2, y: f.y + f.h / 2 })

// Clear line of sight from a to b? Blocked by a solid wall or any non-ignored
// furniture footprint (segment crossing its rotated edges). Windows-as-walls
// don't matter for interior lines; the target piece is ignored so the ray can
// actually reach it.
function hasLineOfSight(a: Pt, b: Pt, walls: Seg[], obstacles: Furniture[], ignore: Set<string>): boolean {
  for (const w of walls) if (segmentsCross(a.x, a.y, b.x, b.y, w.x1, w.y1, w.x2, w.y2)) return false
  for (const f of obstacles) {
    if (ignore.has(f.id)) continue
    const c = rectCorners(f.x, f.y, f.w, f.h, f.rotation)
    for (let i = 0; i < c.length; i++) {
      const p = c[i]
      const q = c[(i + 1) % c.length]
      if (segmentsCross(a.x, a.y, b.x, b.y, p.x, p.y, q.x, q.y)) return false
    }
  }
  return true
}

interface Viewpoint {
  point: Pt
  label: string
}
// A point just inside each opening that faces the outside world — exterior doors
// and windows. Interior doors (a room on both sides) aren't outside vantage
// points, so they're skipped.
function viewpoints(plan: Plan): Viewpoint[] {
  const out: Viewpoint[] = []
  for (const d of plan.doors) {
    const isWindow = (d.type ?? 'swing') === 'window'
    let p: Pt | null = null
    if (d.orientation === 'h') {
      const mx = d.x + d.length / 2
      const up = roomAtPoint(mx, d.y - 14, plan.rooms)
      const down = roomAtPoint(mx, d.y + 14, plan.rooms)
      if (down && !up) p = { x: mx, y: d.y + 25 }
      else if (up && !down) p = { x: mx, y: d.y - 25 }
    } else {
      const my = d.y + d.length / 2
      const right = roomAtPoint(d.x + 14, my, plan.rooms)
      const left = roomAtPoint(d.x - 14, my, plan.rooms)
      if (right && !left) p = { x: d.x + 25, y: my }
      else if (left && !right) p = { x: d.x - 25, y: my }
    }
    if (p) out.push({ point: p, label: isWindow ? 'a window' : 'the front door' })
  }
  return out
}

// TV footprint width → nominal screen diagonal (16:9). width ≈ diag·0.872.
const screenInches = (f: Furniture) => Math.round(f.w / 0.8716 / 2.54)

export function computeSightlinesLayer(plan: Plan): LayerResult {
  const overlays: Overlay[] = []
  const panelRows: PanelRow[] = []
  const warnings: string[] = []
  const u = plan.units

  const walls = solidWalls(plan)
  const obstacles = plan.furniture.filter((f) => furnitureType(f.type) !== 'rug')
  const sensitive = plan.furniture.filter((f) => ['bed', 'toilet'].includes(furnitureType(f.type)))
  const tvs = plan.furniture.filter((f) => furnitureType(f.type) === 'tv')
  const seats = plan.furniture.filter((f) => ['sofa', 'chair'].includes(furnitureType(f.type)))

  if (sensitive.length === 0 && tvs.length === 0) {
    return { overlays, panelRows: [{ id: '__none__', label: 'Nothing to check yet', detail: 'Add a bed, toilet or TV to check privacy and viewing angles.', tone: 'ok' }], warnings }
  }

  // ── Privacy ──
  const vps = viewpoints(plan)
  let exposed = 0
  for (const t of sensitive) {
    const tc = center(t)
    const ignore = new Set([t.id])
    const seenLabels = new Set<string>()
    for (const vp of vps) {
      if (seenLabels.has(vp.label)) continue
      if (!hasLineOfSight(vp.point, tc, walls, obstacles, ignore)) continue
      seenLabels.add(vp.label)
      overlays.push({ kind: 'path', points: [vp.point, tc], stroke: PRIVACY_LINE, dash: '7 5' })
      overlays.push({ kind: 'badge', x: (vp.point.x + tc.x) / 2, y: (vp.point.y + tc.y) / 2, text: '👁', color: PRIVACY_TEXT })
      panelRows.push({
        id: `see-${t.id}-${vp.label}`,
        label: `${t.name || furnitureType(t.type)} in view`,
        detail: `Visible from ${vp.label}`,
        tone: 'warn',
        targetId: t.id,
      })
      exposed++
    }
  }
  if (sensitive.length > 0 && exposed === 0) {
    panelRows.push({ id: '__private__', label: 'Nicely private', detail: 'No bed or toilet is visible from the door or windows.', tone: 'ok' })
  }

  // ── TV viewing ──
  for (const tv of tvs) {
    const tc = center(tv)
    const diagIn = screenInches(tv)
    const diagCm = tv.w / 0.8716
    let nearest: Furniture | null = null
    let nd = Infinity
    for (const s of seats) {
      const d = Math.hypot(center(s).x - tc.x, center(s).y - tc.y)
      if (d < nd) {
        nd = d
        nearest = s
      }
    }
    if (!nearest) {
      panelRows.push({ id: `tv-${tv.id}`, label: `TV (≈${diagIn}")`, detail: 'No seating placed to check the viewing distance.', tone: 'ok', targetId: tv.id })
      continue
    }
    const verdict = nd < diagCm * VIEW_MIN ? 'a bit close' : nd > diagCm * VIEW_MAX ? 'a bit far' : 'comfortable'
    overlays.push({ kind: 'path', points: [tc, center(nearest)], stroke: TV_LINE, dash: '5 4' })
    overlays.push({ kind: 'badge', x: (tc.x + center(nearest).x) / 2, y: (tc.y + center(nearest).y) / 2, text: formatLength(nd, u), color: TV_TEXT })
    panelRows.push({
      id: `tv-${tv.id}`,
      label: `TV (≈${diagIn}")`,
      detail: `Seat ${formatLength(nd, u)} away — ${verdict} (ideal ${formatLength(diagCm * VIEW_MIN, u)}–${formatLength(diagCm * VIEW_MAX, u)})`,
      tone: verdict === 'comfortable' ? 'ok' : 'warn',
      targetId: tv.id,
    })
  }

  const flags = panelRows.filter((r) => r.tone === 'warn').length
  if (flags) warnings.push(`${flags} sightline note${flags > 1 ? 's' : ''} (privacy / viewing).`)

  return { overlays, panelRows, warnings }
}

export const sightlinesLayer: InsightLayer = {
  id: 'sightlines',
  label: 'Sightlines & privacy',
  desc: 'Is the bed/toilet visible from the door or a window? Plus TV viewing distance for its size',
  icon: '👁',
  compute: computeSightlinesLayer,
}
