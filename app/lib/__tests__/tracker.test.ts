import { describe, it, expect } from 'vitest'
import { normalizeTrackers, TRACKER_TEMPLATES, trackerFromTemplate, newColumn, newEntry } from '../tracker'

describe('normalizeTrackers', () => {
  it('returns [] for non-array / junk input', () => {
    expect(normalizeTrackers(null)).toEqual([])
    expect(normalizeTrackers(undefined)).toEqual([])
    expect(normalizeTrackers('nope')).toEqual([])
    expect(normalizeTrackers({})).toEqual([])
    expect(normalizeTrackers(42)).toEqual([])
  })

  it('drops trackers without a string id and malformed columns/entries', () => {
    const out = normalizeTrackers([
      { name: 'no id' }, // dropped: missing id
      {
        id: 't1',
        name: 'Movies',
        columns: [{ id: 'c1', name: 'Title', type: 'text' }, { name: 'bad' /* no id */ }, 'garbage'],
        entries: [{ id: 'e1', values: { c1: 'Dune' } }, { values: {} /* no id */ }, null],
      },
    ])
    expect(out).toHaveLength(1)
    expect(out[0].columns).toHaveLength(1)
    expect(out[0].entries).toHaveLength(1)
    expect(out[0].entries[0].values.c1).toBe('Dune')
  })

  it('clamps unknown column types to text', () => {
    const out = normalizeTrackers([{ id: 't', columns: [{ id: 'c', name: 'X', type: 'wat' }], entries: [] }])
    expect(out[0].columns[0].type).toBe('text')
  })

  it('coerces non-string cell values to empty strings', () => {
    const out = normalizeTrackers([
      { id: 't', columns: [{ id: 'c', name: 'X', type: 'number' }], entries: [{ id: 'e', values: { c: 5 } }] },
    ])
    expect(out[0].entries[0].values.c).toBe('')
  })

  it('seeds a value for every column even if the entry omits it', () => {
    const out = normalizeTrackers([
      { id: 't', columns: [{ id: 'a', name: 'A', type: 'text' }, { id: 'b', name: 'B', type: 'text' }], entries: [{ id: 'e', values: { a: 'hi' } }] },
    ])
    expect(out[0].entries[0].values).toEqual({ a: 'hi', b: '' })
  })

  it('round-trips a valid tracker', () => {
    const t = { id: 't', name: 'Books', icon: '📚', columns: [{ id: 'c', name: 'Title', type: 'text' as const }], entries: [{ id: 'e', values: { c: 'Dune' } }] }
    expect(normalizeTrackers([t])).toEqual([t])
  })
})

describe('templates & factories', () => {
  it('every template has at least one column', () => {
    for (const t of TRACKER_TEMPLATES) expect(t.columns.length).toBeGreaterThan(0)
  })

  it('trackerFromTemplate produces columns with fresh ids and no entries', () => {
    const t = trackerFromTemplate(TRACKER_TEMPLATES[0])
    expect(t.columns.length).toBe(TRACKER_TEMPLATES[0].columns.length)
    expect(new Set(t.columns.map((c) => c.id)).size).toBe(t.columns.length)
    expect(t.entries).toEqual([])
  })

  it('newEntry seeds an empty string for each column id', () => {
    const cols = [newColumn('A', 'text'), newColumn('B', 'date')]
    const e = newEntry(cols)
    expect(Object.keys(e.values).sort()).toEqual(cols.map((c) => c.id).sort())
    expect(Object.values(e.values)).toEqual(['', ''])
  })
})
