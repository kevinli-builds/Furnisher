// Built-in example plans. A first-time visitor lands on a chooser and can open
// one of these instead of a blank canvas — the fastest path to "aha". Each entry
// is a plain Plan-shaped object; the app ALWAYS loads it through normalizePlan()
// (see storage.ts), the exact same trust-boundary path as any untrusted plan, so
// templates get no special treatment. Opening a template copies it — the copy is
// what the user edits; these frozen objects are never mutated.

import type { Plan, Room, Furniture, Door } from '../types'
import type { FurnitureType } from '../furniture'
import { FURNITURE_META } from '../furniture'
import { defaultPlan } from '../storage'

// Soft, type-appropriate default colours so templates look considered out of the
// box (users can recolour anything afterwards).
const FURN_COLOR: Partial<Record<FurnitureType, string>> = {
  sofa: '#d3a87f',
  bed: '#c79a86',
  rug: '#bcb482',
  plant: '#b9c2a0',
  table: '#a8b1aa',
  diningTable: '#a8b1aa',
  desk: '#a8b1aa',
  chair: '#b9c2a0',
}
const DEFAULT_COLOR = '#d8c8a4'

let n = 0
const nid = (p: string) => `${p}${n++}`

function room(name: string, type: string, x: number, y: number, w: number, h: number): Room {
  return { id: nid('r'), name, roomType: type, x, y, w, h }
}

// Furniture at (x,y) top-left. w/h default to the type's real footprint; pass
// them to override (and a rotation in degrees).
function fur(name: string, type: FurnitureType, x: number, y: number, rot = 0, w?: number, h?: number): Furniture {
  const meta = FURNITURE_META[type]
  return {
    id: nid('f'),
    name,
    type,
    x,
    y,
    w: w ?? meta.w,
    h: h ?? meta.h,
    rotation: rot,
    color: FURN_COLOR[type] ?? DEFAULT_COLOR,
    ...(type === 'lamp' ? { light: true } : {}),
  }
}

function door(x: number, y: number, length: number, orientation: 'h' | 'v', swing: 1 | -1 = 1, hinge: 1 | -1 = 1): Door {
  return { id: nid('d'), type: 'swing', x, y, length, orientation, swing, hinge }
}

function win(x: number, y: number, length: number, orientation: 'h' | 'v'): Door {
  return { id: nid('w'), type: 'window', x, y, length, orientation, swing: 1, hinge: 1 }
}

// Assemble a template plan on top of sensible display defaults.
function plan(width: number, height: number, parts: Partial<Plan>): Plan {
  return {
    ...defaultPlan(),
    roomLabels: 'always',
    width,
    height,
    rooms: [],
    doors: [],
    furniture: [],
    ...parts,
  }
}

export interface Template {
  id: string
  name: string
  blurb: string
  plan: Plan
}

// ── Studio ────────────────────────────────────────────────────
function studio(): Plan {
  return plan(760, 620, {
    rooms: [
      room('Studio', 'living', 100, 100, 520, 420),
      room('Bath', 'bathroom', 620, 100, 140, 200),
    ],
    doors: [door(300, 520, 90, 'h', -1, 1), door(620, 150, 80, 'v', 1, 1), win(180, 100, 140, 'h'), win(460, 100, 140, 'h')],
    furniture: [
      fur('Bed (Queen)', 'bed', 130, 130, 0, 153, 203),
      fur('Nightstand', 'nightstand', 300, 130),
      fur('Sofa', 'sofa', 370, 360, 180, 200, 90),
      fur('Coffee table', 'table', 400, 300),
      fur('TV', 'tv', 380, 480, 0, 120, 25),
      fur('Kitchenette', 'sink', 130, 470, 0, 180, 55),
      fur('Fridge', 'fridge', 330, 470),
      fur('Dining table (2)', 'diningTable', 150, 340, 0, 120, 70),
      fur('Rug', 'rug', 340, 320, 0, 230, 160),
      fur('Toilet', 'toilet', 700, 230),
      fur('Plant', 'plant', 560, 130),
    ],
  })
}

