import { describe, it, expect } from 'vitest'
import type { Plan, Furniture, Door } from '../types'
import { defaultPlan } from '../storage'
import { buildWalkGrid, nearestWalkable, findPath, cellCenter, solidWalls } from '../layers/walkGrid'
import { computeFlowLayer } from '../layers/flow'

const piece = (over: Partial<Furniture> & Pick<Furniture, 'id' | 'type'>): Furniture => ({
  name: over.name ?? over.id,
  x: 0, y: 0, w: 100, h: 100, rotation: 0, color: '#b5714e',
  ...over,
})
const base = (over: Partial<Plan>): Plan => ({ ...defaultPlan(), doors: [], furniture: [], ...over })
const walkableAt = (g: ReturnType<typeof buildWalkGrid>, x: number, y: number) => {
  const cx = Math.floor((x - g.ox) / g.cell)
  const cy = Math.floor((y - g.oy) / g.cell)
  return g.walkable[cy * g.cols + cx]
}

describe('walkGrid', () => {
  it('marks room interior walkable and furniture footprints not', () => {
    const g = buildWalkGrid(base({ rooms: [{ id: 'r', name: 'R', x: 0, y: 0, w: 400, h: 400 }], furniture: [piece({ id: 's', type: 'sofa', x: 100, y: 100, w: 120, h: 120 })] }))
    expect(g.cols).toBeGreaterThan(0)
    expect(walkableAt(g, 50, 50)).toBe(1) // free floor
    expect(walkableAt(g, 160, 160)).toBe(0) // inside the sofa
    expect(walkableAt(g, 402, 200)).toBe(0) // in the padded grid but past the wall
  })

  it('does not let a rug block the floor', () => {
    const g = buildWalkGrid(base({ rooms: [{ id: 'r', name: 'R', x: 0, y: 0, w: 400, h: 400 }], furniture: [piece({ id: 'rug', type: 'rug', x: 100, y: 100, w: 200, h: 200 })] }))
    expect(walkableAt(g, 200, 200)).toBe(1)
  })

  it('cuts door openings out of the shared wall, leaving the jambs solid', () => {
    const plan = base({
      rooms: [{ id: 'A', name: 'A', x: 0, y: 0, w: 200, h: 200 }, { id: 'B', name: 'B', x: 200, y: 0, w: 200, h: 200 }],
      doors: [{ id: 'd', type: 'swing', x: 200, y: 80, length: 80, orientation: 'v', swing: 1, hinge: 1 }],
    })
    const walls = solidWalls(plan)
    // On the x=200 wall, y∈[80,160] must be a gap; y=40 and y=180 stay solid.
    const onSharedWall = walls.filter((w) => Math.abs(w.x1 - 200) < 1 && Math.abs(w.x2 - 200) < 1)
    const covers = (y: number) => onSharedWall.some((w) => y >= Math.min(w.y1, w.y2) - 0.01 && y <= Math.max(w.y1, w.y2) + 0.01)
    expect(covers(40)).toBe(true)
    expect(covers(120)).toBe(false) // the doorway
    expect(covers(180)).toBe(true)
  })

  it('cannot path between two rooms with no door between them', () => {
    const g = buildWalkGrid(base({ rooms: [{ id: 'A', name: 'A', x: 0, y: 0, w: 200, h: 200 }, { id: 'B', name: 'B', x: 200, y: 0, w: 200, h: 200 }] }))
    const a = nearestWalkable(g, 100, 100)
    const b = nearestWalkable(g, 300, 100)
    expect(a).toBeGreaterThanOrEqual(0)
    expect(b).toBeGreaterThanOrEqual(0)
    expect(findPath(g, a, b)).toBeNull() // the shared wall is solid everywhere
  })

  it('paths between two rooms through a connecting door', () => {
    const g = buildWalkGrid(base({
      rooms: [{ id: 'A', name: 'A', x: 0, y: 0, w: 200, h: 200 }, { id: 'B', name: 'B', x: 200, y: 0, w: 200, h: 200 }],
      doors: [{ id: 'd', type: 'swing', x: 200, y: 80, length: 80, orientation: 'v', swing: 1, hinge: 1 }],
    }))
    const path = findPath(g, nearestWalkable(g, 100, 100), nearestWalkable(g, 300, 100))
    expect(path).not.toBeNull()
    // Every step of the route crosses the shared wall only within the doorway.
    const pts = (path as number[]).map((c) => cellCenter(g, c % g.cols, (c / g.cols) | 0))
    const crossings = pts.filter((p) => Math.abs(p.x - 200) < g.cell)
    for (const p of crossings) expect(p.y).toBeGreaterThan(70), expect(p.y).toBeLessThan(170)
  })

  it('nearestWalkable snaps a piece centre to an adjacent free cell', () => {
    const g = buildWalkGrid(base({ rooms: [{ id: 'r', name: 'R', x: 0, y: 0, w: 400, h: 400 }], furniture: [piece({ id: 's', type: 'sofa', x: 100, y: 100, w: 120, h: 120 })] }))
    const i = nearestWalkable(g, 160, 160) // inside the sofa
    expect(i).toBeGreaterThanOrEqual(0)
    expect(g.walkable[i]).toBe(1)
  })
})

