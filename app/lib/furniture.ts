// Furniture types → label + a sensible default footprint (cm, canonical).
// The type drives which little top-view icon is drawn in Simulator mode.

export const FURNITURE_TYPES = [
  'sofa',
  'bed',
  'chair',
  'diningTable',
  'table',
  'desk',
  'dresser',
  'wardrobe',
  'nightstand',
  'bookshelf',
  'rug',
  'lamp',
  'plant',
  'tv',
  'fridge',
  'stove',
  'sink',
  'toilet',
  'bathtub',
  'box',
] as const

export type FurnitureType = (typeof FURNITURE_TYPES)[number]

export interface FurnMeta {
  label: string
  w: number // default footprint width (cm)
  h: number // default footprint depth (cm)
}

export const FURNITURE_META: Record<FurnitureType, FurnMeta> = {
  sofa: { label: 'Sofa', w: 200, h: 90 },
  bed: { label: 'Bed', w: 150, h: 200 },
  chair: { label: 'Chair', w: 50, h: 50 },
  diningTable: { label: 'Dining table', w: 160, h: 90 },
  table: { label: 'Coffee table', w: 110, h: 60 },
  desk: { label: 'Desk', w: 140, h: 70 },
  dresser: { label: 'Dresser', w: 100, h: 45 },
  wardrobe: { label: 'Wardrobe', w: 120, h: 60 },
  nightstand: { label: 'Nightstand', w: 45, h: 40 },
  bookshelf: { label: 'Bookshelf', w: 90, h: 30 },
  rug: { label: 'Rug', w: 200, h: 140 },
  lamp: { label: 'Lamp', w: 40, h: 40 },
  plant: { label: 'Plant', w: 40, h: 40 },
  tv: { label: 'TV', w: 120, h: 25 },
  fridge: { label: 'Fridge', w: 70, h: 70 },
  stove: { label: 'Stove', w: 60, h: 60 },
  sink: { label: 'Sink', w: 60, h: 50 },
  toilet: { label: 'Toilet', w: 40, h: 60 },
  bathtub: { label: 'Bathtub', w: 75, h: 170 },
  box: { label: 'Other', w: 60, h: 60 },
}

export function furnitureType(t: string | undefined): FurnitureType {
  return (FURNITURE_TYPES as readonly string[]).includes(t ?? '') ? (t as FurnitureType) : 'box'
}
