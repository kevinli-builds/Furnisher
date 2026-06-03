// ── Furnisher data model ─────────────────────────────────────────
// All geometry is stored in CENTIMETRES (the canonical unit). The
// imperial/metric toggle is display-only — it never mutates stored values.

export type Units = 'imperial' | 'metric'
export type Mode = 'select' | 'room' | 'door'

// How the plan is drawn:
//   schematic → flat "box + sticky-note" outlines, text only (most minimal)
//   sim       → colour-filled furniture + door swings (a real simulator)
export type ViewMode = 'schematic' | 'sim'

// When room name labels are shown.
export type RoomLabels = 'always' | 'hover'

export interface Room {
  id: string
  name: string
  x: number
  y: number
  w: number
  h: number
}

export interface Door {
  id: string
  x: number // top-left corner of the opening span (cm)
  y: number
  length: number // opening width (cm)
  orientation: 'h' | 'v' // wall the door sits on: horizontal or vertical
  swing: 1 | -1 // which side of the wall the leaf opens toward
  hinge: 1 | -1 // which end of the opening the hinge is on
}

export type Rotation = 0 | 90 | 180 | 270

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
}

export interface Plan {
  units: Units
  viewMode: ViewMode
  roomLabels: RoomLabels
  showGrid: boolean
  width: number // overall canvas extent (cm)
  height: number
  rooms: Room[]
  doors: Door[]
  furniture: Furniture[]
}

export type Selection =
  | { type: 'room' | 'door' | 'furniture'; id: string }
  | null
