import { describe, it, expect } from 'vitest'
import { compressToEncodedURIComponent } from 'lz-string'
import { packShare, unpackShare, buildShareUrl, buildMovedayUrl, parseImportHash, MOVEDAY_ORIGIN, MAX_PACKED_LENGTH } from '../share'
import { defaultPlan, normalizePlan } from '../storage'

const plan = {
  width: 1200,
  height: 900,
  rooms: [{ id: 'r1', name: 'Living Room', x: 100, y: 100, w: 500, h: 400 }],
  doors: [{ id: 'd1', type: 'swing' as const, x: 100, y: 260, length: 90, orientation: 'v' as const, swing: 1 as const, hinge: 1 as const }],
}

describe('share pack/unpack', () => {
  it('round-trips a payload', () => {
    const back = unpackShare(packShare(plan, 'Maple St 2BR', 'moveday'))
    expect(back).toMatchObject({ v: 1, source: 'moveday', name: 'Maple St 2BR' })
    expect(back!.plan).toEqual(plan)
  })

  it('rejects garbage, wrong version, and unknown sources', () => {
    expect(unpackShare('not-a-payload')).toBeNull()
    expect(unpackShare('')).toBeNull()
    const raw = JSON.stringify({ v: 2, source: 'furnisher', name: 'x', plan })
    expect(unpackShare(compressToEncodedURIComponent(raw))).toBeNull()
    const foreign = compressToEncodedURIComponent(JSON.stringify({ v: 1, source: 'elsewhere', name: 'x', plan }))
    expect(unpackShare(foreign)).toBeNull()
  })

  it('the unpacked plan survives normalizePlan (the trust boundary)', () => {
    const hostile = { ...plan, rooms: [{ ...plan.rooms[0], color: 'url(https://evil.example/x)' }] }
    const back = unpackShare(packShare(hostile, 'X', 'moveday'))!
    const normalized = normalizePlan(back.plan)
    expect(normalized.rooms[0].color).toMatch(/^#[0-9a-f]+$/i) // hostile colour replaced with a safe fallback
    expect(normalized.rooms[0]).toMatchObject({ id: 'r1', w: 500 })
  })

  it('builds and parses a full share URL', () => {
    const url = buildShareUrl('https://furnisher.vercel.app', normalizePlan(plan), 'My place')
    expect(url).toMatch(/^https:\/\/furnisher\.vercel\.app\/#import=/)
    const hash = '#' + url!.split('#')[1]
    const back = parseImportHash(hash)
    expect(back).not.toBeNull()
    expect(back!.name).toBe('My place')
  })

  it('parseImportHash ignores unrelated hashes', () => {
    expect(parseImportHash('')).toBeNull()
    expect(parseImportHash('#section-2')).toBeNull()
  })

  it('a default plan packs far under the URL budget', () => {
    expect(packShare(defaultPlan(), 'X').length).toBeLessThan(MAX_PACKED_LENGTH / 10)
  })

  it('buildMovedayUrl targets the MoveDay #plan= route and threads listingId', () => {
    const url = buildMovedayUrl(normalizePlan(plan), 'Maple St 2BR', 'listing-42')
    expect(url).toMatch(new RegExp(`^${MOVEDAY_ORIGIN.replace(/\//g, '\\/')}\\/#plan=`))
    // The receiver (MoveDay unpackHandoff) reads the same SharePayload shape;
    // Furnisher's own unpackShare round-trips it, incl. the listingId.
    const packed = url!.split('#plan=')[1]
    const back = unpackShare(packed)!
    expect(back).toMatchObject({ v: 1, source: 'furnisher', name: 'Maple St 2BR', listingId: 'listing-42' })
  })

  it('buildMovedayUrl omits listingId for a fresh plan (MoveDay picks the listing)', () => {
    const url = buildMovedayUrl(normalizePlan(plan), 'Fresh plan')
    const back = unpackShare(url!.split('#plan=')[1])!
    expect(back.listingId).toBeUndefined()
  })
})
