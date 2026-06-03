'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Plan, Mode, Selection, SelItem, Door } from '../lib/types'
import { snap, clamp, uid, snapDoorToWalls, overlaps, gridStep, MIN_ROOM, MIN_SCALE, MAX_SCALE, type Box } from '../lib/geometry'
import { DOOR_LEN, swingForCursor, doorBox, doorGeom } from '../lib/door'
import { formatSize } from '../lib/units'
import { furnitureType } from '../lib/furniture'
import FurnitureGlyph from './FurnitureGlyph'

interface Props {
  plan: Plan
  setPlan: React.Dispatch<React.SetStateAction<Plan>>
  mode: Mode
  setMode: (m: Mode) => void
  sel: Selection
  setSel: (s: Selection) => void
}

type OrigPos = { t: 'room' | 'door' | 'furniture' | 'marker' | 'stair'; id: string; x: number; y: number }

type Drag =
  | { kind: 'draw'; ox: number; oy: number; what: 'room' | 'marker' }
  | { kind: 'marquee'; ox: number; oy: number }
  | { kind: 'pan'; cx0: number; cy0: number; vx0: number; vy0: number }
  | { kind: 'move-sel'; sx: number; sy: number; orig: OrigPos[]; click: SelItem; moved: boolean }
  | { kind: 'move-room' | 'resize-room' | 'resize-marker'; id: string; sx: number; sy: number; ox: number; oy: number; ow: number; oh: number }
  | { kind: 'move-furniture' | 'move-door' | 'move-marker' | 'move-stair'; id: string; sx: number; sy: number; ox: number; oy: number }
  | null

interface View {
  x: number
  y: number
  scale: number // pixels per cm (0 = not yet initialised)
}

