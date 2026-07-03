import { describe, it, expect } from 'vitest'
import { snap, clamp, overlaps, pointInPolygon, roomCorners, bboxOf, bboxHalf, snapDoorToWalls, resizeRect } from '../geometry'
import type { Room } from '../types'

describe('snap / clamp', () => {
  it('snaps to the nearest 10cm by default', () => {
    expect(snap(13)).toBe(10)
    expect(snap(16)).toBe(20)
    expect(snap(25, 50)).toBe(50)
  })
  it('clamps into range', () => {
    expect(clamp(5, 0, 10)).toBe(5)
    expect(clamp(-1, 0, 10)).toBe(0)
    expect(clamp(99, 0, 10)).toBe(10)
  })
})

describe('overlaps', () => {
  it('detects overlap and non-overlap', () => {
    expect(overlaps({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 })).toBe(true)
    expect(overlaps({ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 0, w: 10, h: 10 })).toBe(false)
  })
  it('treats edge-touching as non-overlap', () => {
    expect(overlaps({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 })).toBe(false)
  })
})

describe('pointInPolygon', () => {
  const square = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ]
  it('is true inside and false outside', () => {
    expect(pointInPolygon(5, 5, square)).toBe(true)
    expect(pointInPolygon(15, 5, square)).toBe(false)
  })
})

describe('roomCorners / bboxOf', () => {
  it('returns rect corners for a plain room', () => {
    const r: Room = { id: 'r', name: 'R', x: 10, y: 20, w: 100, h: 50 }
    const c = roomCorners(r)
    expect(c).toHaveLength(4)
    expect(bboxOf(c)).toEqual({ x: 10, y: 20, w: 100, h: 50 })
  })
  it('uses the polygon points when present', () => {
    const r: Room = { id: 'r', name: 'R', x: 0, y: 0, w: 0, h: 0, points: [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 0, y: 40 }] }
    expect(roomCorners(r)).toHaveLength(3)
    expect(bboxOf(roomCorners(r))).toEqual({ x: 0, y: 0, w: 30, h: 40 })
  })
})

describe('bboxHalf', () => {
  it('is w/2,h/2 at 0deg and swaps at 90deg', () => {
    expect(bboxHalf(200, 100, 0)).toEqual({ hw: 100, hh: 50 })
    const r90 = bboxHalf(200, 100, 90)
    expect(r90.hw).toBeCloseTo(50)
    expect(r90.hh).toBeCloseTo(100)
  })
})

describe('snapDoorToWalls', () => {
  const rooms: Room[] = [{ id: 'r', name: 'R', x: 100, y: 100, w: 400, h: 300 }]
  it('returns null with no rooms', () => {
    expect(snapDoorToWalls(0, 0, 80, [])).toBeNull()
  })
  it('snaps a point near the top wall onto that horizontal wall', () => {
    const s = snapDoorToWalls(300, 105, 80, rooms)
    expect(s).not.toBeNull()
    expect(s!.orientation).toBe('h')
    expect(s!.y).toBe(100)
  })
  it('keeps the opening within the wall span', () => {
    const s = snapDoorToWalls(490, 105, 80, rooms)! // near the right end of the top wall
    expect(s.x + 80).toBeLessThanOrEqual(500)
  })
})

describe('resizeRect', () => {
  it('grows the right edge while anchoring the left', () => {
    const out = resizeRect(0, 0, 100, 100, 0, 1, 0, 200, 50, 20)
    expect(out.x).toBe(0)
    expect(out.w).toBe(200)
    expect(out.h).toBe(100)
  })
  it('never shrinks below the minimum size', () => {
    const out = resizeRect(0, 0, 100, 100, 0, 1, 0, 5, 50, 20)
    expect(out.w).toBeGreaterThanOrEqual(20)
  })
})
