import { describe, it, expect } from 'vitest'
import { roomArea, inRoom, computeStats, formatArea, fitFacts } from '../stats'
import { defaultPlan } from '../storage'
import type { Plan, Room } from '../types'

describe('roomArea', () => {
  it('is w*h for a rectangle', () => {
    expect(roomArea({ id: 'r', name: 'R', x: 0, y: 0, w: 200, h: 300 })).toBe(60000)
  })
  it('uses the shoelace area for a polygon (right triangle)', () => {
    const r: Room = { id: 'r', name: 'R', x: 0, y: 0, w: 0, h: 0, points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }] }
    expect(roomArea(r)).toBe(5000)
  })
})

describe('inRoom', () => {
  const r: Room = { id: 'r', name: 'R', x: 0, y: 0, w: 100, h: 100 }
  it('is true inside, false outside', () => {
    expect(inRoom(50, 50, r)).toBe(true)
    expect(inRoom(150, 50, r)).toBe(false)
  })
})

describe('computeStats', () => {
  it('counts furniture footprint against the room it sits in and computes free %', () => {
    const plan: Plan = {
      ...defaultPlan(),
      rooms: [{ id: 'r', name: 'R', x: 0, y: 0, w: 100, h: 100 }], // 10000 cm²
      furniture: [{ id: 'f', name: 'F', type: 'sofa', x: 0, y: 0, w: 50, h: 100, rotation: 0, color: '#b5714e' }], // 5000 cm²
    }
    const s = computeStats(plan)
    expect(s.rooms[0].furnArea).toBe(5000)
    expect(s.rooms[0].freePct).toBe(50)
  })

  it('rugs cover floor but do not consume it', () => {
    const plan: Plan = {
      ...defaultPlan(),
      rooms: [{ id: 'r', name: 'R', x: 0, y: 0, w: 100, h: 100 }],
      furniture: [{ id: 'rug', name: 'Rug', type: 'rug', x: 0, y: 0, w: 100, h: 100, rotation: 0, color: '#b5714e' }],
    }
    expect(computeStats(plan).rooms[0].freePct).toBe(100)
  })

  it('sums prices into total cost', () => {
    const plan: Plan = {
      ...defaultPlan(),
      rooms: [{ id: 'r', name: 'R', x: 0, y: 0, w: 100, h: 100 }],
      furniture: [{ id: 'f', name: 'F', type: 'sofa', x: 10, y: 10, w: 20, h: 20, rotation: 0, color: '#b5714e', price: 999 }],
    }
    expect(computeStats(plan).totalCost).toBe(999)
  })
})

describe('fitFacts', () => {
  const room = { id: 'r', name: 'R', x: 0, y: 0, w: 1000, h: 1000 }
  it('counts sofa + chair seating', () => {
    const plan: Plan = {
      ...defaultPlan(),
      rooms: [room],
      furniture: [
        { id: 's', name: 'Sofa', type: 'sofa', x: 0, y: 0, w: 210, h: 90, rotation: 0, color: '#b5714e' }, // 3
        { id: 'c', name: 'Chair', type: 'chair', x: 300, y: 0, w: 60, h: 60, rotation: 0, color: '#b5714e' }, // 1
      ],
    }
    expect(fitFacts(plan)).toContain('Seats 4')
  })

  it('reports sleeps from bed width and piece count (excluding rugs)', () => {
    const plan: Plan = {
      ...defaultPlan(),
      rooms: [room],
      furniture: [
        { id: 'b', name: 'Bed', type: 'bed', x: 0, y: 0, w: 150, h: 200, rotation: 0, color: '#b5714e' }, // sleeps 2
        { id: 'rug', name: 'Rug', type: 'rug', x: 0, y: 0, w: 200, h: 140, rotation: 0, color: '#b5714e' }, // not a piece
      ],
    }
    const facts = fitFacts(plan)
    expect(facts).toContain('Sleeps 2')
    expect(facts).toContain('1 piece placed')
  })

  it('is empty for a plan with no furniture and no rooms', () => {
    expect(fitFacts({ ...defaultPlan(), rooms: [], furniture: [] })).toEqual([])
  })
})

describe('formatArea', () => {
  it('formats ft² for imperial and m² for metric', () => {
    expect(formatArea(929.0304, 'imperial')).toBe('1.0 ft²')
    expect(formatArea(10000, 'metric')).toBe('1.0 m²')
  })
})
