// Share links + fragment import — the P2 share-links feature, and the receiving
// half of the MoveDay handoff (see C:\Users\snoww\MoveDay\FABLE_BRIEF.md §4).
//
// A plan travels lz-string-compressed in the URL FRAGMENT (#import=…): fragments
// never reach server logs or Referer headers — and this is a static export, so
// there is no server to see one anyway. Anything that arrives this way is
// UNTRUSTED: the caller must pass the plan through normalizePlan() (which
// sanitizes colour fields) before it touches the canvas.

import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string'
import type { Plan } from './types'

// Fragments beyond this are unreliable across browsers/chat apps — callers fall
// back to copy/paste JSON. Rooms-only handoffs pack to 2–10 KB; only huge fully
// furnished plans approach this.
export const MAX_PACKED_LENGTH = 30_000

export interface SharePayload {
  v: 1
  source: 'moveday' | 'furnisher'
  name: string
  listingId?: string // MoveDay round-trip correlation — preserved, unused here
  plan: Partial<Plan>
}

export function packShare(plan: Partial<Plan>, name: string, source: SharePayload['source'] = 'furnisher'): string {
  const payload: SharePayload = { v: 1, source, name, plan }
  return compressToEncodedURIComponent(JSON.stringify(payload))
}

// Full shareable URL for the current plan, or null when it packs too large.
export function buildShareUrl(origin: string, plan: Plan, name = 'Shared plan'): string | null {
  const packed = packShare(plan, name)
  if (packed.length > MAX_PACKED_LENGTH) return null
  return `${origin}/#import=${packed}`
}

// ── Return trip to MoveDay ──────────────────────────────────────────────────
export const MOVEDAY_ORIGIN = 'https://move-day.vercel.app'
// Set when a plan arrives via a MoveDay Fit-check (#import= with a listingId);
// read by the "Send to MoveDay" action so the return trip re-attaches to the
// right listing. localStorage key, so it survives the round-trip inside the tab.
export const MOVEDAY_LISTING_KEY = 'furnisher.movedayListingId'

// Build a link that hands this plan back to MoveDay (its #plan= inbound route).
// listingId threads a Fit-check round-trip so MoveDay re-attaches to the source
// listing; omit it for a fresh plan (MoveDay then shows a listing picker).
export function buildMovedayUrl(plan: Partial<Plan>, name: string, listingId?: string): string | null {
  const payload: SharePayload = { v: 1, source: 'furnisher', name, listingId, plan }
  const packed = compressToEncodedURIComponent(JSON.stringify(payload))
  if (packed.length > MAX_PACKED_LENGTH) return null
  return `${MOVEDAY_ORIGIN}/#plan=${packed}`
}

export function unpackShare(packed: string): SharePayload | null {
  if (!packed || packed.length > MAX_PACKED_LENGTH) return null
  try {
    const json = decompressFromEncodedURIComponent(packed)
    if (!json) return null
    const parsed = JSON.parse(json) as Partial<SharePayload>
    if (parsed.v !== 1) return null
    if (parsed.source !== 'moveday' && parsed.source !== 'furnisher') return null
    if (!parsed.plan || typeof parsed.plan !== 'object' || Array.isArray(parsed.plan)) return null
    return {
      v: 1,
      source: parsed.source,
      name: typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name.slice(0, 120) : 'Shared plan',
      listingId: typeof parsed.listingId === 'string' ? parsed.listingId : undefined,
      plan: parsed.plan as Partial<Plan>,
    }
  } catch {
    return null
  }
}

// The import payload carried in a location.hash, if any. Accepts "#import=…".
export function parseImportHash(hash: string): SharePayload | null {
  const m = /^#import=(.+)$/.exec(hash)
  if (!m) return null
  return unpackShare(m[1])
}
