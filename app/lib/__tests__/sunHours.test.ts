import { describe, it, expect } from 'vitest'
import type { Plan, Furniture, Door } from '../types'
import { defaultPlan } from '../storage'
import { computeSunHoursLayer } from '../layers/sunHours'
import { getLayer, computeActiveLayers } from '../layers/registry'

const piece = (over: Partial<Furniture> & Pick<Furniture, 'id' | 'type'>): Furniture => ({
  name: over.name ?? over.id,
  x: 0, y: 0, w: 100, h: 100, rotation: 0, color: '#b5714e',
  ...over,
})
const base = (over: Partial<Plan>): Plan => ({ ...defaultPlan(), northDeg: 0, latitude: 40, doors: [], furniture: [], ...over })
// Total lit floor area from the heatmap rects.
const litArea = (res: ReturnType<typeof computeSunHoursLayer>) =>
  res.overlays.reduce((a, o) => (o.kind === 'rect' ? a + o.w * o.h : a), 0)
const peakHours = (res: ReturnType<typeof computeSunHoursLayer>) => {
  const m = res.panelRows.find((r) => r.id === '__peak__')?.detail?.match(/up to (\d+)h/)
  return m ? Number(m[1]) : 0
}
// A room with a wide window on its south (bottom) wall — faces the midday sun.
const sunnyRoom = (over: Partial<Plan> = {}): Plan =>
  base({
    rooms: [{ id: 'r', name: 'Room', x: 0, y: 0, w: 400, h: 300 }],
    doors: [{ id: 'win', type: 'window', x: 40, y: 300, length: 320, orientation: 'h', swing: 1, hinge: 1 }] as Door[],
    ...over,
  })

describe('L3 sun-hours heatmap', () => {
  it('lights the floor through a sun-facing window', () => {
    const res = computeSunHoursLayer(sunnyRoom())
    expect(peakHours(res)).toBeGreaterThan(0)
    expect(litArea(res)).toBeGreaterThan(0)
    expect(res.overlays.some((o) => o.kind === 'rect')).toBe(true)
    expect(res.panelRows.find((r) => r.id === 'room-r')?.detail).toMatch(/direct sun/)
  })

  it('needs a window — bare rooms get a hint', () => {
    const res = computeSunHoursLayer(base({ rooms: [{ id: 'r', name: 'R', x: 0, y: 0, w: 400, h: 300 }] }))
    expect(res.panelRows[0]).toMatchObject({ id: '__nowin__' })
    expect(res.overlays).toHaveLength(0)
  })

  it('returns a no-rooms note when empty', () => {
    expect(computeSunHoursLayer(base({ rooms: [] })).panelRows[0]).toMatchObject({ id: '__norooms__' })
  })

  it('casts furniture shadow — a piece blocking the window shades the floor behind it', () => {
    const open = computeSunHoursLayer(sunnyRoom())
    const blocked = computeSunHoursLayer(
      sunnyRoom({
        // a full-width wardrobe pressed against the window sill
        furniture: [piece({ id: 'wd', name: 'Wardrobe', type: 'wardrobe', x: 40, y: 250, w: 320, h: 45 })],
      }),
    )
    expect(litArea(blocked)).toBeLessThan(litArea(open))
  })

  it('shortens sun-hours in winter vs summer (shorter days)', () => {
    const summer = computeSunHoursLayer(sunnyRoom({ sunSeason: 'summer' }))
    const winter = computeSunHoursLayer(sunnyRoom({ sunSeason: 'winter' }))
    expect(peakHours(summer)).toBeGreaterThan(peakHours(winter))
  })

  it('flags afternoon glare on a TV in the sunbeam', () => {
    const plan = base({
      rooms: [{ id: 'r', name: 'R', x: 0, y: 0, w: 400, h: 250 }],
      doors: [{ id: 'win', type: 'window', x: 20, y: 250, length: 360, orientation: 'h', swing: 1, hinge: 1 }] as Door[],
      furniture: [piece({ id: 'tv', name: 'TV', type: 'tv', x: 170, y: 90, w: 60, h: 40 })],
    })
    const res = computeSunHoursLayer(plan)
    const glare = res.panelRows.find((r) => r.id === 'glare-tv')
    expect(glare).toMatchObject({ tone: 'warn', targetId: 'tv' })
    expect(glare?.detail).toContain('TV')
  })
})

describe('sun-hours is a distinct registered layer', () => {
  it('is in the registry and runs independently', () => {
    expect(getLayer('sun-hours')?.label).toBe('Sun-hours heatmap')
    const plan = sunnyRoom({ layers: ['sun-hours'] })
    expect(computeActiveLayers(plan).map((l) => l.id)).toEqual(['sun-hours'])
  })
})
