// A curated catalogue of common furniture at real-world footprints (cm),
// grouped by room. Tapping one drops it on the plan — no setup needed.

import type { FurnitureType } from './furniture'

export interface CatalogItem {
  name: string
  type: FurnitureType
  w: number // width (cm)
  h: number // depth (cm)
}

export const CATALOG: { group: string; items: CatalogItem[] }[] = [
  {
    group: 'Living room',
    items: [
      { name: 'Sofa (3-seat)', type: 'sofa', w: 220, h: 95 },
      { name: 'Loveseat (2-seat)', type: 'sofa', w: 150, h: 90 },
      { name: 'Sectional sofa', type: 'sofa', w: 260, h: 200 },
      { name: 'Armchair', type: 'chair', w: 80, h: 85 },
      { name: 'Coffee table', type: 'table', w: 110, h: 60 },
      { name: 'Side table', type: 'table', w: 50, h: 50 },
      { name: 'TV stand', type: 'tv', w: 150, h: 40 },
      { name: 'Bookshelf', type: 'bookshelf', w: 90, h: 30 },
      { name: 'Floor lamp', type: 'lamp', w: 40, h: 40 },
      { name: 'Area rug', type: 'rug', w: 230, h: 160 },
      { name: 'Plant', type: 'plant', w: 45, h: 45 },
    ],
  },
  {
    group: 'Bedroom',
    items: [
      { name: 'Bed (King)', type: 'bed', w: 193, h: 203 },
      { name: 'Bed (Queen)', type: 'bed', w: 153, h: 203 },
      { name: 'Bed (Double)', type: 'bed', w: 137, h: 191 },
      { name: 'Bed (Single)', type: 'bed', w: 97, h: 191 },
      { name: 'Nightstand', type: 'nightstand', w: 45, h: 40 },
      { name: 'Dresser', type: 'dresser', w: 100, h: 45 },
      { name: 'Wardrobe', type: 'wardrobe', w: 120, h: 60 },
    ],
  },
  {
    group: 'Dining & kitchen',
    items: [
      { name: 'Dining table (4)', type: 'diningTable', w: 120, h: 80 },
      { name: 'Dining table (6)', type: 'diningTable', w: 180, h: 90 },
      { name: 'Dining chair', type: 'chair', w: 45, h: 50 },
      { name: 'Fridge', type: 'fridge', w: 70, h: 70 },
      { name: 'Stove / range', type: 'stove', w: 60, h: 60 },
      { name: 'Kitchen sink', type: 'sink', w: 80, h: 55 },
    ],
  },
  {
    group: 'Bathroom',
    items: [
      { name: 'Toilet', type: 'toilet', w: 40, h: 70 },
      { name: 'Bathtub', type: 'bathtub', w: 75, h: 170 },
      { name: 'Shower', type: 'box', w: 90, h: 90 },
      { name: 'Vanity / sink', type: 'sink', w: 60, h: 48 },
    ],
  },
  {
    group: 'Office',
    items: [
      { name: 'Desk', type: 'desk', w: 140, h: 70 },
      { name: 'Office chair', type: 'chair', w: 60, h: 60 },
      { name: 'Bookcase', type: 'bookshelf', w: 80, h: 30 },
    ],
  },
]