describe('L2 flow layer', () => {
  it('returns a no-rooms note when there is nothing to route over', () => {
    const res = computeFlowLayer(base({ rooms: [] }))
    expect(res.panelRows[0]).toMatchObject({ id: '__norooms__', tone: 'ok' })
    expect(res.overlays).toHaveLength(0)
  })

  it('traces a clear bed → bathroom route with a length', () => {
    const plan = base({
      units: 'metric',
      rooms: [{ id: 'BR', name: 'Bedroom', x: 0, y: 0, w: 300, h: 300 }, { id: 'BA', name: 'Bath', x: 300, y: 0, w: 200, h: 300 }],
      doors: [{ id: 'd', type: 'swing', x: 300, y: 110, length: 90, orientation: 'v', swing: 1, hinge: 1 }],
      furniture: [
        piece({ id: 'bed', name: 'Bed', type: 'bed', x: 40, y: 40, w: 150, h: 200 }),
        piece({ id: 'wc', name: 'Toilet', type: 'toilet', x: 360, y: 60, w: 40, h: 60 }),
      ],
    })
    const res = computeFlowLayer(plan)
    const row = res.panelRows.find((r) => r.label === 'Bed → Bathroom')
    expect(row).toBeDefined()
    expect(row?.tone).toBe('ok')
    expect(row?.detail).toContain('clear')
    expect(res.overlays.some((o) => o.kind === 'path')).toBe(true)
    expect(res.overlays.some((o) => o.kind === 'badge')).toBe(true)
  })

  it('flags a pinch point and names the piece that squeezes the route', () => {
    const plan = base({
      units: 'metric',
      rooms: [{ id: 'R', name: 'Room', x: 0, y: 0, w: 600, h: 300 }],
      doors: [{ id: 'e', type: 'swing', x: 0, y: 110, length: 80, orientation: 'v', swing: 1, hinge: 1 } as Door],
      furniture: [
        piece({ id: 'fr', name: 'Fridge', type: 'fridge', x: 540, y: 120, w: 60, h: 60 }),
        piece({ id: 'sa', name: 'Shelf A', type: 'bookshelf', x: 280, y: 0, w: 60, h: 120 }),
        piece({ id: 'sb', name: 'Shelf B', type: 'bookshelf', x: 280, y: 170, w: 60, h: 130 }), // gap y120..170 = 50cm
      ],
    })
    const res = computeFlowLayer(plan)
    const row = res.panelRows.find((r) => r.label === 'Entry → Kitchen')
    expect(row).toBeDefined()
    expect(row?.tone).toBe('warn')
    expect(row?.detail).toMatch(/squeezes to/)
    expect(row?.detail).toContain('Shelf')
    expect(res.warnings.length).toBe(1)
    expect(res.overlays.some((o) => o.kind === 'polygon')).toBe(true) // the pinch diamond
  })

  it('reports no clear path when rooms are not connected by a door', () => {
    const plan = base({
      rooms: [{ id: 'BR', name: 'Bedroom', x: 0, y: 0, w: 300, h: 300 }, { id: 'BA', name: 'Bath', x: 300, y: 0, w: 200, h: 300 }],
      furniture: [
        piece({ id: 'bed', name: 'Bed', type: 'bed', x: 40, y: 40, w: 150, h: 200 }),
        piece({ id: 'wc', name: 'Toilet', type: 'toilet', x: 360, y: 60, w: 40, h: 60 }),
      ],
    })
    const row = computeFlowLayer(plan).panelRows.find((r) => r.label === 'Bed → Bathroom')
    expect(row).toMatchObject({ tone: 'bad' })
  })
})
