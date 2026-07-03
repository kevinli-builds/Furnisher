import { describe, it, expect } from 'vitest'
import { diffPlan, applyOps, sanitizeOps } from '../collab'
import { defaultPlan } from '../storage'
import type { Plan } from '../types'

function planWith(over: Partial<Plan>): Plan {
  return { ...defaultPlan(), ...over }
}

describe('diffPlan / applyOps', () => {
  it('round-trips an upsert: applying the diff reproduces the next plan', () => {
    const prev = defaultPlan()
    const next = planWith({
      furniture: [{ id: 'f1', name: 'Sofa', type: 'sofa', x: 10, y: 10, w: 200, h: 90, rotation: 0, color: '#b5714e' }],
    })
    const ops = diffPlan(prev, next)
    expect(applyOps(prev, ops).furniture).toEqual(next.furniture)
  })

  it('emits a del op for a removed entity', () => {
    const prev = planWith({ rooms: [{ id: 'r1', name: 'A', x: 0, y: 0, w: 10, h: 10 }] })
    const next = planWith({ rooms: [] })
    const ops = diffPlan(prev, next)
    expect(ops).toContainEqual({ t: 'del', c: 'rooms', id: 'r1' })
  })

  it('emits a meta op only for changed meta keys', () => {
    const prev = defaultPlan()
    const next = planWith({ units: 'metric' })
    const ops = diffPlan(prev, next).filter((o) => o.t === 'meta')
    expect(ops).toHaveLength(1)
  })
})

describe('sanitizeOps — the collab trust boundary', () => {
  it('drops non-array / garbage input', () => {
    expect(sanitizeOps(null)).toEqual([])
    expect(sanitizeOps({})).toEqual([])
    expect(sanitizeOps([null, 5, 'x', {}])).toEqual([])
  })

  it('sanitizes hostile colours on incoming upsert ops (same rule as plan load)', () => {
    const ops = sanitizeOps([{ t: 'upsert', c: 'furniture', item: { id: 'f', color: 'url(http://evil.test)' } }])
    expect(ops).toHaveLength(1)
    expect((ops[0] as unknown as { item: { color: string } }).item.color).toBe('#d8c8a4')
  })

  it('rejects upserts to unknown collections and items without a string id', () => {
    expect(sanitizeOps([{ t: 'upsert', c: 'secrets', item: { id: 'x' } }])).toEqual([])
    expect(sanitizeOps([{ t: 'upsert', c: 'furniture', item: { id: 5 } }])).toEqual([])
  })

  it('whitelists meta keys — drops unknown fields from meta ops', () => {
    const ops = sanitizeOps([{ t: 'meta', fields: { units: 'metric', evil: 'x', __proto__: { polluted: true } } }])
    expect(ops).toHaveLength(1)
    const fields = (ops[0] as { fields: Record<string, unknown> }).fields
    expect(fields.units).toBe('metric')
    expect('evil' in fields).toBe(false)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })
})
