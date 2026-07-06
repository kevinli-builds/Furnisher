import type { Tracker, TrackerColumn, TrackerColumnType, TrackerEntry } from './types'
import { uid } from './geometry'

const COL_TYPES: TrackerColumnType[] = ['text', 'date', 'number']
const MAX = 200 // cap free-text lengths on the trust boundary

// ── Factories ──────────────────────────────────────────────────
export function newColumn(name: string, type: TrackerColumnType = 'text'): TrackerColumn {
  return { id: uid(), name, type }
}

// A blank entry seeded with an empty value for each current column.
export function newEntry(cols: TrackerColumn[]): TrackerEntry {
  const values: Record<string, string> = {}
  for (const c of cols) values[c.id] = ''
  return { id: uid(), values }
}

export function newTracker(name: string, icon: string, cols: TrackerColumn[]): Tracker {
  return { id: uid(), name, icon, columns: cols, entries: [] }
}

// ── Quick-start templates ──────────────────────────────────────
// Column specs are turned into real columns (with fresh ids) at creation time.
type ColSpec = [name: string, type: TrackerColumnType]
export interface TrackerTemplate {
  name: string
  icon: string
  columns: ColSpec[]
}

export const TRACKER_TEMPLATES: TrackerTemplate[] = [
  { name: 'Movies watched', icon: '🎬', columns: [['Title', 'text'], ['Watched on', 'date'], ['With', 'text'], ['Rating', 'number'], ['Notes', 'text']] },
  { name: 'Music', icon: '🎵', columns: [['Title', 'text'], ['Artist', 'text'], ['Listened on', 'date'], ['Notes', 'text']] },
  { name: 'Restaurants', icon: '🍽', columns: [['Name', 'text'], ['Cuisine', 'text'], ['Location', 'text'], ['Rating', 'number'], ['Notes', 'text']] },
  { name: 'Favorite celebrities', icon: '⭐', columns: [['Name', 'text'], ['Known for', 'text'], ['Notes', 'text']] },
  { name: 'Books', icon: '📚', columns: [['Title', 'text'], ['Author', 'text'], ['Finished on', 'date'], ['Rating', 'number'], ['Notes', 'text']] },
]

// Build a fresh Tracker (with new ids) from a template.
export function trackerFromTemplate(t: TrackerTemplate): Tracker {
  return newTracker(t.name, t.icon, t.columns.map(([n, ty]) => newColumn(n, ty)))
}

// ── Trust-boundary normalization ───────────────────────────────
// Coerce any stored/loaded/peer-supplied tracker shape into valid Trackers:
// drop malformed rows, cap strings, restrict column types. Mirrors normalizePlan.
function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v.slice(0, MAX) : fallback
}

function normalizeColumn(raw: unknown): TrackerColumn | null {
  if (!raw || typeof raw !== 'object') return null
  const c = raw as Record<string, unknown>
  if (typeof c.id !== 'string') return null
  const type = COL_TYPES.includes(c.type as TrackerColumnType) ? (c.type as TrackerColumnType) : 'text'
  return { id: c.id.slice(0, MAX), name: str(c.name), type }
}

function normalizeEntry(raw: unknown, cols: TrackerColumn[]): TrackerEntry | null {
  if (!raw || typeof raw !== 'object') return null
  const e = raw as Record<string, unknown>
  if (typeof e.id !== 'string') return null
  const values: Record<string, string> = {}
  const src = (e.values && typeof e.values === 'object' ? e.values : {}) as Record<string, unknown>
  for (const c of cols) values[c.id] = str(src[c.id])
  return { id: e.id.slice(0, MAX), values }
}

export function normalizeTrackers(raw: unknown): Tracker[] {
  if (!Array.isArray(raw)) return []
  const out: Tracker[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const t = item as Record<string, unknown>
    if (typeof t.id !== 'string') continue
    const columns = (Array.isArray(t.columns) ? t.columns : []).map(normalizeColumn).filter((c): c is TrackerColumn => c !== null)
    const entries = (Array.isArray(t.entries) ? t.entries : []).map((e) => normalizeEntry(e, columns)).filter((e): e is TrackerEntry => e !== null)
    out.push({
      id: t.id.slice(0, MAX),
      name: str(t.name, 'Untitled'),
      icon: t.icon === undefined ? undefined : str(t.icon),
      columns,
      entries,
    })
  }
  return out
}
