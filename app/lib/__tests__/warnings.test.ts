import { describe, it, expect } from 'vitest'
import { computeWarnings, computeClearance, moveInCheck, cornerAllowedLength } from '../warnings'
import { defaultPlan } from '../storage'
import type { Plan } from '../types'

const room = { id: 'r', name: 'R', x: 0, y: 0, w: 1000, h: 1000 }

describe('computeWarnings', () => {
  it('flags two overlapping solid pieces', () => {
    const plan: Plan = {
      ...defaultPlan(),
      rooms: [room],
      furniture: [
        { id: 'a', name: 'A', type: 'sofa', x: 100, y: 100, w: 100, h: 100, rotation: 0, color: '#b5714e' },
        { id: 'b', name: 'B', type: 'table', x: 150, y: 150, w: 100, h: 100, rotation: 0, color: '#b5714e' },
      ],
    }
    const w = computeWarnings(plan)
    expect(w.furniture.has('a')).toBe(true)
    expect(w.furniture.has('b')).toBe(true)
  })

  it('does not flag rugs for overlap', () => {
    const plan: Plan = {
      ...defaultPlan(),
      rooms: [room],
      furniture: [
        { id: 'rug', name: 'Rug', type: 'rug', x: 100, y: 100, w: 300, h: 200, rotation: 0, color: '#b5714e' },
        { id: 'sofa', name: 'Sofa', type: 'sofa', x: 120, y: 120, w: 100, h: 100, rotation: 0, color: '#b5714e' },
      ],
    }
    expect(computeWarnings(plan).furniture.has('rug')).toBe(false)
  })

  it('flags a piece whose centre is outside every room', () => {
    const plan: Plan = {
      ...defaultPlan(),
      rooms: [room],
      furniture: [{ id: 'out', name: 'Out', type: 'chair', x: 5000, y: 5000, w: 50, h: 50, rotation: 0, color: '#b5714e' }],
    }
    expect(computeWarnings(plan).furniture.has('out')).toBe(true)
  })

  it('flags a swing door whose arc is blocked by furniture', () => {
    const plan: Plan = {
      ...defaultPlan(),
      rooms: [room],
      doors: [{ id: 'd', type: 'swing', x: 100, y: 0, length: 80, orientation: 'h', swing: 1, hinge: 1 }],
      furniture: [{ id: 'f', name: 'F', type: 'sofa', x: 100, y: 20, w: 80, h: 80, rotation: 0, color: '#b5714e' }],
    }
    expect(computeWarnings(plan).doors.has('d')).toBe(true)
  })
})

describe('computeClearance', () => {
  it('reports a too-narrow walkway between two bulky pieces', () => {
    const plan: Plan = {
      ...defaultPlan(),
      rooms: [room],
      furniture: [
        { id: 'a', name: 'A', type: 'sofa', x: 0, y: 0, w: 100, h: 100, rotation: 0, color: '#b5714e' },
        { id: 'b', name: 'B', type: 'dresser', x: 140, y: 0, w: 100, h: 100, rotation: 0, color: '#b5714e' }, // 40cm gap < 90
      ],
    }
    const gaps = computeClearance(plan)
    expect(gaps).toHaveLength(1)
    expect(gaps[0].dist).toBe(40)
  })

  it('ignores comfortable gaps', () => {
    const plan: Plan = {
      ...defaultPlan(),
      rooms: [room],
      furniture: [
        { id: 'a', name: 'A', type: 'sofa', x: 0, y: 0, w: 100, h: 100, rotation: 0, color: '#b5714e' },
        { id: 'b', name: 'B', type: 'dresser', x: 300, y: 0, w: 100, h: 100, rotation: 0, color: '#b5714e' }, // 200cm gap
      ],
    }
    expect(computeClearance(plan)).toHaveLength(0)
  })
})

