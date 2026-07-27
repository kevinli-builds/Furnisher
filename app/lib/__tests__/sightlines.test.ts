import { describe, it, expect } from 'vitest'
import type { Plan, Furniture, Door } from '../types'
import { defaultPlan } from '../storage'
import { computeSightlinesLayer } from '../layers/sightlines'
import { getLayer, computeActiveLayers } from '../layers/registry'

const piece = (over: Partial<Furniture> & Pick<Furniture, 'id' | 'type'>): Furniture => ({
  name: over.name ?? over.id,
  x: 0, y: 0, w: 100, h: 100, rotation: 0, color: '#b5714e',
  ...over,
})
const base = (over: Partial<Plan>): Plan => ({ ...defaultPlan(), doors: [], furniture: [], ...over })
const rowFor = (res: ReturnType<typeof computeSightlinesLayer>, frag: string) => res.panelRows.find((r) => (r.detail ?? '').includes(frag) || r.label.includes(frag))

describe('L5 privacy sightlines', () => {
  it('flags a bed visible from the front door across an open room', () => {
    const plan = base({
      rooms: [{ id: 'r', name: 'Studio', x: 0, y: 0, w: 500, h: 400 }],
      doors: [{ id: 'd', type: 'swing', x: 0, y: 150, length: 90, orientation: 'v', swing: 1, hinge: 1 }] as Door[],
      furniture: [piece({ id: 'bed', name: 'Bed', type: 'bed', x: 300, y: 150, w: 150, h: 100 })],
    })
    const res = computeSightlinesLayer(plan)
    const row = res.panelRows.find((r) => r.targetId === 'bed')
    expect(row).toMatchObject({ tone: 'warn' })
    expect(row?.detail).toContain('the front door')
    expect(res.overlays.some((o) => o.kind === 'path')).toBe(true)
  })

  it('does not flag a bed screened by a wall (no door between)', () => {
    const plan = base({
      rooms: [{ id: 'A', name: 'Hall', x: 0, y: 0, w: 250, h: 400 }, { id: 'B', name: 'Bedroom', x: 250, y: 0, w: 250, h: 400 }],
      doors: [{ id: 'd', type: 'swing', x: 0, y: 150, length: 90, orientation: 'v', swing: 1, hinge: 1 }] as Door[],
      furniture: [piece({ id: 'bed', name: 'Bed', type: 'bed', x: 320, y: 150, w: 150, h: 100 })],
    })
    const res = computeSightlinesLayer(plan)
    expect(res.panelRows.some((r) => r.targetId === 'bed')).toBe(false)
    expect(res.panelRows.some((r) => r.id === '__private__')).toBe(true)
  })

  it('does not flag a bed hidden behind furniture', () => {
    const plan = base({
      rooms: [{ id: 'r', name: 'Studio', x: 0, y: 0, w: 500, h: 400 }],
      doors: [{ id: 'd', type: 'swing', x: 0, y: 150, length: 90, orientation: 'v', swing: 1, hinge: 1 }] as Door[],
      furniture: [
        piece({ id: 'bed', name: 'Bed', type: 'bed', x: 350, y: 150, w: 150, h: 100 }),
        piece({ id: 'wd', name: 'Wardrobe', type: 'wardrobe', x: 180, y: 110, w: 60, h: 180 }), // screens the line of sight
      ],
    })
    expect(computeSightlinesLayer(plan).panelRows.some((r) => r.targetId === 'bed')).toBe(false)
  })

  it('flags a toilet visible from a window', () => {
    const plan = base({
      rooms: [{ id: 'r', name: 'Bath', x: 0, y: 0, w: 400, h: 400 }],
      doors: [{ id: 'w', type: 'window', x: 150, y: 0, length: 100, orientation: 'h', swing: 1, hinge: 1 }] as Door[],
      furniture: [piece({ id: 'wc', name: 'Toilet', type: 'toilet', x: 180, y: 200, w: 40, h: 60 })],
    })
    const row = computeSightlinesLayer(plan).panelRows.find((r) => r.targetId === 'wc')
    expect(row?.detail).toContain('a window')
  })
})

describe('L5 TV viewing', () => {
  it('reads the screen size and judges the viewing distance', () => {
    const plan = base({
      rooms: [{ id: 'r', name: 'Living', x: 0, y: 0, w: 500, h: 300 }],
      furniture: [
        piece({ id: 'tv', name: 'TV', type: 'tv', x: 200, y: 10, w: 120, h: 25 }), // ~54"
        piece({ id: 'sofa', name: 'Sofa', type: 'sofa', x: 180, y: 220, w: 220, h: 90 }),
      ],
    })
    const res = computeSightlinesLayer(plan)
    const row = res.panelRows.find((r) => r.targetId === 'tv')
    expect(row?.label).toContain('54')
    expect(row?.detail).toMatch(/comfortable|close|far/)
    expect(res.overlays.some((o) => o.kind === 'path')).toBe(true)
  })

  it('flags a TV that is too close for its size', () => {
    const plan = base({
      rooms: [{ id: 'r', name: 'Living', x: 0, y: 0, w: 500, h: 300 }],
      furniture: [
        piece({ id: 'tv', name: 'TV', type: 'tv', x: 200, y: 10, w: 160, h: 25 }), // big screen ~72"
        piece({ id: 'sofa', name: 'Sofa', type: 'sofa', x: 200, y: 70, w: 200, h: 90 }), // very close
      ],
    })
    expect(computeSightlinesLayer(plan).panelRows.find((r) => r.targetId === 'tv')).toMatchObject({ tone: 'warn' })
  })

  it('notes when a TV has no seating to check', () => {
    const plan = base({ rooms: [{ id: 'r', name: 'Living', x: 0, y: 0, w: 500, h: 300 }], furniture: [piece({ id: 'tv', type: 'tv', x: 200, y: 10, w: 120, h: 25 })] })
    expect(computeSightlinesLayer(plan).panelRows.find((r) => r.targetId === 'tv')?.detail).toContain('No seating')
  })
})

describe('L5 registration', () => {
  it('returns a note with nothing to check and is a distinct layer', () => {
    expect(computeSightlinesLayer(base({ rooms: [{ id: 'r', name: 'R', x: 0, y: 0, w: 300, h: 300 }] })).panelRows[0]).toMatchObject({ id: '__none__' })
    expect(getLayer('sightlines')?.label).toBe('Sightlines & privacy')
    const plan = base({ rooms: [{ id: 'r', name: 'R', x: 0, y: 0, w: 300, h: 300 }], layers: ['sightlines'] })
    expect(computeActiveLayers(plan).map((l) => l.id)).toEqual(['sightlines'])
  })
})
