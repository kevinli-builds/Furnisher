import { describe, it, expect } from 'vitest'
import type { Plan, Furniture } from '../types'
import { defaultPlan, normalizePlan } from '../storage'
import { LAYERS, getLayer, validateLayerIds, computeActiveLayers } from '../layers/registry'
import { rectCorners, apronPolygon, convexOverlap, computeClearanceLayer } from '../layers/clearance'
import { CLEARANCE_STANDARDS } from '../layers/clearanceStandards'

const room = { id: 'r', name: 'R', x: 0, y: 0, w: 1000, h: 1000 }
const piece = (over: Partial<Furniture> & Pick<Furniture, 'id' | 'type'>): Furniture => ({
  name: over.name ?? over.id,
  x: 0, y: 0, w: 100, h: 100, rotation: 0, color: '#b5714e',
  ...over,
})
const withFurniture = (furniture: Furniture[], layers = ['clearance-zones']): Plan => ({ ...defaultPlan(), rooms: [room], furniture, layers })

const bbox = (pts: { x: number; y: number }[]) => {
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
}

describe('layer registry', () => {
  it('validateLayerIds keeps only known ids, de-duplicated', () => {
    expect(validateLayerIds(['clearance-zones', 'bogus', 'clearance-zones'])).toEqual(['clearance-zones'])
    expect(validateLayerIds('nope')).toEqual([])
    expect(validateLayerIds(undefined)).toEqual([])
    expect(validateLayerIds([1, {}, null])).toEqual([])
  })

  it('getLayer resolves a registered layer', () => {
    expect(getLayer('clearance-zones')?.label).toBe('Clearance zones')
    expect(getLayer('missing')).toBeUndefined()
    expect(LAYERS.length).toBeGreaterThan(0)
  })

  it('computeActiveLayers runs only the active layers', () => {
    const plan = withFurniture([piece({ id: 'w', type: 'wardrobe', x: 100, y: 100, w: 120, h: 60 })])
    const active = computeActiveLayers(plan)
    expect(active).toHaveLength(1)
    expect(active[0].id).toBe('clearance-zones')
    expect(computeActiveLayers({ ...plan, layers: [] })).toHaveLength(0)
  })

  it('normalizePlan sanitizes stored layer ids', () => {
    expect(normalizePlan({ rooms: [], layers: ['clearance-zones', 'evil'] } as Partial<Plan>).layers).toEqual(['clearance-zones'])
    expect(normalizePlan({ rooms: [] } as Partial<Plan>).layers).toEqual([])
  })
})

describe('geometry helpers', () => {
  it('rectCorners at rotation 0 is the plain footprint', () => {
    const c = rectCorners(0, 0, 100, 50, 0)
    expect(bbox(c)).toMatchObject({ x: 0, y: 0, w: 100, h: 50 })
  })

  it('rectCorners at 90° swaps the bounding dimensions about the centre', () => {
    const c = rectCorners(0, 0, 100, 50, 90)
    const b = bbox(c)
    expect(b.w).toBeCloseTo(50)
    expect(b.h).toBeCloseTo(100)
    // centre is preserved
    expect(b.x + b.w / 2).toBeCloseTo(50)
    expect(b.y + b.h / 2).toBeCloseTo(25)
  })

  it('apronPolygon extends off the front (+y) edge when unrotated', () => {
    const wardrobe = piece({ id: 'w', type: 'wardrobe', x: 100, y: 100, w: 120, h: 60 })
    const poly = apronPolygon(wardrobe, { side: 'front', depth: 90 })
    expect(bbox(poly)).toMatchObject({ x: 100, y: 160, w: 120, h: 90 })
  })

  it('apronPolygon rotates the front apron with the piece (180° → faces -y)', () => {
    const wardrobe = piece({ id: 'w', type: 'wardrobe', x: 100, y: 100, w: 120, h: 60, rotation: 180 })
    const b = bbox(apronPolygon(wardrobe, { side: 'front', depth: 90 }))
    // centre (160,130); front now points up → apron above the piece.
    expect(b.y).toBeCloseTo(10)
    expect(b.y + b.h).toBeCloseTo(100)
  })

  it('convexOverlap: overlap true, disjoint false, edge-touching false', () => {
    const sq = (x: number, y: number) => [{ x, y }, { x: x + 10, y }, { x: x + 10, y: y + 10 }, { x, y: y + 10 }]
    expect(convexOverlap(sq(0, 0), sq(5, 5))).toBe(true)
    expect(convexOverlap(sq(0, 0), sq(30, 0))).toBe(false)
    expect(convexOverlap(sq(0, 0), sq(10, 0))).toBe(false) // flush against the edge
  })
})