describe('moveInCheck (the Doorway Test)', () => {
  // One room (100,100)-(500,500) with a front door on the top wall.
  const oneRoom = { id: 'A', name: 'Living', x: 100, y: 100, w: 400, h: 400 }
  const frontDoor = (len: number) => ({ id: 'd', type: 'swing' as const, x: 200, y: 100, length: len, orientation: 'h' as const, swing: 1 as const, hinge: 1 as const })
  const sofa = (w: number, h: number) => ({ id: 's', name: 'Sofa', type: 'sofa' as const, x: 150, y: 200, w, h, rotation: 0, color: '#b5714e' })

  it('flags a sofa too wide for the front door as "wont"', () => {
    const plan: Plan = { ...defaultPlan(), rooms: [oneRoom], doors: [frontDoor(80)], furniture: [sofa(90, 200)] }
    const issues = moveInCheck(plan)
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ id: 's', verdict: 'wont', cross: 90, doorway: 80 })
  })

  it('passes a sofa that clears the door with room to spare', () => {
    const plan: Plan = { ...defaultPlan(), rooms: [oneRoom], doors: [frontDoor(100)], furniture: [sofa(90, 200)] }
    expect(moveInCheck(plan)).toHaveLength(0)
  })

  it('marks a barely-fitting sofa as "tight"', () => {
    const plan: Plan = { ...defaultPlan(), rooms: [oneRoom], doors: [frontDoor(95)], furniture: [sofa(90, 200)] }
    expect(moveInCheck(plan)[0]).toMatchObject({ verdict: 'tight', cross: 90, doorway: 95 })
  })

  it('uses the tightest doorway on the route into an inner room', () => {
    const living = { id: 'A', name: 'Living', x: 100, y: 100, w: 400, h: 300 } // y 100..400
    const bedroom = { id: 'B', name: 'Bedroom', x: 100, y: 400, w: 400, h: 300 } // y 400..700, shares wall at y=400
    const plan: Plan = {
      ...defaultPlan(),
      rooms: [living, bedroom],
      doors: [
        { id: 'front', type: 'swing', x: 200, y: 100, length: 90, orientation: 'h', swing: 1, hinge: 1 }, // outside → Living, 90
        { id: 'bed', type: 'swing', x: 200, y: 400, length: 75, orientation: 'h', swing: 1, hinge: 1 }, // Living → Bedroom, 75
      ],
      furniture: [{ id: 's', name: 'Sofa', type: 'sofa', x: 150, y: 450, w: 80, h: 200, rotation: 0, color: '#b5714e' }], // in Bedroom, cross 80
    }
    const issues = moveInCheck(plan)
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ verdict: 'wont', cross: 80, doorway: 75 }) // bottlenecked by the 75cm bedroom door
  })

  it('does not count windows as a way in', () => {
    const plan: Plan = {
      ...defaultPlan(),
      rooms: [oneRoom],
      doors: [{ id: 'win', type: 'window', x: 200, y: 100, length: 200, orientation: 'h', swing: 1, hinge: 1 }],
      furniture: [sofa(90, 200)],
    }
    expect(moveInCheck(plan)).toEqual([]) // no real doorway → nothing to assess
  })

  it('only checks rigid bulky pieces — skips beds, rugs, and pieces outside every room', () => {
    const plan: Plan = {
      ...defaultPlan(),
      rooms: [oneRoom],
      doors: [frontDoor(70)], // narrow door: would flag anything checked
      furniture: [
        { id: 'bed', name: 'Bed', type: 'bed', x: 150, y: 200, w: 150, h: 200, rotation: 0, color: '#b5714e' }, // tilts/knocks down → not checked
        { id: 'rug', name: 'Rug', type: 'rug', x: 150, y: 200, w: 300, h: 200, rotation: 0, color: '#b5714e' }, // rolls up
        { id: 'out', name: 'Out', type: 'sofa', x: 2000, y: 2000, w: 300, h: 90, rotation: 0, color: '#b5714e' }, // outside every room
      ],
    }
    expect(moveInCheck(plan)).toEqual([])
  })

  it('flags a rigid wardrobe too deep for the door', () => {
    const plan: Plan = {
      ...defaultPlan(),
      rooms: [oneRoom],
      doors: [frontDoor(70)],
      furniture: [{ id: 'wd', name: 'Wardrobe', type: 'wardrobe', x: 150, y: 200, w: 120, h: 75, rotation: 0, color: '#b5714e' }], // cross 75 > 70
    }
    expect(moveInCheck(plan)[0]).toMatchObject({ id: 'wd', verdict: 'wont' })
  })
})

describe('cornerAllowedLength', () => {
  it('reduces to the classic ladder-around-a-corner bound at zero width', () => {
    // max ladder length = (c1^(2/3) + c2^(2/3))^(3/2)
    const closed = (c1: number, c2: number) => Math.pow(Math.pow(c1, 2 / 3) + Math.pow(c2, 2 / 3), 3 / 2)
    expect(cornerAllowedLength(100, 100, 0)).toBeCloseTo(closed(100, 100), 0) // ≈ 282.8
    expect(cornerAllowedLength(100, 200, 0)).toBeCloseTo(closed(100, 200), 0) // ≈ 416.1
  })

  it('matches the symmetric closed form 2√2·c − 2a', () => {
    // For c1 = c2 = c the minimum is at 45°: f = 2√2·c − 2a.
    expect(cornerAllowedLength(120, 120, 95)).toBeCloseTo(2 * Math.SQRT2 * 120 - 190, 0) // ≈ 149.4
    expect(cornerAllowedLength(110, 110, 105)).toBeCloseTo(2 * Math.SQRT2 * 110 - 210, 0) // ≈ 101.1
  })

  it('is zero when the piece cannot even sit in a corridor', () => {
    expect(cornerAllowedLength(90, 120, 90)).toBe(0)
    expect(cornerAllowedLength(120, 90, 95)).toBe(0)
  })

  it('shrinks as the piece gets wider', () => {
    const c = (a: number) => cornerAllowedLength(120, 120, a)
    expect(c(50)).toBeGreaterThan(c(80))
    expect(c(80)).toBeGreaterThan(c(110))
  })
})

