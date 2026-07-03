import { describe, it, expect } from 'vitest'
import { normalizePlan, defaultPlan } from '../storage'
import type { Plan } from '../types'

// normalizePlan is the trust boundary: every plan (localStorage, cloud row,
// shared project) passes through it. These feed it malformed / hostile shapes
// and assert it always yields a complete, safe Plan without throwing.

describe('normalizePlan — resilience', () => {
  it('returns a full default plan for null / undefined / non-object', () => {
    for (const bad of [null, undefined, 42, 'x', [], true]) {
      const p = normalizePlan(bad as unknown as Partial<Plan>)
      expect(Array.isArray(p.rooms)).toBe(true)
      expect(p.width).toBeGreaterThan(0)
    }
  })

  it('falls back to default when rooms is not an array', () => {
    expect(normalizePlan({ rooms: 'nope' } as unknown as Partial<Plan>)).toEqual(defaultPlan())
  })

  it('always fills every required collection as an array', () => {
    const p = normalizePlan({ rooms: [] })
    for (const k of ['rooms', 'doors', 'furniture', 'markers', 'stairs', 'lights'] as const) {
      expect(Array.isArray(p[k])).toBe(true)
    }
    expect(Array.isArray(p.inventory.furniture)).toBe(true)
    expect(Array.isArray(p.inventory.rooms)).toBe(true)
    expect(Array.isArray(p.inventory.markers)).toBe(true)
  })

  it('does not throw on missing nested collections', () => {
    expect(() => normalizePlan({ rooms: [{ id: 'r', name: 'R', x: 0, y: 0, w: 100, h: 100 }] })).not.toThrow()
  })
})

describe('normalizePlan — sanitization', () => {
  it('strips hostile url() colours from rooms and furniture', () => {
    const p = normalizePlan({
      rooms: [{ id: 'r', name: 'R', x: 0, y: 0, w: 100, h: 100, color: 'url(http://evil.test)' }],
      furniture: [{ id: 'f', name: 'F', type: 'sofa', x: 0, y: 0, w: 100, h: 100, rotation: 0, color: 'url(http://evil.test)' }],
      inventory: { furniture: [{ id: 't', name: 'T', type: 'sofa', w: 100, h: 100, color: 'url(http://evil.test)' }], rooms: [], markers: [] },
    } as unknown as Partial<Plan>)
    expect(p.rooms[0].color).toBe('#d8c8a4')
    expect(p.furniture[0].color).toBe('#d8c8a4')
    expect(p.inventory.furniture[0].color).toBe('#d8c8a4')
  })

  it('coerces bogus enum / scalar fields to safe defaults', () => {
    const p = normalizePlan({
      rooms: [],
      units: 'klingon' as unknown as 'metric',
      viewMode: 'hologram' as unknown as 'sim',
      width: 0,
      budget: -100,
      northDeg: 'north' as unknown as number,
    } as unknown as Partial<Plan>)
    expect(p.units).toBe('imperial')
    expect(p.viewMode).toBe('sim')
    expect(p.width).toBe(1200) // 0 is falsy → falls back to default extent
    expect(p.budget).toBeUndefined() // negative budget ignored
    expect(p.northDeg).toBe(0) // non-number → 0
  })
})

describe('normalizePlan — prototype pollution', () => {
  it('does not pollute Object.prototype via __proto__ payloads', () => {
    const hostile = JSON.parse('{"rooms":[{"id":"r","name":"R","x":0,"y":0,"w":10,"h":10,"__proto__":{"polluted":true}}]}')
    normalizePlan(hostile)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  it('does not choke on huge arrays', () => {
    const rooms = Array.from({ length: 5000 }, (_, i) => ({ id: 'r' + i, name: 'R', x: 0, y: 0, w: 10, h: 10 }))
    expect(() => normalizePlan({ rooms } as unknown as Partial<Plan>)).not.toThrow()
  })
})
