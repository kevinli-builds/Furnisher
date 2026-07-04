import { describe, it, expect } from 'vitest'
import { pointHits, objectsInMarquee, cycleNext } from '../interactions'
import { defaultPlan } from '../storage'
import type { Plan, SelItem } from '../types'

function plan(over: Partial<Plan>): Plan {
  return { ...defaultPlan(), rooms: [], doors: [], furniture: [], markers: [], stairs: [], lights: [], ...over }
}

const sofa = { id: 'f1', name: 'Sofa', type: 'sofa' as const, x: 100, y: 100, w: 200, h: 90, rotation: 0, color: '#b5714e' }
const room = { id: 'r1', name: 'Living', x: 0, y: 0, w: 400, h: 400 }

describe('pointHits', () => {
  it('returns furniture above the room it sits in (stack order)', () => {
    const hits = pointHits(plan({ rooms: [room], furniture: [sofa] }), { x: 150, y: 120 })
    expect(hits.map((h) => h.item.type)).toEqual(['furniture', 'room'])
    expect(hits[0].label).toBe('Furniture · Sofa')
  })

  it('is empty when the point is outside everything', () => {
    expect(pointHits(plan({ rooms: [room] }), { x: 999, y: 999 })).toEqual([])
  })

  it('gives lights a generous 32cm tap target around their point', () => {
    const p = plan({ lights: [{ id: 'l1', x: 100, y: 100 }] })
    expect(pointHits(p, { x: 110, y: 90 }).some((h) => h.item.type === 'light')).toBe(true)
    expect(pointHits(p, { x: 130, y: 100 }).length).toBe(0) // 30cm away → outside the 16cm half-box
  })
})

describe('objectsInMarquee', () => {
  it('selects every object the box overlaps', () => {
    const p = plan({ rooms: [room], furniture: [sofa] })
    const sel = objectsInMarquee(p, { x: 50, y: 50, w: 300, h: 300 })
    expect(sel).toEqual(expect.arrayContaining([
      { type: 'room', id: 'r1' },
      { type: 'furniture', id: 'f1' },
    ]))
  })

  it('excludes objects outside the box', () => {
    const p = plan({ furniture: [sofa] })
    expect(objectsInMarquee(p, { x: 0, y: 0, w: 10, h: 10 })).toEqual([])
  })
})

describe('cycleNext', () => {
  const hits = [
    { item: { type: 'furniture', id: 'f1' } as SelItem, label: 'a' },
    { item: { type: 'room', id: 'r1' } as SelItem, label: 'b' },
  ]
  it('advances to the next item under the stack, wrapping around', () => {
    expect(cycleNext(hits, { type: 'furniture', id: 'f1' })).toEqual({ type: 'room', id: 'r1' })
    expect(cycleNext(hits, { type: 'room', id: 'r1' })).toEqual({ type: 'furniture', id: 'f1' })
  })
  it('returns null when there is nothing to cycle', () => {
    expect(cycleNext(hits.slice(0, 1), { type: 'furniture', id: 'f1' })).toBeNull()
    expect(cycleNext(hits, null)).toBeNull()
    expect(cycleNext(hits, { type: 'light', id: 'nope' })).toBeNull()
  })
})
