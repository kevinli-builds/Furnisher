import { describe, it, expect } from 'vitest'
import type { Plan, Furniture, Door, Stair } from '../types'
import { defaultPlan } from '../storage'
import { computeAccessibilityLayer } from '../layers/accessibility'
import { LAYERS, getLayer, computeActiveLayers } from '../layers/registry'

const base = (over: Partial<Plan>): Plan => ({ ...defaultPlan(), doors: [], furniture: [], stairs: [], ...over })
const hasBlueCircle = (os: ReturnType<typeof computeAccessibilityLayer>['overlays']) => os.some((o) => o.kind === 'circle' && /72, 120, 158/.test(o.stroke ?? ''))
const hasRed = (os: ReturnType<typeof computeAccessibilityLayer>['overlays']) => os.some((o) => /168, 70, 60/.test((o as { stroke?: string; fill?: string }).stroke ?? (o as { fill?: string }).fill ?? ''))

describe('L6 accessibility layer', () => {
  it('passes a large empty room with a 150cm turning circle', () => {
    const res = computeAccessibilityLayer(base({ rooms: [{ id: 'r', name: 'Living', x: 0, y: 0, w: 400, h: 400 }] }))
    expect(res.panelRows[0]).toMatchObject({ id: '__ok__', tone: 'ok' })
    expect(hasBlueCircle(res.overlays)).toBe(true)
    expect(res.warnings).toEqual([])
  })

  it('flags a room with no room to turn', () => {
    const res = computeAccessibilityLayer(base({ rooms: [{ id: 'hall', name: 'Hall', x: 0, y: 0, w: 320, h: 80 }] })) // 80cm wide corridor
    const row = res.panelRows.find((r) => r.id === 'turn-hall')
    expect(row).toMatchObject({ tone: 'bad' })
    expect(row?.detail).toMatch(/No 150 cm turning circle/)
    expect(hasRed(res.overlays)).toBe(true)
    expect(res.warnings).toHaveLength(1)
  })

  it('skips small rooms (closets) from the turning check', () => {
    const res = computeAccessibilityLayer(base({ rooms: [{ id: 'c', name: 'Closet', x: 0, y: 0, w: 100, h: 100 }] })) // 1m² < 2.5m²
    expect(res.panelRows.some((r) => r.id.startsWith('turn-'))).toBe(false)
  })

  it('flags a doorway below the 81cm minimum but not a wide one', () => {
    const res = computeAccessibilityLayer(
      base({
        rooms: [{ id: 'r', name: 'R', x: 0, y: 0, w: 400, h: 400 }],
        doors: [
          { id: 'narrow', type: 'swing', x: 40, y: 0, length: 75, orientation: 'h', swing: 1, hinge: 1 },
          { id: 'wide', type: 'swing', x: 200, y: 0, length: 90, orientation: 'h', swing: 1, hinge: 1 },
        ] as Door[],
      }),
    )
    const doorRows = res.panelRows.filter((r) => r.id.startsWith('door-'))
    expect(doorRows).toHaveLength(1)
    expect(doorRows[0].id).toBe('door-narrow')
    expect(doorRows[0].detail).toMatch(/step-free minimum/)
  })

  it('does not count a window as a doorway', () => {
    const res = computeAccessibilityLayer(
      base({
        rooms: [{ id: 'r', name: 'R', x: 0, y: 0, w: 400, h: 400 }],
        doors: [{ id: 'win', type: 'window', x: 40, y: 0, length: 60, orientation: 'h', swing: 1, hinge: 1 }] as Door[],
      }),
    )
    expect(res.panelRows.some((r) => r.id.startsWith('door-'))).toBe(false)
  })

  it('flags stairs as not step-free (counting flights, not objects)', () => {
    const stairs: Stair[] = [
      { id: 's1', link: 'L', role: 'entry', x: 50, y: 50, w: 100, h: 100, rotation: 0 },
      { id: 's2', link: 'L', role: 'exit', x: 300, y: 50, w: 100, h: 100, rotation: 0 },
    ]
    const res = computeAccessibilityLayer(base({ rooms: [{ id: 'r', name: 'R', x: 0, y: 0, w: 400, h: 400 }], stairs }))
    const row = res.panelRows.find((r) => r.id === '__stairs__')
    expect(row).toMatchObject({ tone: 'warn' })
    expect(row?.detail).toContain('1 flight') // one linked pair
    expect(res.panelRows.some((r) => r.id === '__ok__')).toBe(false) // stairs suppress the all-clear
  })

  it('returns a no-rooms note when empty', () => {
    expect(computeAccessibilityLayer(base({ rooms: [] })).panelRows[0]).toMatchObject({ id: '__norooms__' })
  })
})

describe('accessibility is a separate, independent layer', () => {
  it('is registered distinctly from flow-paths', () => {
    expect(getLayer('accessibility')?.label).toBe('Accessibility')
    expect(getLayer('flow-paths')).toBeDefined()
    expect(LAYERS.map((l) => l.id)).toContain('accessibility')
  })

  it('runs only when its own id is active — not implied by flow-paths', () => {
    const plan = base({ rooms: [{ id: 'r', name: 'R', x: 0, y: 0, w: 400, h: 400 }], layers: ['accessibility'] })
    const active = computeActiveLayers(plan)
    expect(active.map((l) => l.id)).toEqual(['accessibility'])

    const flowOnly = computeActiveLayers({ ...plan, layers: ['flow-paths'] })
    expect(flowOnly.map((l) => l.id)).toEqual(['flow-paths']) // accessibility does NOT come along
  })
})
