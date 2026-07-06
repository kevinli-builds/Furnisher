import type { FurnTemplate } from './types'
import { safeColorField } from './sanitize'
import { supabase } from './supabase'

// A user's personal furniture library — the pieces they own, kept SEPARATE from
// any one plan so they follow the person across projects (you move, your couch
// doesn't change). Local-first (localStorage); when signed in it also syncs to a
// per-user cloud row so the library follows across devices.

export interface Library {
  furniture: FurnTemplate[]
  groups: string[]
}

const KEY = 'furnisher.library.v1'

export function emptyLibrary(): Library {
  return { furniture: [], groups: ['General'] }
}

// Coerce any loaded/synced shape into a valid Library. Furniture colours reach an
// SVG fill, so sanitize them (same trust boundary as normalizePlan).
export function sanitizeLibrary(raw: Partial<Library> | null | undefined): Library {
  if (!raw) return emptyLibrary()
  const furniture = Array.isArray(raw.furniture) ? raw.furniture.map(safeColorField) : []
  const groups = Array.isArray(raw.groups) && raw.groups.length ? raw.groups.filter((g) => typeof g === 'string') : ['General']
  return { furniture, groups }
}

// Union two libraries by furniture id (keeps every distinct piece) and by group
// name. Used when a signed-in device first pulls the cloud copy into its local one.
export function mergeLibraries(a: Library, b: Library): Library {
  const byId = new Map<string, FurnTemplate>()
  for (const t of a.furniture) byId.set(t.id, t)
  for (const t of b.furniture) if (!byId.has(t.id)) byId.set(t.id, t)
  const groups = [...new Set([...a.groups, ...b.groups])]
  return { furniture: [...byId.values()], groups: groups.length ? groups : ['General'] }
}

// ── Local ─────────────────────────────────────────────────────────
// Returns null when nothing has been saved yet, so the caller can seed the
// library from the current plan's inventory the first time (one-off migration).
export function loadLibrary(): Library | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return null
    return sanitizeLibrary(JSON.parse(raw) as Partial<Library>)
  } catch {
    return null
  }
}

export function saveLibrary(lib: Library): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(KEY, JSON.stringify(lib))
  } catch {
    /* quota / private mode — ignore */
  }
}

// ── Cloud (best-effort) ───────────────────────────────────────────
// Both no-op gracefully when Supabase isn't configured, the table is missing, or
// the network fails — the local library always keeps working. Requires the
// `furniture_library` table + RLS (see supabase/furniture_library.sql).
export async function fetchCloudLibrary(): Promise<Library | null> {
  if (!supabase) return null
  try {
    const { data: auth } = await supabase.auth.getUser()
    const userId = auth.user?.id
    if (!userId) return null
    const { data, error } = await supabase.from('furniture_library').select('data').eq('user_id', userId).maybeSingle()
    if (error || !data) return null
    return sanitizeLibrary(data.data as Partial<Library>)
  } catch {
    return null
  }
}

export async function pushCloudLibrary(lib: Library): Promise<void> {
  if (!supabase) return
  try {
    const { data: auth } = await supabase.auth.getUser()
    const userId = auth.user?.id
    if (!userId) return
    await supabase.from('furniture_library').upsert({ user_id: userId, data: lib, updated_at: new Date().toISOString() })
  } catch {
    /* offline / table missing — local copy is still safe */
  }
}
