// ── Furnisher data model ─────────────────────────────────────────
// All geometry is stored in CENTIMETRES (the canonical unit). The
// imperial/metric toggle is display-only — it never mutates stored values.

export type Units = 'imperial' | 'metric'
export type Mode = 'select' | 'room' | 'door' | 'window' | 'marker'

// How the plan is drawn:
//   schematic → flat "box + sticky-note" outlines, text only (most minimal)
//   sim       → colour-filled furniture + door swings (a real simulator)
export type ViewMode = 'schematic' | 'sim'

// When room name labels are shown.
export type RoomLabels = 'always' | 'hover'

export interface Pt {
  x: number
  y: number
}

export interface Room {
  id: string
  name: string
  x: number // bounding box (kept in sync with points when present)
  y: number
  w: number
  h: number
  points?: Pt[] // polygon vertices (absolute cm); absent = plain rectangle
}

// A wall opening: a swinging door, a sliding door, or a window.
export type OpeningType = 'swing' | 'sliding' | 'window'

export interface Door {
  id: string
  type: OpeningType
  x: number // top-left corner of the opening span (cm)
  y: number
  length: number // opening width (cm)
  orientation: 'h' | 'v' // wall the opening sits on: horizontal or vertical
  swing: 1 | -1 // (swing doors) which side of the wall the leaf opens toward
  hinge: 1 | -1 // (swing doors) which end of the opening the hinge is on
}

// Degrees clockwise. Free rotation (not limited to 90° steps).
export type Rotation = number

import type { FurnitureType } from './furniture'

export interface Furniture {
  id: string
  name: string
  type: FurnitureType // drives the Simulator icon
  x: number // top-left of the unrotated footprint (cm)
  y: number
  w: number // footprint width (cm)
  h: number // footprint depth (cm)
  rotation: Rotation
  color: string
  url?: string // optional product/reference link
}

// A labelled box drawn behind everything — e.g. to frame a floor (frame) or to
// indicate a closet (closet = diagonal-hatched shading).
export type MarkerStyle = 'frame' | 'shaded' | 'closet'
export interface Marker {
  id: string
  name: string
  style: MarkerStyle
  x: number
  y: number
  w: number
  h: number
}

export type StairRole = 'entry' | 'exit'

// Stairs come as an entry+exit pair sharing a `link`; a dashed line is drawn
// between the two to show the transition between floors laid out on one grid.
export interface Stair {
  id: string
  link: string
  role: StairRole
  x: number
  y: number
  w: number
  h: number
  rotation: Rotation
}

// Reusable templates kept in the project's inventory (left panel). Dragging /
// clicking one creates a placed instance on the grid.
export interface FurnTemplate {
  id: string
  name: string
  type: FurnitureType
  w: number
  h: number
  color: string
  url?: string
}
export interface RoomTemplate {
  id: string
  name: string
  w: number
  h: number
}
export interface Inventory {
  furniture: FurnTemplate[]
  rooms: RoomTemplate[]
}

export interface Plan {
  units: Units
  viewMode: ViewMode
  roomLabels: RoomLabels
  furnitureLabels?: RoomLabels // 'always' | 'hover' (default always)
  showGrid: boolean
  lighting?: boolean // sun/light overlay on/off
  northDeg?: number // compass direction the top of the plan faces (0 = north up)
  sunTime?: number // hour of day for the sun sim (0–24)
  blueprintUrl?: string // optional link to the listing / source blueprint
  inventory: Inventory
  width: number // overall canvas extent (cm)
  height: number
  rooms: Room[]
  doors: Door[]
  furniture: Furniture[]
  markers: Marker[]
  stairs: Stair[]
}

export interface SelItem {
  type: 'room' | 'door' | 'furniture' | 'marker' | 'stair'
  id: string
}

// Multi-selection: an empty array means nothing is selected.
export type Selection = SelItem[]
