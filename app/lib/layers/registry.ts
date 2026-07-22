// ── Insight-layer registry ───────────────────────────────────────
// The single list every layer registers into. The Display menu renders it, the
// Canvas computes the active ones, and normalizePlan validates stored layer ids
// against it. Add a layer by importing it and appending — nothing else wires up.

import type { Plan } from '../types'
import type { InsightLayer, LayerResult } from './types'
import { clearanceLayer } from './clearance'

export const LAYERS: InsightLayer[] = [clearanceLayer]

export function getLayer(id: string): InsightLayer | undefined {
  return LAYERS.find((l) => l.id === id)
}

// Keep only ids the registry actually knows, de-duplicated. Used by
// normalizePlan so a tampered/older cloud plan can't carry junk layer ids.
export function validateLayerIds(ids: unknown): string[] {
  if (!Array.isArray(ids)) return []
  const known = new Set(LAYERS.map((l) => l.id))
  const out: string[] = []
  for (const id of ids) {
    if (typeof id === 'string' && known.has(id) && !out.includes(id)) out.push(id)
  }
  return out
}

export interface ActiveLayer {
  id: string
  label: string
  result: LayerResult
}

// Compute every active + known layer for a plan. Order follows the registry so
// overlays stack predictably.
export function computeActiveLayers(plan: Plan): ActiveLayer[] {
  const active = new Set(plan.layers ?? [])
  if (active.size === 0) return []
  return LAYERS.filter((l) => active.has(l.id)).map((l) => ({ id: l.id, label: l.label, result: l.compute(plan) }))
}
