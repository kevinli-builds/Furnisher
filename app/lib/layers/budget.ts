// ── L4 — Budget & move-day ───────────────────────────────────────
// The plan already knows every piece's price and footprint — turn that into a
// bill of materials per room, what's left to buy (owned vs planned), and roughly
// what size truck the move needs. Zero new geometry; a CSV export falls out.

import type { Plan, Furniture } from '../types'
import { furnitureType, type FurnitureType } from '../furniture'
import { inRoom, formatPrice } from '../stats'
import type { InsightLayer, LayerResult, Overlay, PanelRow } from './types'

// Approximate packed heights (cm) per type — the model is 2D, so volume needs a
// stand-in vertical dimension. Rough on purpose (a rug rolls, a bed knocks down);
// good enough to size a truck, and labelled as an estimate.
const HEIGHT: Record<FurnitureType, number> = {
  sofa: 90, bed: 60, chair: 95, diningTable: 75, table: 45, desk: 75, dresser: 82, wardrobe: 200,
  nightstand: 55, bookshelf: 180, rug: 6, lamp: 150, plant: 70, tv: 75, fridge: 175, stove: 90,
  sink: 85, toilet: 75, bathtub: 60, box: 45,
}

// Rough truck buckets keyed on raw bounding-box volume (m³).
const TRUCKS: Array<[number, string]> = [
  [3, 'a cargo van'],
  [8, 'a 10 ft box truck'],
  [16, 'a 15 ft truck'],
  [24, 'a 20 ft truck'],
]
function truckFor(m3: number): string {
  for (const [max, label] of TRUCKS) if (m3 <= max) return label
  return 'a 26 ft truck (maybe two trips)'
}

const pieceVolume = (f: Furniture) => (f.w * f.h * HEIGHT[furnitureType(f.type)]) / 1_000_000 // cm³ → m³

export interface BomItem {
  id: string
  name: string
  type: string
  w: number
  h: number
  price: number
  owned: boolean
  volume: number
  room: string
}
export interface Budget {
  items: BomItem[]
  rooms: Array<{ id: string; name: string; subtotal: number; toBuy: number; count: number }>
  totalCost: number
  ownedCost: number
  toBuy: number
  volume: number
  truck: string
  pricedCount: number
}

export function computeBudget(plan: Plan): Budget {
  const roomOf = (f: Furniture) => plan.rooms.find((r) => inRoom(f.x + f.w / 2, f.y + f.h / 2, r))
  const items: BomItem[] = plan.furniture.map((f) => {
    const r = roomOf(f)
    return {
      id: f.id,
      name: f.name || 'Piece',
      type: furnitureType(f.type),
      w: f.w,
      h: f.h,
      price: f.price ?? 0,
      owned: f.owned === true,
      volume: pieceVolume(f),
      room: r ? r.name || 'Room' : '(unplaced)',
    }
  })

  const byRoom = new Map<string, { id: string; name: string; subtotal: number; toBuy: number; count: number }>()
  for (const r of plan.rooms) byRoom.set(r.name || r.id, { id: r.id, name: r.name || 'Room', subtotal: 0, toBuy: 0, count: 0 })
  for (const f of plan.furniture) {
    const r = roomOf(f)
    if (!r) continue
    const key = r.name || r.id
    const row = byRoom.get(key)!
    row.subtotal += f.price ?? 0
    if (!(f.owned === true)) row.toBuy += f.price ?? 0
    if ((f.price ?? 0) > 0 || f.owned) row.count++
  }

  const totalCost = items.reduce((a, i) => a + i.price, 0)
  const ownedCost = items.reduce((a, i) => a + (i.owned ? i.price : 0), 0)
  const volume = items.reduce((a, i) => a + i.volume, 0)
  return {
    items,
    rooms: [...byRoom.values()].filter((r) => r.count > 0),
    totalCost,
    ownedCost,
    toBuy: totalCost - ownedCost,
    volume,
    truck: truckFor(volume),
    pricedCount: items.filter((i) => i.price > 0).length,
  }
}

