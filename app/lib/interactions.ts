// Pure canvas-interaction helpers, extracted from Canvas.tsx so the fiddly
// hit-testing / marquee / stack-cycle logic can be unit-tested in isolation.
// Nothing here touches React or the DOM — inputs are plain plan data + points.

import type { Plan, SelItem } from './types'
import { overlaps, type Box } from './geometry'
import { doorBox } from './door'

export interface Hit {
  item: SelItem
  label: string
}

const inBox = (px: number, py: number, x: number, y: number, w: number, h: number) => px >= x && px <= x + w && py >= y && py <= y + h

// Every object whose footprint contains the point, in top-of-stack order
// (lights, furniture, stairs, doors, rooms, markers). Drives the right-click /
// tap-to-cycle menu on overlapping objects.
export function pointHits(plan: Plan, p: { x: number; y: number }): Hit[] {
  const res: Hit[] = []
  for (const l of plan.lights) if (inBox(p.x, p.y, l.x - 16, l.y - 16, 32, 32)) res.push({ item: { type: 'light', id: l.id }, label: 'Ceiling light' })
  for (const f of plan.furniture) if (inBox(p.x, p.y, f.x, f.y, f.w, f.h)) res.push({ item: { type: 'furniture', id: f.id }, label: `Furniture · ${f.name}` })
  for (const s of plan.stairs) if (inBox(p.x, p.y, s.x, s.y, s.w, s.h)) res.push({ item: { type: 'stair', id: s.id }, label: `Stairs · ${s.role}` })
  for (const dd of plan.doors) {
    const b = doorBox(dd)
    if (inBox(p.x, p.y, b.x, b.y, b.w, b.h)) res.push({ item: { type: 'door', id: dd.id }, label: `${dd.type ?? 'swing'} opening` })
  }
  for (const r of plan.rooms) if (inBox(p.x, p.y, r.x, r.y, r.w, r.h)) res.push({ item: { type: 'room', id: r.id }, label: `Room · ${r.name}` })
  for (const m of plan.markers) if (inBox(p.x, p.y, m.x, m.y, m.w, m.h)) res.push({ item: { type: 'marker', id: m.id }, label: `${(m.style ?? 'frame') === 'closet' ? 'Closet' : 'Marker'} · ${m.name}` })
  return res
}

// Every object overlapping a marquee (box-select) rectangle.
export function objectsInMarquee(plan: Plan, box: Box): SelItem[] {
  const hits: SelItem[] = []
  for (const m of plan.markers) if (overlaps(box, { x: m.x, y: m.y, w: m.w, h: m.h })) hits.push({ type: 'marker', id: m.id })
  for (const r of plan.rooms) if (overlaps(box, { x: r.x, y: r.y, w: r.w, h: r.h })) hits.push({ type: 'room', id: r.id })
  for (const f of plan.furniture) if (overlaps(box, { x: f.x, y: f.y, w: f.w, h: f.h })) hits.push({ type: 'furniture', id: f.id })
  for (const s of plan.stairs) if (overlaps(box, { x: s.x, y: s.y, w: s.w, h: s.h })) hits.push({ type: 'stair', id: s.id })
  for (const l of plan.lights) if (overlaps(box, { x: l.x - 8, y: l.y - 8, w: 16, h: 16 })) hits.push({ type: 'light', id: l.id })
  for (const dd of plan.doors) if (overlaps(box, doorBox(dd))) hits.push({ type: 'door', id: dd.id })
  return hits
}

// The next item under a click on a stack of overlapping objects: advance from
// whatever was selected before this press, wrapping around. Returns null when
// there's nothing to cycle (0/1 hits, or the previous item isn't in the stack).
export function cycleNext(hits: Hit[], prev: SelItem | null): SelItem | null {
  if (hits.length <= 1) return null
  const idx = prev ? hits.findIndex((h) => h.item.type === prev.type && h.item.id === prev.id) : -1
  if (idx < 0) return null
  return hits[(idx + 1) % hits.length].item
}
