import { describe, it, expect } from 'vitest'
import type { Plan, Furniture } from '../types'
import { defaultPlan } from '../storage'
import { computeBudget, computeBudgetLayer, buildBudgetCsv } from '../layers/budget'
import { getLayer, computeActiveLayers } from '../layers/registry'

const piece = (over: Partial<Furniture> & Pick<Furniture, 'id' | 'type'>): Furniture => ({
  name: over.name ?? over.id,
  x: 0, y: 0, w: 100, h: 100, rotation: 0, color: '#b5714e',
  ...over,
})
const roomA = { id: 'A', name: 'Living', x: 0, y: 0, w: 400, h: 400 }
const roomB = { id: 'B', name: 'Bedroom', x: 400, y: 0, w: 400, h: 400 }
const base = (furniture: Furniture[], over: Partial<Plan> = {}): Plan => ({ ...defaultPlan(), rooms: [roomA, roomB], furniture, ...over })

const sample = () =>
  base([
    piece({ id: 'sofa', name: 'Sofa', type: 'sofa', x: 40, y: 40, w: 200, h: 90, price: 800 }),
    piece({ id: 'bed', name: 'Bed', type: 'bed', x: 40, y: 200, w: 150, h: 200, price: 1200, owned: true }),
    piece({ id: 'desk', name: 'Desk', type: 'desk', x: 440, y: 40, w: 140, h: 70, price: 300 }),
    piece({ id: 'lamp', name: 'Lamp', type: 'lamp', x: 600, y: 200, w: 40, h: 40 }), // no price
    piece({ id: 'box', name: 'Boxes', type: 'box', x: 5000, y: 5000, w: 60, h: 60, price: 100 }), // unplaced
  ])

describe('computeBudget', () => {
  it('bills materials per room and excludes owned pieces from "to buy"', () => {
    const b = computeBudget(sample())
    const A = b.rooms.find((r) => r.id === 'A')!
    const B = b.rooms.find((r) => r.id === 'B')!
    expect(A).toMatchObject({ subtotal: 2000, toBuy: 800 }) // bed is owned → not "to buy"
    expect(B).toMatchObject({ subtotal: 300, toBuy: 300 })
    expect(b.totalCost).toBe(2400)
    expect(b.ownedCost).toBe(1200)
    expect(b.toBuy).toBe(1200) // sofa 800 + desk 300 + unplaced box 100
  })

  it('skips rooms with no priced/owned furniture', () => {
    const b = computeBudget(base([piece({ id: 'l', type: 'lamp', x: 600, y: 200, w: 40, h: 40 })]))
    expect(b.rooms).toHaveLength(0)
  })

  it('estimates a move volume and a truck size', () => {
    const b = computeBudget(sample())
    expect(b.volume).toBeGreaterThan(4)
    expect(b.truck).toBe('a 10 ft box truck') // ~4.6 m³ lands in the 3–8 bucket
  })
})

describe('computeBudgetLayer', () => {
  it('hints when nothing is priced', () => {
    const res = computeBudgetLayer(base([piece({ id: 'l', type: 'lamp', x: 600, y: 200, w: 40, h: 40 })]))
    expect(res.panelRows.some((r) => r.id === '__noprice__')).toBe(true)
  })

  it('reports per-room, still-to-buy and truck rows, and tags priced pieces', () => {
    const res = computeBudgetLayer(sample())
    expect(res.panelRows.find((r) => r.id === 'room-A')?.detail).toContain('$2,000')
    expect(res.panelRows.find((r) => r.id === 'room-A')?.detail).toContain('to buy')
    expect(res.panelRows.find((r) => r.id === '__tobuy__')).toMatchObject({ tone: 'warn', detail: '$1,200' })
    expect(res.panelRows.find((r) => r.id === '__owned__')?.detail).toBe('$1,200')
    expect(res.panelRows.some((r) => r.id === '__truck__')).toBe(true)
    // one price badge per priced piece (4 of 5; the lamp has no price)
    expect(res.overlays.filter((o) => o.kind === 'badge')).toHaveLength(4)
  })

  it('shows "all owned" for a room whose pieces are all owned', () => {
    const res = computeBudgetLayer(base([piece({ id: 'bed', type: 'bed', x: 40, y: 40, w: 150, h: 200, price: 900, owned: true })]))
    expect(res.panelRows.find((r) => r.id === 'room-A')?.detail).toContain('all owned')
    expect(res.panelRows.find((r) => r.id === '__tobuy__')).toMatchObject({ tone: 'ok', detail: '$0' })
  })

  it('compares against a set budget', () => {
    const res = computeBudgetLayer(base(sample().furniture, { budget: 1000 }))
    const row = res.panelRows.find((r) => r.id === '__budget__')
    expect(row?.tone).toBe('bad') // to-buy 1200 > 1000
    expect(row?.detail).toContain('over')
  })
})

describe('buildBudgetCsv', () => {
  it('produces a header, item rows and a totals block', () => {
    const csv = buildBudgetCsv(sample())
    const lines = csv.split('\n')
    expect(lines[0]).toBe('Room,Item,Type,Width_cm,Depth_cm,Price,Owned,Volume_m3')
    expect(csv).toContain('"Sofa"')
    expect(csv).toContain(',800,')
    expect(csv).toContain('"(unplaced)"') // the box outside any room
    expect(csv).toMatch(/"TOTAL",.*,2400,/)
  })

  it('quotes and escapes names with commas/quotes', () => {
    const csv = buildBudgetCsv(base([piece({ id: 'x', name: 'Sofa, "big"', type: 'sofa', x: 40, y: 40, w: 100, h: 100, price: 5 })]))
    expect(csv).toContain('"Sofa, ""big"""')
  })
})

describe('budget layer registration', () => {
  it('is a distinct registered layer', () => {
    expect(getLayer('budget-move')?.label).toBe('Budget & move-day')
    expect(computeActiveLayers(base(sample().furniture, { layers: ['budget-move'] })).map((l) => l.id)).toEqual(['budget-move'])
  })
})