describe('moveInCheck v2 — corner turns', () => {
  // An L route: front door → narrow hall (120×120) → 90° bend → bedroom.
  // Hall: (0,0)-(120,120). Front door on its LEFT (vertical) wall → horizontal
  // travel. Bedroom door on its BOTTOM (horizontal) wall → vertical travel.
  const hall = { id: 'H', name: 'Hall', x: 0, y: 0, w: 120, h: 120 }
  const bedroom = { id: 'B', name: 'Bedroom', x: 0, y: 120, w: 300, h: 300 }
  const lPlan = (doorLen: number): Plan => ({
    ...defaultPlan(),
    rooms: [hall, bedroom],
    doors: [
      { id: 'front', type: 'swing', x: 0, y: 10, length: doorLen, orientation: 'v', swing: 1, hinge: 1 }, // outside → Hall
      { id: 'inner', type: 'swing', x: 10, y: 120, length: doorLen, orientation: 'h', swing: 1, hinge: 1 }, // Hall → Bedroom
    ],
    furniture: [],
  })

  it('flags a long sofa that clears every door but cannot turn the hall corner', () => {
    const plan = lPlan(100)
    plan.furniture = [{ id: 's', name: 'Sofa', type: 'sofa', x: 10, y: 200, w: 220, h: 95, rotation: 0, color: '#b5714e' }]
    const issues = moveInCheck(plan)
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ id: 's', verdict: 'turn', roomName: 'Bedroom', cross: 95, length: 220 })
    // Longest piece of width 95 that makes a 120/120 bend ≈ 2√2·120 − 190 ≈ 149.
    expect(issues[0].maxLength).toBeGreaterThan(145)
    expect(issues[0].maxLength).toBeLessThan(152)
  })

  it('passes a piece short enough to rotate through the same corner', () => {
    const plan = lPlan(100)
    plan.furniture = [{ id: 'd', name: 'Dresser', type: 'dresser', x: 10, y: 200, w: 140, h: 50, rotation: 0, color: '#b5714e' }]
    expect(moveInCheck(plan)).toHaveLength(0) // corner allows ~262 for width 50
  })

  it('lets a square-ish piece translate around a corner the rotation bound alone would flag', () => {
    // Hall 110×110, doors 115: rotation bound for a 105-wide piece is ~101 (< 105),
    // but a 105×105 piece rounds the bend by translating without rotating.
    const plan: Plan = {
      ...defaultPlan(),
      rooms: [{ id: 'H', name: 'Hall', x: 0, y: 0, w: 110, h: 110 }, { ...bedroom }],
      doors: [
        { id: 'front', type: 'swing', x: 0, y: 2, length: 106, orientation: 'v', swing: 1, hinge: 1 },
        { id: 'inner', type: 'swing', x: 2, y: 120, length: 106, orientation: 'h', swing: 1, hinge: 1 },
      ],
      furniture: [{ id: 'sq', name: 'Table', type: 'diningTable', x: 10, y: 200, w: 105, h: 105, rotation: 0, color: '#b5714e' }],
    }
    // Would be 'turn' without the translation path; it is only width-'tight' (106 − 105 ≤ 5).
    const issues = moveInCheck(plan)
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ id: 'sq', verdict: 'tight' })
  })

  it('does not invent corners on a straight-through route', () => {
    // Both doors on horizontal walls → straight run, no bend: a long sofa is fine.
    const plan: Plan = {
      ...defaultPlan(),
      rooms: [{ id: 'H', name: 'Hall', x: 0, y: 0, w: 120, h: 120 }, { ...bedroom }],
      doors: [
        { id: 'front', type: 'swing', x: 10, y: 0, length: 110, orientation: 'h', swing: 1, hinge: 1 }, // outside → Hall (top)
        { id: 'inner', type: 'swing', x: 10, y: 120, length: 110, orientation: 'h', swing: 1, hinge: 1 }, // Hall → Bedroom (bottom)
      ],
      furniture: [{ id: 's', name: 'Sofa', type: 'sofa', x: 10, y: 200, w: 220, h: 95, rotation: 0, color: '#b5714e' }],
    }
    expect(moveInCheck(plan)).toHaveLength(0)
  })

  it('reports the turn failure instead of a mere width-"tight"', () => {
    const plan = lPlan(100)
    plan.furniture = [{ id: 's', name: 'Sofa', type: 'sofa', x: 10, y: 200, w: 220, h: 97, rotation: 0, color: '#b5714e' }] // 100−97 ≤ 5 → tight by width, but the corner is the real story
    const issues = moveInCheck(plan)
    expect(issues).toHaveLength(1)
    expect(issues[0].verdict).toBe('turn')
  })
})
