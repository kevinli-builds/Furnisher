// ── L1 clearance standards ───────────────────────────────────────
// Per-type ERGONOMIC aprons: the empty floor a piece needs to be usable, beyond
// the hard collision check. A desk needs chair pushback; a wardrobe needs its
// doors to open; a bed needs a way in on each side. Data-only — extend freely.
//
// Sides are in the piece's LOCAL frame. Furniture's canonical facing is: at
// rotation 0 the FRONT faces +y (down) and the BACK (-y) is what `face`-snapping
// sits against a wall (see geometry.ts faceSnap). So 'front' = the usable face,
// 'back' = the wall side, 'left'/'right' = the two flanks. Depths are honest
// round numbers (cm), not invented code citations — the note states the purpose.

import type { FurnitureType } from '../furniture'

export type ClearSide = 'front' | 'back' | 'left' | 'right'

export interface ClearApron {
  side: ClearSide
  depth: number // cm of clear floor the apron reaches out from that edge
}

export interface ClearStandard {
  aprons: ClearApron[]
  note: string // the ergonomic purpose, shown in the read-out
}

export const CLEARANCE_STANDARDS: Partial<Record<FurnitureType, ClearStandard>> = {
  bed: { aprons: [{ side: 'left', depth: 60 }, { side: 'right', depth: 60 }, { side: 'front', depth: 60 }], note: 'Bedside + foot access (≈60cm)' },
  desk: { aprons: [{ side: 'front', depth: 75 }], note: 'Chair pushback (≈75cm)' },
  diningTable: {
    aprons: [{ side: 'front', depth: 90 }, { side: 'back', depth: 90 }, { side: 'left', depth: 90 }, { side: 'right', depth: 90 }],
    note: 'Seat pull-out + circulation (≈90cm)',
  },
  dresser: { aprons: [{ side: 'front', depth: 75 }], note: 'Drawer pull-out (≈75cm)' },
  wardrobe: { aprons: [{ side: 'front', depth: 90 }], note: 'Door swing + standing (≈90cm)' },
  bookshelf: { aprons: [{ side: 'front', depth: 75 }], note: 'Browse / kneel room (≈75cm)' },
  fridge: { aprons: [{ side: 'front', depth: 105 }], note: 'Door swing + standing (≈105cm)' },
  stove: { aprons: [{ side: 'front', depth: 100 }], note: 'Work zone + safety (≈100cm)' },
  sink: { aprons: [{ side: 'front', depth: 75 }], note: 'Standing room (≈75cm)' },
  toilet: { aprons: [{ side: 'front', depth: 60 }], note: 'Standing clearance (≈60cm)' },
  sofa: { aprons: [{ side: 'front', depth: 40 }], note: 'Legroom in front (≈40cm)' },
}

// Pieces too flat/light to count as blocking someone else's clearance — a rug
// slides under, a lamp lifts away. Keeping them out of the obstruction test is
// what stopped the old clearance checker from being unusably noisy.
export const IGNORE_AS_OBSTRUCTION: ReadonlySet<string> = new Set(['rug', 'lamp'])

// Adjacencies that are INTENDED, so they must not read as clearance violations:
// a chair belongs in a desk/table's pushback zone; a nightstand belongs beside a
// bed. Keyed by the apron owner's type → the neighbour types that may sit in it.
export const EXPECTED_NEIGHBOURS: Partial<Record<FurnitureType, ReadonlySet<string>>> = {
  desk: new Set(['chair']),
  diningTable: new Set(['chair']),
  bed: new Set(['nightstand']),
}