// Overlay badge colours — CODE CONSTANTS.
const PLANNED = '#9a5d3e' // accent-dark: still to buy
const OWNED = '#8a7e6b' // muted: already own

export function computeBudgetLayer(plan: Plan): LayerResult {
  const overlays: Overlay[] = []
  const panelRows: PanelRow[] = []
  const warnings: string[] = []

  if (plan.furniture.length === 0) {
    return { overlays, panelRows: [{ id: '__none__', label: 'No furniture yet', detail: 'Add pieces (and set their prices) to build a budget.', tone: 'ok' }], warnings }
  }

  const b = computeBudget(plan)

  // Price tags on the plan, coloured by owned vs planned.
  for (const f of plan.furniture) {
    if (!f.price) continue
    overlays.push({ kind: 'badge', x: f.x + f.w / 2, y: f.y + f.h / 2, text: formatPrice(f.price), color: f.owned ? OWNED : PLANNED })
  }

  if (b.pricedCount === 0 && b.ownedCost === 0) {
    panelRows.push({ id: '__noprice__', label: 'No prices set', detail: 'Open a piece and set its Price to see the bill of materials.', tone: 'ok' })
  } else {
    for (const r of b.rooms) {
      panelRows.push({
        id: `room-${r.id}`,
        label: r.name,
        detail: `${formatPrice(r.subtotal)}${r.toBuy > 0 ? ` · ${formatPrice(r.toBuy)} to buy` : ' · all owned'}`,
        tone: 'ok',
      })
    }
    panelRows.push({ id: '__tobuy__', label: 'Still to buy', detail: formatPrice(b.toBuy), tone: b.toBuy > 0 ? 'warn' : 'ok' })
    if (b.ownedCost > 0) panelRows.push({ id: '__owned__', label: 'Already own', detail: formatPrice(b.ownedCost), tone: 'ok' })
    if (plan.budget != null) {
      const diff = plan.budget - b.toBuy
      panelRows.push({
        id: '__budget__',
        label: 'Vs budget',
        detail: `${formatPrice(plan.budget)} — ${diff >= 0 ? `${formatPrice(diff)} under` : `${formatPrice(-diff)} over`}`,
        tone: diff >= 0 ? 'ok' : 'bad',
      })
    }
    if (b.toBuy > 0) warnings.push(`${formatPrice(b.toBuy)} still to buy.`)
  }
  panelRows.push({ id: '__truck__', label: 'Move volume', detail: `~${b.volume.toFixed(1)} m³ of stuff → fits ${b.truck} (rough)`, tone: 'ok' })

  return { overlays, panelRows, warnings }
}

// A downloadable bill-of-materials CSV. Dimensions are canonical cm; price is a
// bare number; owned is yes/no. Fields are quoted + quote-escaped.
export function buildBudgetCsv(plan: Plan): string {
  const b = computeBudget(plan)
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`
  const lines = ['Room,Item,Type,Width_cm,Depth_cm,Price,Owned,Volume_m3']
  for (const i of b.items) {
    lines.push([esc(i.room), esc(i.name), esc(i.type), i.w, i.h, i.price || '', i.owned ? 'yes' : 'no', i.volume.toFixed(2)].join(','))
  }
  lines.push('')
  lines.push([esc('TOTAL'), '', '', '', '', b.totalCost, '', b.volume.toFixed(2)].join(','))
  lines.push([esc('Still to buy'), '', '', '', '', b.toBuy, '', ''].join(','))
  lines.push([esc('Already own'), '', '', '', '', b.ownedCost, '', ''].join(','))
  return lines.join('\n')
}

export const budgetLayer: InsightLayer = {
  id: 'budget-move',
  label: 'Budget & move-day',
  desc: 'Bill of materials per room, still-to-buy total, and a truck-size estimate (CSV export)',
  icon: '💰',
  compute: computeBudgetLayer,
}
