import { describe, it, expect } from 'vitest'
import { computeWarnings, computeClearance } from '../warnings'
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