export default function Canvas({ plan, setPlan, mode, setMode, sel, setSel }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const drag = useRef<Drag>(null)
  const [draft, setDraft] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [marquee, setMarquee] = useState<Box | null>(null)
  const [hoverRoom, setHoverRoom] = useState<string | null>(null)
  const [doorGhost, setDoorGhost] = useState<{ x: number; y: number; orientation: 'h' | 'v'; swing: 1 | -1 } | null>(null)

  const [size, setSize] = useState({ cw: 0, ch: 0 })
  const [view, setViewState] = useState<View>({ x: 0, y: 0, scale: 0 })
  const viewRef = useRef(view)
  function setView(v: View) {
    viewRef.current = v
    setViewState(v)
  }

  const spaceRef = useRef(false)
  const [spaceHeld, setSpaceHeld] = useState(false)

  const { viewMode, units } = plan
  const schematic = viewMode === 'schematic'

  const inSel = (type: SelItem['type'], id: string) => sel.some((s) => s.type === type && s.id === id)

  // ── Viewport sizing ───────────────────────────────────────────
  useLayoutEffect(() => {
    const el = hostRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ cw: el.clientWidth, ch: el.clientHeight }))
    ro.observe(el)
    setSize({ cw: el.clientWidth, ch: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  // Space-bar pans (held). Ignore while typing in a field.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      spaceRef.current = true
      setSpaceHeld(true)
      e.preventDefault()
    }
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceRef.current = false
        setSpaceHeld(false)
      }
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  function contentBounds() {
    const xs: number[] = []
    const ys: number[] = []
    const xe: number[] = []
    const ye: number[] = []
    for (const r of plan.rooms) xs.push(r.x), ys.push(r.y), xe.push(r.x + r.w), ye.push(r.y + r.h)
    for (const f of plan.furniture) xs.push(f.x), ys.push(f.y), xe.push(f.x + f.w), ye.push(f.y + f.h)
    for (const m of plan.markers) xs.push(m.x), ys.push(m.y), xe.push(m.x + m.w), ye.push(m.y + m.h)
    for (const s of plan.stairs) xs.push(s.x), ys.push(s.y), xe.push(s.x + s.w), ye.push(s.y + s.h)
    if (!xs.length) return { x: 0, y: 0, w: plan.width, h: plan.height }
    const x = Math.min(...xs)
    const y = Math.min(...ys)
    return { x, y, w: Math.max(...xe) - x, h: Math.max(...ye) - y }
  }

  function fitView() {
    const { cw, ch } = size
    if (cw === 0 || ch === 0) return
    const b = contentBounds()
    const pad = 1.15
    const sc = clamp(Math.min(cw / (b.w * pad), ch / (b.h * pad)), MIN_SCALE, MAX_SCALE)
    setView({ x: b.x + b.w / 2 - cw / sc / 2, y: b.y + b.h / 2 - ch / sc / 2, scale: sc })
  }

  useEffect(() => {
    if (size.cw > 0 && viewRef.current.scale === 0) fitView()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size])

  const scale = view.scale || (size.cw ? size.cw / Math.max(plan.width, 1) : 1)
  const vw = size.cw ? size.cw / scale : plan.width
  const vh = size.ch ? size.ch / scale : plan.height

  function toCm(e: { clientX: number; clientY: number }): { x: number; y: number } {
    const svg = svgRef.current!
    const ctm = svg.getScreenCTM()
    if (!ctm) return { x: 0, y: 0 }
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse())
    return { x: p.x, y: p.y }
  }

  function capture(e: React.PointerEvent) {
    svgRef.current?.setPointerCapture(e.pointerId)
  }

  // ── Zoom ──────────────────────────────────────────────────────
  function zoomAt(clientX: number, clientY: number, factor: number) {
    const cur = viewRef.current
    const s0 = cur.scale || scale
    const s2 = clamp(s0 * factor, MIN_SCALE, MAX_SCALE)
    if (s2 === s0) return
    const pc = toCm({ clientX, clientY })
    const offX = (pc.x - cur.x) * s0
    const offY = (pc.y - cur.y) * s0
    setView({ x: pc.x - offX / s2, y: pc.y - offY / s2, scale: s2 })
  }

  function zoomCentre(factor: number) {
    const cur = viewRef.current
    const s0 = cur.scale || scale
    const s2 = clamp(s0 * factor, MIN_SCALE, MAX_SCALE)
    if (s2 === s0) return
    const cxcm = cur.x + size.cw / s0 / 2
    const cycm = cur.y + size.ch / s0 / 2
    setView({ x: cxcm - size.cw / s2 / 2, y: cycm - size.ch / s2 / 2, scale: s2 })
  }

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015))
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size])

  // ── Capture phase: pan (space / middle mouse) or door placement ─
  function onDownCapture(e: React.PointerEvent) {
    if (spaceRef.current || e.button === 1) {
      e.stopPropagation()
      drag.current = { kind: 'pan', cx0: e.clientX, cy0: e.clientY, vx0: viewRef.current.x, vy0: viewRef.current.y }
      capture(e)
      return
    }
    if (mode === 'door') {
      e.stopPropagation()
      placeDoor(toCm(e))
    }
  }

  function placeDoor(p: { x: number; y: number }) {
    const hit = snapDoorToWalls(p.x, p.y, DOOR_LEN, plan.rooms)
    const d: Door = hit
      ? {
          id: uid(),
          x: hit.x,
          y: hit.y,
          length: DOOR_LEN,
          orientation: hit.orientation,
          swing: swingForCursor(hit.orientation, hit.orientation === 'h' ? hit.y : hit.x, p, doorGhost?.swing ?? 1),
          hinge: 1,
        }
      : { id: uid(), x: snap(p.x), y: snap(p.y), length: DOOR_LEN, orientation: 'h', swing: 1, hinge: 1 }
    setPlan((pl) => ({ ...pl, doors: [...pl.doors, d] }))
    setSel([{ type: 'door', id: d.id }])
    setDoorGhost(null)
    setMode('select')
  }

  // ── Background: draw a room, or marquee-select ────────────────
  function onBgDown(e: React.PointerEvent) {
    if (mode === 'door') return // capture handles it
    const p = toCm(e)
    if (mode === 'room' || mode === 'marker') {
      drag.current = { kind: 'draw', ox: snap(p.x), oy: snap(p.y), what: mode === 'marker' ? 'marker' : 'room' }
      setDraft({ x: snap(p.x), y: snap(p.y), w: 0, h: 0 })
    } else {
      drag.current = { kind: 'marquee', ox: p.x, oy: p.y }
      setMarquee({ x: p.x, y: p.y, w: 0, h: 0 })
    }
    capture(e)
  }

  // ── Selecting / moving objects ────────────────────────────────
  function toggle(item: SelItem) {
    setSel(inSel(item.type, item.id) ? sel.filter((s) => !(s.type === item.type && s.id === item.id)) : [...sel, item])
  }

  function startGroupMove(e: React.PointerEvent, click: SelItem) {
    const p = toCm(e)
    const orig: OrigPos[] = []
    for (const s of sel) {
      if (s.type === 'room') {
        const r = plan.rooms.find((r) => r.id === s.id)
        if (r) orig.push({ t: 'room', id: s.id, x: r.x, y: r.y })
      } else if (s.type === 'door') {
        const dd = plan.doors.find((d) => d.id === s.id)
        if (dd) orig.push({ t: 'door', id: s.id, x: dd.x, y: dd.y })
      } else if (s.type === 'furniture') {
        const f = plan.furniture.find((f) => f.id === s.id)
        if (f) orig.push({ t: 'furniture', id: s.id, x: f.x, y: f.y })
      } else if (s.type === 'marker') {
        const m = plan.markers.find((m) => m.id === s.id)
        if (m) orig.push({ t: 'marker', id: s.id, x: m.x, y: m.y })
      } else {
        const st = plan.stairs.find((st) => st.id === s.id)
        if (st) orig.push({ t: 'stair', id: s.id, x: st.x, y: st.y })
      }
    }
    drag.current = { kind: 'move-sel', sx: p.x, sy: p.y, orig, click, moved: false }
    capture(e)
  }

  // Common entry for a left-press on an object: shift toggles; pressing a
  // member of a multi-selection moves the group; otherwise select just it.
  function onObjDown(e: React.PointerEvent, item: SelItem, startSingle: () => void) {
    e.stopPropagation()
    if (e.shiftKey) {
      toggle(item)
      return
    }
    if (inSel(item.type, item.id) && sel.length > 1) {
      startGroupMove(e, item)
      return
    }
    setSel([item])
    startSingle()
  }

  function onRoomDown(e: React.PointerEvent, id: string) {
    onObjDown(e, { type: 'room', id }, () => {
      const r = plan.rooms.find((r) => r.id === id)!
      const p = toCm(e)
      drag.current = { kind: 'move-room', id, sx: p.x, sy: p.y, ox: r.x, oy: r.y, ow: r.w, oh: r.h }
      capture(e)
    })
  }

  function onRoomResize(e: React.PointerEvent, id: string) {
    e.stopPropagation()
    const r = plan.rooms.find((r) => r.id === id)!
    const p = toCm(e)
    drag.current = { kind: 'resize-room', id, sx: p.x, sy: p.y, ox: r.x, oy: r.y, ow: r.w, oh: r.h }
    setSel([{ type: 'room', id }])
    capture(e)
  }

  function onFurnDown(e: React.PointerEvent, id: string) {
    onObjDown(e, { type: 'furniture', id }, () => {
      const f = plan.furniture.find((f) => f.id === id)!
      const p = toCm(e)
      drag.current = { kind: 'move-furniture', id, sx: p.x, sy: p.y, ox: f.x, oy: f.y }
      capture(e)
    })
  }

  function onDoorDown(e: React.PointerEvent, id: string) {
    onObjDown(e, { type: 'door', id }, () => {
      const dd = plan.doors.find((d) => d.id === id)!
      const p = toCm(e)
      drag.current = { kind: 'move-door', id, sx: p.x, sy: p.y, ox: dd.x, oy: dd.y }
      capture(e)
    })
  }

  function onMarkerDown(e: React.PointerEvent, id: string) {
    onObjDown(e, { type: 'marker', id }, () => {
      const m = plan.markers.find((m) => m.id === id)!
      const p = toCm(e)
      drag.current = { kind: 'move-marker', id, sx: p.x, sy: p.y, ox: m.x, oy: m.y }
      capture(e)
    })
  }

  function onMarkerResize(e: React.PointerEvent, id: string) {
    e.stopPropagation()
    const m = plan.markers.find((m) => m.id === id)!
    const p = toCm(e)
    drag.current = { kind: 'resize-marker', id, sx: p.x, sy: p.y, ox: m.x, oy: m.y, ow: m.w, oh: m.h }
    setSel([{ type: 'marker', id }])
    capture(e)
  }

  function onStairDown(e: React.PointerEvent, id: string) {
    onObjDown(e, { type: 'stair', id }, () => {
      const st = plan.stairs.find((s) => s.id === id)!
      const p = toCm(e)
      drag.current = { kind: 'move-stair', id, sx: p.x, sy: p.y, ox: st.x, oy: st.y }
      capture(e)
    })
  }

  // ── Move / resize / pan / marquee ─────────────────────────────
  function onMove(e: React.PointerEvent) {
    const d = drag.current
    if (!d) {
      if (mode === 'door') {
        const p = toCm(e)
        const hit = snapDoorToWalls(p.x, p.y, DOOR_LEN, plan.rooms)
        setDoorGhost(
          hit
            ? { x: hit.x, y: hit.y, orientation: hit.orientation, swing: swingForCursor(hit.orientation, hit.orientation === 'h' ? hit.y : hit.x, p, doorGhost?.swing ?? 1) }
            : null,
        )
      }
      return
    }

    if (d.kind === 'pan') {
      const sc = viewRef.current.scale || scale
      setView({ x: d.vx0 - (e.clientX - d.cx0) / sc, y: d.vy0 - (e.clientY - d.cy0) / sc, scale: sc })
      return
    }

    const p = toCm(e)

    if (d.kind === 'draw') {
      setDraft({ x: Math.min(d.ox, snap(p.x)), y: Math.min(d.oy, snap(p.y)), w: Math.abs(snap(p.x) - d.ox), h: Math.abs(snap(p.y) - d.oy) })
      return
    }

    if (d.kind === 'marquee') {
      setMarquee({ x: Math.min(d.ox, p.x), y: Math.min(d.oy, p.y), w: Math.abs(p.x - d.ox), h: Math.abs(p.y - d.oy) })
      return
    }

    if (d.kind === 'move-sel') {
      const dx = snap(p.x - d.sx)
      const dy = snap(p.y - d.sy)
      if (dx !== 0 || dy !== 0) d.moved = true
      setPlan((pl) => ({
        ...pl,
        rooms: pl.rooms.map((r) => {
          const o = d.orig.find((x) => x.t === 'room' && x.id === r.id)
          return o ? { ...r, x: o.x + dx, y: o.y + dy } : r
        }),
        furniture: pl.furniture.map((f) => {
          const o = d.orig.find((x) => x.t === 'furniture' && x.id === f.id)
          return o ? { ...f, x: o.x + dx, y: o.y + dy } : f
        }),
        doors: pl.doors.map((dd) => {
          const o = d.orig.find((x) => x.t === 'door' && x.id === dd.id)
          return o ? { ...dd, x: o.x + dx, y: o.y + dy } : dd
        }),
        markers: pl.markers.map((m) => {
          const o = d.orig.find((x) => x.t === 'marker' && x.id === m.id)
          return o ? { ...m, x: o.x + dx, y: o.y + dy } : m
        }),
        stairs: pl.stairs.map((st) => {
          const o = d.orig.find((x) => x.t === 'stair' && x.id === st.id)
          return o ? { ...st, x: o.x + dx, y: o.y + dy } : st
        }),
      }))
      return
    }

    const dx = p.x - d.sx
    const dy = p.y - d.sy

    if (d.kind === 'move-room') {
      setPlan((pl) => ({ ...pl, rooms: pl.rooms.map((r) => (r.id === d.id ? { ...r, x: snap(d.ox + dx), y: snap(d.oy + dy) } : r)) }))
    } else if (d.kind === 'resize-room') {
      const nw = Math.max(MIN_ROOM, snap(d.ow + dx))
      const nh = Math.max(MIN_ROOM, snap(d.oh + dy))
      setPlan((pl) => ({ ...pl, rooms: pl.rooms.map((r) => (r.id === d.id ? { ...r, w: nw, h: nh } : r)) }))
    } else if (d.kind === 'move-furniture') {
      setPlan((pl) => ({ ...pl, furniture: pl.furniture.map((f) => (f.id === d.id ? { ...f, x: snap(d.ox + dx), y: snap(d.oy + dy) } : f)) }))
    } else if (d.kind === 'move-door') {
      setPlan((pl) => ({
        ...pl,
        doors: pl.doors.map((dd) => {
          if (dd.id !== d.id) return dd
          const hit = snapDoorToWalls(p.x, p.y, dd.length, pl.rooms)
          if (hit) {
            const swing = swingForCursor(hit.orientation, hit.orientation === 'h' ? hit.y : hit.x, p, dd.swing)
            return { ...dd, x: hit.x, y: hit.y, orientation: hit.orientation, swing }
          }
          return { ...dd, x: snap(d.ox + dx), y: snap(d.oy + dy) }
        }),
      }))
    } else if (d.kind === 'move-marker') {
      setPlan((pl) => ({ ...pl, markers: pl.markers.map((m) => (m.id === d.id ? { ...m, x: snap(d.ox + dx), y: snap(d.oy + dy) } : m)) }))
    } else if (d.kind === 'resize-marker') {
      const nw = Math.max(MIN_ROOM, snap(d.ow + dx))
      const nh = Math.max(MIN_ROOM, snap(d.oh + dy))
      setPlan((pl) => ({ ...pl, markers: pl.markers.map((m) => (m.id === d.id ? { ...m, w: nw, h: nh } : m)) }))
    } else if (d.kind === 'move-stair') {
      setPlan((pl) => ({ ...pl, stairs: pl.stairs.map((s) => (s.id === d.id ? { ...s, x: snap(d.ox + dx), y: snap(d.oy + dy) } : s)) }))
    }
  }

  function onUp(e: React.PointerEvent) {
    const d = drag.current
    // Recompute the final rect from the event (don't depend on React state,
    // which can lag a fast drag).
    if (d?.kind === 'draw') {
      const p = toCm(e)
      const x = Math.min(d.ox, snap(p.x))
      const y = Math.min(d.oy, snap(p.y))
      const w = Math.abs(snap(p.x) - d.ox)
      const h = Math.abs(snap(p.y) - d.oy)
      if (w >= MIN_ROOM && h >= MIN_ROOM) {
        const id = uid()
        if (d.what === 'marker') {
          setPlan((pl) => ({ ...pl, markers: [...pl.markers, { id, name: `Floor ${pl.markers.length + 1}`, x, y, w, h }] }))
          setSel([{ type: 'marker', id }])
        } else {
          setPlan((pl) => ({ ...pl, rooms: [...pl.rooms, { id, name: `Room ${pl.rooms.length + 1}`, x, y, w, h }] }))
          setSel([{ type: 'room', id }])
        }
      }
      setDraft(null)
    } else if (d?.kind === 'marquee') {
      const p = toCm(e)
      const box: Box = { x: Math.min(d.ox, p.x), y: Math.min(d.oy, p.y), w: Math.abs(p.x - d.ox), h: Math.abs(p.y - d.oy) }
      if (box.w < 5 && box.h < 5) {
        setSel([]) // a plain click on empty space clears the selection
      } else {
        const hits: SelItem[] = []
        for (const m of plan.markers) if (overlaps(box, { x: m.x, y: m.y, w: m.w, h: m.h })) hits.push({ type: 'marker', id: m.id })
        for (const r of plan.rooms) if (overlaps(box, { x: r.x, y: r.y, w: r.w, h: r.h })) hits.push({ type: 'room', id: r.id })
        for (const f of plan.furniture) if (overlaps(box, { x: f.x, y: f.y, w: f.w, h: f.h })) hits.push({ type: 'furniture', id: f.id })
        for (const s of plan.stairs) if (overlaps(box, { x: s.x, y: s.y, w: s.w, h: s.h })) hits.push({ type: 'stair', id: s.id })
        for (const dd of plan.doors) if (overlaps(box, doorBox(dd))) hits.push({ type: 'door', id: dd.id })
        setSel(hits)
      }
      setMarquee(null)
    } else if (d?.kind === 'move-sel' && !d.moved) {
      // Pressed (without dragging) a member of a multi-selection → narrow to it.
      setSel([d.click])
    }
    drag.current = null
    svgRef.current?.releasePointerCapture(e.pointerId)
  }

  // ── Grid lines ────────────────────────────────────────────────
  const minor = gridStep(scale, units)
  const major = minor * 4
  const left = view.scale ? view.x : 0
  const top = view.scale ? view.y : 0
  const right = left + vw
  const bottom = top + vh
  const vLines: number[] = []
  for (let x = Math.floor(left / minor) * minor; x <= right; x += minor) vLines.push(x)
  const hLines: number[] = []
  for (let y = Math.floor(top / minor) * minor; y <= bottom; y += minor) hLines.push(y)
  const isMajor = (v: number) => Math.abs(v % major) < 0.5

  const roomName = 15
  const roomDim = 12

  // Pair up stairs by link to draw the floor-transition connector.
  const stairLinks = new Map<string, { entry?: { x: number; y: number; w: number; h: number }; exit?: { x: number; y: number; w: number; h: number } }>()
  for (const s of plan.stairs) {
    const g = stairLinks.get(s.link) ?? {}
    g[s.role] = s
    stairLinks.set(s.link, g)
  }
  const connectors: { ex: number; ey: number; xx: number; xy: number }[] = []
  for (const g of stairLinks.values()) {
    if (g.entry && g.exit) {
      connectors.push({ ex: g.entry.x + g.entry.w / 2, ey: g.entry.y + g.entry.h / 2, xx: g.exit.x + g.exit.w / 2, xy: g.exit.y + g.exit.h / 2 })
    }
  }

  function spaceAbove(r: { id: string; x: number; y: number; w: number; h: number }): boolean {
    return !plan.rooms.some((o) => o.id !== r.id && o.x < r.x + r.w && o.x + o.w > r.x && o.y < r.y && o.y + o.h >= r.y - 2)
  }

  const bgCursor = spaceHeld ? 'grab' : mode === 'room' ? 'crosshair' : mode === 'door' ? 'copy' : 'default'

  return (
    <div className="canvas-host" ref={hostRef}>
      <svg
        ref={svgRef}
        className="canvas"
        viewBox={`${left} ${top} ${vw} ${vh}`}
        preserveAspectRatio="xMidYMid meet"
        style={spaceHeld ? { cursor: 'grab' } : undefined}
        onPointerDownCapture={onDownCapture}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={() => setDoorGhost(null)}
      >
        <rect x={left} y={top} width={vw} height={vh} fill="#fdfbf7" style={{ cursor: bgCursor }} onPointerDown={onBgDown} />

        {/* Grid */}
        {plan.showGrid && (
          <g pointerEvents="none">
            {vLines.map((x) => (
              <line key={`v${x}`} x1={x} y1={top} x2={x} y2={bottom} stroke={isMajor(x) ? '#e6dccb' : '#f0e9db'} strokeWidth={1} vectorEffect="non-scaling-stroke" />
            ))}
            {hLines.map((y) => (
              <line key={`h${y}`} x1={left} y1={y} x2={right} y2={y} stroke={isMajor(y) ? '#e6dccb' : '#f0e9db'} strokeWidth={1} vectorEffect="non-scaling-stroke" />
            ))}
          </g>
        )}

        {/* Markers (floor frames) — behind everything else */}
        {plan.markers.map((m) => {
          const active = inSel('marker', m.id)
          return (
            <g key={m.id}>
              <rect
                x={m.x}
                y={m.y}
                width={m.w}
                height={m.h}
                rx={10}
                fill="rgba(140,124,96,0.04)"
                stroke={active ? '#b5714e' : '#c9bca6'}
                strokeWidth={active ? 2.5 : 1.5}
                strokeDasharray="10 6"
                vectorEffect="non-scaling-stroke"
                style={{ cursor: 'move' }}
                onPointerDown={(e) => onMarkerDown(e, m.id)}
              />
              <text x={m.x + 12} y={m.y + 24} fontSize={18} fill="#b3a488" fontWeight={700} pointerEvents="none">
                {m.name}
              </text>
              {active && sel.length === 1 && (
                <rect x={m.x + m.w - 14} y={m.y + m.h - 14} width={28} height={28} fill="#b5714e" rx={3} style={{ cursor: 'nwse-resize' }} onPointerDown={(e) => onMarkerResize(e, m.id)} />
              )}
            </g>
          )
        })}

        {/* Rooms */}
        {plan.rooms.map((r) => {
          const active = inSel('room', r.id)
          const showLabel = plan.roomLabels === 'always' || active || hoverRoom === r.id
          const above = spaceAbove(r)
          const dimY = above ? r.y - 7 : r.y + roomName + roomDim + 12
          const nameY = above ? r.y - 7 - (roomDim + 3) : r.y + roomName + 6
          return (
            <g key={r.id} onPointerEnter={() => setHoverRoom(r.id)} onPointerLeave={() => setHoverRoom((h) => (h === r.id ? null : h))}>
              <rect
                x={r.x}
                y={r.y}
                width={r.w}
                height={r.h}
                fill={active ? 'rgba(181,113,78,0.06)' : 'rgba(74,65,54,0.02)'}
                stroke={active ? '#b5714e' : '#b3a78f'}
                strokeWidth={active ? 3 : 1.75}
                vectorEffect="non-scaling-stroke"
                style={{ cursor: 'move' }}
                onPointerDown={(e) => onRoomDown(e, r.id)}
              />
              {showLabel && (
                <>
                  <text x={r.x + 10} y={nameY} fontSize={roomName} fill="#8a7e6b" fontWeight={500} pointerEvents="none">
                    {r.name}
                  </text>
                  <text x={r.x + 10} y={dimY} fontSize={roomDim} fill="#a89c88" pointerEvents="none">
                    {formatSize(r.w, r.h, units)}
                  </text>
                </>
              )}
              {active && sel.length === 1 && (
                <rect x={r.x + r.w - 14} y={r.y + r.h - 14} width={28} height={28} fill="#b5714e" rx={3} style={{ cursor: 'nwse-resize' }} onPointerDown={(e) => onRoomResize(e, r.id)} />
              )}
            </g>
          )
        })}

        {/* Doors */}
        {plan.doors.map((d) => {
          const active = inSel('door', d.id)
          const color = active ? '#b5714e' : '#6b5f4f'
          const g = doorGeom(d.x, d.y, d.length, d.orientation, d.swing, d.hinge ?? 1)
          return (
            <g key={d.id} style={{ cursor: 'move' }} onPointerDown={(e) => onDoorDown(e, d.id)}>
              <line x1={g.ax} y1={g.ay} x2={g.bx} y2={g.by} stroke="#fdfbf7" strokeWidth={6} vectorEffect="non-scaling-stroke" />
              <path d={g.leaf} stroke={color} strokeWidth={3} vectorEffect="non-scaling-stroke" fill="none" />
              <path d={g.arc} stroke={color} strokeWidth={1.5} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" fill="none" />
              {active && <circle cx={g.hx} cy={g.hy} r={6} fill="#b5714e" vectorEffect="non-scaling-stroke" />}
            </g>
          )
        })}

        {/* Door placement ghost */}
        {mode === 'door' && doorGhost && (() => {
          const g = doorGeom(doorGhost.x, doorGhost.y, DOOR_LEN, doorGhost.orientation, doorGhost.swing, 1)
          return (
            <g pointerEvents="none">
              <line x1={g.ax} y1={g.ay} x2={g.bx} y2={g.by} stroke="#b5714e" strokeWidth={6} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
              <path d={g.leaf} stroke="#b5714e" strokeWidth={3} vectorEffect="non-scaling-stroke" fill="none" opacity={0.7} />
              <path d={g.arc} stroke="#b5714e" strokeWidth={1.5} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" fill="none" opacity={0.5} />
            </g>
          )
        })()}

        {/* Furniture */}
        {plan.furniture.map((f) => {
          const active = inSel('furniture', f.id)
          const cx = f.x + f.w / 2
          const cy = f.y + f.h / 2
          const t = furnitureType(f.type)
          return (
            <g key={f.id} transform={`rotate(${f.rotation} ${cx} ${cy})`} style={{ cursor: 'move' }} onPointerDown={(e) => onFurnDown(e, f.id)}>
              {schematic ? (
                <rect x={f.x} y={f.y} width={f.w} height={f.h} rx={6} fill={f.color} fillOpacity={0.85} stroke={active ? '#b5714e' : '#7a6e5b'} strokeWidth={active ? 3 : 1.5} vectorEffect="non-scaling-stroke" />
              ) : (
                <>
                  <rect x={f.x} y={f.y} width={f.w} height={f.h} rx={6} fill={f.color} fillOpacity={0.16} stroke={active ? '#b5714e' : '#cabfa9'} strokeWidth={active ? 3 : 1.2} vectorEffect="non-scaling-stroke" />
                  <FurnitureGlyph type={t} x={f.x} y={f.y} w={f.w} h={f.h} color={f.color} />
                </>
              )}
              <text x={cx} y={cy - 1} fontSize={13} fill="#8a7e6b" fontWeight={500} textAnchor="middle" pointerEvents="none">
                {f.name}
              </text>
              <text x={cx} y={cy + 13} fontSize={11} fill="#a89c88" textAnchor="middle" pointerEvents="none">
                {formatSize(f.w, f.h, units)}
              </text>
            </g>
          )
        })}

        {/* Stair transition connectors (entry ↔ exit) */}
        {connectors.map((c, i) => (
          <g key={`c${i}`} pointerEvents="none">
            <line x1={c.ex} y1={c.ey} x2={c.xx} y2={c.xy} stroke="#c4a98f" strokeWidth={1.5} strokeDasharray="9 7" vectorEffect="non-scaling-stroke" />
            <circle cx={c.ex} cy={c.ey} r={4} fill="#c4a98f" vectorEffect="non-scaling-stroke" />
            <circle cx={c.xx} cy={c.xy} r={4} fill="#c4a98f" vectorEffect="non-scaling-stroke" />
          </g>
        ))}

        {/* Stairs */}
        {plan.stairs.map((s) => {
          const active = inSel('stair', s.id)
          const cx = s.x + s.w / 2
          const cy = s.y + s.h / 2
          const n = Math.max(3, Math.min(12, Math.round(s.h / 35)))
          const steps = []
          for (let i = 1; i < n; i++) {
            const yy = s.y + (s.h * i) / n
            steps.push(<line key={i} x1={s.x + 6} y1={yy} x2={s.x + s.w - 6} y2={yy} stroke="#9a8c74" strokeWidth={1} vectorEffect="non-scaling-stroke" />)
          }
          const up = s.role === 'entry'
          const base = up ? s.y + 20 : s.y + s.h - 20
          const tip = up ? s.y + 7 : s.y + s.h - 7
          const arrow = `M ${cx - 7} ${base} L ${cx + 7} ${base} L ${cx} ${tip} Z`
          return (
            <g key={s.id} transform={`rotate(${s.rotation} ${cx} ${cy})`} style={{ cursor: 'move' }} onPointerDown={(e) => onStairDown(e, s.id)}>
              <rect x={s.x} y={s.y} width={s.w} height={s.h} rx={4} fill="#efe7d8" fillOpacity={0.9} stroke={active ? '#b5714e' : '#b3a488'} strokeWidth={active ? 3 : 1.5} vectorEffect="non-scaling-stroke" />
              {steps}
              <path d={arrow} fill="#8a7c66" stroke="none" pointerEvents="none" />
              <text x={cx} y={cy + 4} fontSize={12} fill="#8a7e6b" fontWeight={600} textAnchor="middle" pointerEvents="none">
                {up ? 'Entry' : 'Exit'}
              </text>
            </g>
          )
        })}

        {/* Draft room */}
        {draft && (
          <rect x={draft.x} y={draft.y} width={draft.w} height={draft.h} fill="rgba(181,113,78,0.09)" stroke="#b5714e" strokeWidth={2} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" pointerEvents="none" />
        )}

        {/* Marquee selection box */}
        {marquee && (
          <rect x={marquee.x} y={marquee.y} width={marquee.w} height={marquee.h} fill="rgba(181,113,78,0.07)" stroke="#b5714e" strokeWidth={1} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" pointerEvents="none" />
        )}
      </svg>

      {/* Zoom controls */}
      <div className="zoom-controls">
        <button className="zoom-btn" onClick={() => zoomCentre(1.25)} title="Zoom in">
          ＋
        </button>
        <button className="zoom-btn" onClick={() => zoomCentre(0.8)} title="Zoom out">
          －
        </button>
        <button className="zoom-btn" onClick={fitView} title="Fit to content">
          ⤢
        </button>
        <span className="zoom-pct">{Math.round(scale * 100)}%</span>
      </div>
    </div>
  )
}