describe('L1 clearance layer', () => {
  it('reports every piece clear when nothing sits in an apron', () => {
    const res = computeClearanceLayer(withFurniture([piece({ id: 'w', type: 'wardrobe', x: 100, y: 100, w: 120, h: 60 })]))
    expect(res.overlays).toHaveLength(1) // one front apron
    expect(res.overlays[0].kind).toBe('polygon')
    expect(res.warnings).toEqual([])
    expect(res.panelRows).toHaveLength(1)
    expect(res.panelRows[0]).toMatchObject({ tone: 'ok', id: '__ok__' })
  })

  it('flags a piece parked in a wardrobe’s door-swing apron', () => {
    const res = computeClearanceLayer(
      withFurniture([
        piece({ id: 'w', name: 'Wardrobe', type: 'wardrobe', x: 100, y: 100, w: 120, h: 60 }),
        piece({ id: 'x', name: 'Box', type: 'box', x: 140, y: 180, w: 50, h: 50 }), // inside front apron y∈[160,250]
      ]),
    )
    const row = res.panelRows.find((r) => r.targetId === 'w')
    expect(row).toBeDefined()
    expect(row).toMatchObject({ tone: 'bad', targetId: 'w' })
    expect(row?.detail).toContain('Box')
    expect(res.warnings).toHaveLength(1)
    // the blocked apron is tinted with the danger fill
    expect(res.overlays.some((o) => o.kind === 'polygon' && /168, 70, 60/.test(o.fill ?? ''))).toBe(true)
  })

  it('does not flag an intended neighbour (a chair in a desk’s pushback)', () => {
    const res = computeClearanceLayer(
      withFurniture([
        piece({ id: 'd', name: 'Desk', type: 'desk', x: 100, y: 100, w: 140, h: 70 }),
        piece({ id: 'c', name: 'Chair', type: 'chair', x: 150, y: 180, w: 50, h: 50 }), // in the front apron, but expected
      ]),
    )
    expect(res.panelRows.every((r) => r.tone !== 'bad')).toBe(true)
  })

  it('flags a NON-expected piece in the desk’s pushback', () => {
    const res = computeClearanceLayer(
      withFurniture([
        piece({ id: 'd', name: 'Desk', type: 'desk', x: 100, y: 100, w: 140, h: 70 }),
        piece({ id: 'b', name: 'Box', type: 'box', x: 150, y: 180, w: 50, h: 50 }),
      ]),
    )
    expect(res.panelRows.find((r) => r.targetId === 'd')).toMatchObject({ tone: 'bad' })
  })

  it('ignores flat pieces (a rug) as obstructions', () => {
    const res = computeClearanceLayer(
      withFurniture([
        piece({ id: 'w', name: 'Wardrobe', type: 'wardrobe', x: 100, y: 100, w: 120, h: 60 }),
        piece({ id: 'rug', name: 'Rug', type: 'rug', x: 100, y: 160, w: 200, h: 90 }), // over the apron, but flat
      ]),
    )
    expect(res.panelRows.every((r) => r.tone !== 'bad')).toBe(true)
  })

  it('respects rotation: a piece behind a 180°-turned wardrobe blocks its (now upward) front', () => {
    const res = computeClearanceLayer(
      withFurniture([
        piece({ id: 'w', name: 'Wardrobe', type: 'wardrobe', x: 100, y: 100, w: 120, h: 60, rotation: 180 }),
        piece({ id: 'b', name: 'Box', type: 'box', x: 100, y: 10, w: 120, h: 80 }), // above → in the flipped front apron
      ]),
    )
    expect(res.panelRows.find((r) => r.targetId === 'w')).toMatchObject({ tone: 'bad' })
  })

  it('tells the user when no piece needs clearance', () => {
    const res = computeClearanceLayer(withFurniture([piece({ id: 'c', type: 'chair', x: 100, y: 100, w: 50, h: 50 })]))
    expect(res.panelRows[0]).toMatchObject({ id: '__none__', tone: 'ok' })
    expect(res.overlays).toHaveLength(0)
  })

  it('every standard references a real furniture type with positive apron depths', () => {
    for (const [type, std] of Object.entries(CLEARANCE_STANDARDS)) {
      expect(std!.aprons.length).toBeGreaterThan(0)
      for (const ap of std!.aprons) expect(ap.depth).toBeGreaterThan(0)
      expect(typeof std!.note).toBe('string')
      expect(type.length).toBeGreaterThan(0)
    }
  })
})
