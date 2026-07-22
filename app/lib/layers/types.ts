// ── Insight-layer spine ──────────────────────────────────────────
// A layer turns the plan's geometry into insight the raw drawing doesn't show
// (clearance zones, flow paths, sun hours…). Every layer is a PURE function of
// the plan, so it is trivially unit-testable, and it returns only simple drawing
// primitives — a generic <InsightLayer> renders them, the Canvas stays dumb.
//
// SECURITY NOTE: overlay colours are CODE-CONTROLLED constants defined in the
// layer modules, never values pulled off the (untrusted) plan. Layers must not
// route a plan `color`/`url` field into an overlay fill/stroke — that would
// re-open the `url(...)`-in-CSS sink that lib/sanitize.ts closes. Text fields
// (a room/piece name in a badge) are fine: React escapes them at render.

import type { Plan, Pt } from '../types'

// Overlay primitives, all in canonical CENTIMETRES (the Canvas SVG user space).
export interface PolygonOverlay {
  kind: 'polygon'
  points: Pt[]
  fill?: string
  stroke?: string
  opacity?: number
}
export interface RectOverlay {
  kind: 'rect'
  x: number
  y: number
  w: number
  h: number
  rotation?: number // degrees clockwise about the rect centre
  fill?: string
  stroke?: string
  opacity?: number
}
export interface PathOverlay {
  kind: 'path'
  points: Pt[] // polyline
  stroke?: string
  width?: number // cm; stroke uses non-scaling width when omitted
  dash?: string
  opacity?: number
}
export interface CircleOverlay {
  kind: 'circle'
  cx: number
  cy: number
  r: number
  fill?: string
  stroke?: string
  opacity?: number
}
export interface BadgeOverlay {
  kind: 'badge'
  x: number
  y: number
  text: string
  color?: string
}
export type Overlay = PolygonOverlay | RectOverlay | PathOverlay | CircleOverlay | BadgeOverlay

// One line in the layer's read-out (shown in the Stats panel's Layers section).
export interface PanelRow {
  id: string
  label: string
  detail?: string
  tone?: 'ok' | 'warn' | 'bad'
  targetId?: string // furniture/room id to select on the canvas when clicked
}

export interface LayerResult {
  overlays: Overlay[]
  panelRows: PanelRow[]
  warnings: string[] // headline messages, if any
}

export interface InsightLayer {
  id: string
  label: string
  desc: string // one-liner for the Display menu
  icon?: string
  compute(plan: Plan): LayerResult
}