// ── One-bedroom ───────────────────────────────────────────────
function oneBed(): Plan {
  return plan(1040, 760, {
    rooms: [
      room('Living / Dining', 'living', 100, 100, 520, 560),
      room('Kitchen', 'kitchen', 620, 100, 320, 260),
      room('Bedroom', 'bedroom', 620, 360, 320, 300),
    ],
    doors: [
      door(320, 660, 90, 'h', -1, 1),
      door(620, 200, 80, 'v', 1, 1),
      door(620, 440, 80, 'v', 1, -1),
      win(180, 100, 160, 'h'),
      win(400, 100, 160, 'h'),
    ],
    furniture: [
      // Living
      fur('Sofa (3-seat)', 'sofa', 150, 420, 0, 220, 95),
      fur('Coffee table', 'table', 190, 320),
      fur('TV stand', 'tv', 190, 130, 0, 150, 40),
      fur('Armchair', 'chair', 420, 380, 270, 80, 85),
      fur('Rug', 'rug', 150, 300, 0, 260, 180),
      fur('Dining table (4)', 'diningTable', 350, 520, 0, 120, 80),
      fur('Bookshelf', 'bookshelf', 520, 130, 0, 90, 30),
      fur('Plant', 'plant', 540, 560),
      // Kitchen
      fur('Counter / sink', 'sink', 650, 130, 0, 200, 55),
      fur('Stove', 'stove', 860, 130),
      fur('Fridge', 'fridge', 860, 260),
      // Bedroom
      fur('Bed (Queen)', 'bed', 700, 400, 0, 153, 203),
      fur('Nightstand', 'nightstand', 660, 400),
      fur('Wardrobe', 'wardrobe', 700, 610, 0, 120, 60),
    ],
  })
}

// ── Two-bedroom ───────────────────────────────────────────────
function twoBed(): Plan {
  return plan(1240, 900, {
    rooms: [
      room('Living room', 'living', 100, 100, 520, 460),
      room('Kitchen', 'kitchen', 100, 560, 300, 240),
      room('Dining', 'dining', 400, 560, 220, 240),
      room('Main bedroom', 'bedroom', 620, 100, 520, 360),
      room('Bedroom 2', 'bedroom', 620, 560, 320, 240),
      room('Bath', 'bathroom', 940, 460, 200, 340),
    ],
    doors: [
      door(300, 560, 90, 'h', 1, 1),
      door(620, 220, 80, 'v', -1, 1),
      door(700, 560, 80, 'h', -1, 1),
      door(940, 560, 80, 'v', 1, 1),
      win(200, 100, 200, 'h'),
      win(800, 100, 200, 'h'),
    ],
    furniture: [
      // Living
      fur('Sectional sofa', 'sofa', 150, 380, 0, 260, 160),
      fur('Coffee table', 'table', 260, 300),
      fur('TV stand', 'tv', 260, 130, 0, 150, 40),
      fur('Rug', 'rug', 200, 290, 0, 300, 200),
      fur('Bookshelf', 'bookshelf', 520, 130, 0, 90, 30),
      // Kitchen
      fur('Counter / sink', 'sink', 130, 590, 0, 200, 55),
      fur('Stove', 'stove', 130, 720),
      fur('Fridge', 'fridge', 300, 720),
      // Dining
      fur('Dining table (6)', 'diningTable', 440, 620, 0, 180, 90),
      // Main bedroom
      fur('Bed (King)', 'bed', 800, 140, 0, 193, 203),
      fur('Nightstand', 'nightstand', 750, 140),
      fur('Nightstand', 'nightstand', 1000, 140),
      fur('Wardrobe', 'wardrobe', 660, 380, 0, 120, 60),
      fur('Dresser', 'dresser', 950, 380, 0, 100, 45),
      // Bedroom 2
      fur('Bed (Single)', 'bed', 660, 600, 0, 97, 191),
      fur('Desk', 'desk', 800, 720, 0, 120, 60),
    ],
  })
}

// ── Home office ───────────────────────────────────────────────
function office(): Plan {
  return plan(720, 620, {
    rooms: [room('Home office', 'office', 100, 100, 520, 420)],
    doors: [door(300, 520, 90, 'h', -1, 1), win(180, 100, 160, 'h'), win(420, 100, 160, 'h')],
    furniture: [
      fur('Desk', 'desk', 150, 150, 0, 160, 80),
      fur('Office chair', 'chair', 210, 250, 0, 60, 60),
      fur('Desk', 'desk', 420, 150, 0, 160, 80),
      fur('Office chair', 'chair', 480, 250, 180, 60, 60),
      fur('Bookcase', 'bookshelf', 150, 470, 0, 160, 30),
      fur('Bookcase', 'bookshelf', 420, 470, 0, 160, 30),
      fur('Sofa (2-seat)', 'sofa', 150, 350, 0, 150, 90),
      fur('Plant', 'plant', 540, 440),
      fur('Rug', 'rug', 320, 300, 0, 200, 140),
    ],
  })
}

// Ids/names are the stable API for the chooser. Order = display order.
export const TEMPLATES: Template[] = [
  { id: 'studio', name: 'Studio apartment', blurb: 'One open room + bath — the classic small-space puzzle.', plan: studio() },
  { id: 'one-bed', name: 'One-bedroom', blurb: 'Living, kitchen, bedroom & bath. A great starting point.', plan: oneBed() },
  { id: 'two-bed', name: 'Two-bedroom', blurb: 'Two beds, open living/dining, family-sized.', plan: twoBed() },
  { id: 'office', name: 'Home office', blurb: 'A two-desk workspace with a reading corner.', plan: office() },
]
