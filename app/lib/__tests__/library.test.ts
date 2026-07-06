import { describe, it, expect } from 'vitest'
import { emptyLibrary, sanitizeLibrary, mergeLibraries, type Library } from '../library'
import type { FurnTemplate } from '../types'

const piece = (id: string, extra: Partial<FurnTemplate> = {}): FurnTemplate => ({
  id,
  name: id,
  type: 'sofa',
  w: 200,
  h: 90,
  color: '#b5714e',
  ...extra,
})

describe('sanitizeLibrary', () => {
  it('falls back to an empty library for junk input', () => {
    expect(sanitizeLibrary(null)).toEqual(emptyLibrary())
    expect(sanitizeLibrary({} as Library)).toEqual(emptyLibrary())
  })
  it('neutralizes a dangerous furniture colour (SVG fill sink)', () => {
    const dirty = { furniture: [piece('a', { color: 'url(http://evil.example/x)' })], groups: ['General'] }
    const clean = sanitizeLibrary(dirty)
    expect(clean.furniture[0].color).not.toContain('url(')
  })
  it('defaults groups to General when missing/empty', () => {
    expect(sanitizeLibrary({ furniture: [] }).groups).toEqual(['General'])
    expect(sanitizeLibrary({ furniture: [], groups: [] }).groups).toEqual(['General'])
  })
})

describe('mergeLibraries', () => {
  it('unions furniture by id (keeps the local copy on a clash)', () => {
    const local: Library = { furniture: [piece('a', { name: 'local-a' }), piece('b')], groups: ['General'] }
    const cloud: Library = { furniture: [piece('a', { name: 'cloud-a' }), piece('c')], groups: ['Kitchen'] }
    const m = mergeLibraries(local, cloud)
    expect(m.furniture.map((f) => f.id).sort()).toEqual(['a', 'b', 'c'])
    expect(m.furniture.find((f) => f.id === 'a')!.name).toBe('local-a')
  })
  it('unions group names without duplicates', () => {
    const m = mergeLibraries({ furniture: [], groups: ['General', 'Kitchen'] }, { furniture: [], groups: ['Kitchen', 'Office'] })
    expect(m.groups).toEqual(['General', 'Kitchen', 'Office'])
  })
})
