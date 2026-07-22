// ── L1 — Functional clearance zones ──────────────────────────────
// Beyond "do two pieces overlap?", does each piece have the ergonomic apron it
// needs to actually be used — chair pushback, door swing, a way onto the bed —
// or is something parked in it? Pure compute over the plan; the data table in
// clearanceStandards.ts drives which pieces get which aprons.

import type { Plan, Furniture, Pt } from '../types'
import { furnitureType } from '../furniture'
import type { InsightLayer, LayerResult, Overlay, PanelRow } from './types'
import { CLEARANCE_STANDARDS, EXPECTED_NEIGHBOURS, IGNORE_AS_OBSTRUCTION, type ClearApron, type ClearSide } from './clearanceStandards'

// Overlay colours — CODE CONSTANTS (never plan data). Sage = clear, danger tint
// = obstructed, matching the earthy/danger palette (#a8463c).
const CLEAR_FILL = 'rgba(122, 138, 95, 0.15)'
const CLEAR_STROKE = 'rgba(122, 138, 95, 0.45)'
const BLOCKED_FILL = 'rgba(168, 70, 60, 0.22)'
const BLOCKED_STROKE = 'rgba(168, 70, 60, 0.6)'

// The four corners of a (rotated) rectangle, absolute cm. rot is degrees
// clockwise about the piece centre — the same convention Furniture.rotation uses.
export function rectCorners(x: number, y: number, w: number, h: number, rot: number): Pt[] {
  const cx = x + w / 2
  const cy = y + h / 2
  const r = (rot * Math.PI) / 180
  const cos = Math.cos(r)
  const sin = Math.sin(r)
  const local: Array<[number, number]> = [
    [-w / 2, -h / 2],
    [w / 2, -h / 2],
    [w / 2, h / 2],
    [-w / 2, h / 2],
  ]
  return local.map(([lx, ly]) => ({ x: cx + lx * cos - ly * sin, y: cy + lx * sin + ly * cos }))
}

// The absolute polygon of one apron on a piece. In the piece's local frame the
// footprint spans x∈[0,w], y∈[0,h]; an apron extends `depth` cm off the named
// edge. Rotated about the piece centre so aprons follow the piece's heading.
export function apronPolygon(f: Furniture, ap: ClearApron): Pt[] {
  const { x, y, w, h, rotation } = f
  let lx = 0
  let ly = 0
  let lw = 0
  let lh = 0
  switch (ap.side) {
    case 'front': // +y (the usable face)
      lx = 0; ly = h; lw = w; lh = ap.depth; break
    case 'back': // -y (the wall side)
      lx = 0; ly = -ap.depth; lw = w; lh = ap.depth; break
    case 'left': // -x
      lx = -ap.depth; ly = 0; lw = ap.depth; lh = h; break
    case 'right': // +x
      lx = w; ly = 0; lw = ap.depth; lh = h; break
  }
  // Reuse the rect-corner rotation by expressing the apron as its own rect that
  // shares the PIECE's centre + rotation. Easiest: build local corners then map.
  const cx = x + w / 2
  const cy = y + h / 2
  const r = (rotation * Math.PI) / 180
  const cos = Math.cos(r)
  const sin = Math.sin(r)
  const corners: Array<[number, number]> = [
    [lx, ly],
    [lx + lw, ly],
    [lx + lw, ly + lh],
    [lx, ly + lh],
  ]
  // local coords above are relative to the piece's top-left (x,y); shift to
  // centre-relative before rotating.
  return corners.map(([px, py]) => {
    const rx = x + px - cx
    const ry = y + py - cy
    return { x: cx + rx * cos - ry * sin, y: cy + rx * sin + ry * cos }
  })
}

// Do two convex polygons overlap? Separating-axis test over both polys' edge
// normals. Edge-touching (zero penetration) reads as NOT overlapping — a piece
// sitting flush against the apron's mouth isn't intruding into it.
export function convexOverlap(a: Pt[], b: Pt[]): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p1 = poly[i]
      const p2 = poly[(i + 1) % poly.length]
      const nx = -(p2.y - p1.y)
      const ny = p2.x - p1.x
      let minA = Infinity
      let maxA = -Infinity
      let minB = Infinity
      let maxB = -Infinity
      for (const p of a) {
        const d = p.x * nx + p.y * ny
        if (d < minA) minA = d
        if (d > maxA) maxA = d
      }
      for (const p of b) {
        const d = p.x * nx + p.y * ny
        if (d < minB) minB = d
        if (d > maxB) maxB = d
      }
      if (maxA <= minB || maxB <= minA) return false // gap on this axis → disjoint
    }
  }
  return true
}

const label = (side: ClearSide) => (side === 'front' ? 'front' : side === 'back' ? 'back' : side)

export function computeClearanceLayer(plan: Plan): LayerResult {
  const overlays: Overlay[] = []
  const panelRows: PanelRow[] = []
  const warnings: string[] = []

  // Everything that could sit IN an apron: solid footprints, minus the flats.
  const blockers = plan.furniture.filter((f) => !IGNORE_AS_OBSTRUCTION.has(furnitureType(f.type)))
  const cornersOf = (f: Furniture) => rectCorners(f.x, f.y, f.w, f.h, f.rotation)

  let ownerCount = 0
  for (const f of plan.furniture) {
    const std = CLEARANCE_STANDARDS[furnitureType(f.type)]
    if (!std) continue
    ownerCount++
    const expected = EXPECTED_NEIGHBOURS[furnitureType(f.type)]
    const blockedSides: string[] = []
    const blockerNames = new Set<string>()

    for (const ap of std.aprons) {
      const poly = apronPolygon(f, ap)
      let blocked = false
      for (const b of blockers) {
        if (b.id === f.id) continue
        if (expected?.has(furnitureType(b.type))) continue // intended adjacency
        if (convexOverlap(poly, cornersOf(b))) {
          blocked = true
          blockerNames.add(b.name || 'a piece')
        }
      }
      overlays.push({
        kind: 'polygon',
        points: poly,
        fill: blocked ? BLOCKED_FILL : CLEAR_FILL,
        stroke: blocked ? BLOCKED_STROKE : CLEAR_STROKE,
      })
      if (blocked) blockedSides.push(label(ap.side))
    }

    if (blockedSides.length) {
      const sides = blockedSides.join(' & ')
      const who = [...blockerNames].join(', ')
      panelRows.push({
        id: f.id,
        label: f.name || 'Piece',
        detail: `${sides} clearance blocked${who ? ` by ${who}` : ''} — ${std.note}`,
        tone: 'bad',
        targetId: f.id,
      })
    }
  }

  if (ownerCount === 0) {
    panelRows.push({ id: '__none__', label: 'No pieces need clearance yet', detail: 'Add furniture like a bed, desk, sofa or wardrobe.', tone: 'ok' })
  } else if (panelRows.length === 0) {
    panelRows.push({ id: '__ok__', label: 'All clearances clear', detail: 'Every piece has room to be used.', tone: 'ok' })
  } else {
    warnings.push(`${panelRows.length} piece${panelRows.length > 1 ? 's have' : ' has'} a blocked clearance zone.`)
  }

  return { overlays, panelRows, warnings }
}

export const clearanceLayer: InsightLayer = {
  id: 'clearance-zones',
  label: 'Clearance zones',
  desc: 'Ergonomic room to use each piece — chair pushback, door swing, bedside access',
  icon: '📐',
  compute: computeClearanceLayer,
}
