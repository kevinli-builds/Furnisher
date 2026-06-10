'use client'

import { useEffect, useRef, useState } from 'react'
import type { Plan } from './types'
import { supabase } from './supabase'
import { useAuth } from './auth'

// ── Operation model ───────────────────────────────────────────
// Live edits are broadcast as small per-object ops (not the whole plan), so two
// people editing different things don't clobber each other.
type Coll = 'rooms' | 'doors' | 'furniture' | 'markers' | 'stairs' | 'lights'
const COLLS: Coll[] = ['rooms', 'doors', 'furniture', 'markers', 'stairs', 'lights']
const META_KEYS: (keyof Plan)[] = [
  'units',
  'viewMode',
  'roomLabels',
  'furnitureLabels',
  'showGrid',
  'lighting',
  'northDeg',
  'sunTime',
  'latitude',
  'blueprintUrl',
  'width',
  'height',
  'inventory',
]

type Entity = { id: string }
type Op =
  | { t: 'upsert'; c: Coll; item: Entity }
  | { t: 'del'; c: Coll; id: string }
  | { t: 'meta'; fields: Partial<Plan> }

export function diffPlan(prev: Plan, next: Plan): Op[] {
  const ops: Op[] = []
  for (const c of COLLS) {
    const pa = prev[c] as Entity[]
    const na = next[c] as Entity[]
    const pm = new Map(pa.map((o) => [o.id, o]))
    const nIds = new Set(na.map((o) => o.id))
    for (const o of na) {
      const old = pm.get(o.id)
      if (!old || JSON.stringify(old) !== JSON.stringify(o)) ops.push({ t: 'upsert', c, item: o })
    }
    for (const o of pa) if (!nIds.has(o.id)) ops.push({ t: 'del', c, id: o.id })
  }
  const fields: Partial<Plan> = {}
  let metaChanged = false
  for (const k of META_KEYS) {
    if (JSON.stringify(prev[k]) !== JSON.stringify(next[k])) {
      ;(fields as Record<string, unknown>)[k] = next[k]
      metaChanged = true
    }
  }
  if (metaChanged) ops.push({ t: 'meta', fields })
  return ops
}

// A colour that will be painted into SVG fill/stroke must be a plain colour
// value — never url(...) (which can make the viewer's browser fetch an
// attacker-controlled paint server) or other CSS tricks.
const SAFE_COLOR = /^#[0-9a-fA-F]{3,8}$|^rgba?\([\d.,\s%]+\)$|^[a-zA-Z]{3,20}$/
function sanitizeItem(item: Entity): Entity {
  const it = item as Entity & Record<string, unknown>
  if ('color' in it && (typeof it.color !== 'string' || !SAFE_COLOR.test(it.color as string))) {
    return { ...it, color: '#d8c8a4' } as Entity
  }
  return item
}

// Validate + clean ops arriving from the network (the channel is only
// semi-trusted): drop anything malformed, and only allow known meta keys.
export function sanitizeOps(raw: unknown): Op[] {
  if (!Array.isArray(raw)) return []
  const out: Op[] = []
  for (const o of raw) {
    if (!o || typeof o !== 'object') continue
    const op = o as Record<string, unknown>
    if (op.t === 'upsert' && COLLS.includes(op.c as Coll) && op.item && typeof op.item === 'object' && typeof (op.item as Entity).id === 'string') {
      out.push({ t: 'upsert', c: op.c as Coll, item: sanitizeItem(op.item as Entity) })
    } else if (op.t === 'del' && COLLS.includes(op.c as Coll) && typeof op.id === 'string') {
      out.push({ t: 'del', c: op.c as Coll, id: op.id })
    } else if (op.t === 'meta' && op.fields && typeof op.fields === 'object') {
      const clean: Partial<Plan> = {}
      for (const k of META_KEYS) {
        if (k in (op.fields as object)) (clean as Record<string, unknown>)[k] = (op.fields as Record<string, unknown>)[k]
      }
      out.push({ t: 'meta', fields: clean })
    }
  }
  return out
}

export function applyOps(plan: Plan, ops: Op[]): Plan {
  let p: Plan = plan
  for (const op of ops) {
    if (op.t === 'meta') {
      p = { ...p, ...op.fields }
    } else if (op.t === 'upsert') {
      const arr = (p[op.c] as Entity[]).slice()
      const i = arr.findIndex((o) => o.id === op.item.id)
      if (i >= 0) arr[i] = op.item
      else arr.push(op.item)
      p = { ...p, [op.c]: arr }
    } else {
      p = { ...p, [op.c]: (p[op.c] as Entity[]).filter((o) => o.id !== op.id) }
    }
  }
  return p
}

// ── Presence ──────────────────────────────────────────────────
export interface Peer {
  id: string
  name: string
  color: string
  x?: number
  y?: number
}

const PALETTE = ['#e0742f', '#2f8f6b', '#6a6acb', '#c0567f', '#3d8bbf', '#b08a2e']
function colorFor(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return PALETTE[h % PALETTE.length]
}

// A peer-supplied colour goes into CSS `background` / SVG `fill`; restrict it to
// hex / rgb() so a hostile peer can't inject e.g. url(...) for tracking.
function safeColor(c: unknown): string {
  return typeof c === 'string' && /^#[0-9a-fA-F]{3,8}$|^rgba?\([\d.,\s%]+\)$/.test(c) ? c : '#888'
}
const safeName = (n: unknown) => String(n ?? 'Guest').slice(0, 24)

// throttle helper
function throttle<A extends unknown[]>(fn: (...a: A) => void, ms: number) {
  let last = 0
  let pending: A | null = null
  let t: ReturnType<typeof setTimeout> | null = null
  const run = () => {
    last = Date.now()
    t = null
    if (pending) {
      fn(...pending)
      pending = null
    }
  }
  return (...a: A) => {
    const now = Date.now()
    if (now - last >= ms) {
      last = now
      fn(...a)
    } else {
      pending = a
      if (!t) t = setTimeout(run, ms - (now - last))
    }
  }
}

// ── Hook ──────────────────────────────────────────────────────
// projectId: the open cloud project (null = solo). applyRemote: history-silent
// plan setter for incoming ops. `plan` is observed to broadcast local diffs.
export function useCollab(projectId: string | null, plan: Plan, applyRemote: (p: Plan) => void) {
  const { user } = useAuth()
  const [peers, setPeers] = useState<Record<string, Peer>>({})

  const me = useRef<{ id: string; name: string; color: string }>({ id: '', name: '', color: '' })
  if (!me.current.id) me.current.id = (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2))
  me.current.name = user?.email?.split('@')[0] || 'Guest'
  me.current.color = colorFor(user?.id || me.current.id)

  const chan = useRef<ReturnType<NonNullable<typeof supabase>['channel']> | null>(null)
  const prevPlan = useRef<Plan>(plan)
  const applyingRemote = useRef(false)
  const planRef = useRef<Plan>(plan)
  planRef.current = plan

  useEffect(() => {
    if (!supabase || !projectId || !user) {
      setPeers({})
      return
    }
    prevPlan.current = planRef.current
    const ch = supabase.channel(`collab:${projectId}`, {
      config: { broadcast: { self: false }, presence: { key: me.current.id } },
    })

    ch.on('broadcast', { event: 'ops' }, ({ payload }: { payload: { ops?: unknown } }) => {
      const ops = sanitizeOps(payload?.ops)
      if (!ops.length) return
      applyingRemote.current = true
      const np = applyOps(planRef.current, ops)
      prevPlan.current = np
      applyRemote(np)
      queueMicrotask(() => {
        applyingRemote.current = false
      })
    })

    ch.on('broadcast', { event: 'cursor' }, ({ payload }: { payload: Partial<Peer> }) => {
      if (typeof payload?.id !== 'string' || payload.id === me.current.id) return
      const peer: Peer = {
        id: payload.id,
        name: safeName(payload.name),
        color: safeColor(payload.color),
        x: typeof payload.x === 'number' ? payload.x : undefined,
        y: typeof payload.y === 'number' ? payload.y : undefined,
      }
      setPeers((ps) => ({ ...ps, [peer.id]: { ...ps[peer.id], ...peer } }))
    })

    const syncPresence = () => {
      const state = ch.presenceState() as Record<string, { id: string; name: string; color: string }[]>
      setPeers((prev) => {
        const next: Record<string, Peer> = {}
        for (const key of Object.keys(state)) {
          const meta = state[key][0]
          if (!meta || meta.id === me.current.id) continue
          next[meta.id] = { id: meta.id, name: safeName(meta.name), color: safeColor(meta.color), x: prev[meta.id]?.x, y: prev[meta.id]?.y }
        }
        return next
      })
    }
    ch.on('presence', { event: 'sync' }, syncPresence)

    ch.subscribe((status: string) => {
      if (status === 'SUBSCRIBED') ch.track({ id: me.current.id, name: me.current.name, color: me.current.color })
    })
    chan.current = ch

    return () => {
      supabase?.removeChannel(ch)
      chan.current = null
      setPeers({})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, user])

  // Broadcast local plan diffs (skip when we're applying a remote change).
  useEffect(() => {
    if (!chan.current || !projectId) {
      prevPlan.current = plan
      return
    }
    if (applyingRemote.current) {
      prevPlan.current = plan
      return
    }
    const ops = diffPlan(prevPlan.current, plan)
    prevPlan.current = plan
    if (ops.length) chan.current.send({ type: 'broadcast', event: 'ops', payload: { ops } })
  }, [plan, projectId])

  const onPointer = useRef(
    throttle((x: number, y: number) => {
      chan.current?.send({ type: 'broadcast', event: 'cursor', payload: { id: me.current.id, name: me.current.name, color: me.current.color, x, y } })
    }, 45),
  ).current

  return { peers: Object.values(peers), onPointer, active: !!(projectId && user && supabase) }
}
