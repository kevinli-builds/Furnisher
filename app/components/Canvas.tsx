'use client'

import { useEffect, useRef, useState } from 'react'
import type { Plan, Mode, Selection, SelItem, Door, Pt } from '../lib/types'
import { snap, uid, snapDoorToWalls, bboxHalf, snapBBox, alignBBox, faceSnap, gridStep, roomCorners, bboxOf, resizeRect, MIN_ROOM, type Box } from '../lib/geometry'
import { useViewport } from '../lib/useViewport'
import { DOOR_LEN, swingForCursor, doorBox, doorGeom } from '../lib/door'
import { pointHits, objectsInMarquee, cycleNext } from '../lib/interactions'
import { sunAt, sunColor, formatHour, windowCones, lampGlows } from '../lib/sun'
import { computeWarnings, computeClearance } from '../lib/warnings'
import { inRoom } from '../lib/stats'
import { formatLength } from '../lib/units'
import { furnitureType } from '../lib/furniture'
import type { Peer } from '../lib/collab'
import CeilingLight from './CeilingLight'
import Handles from './Handles'
import FurniturePiece from './FurniturePiece'
import RoomShape from './RoomShape'
import Stairs from './Stairs'
import LightingLayer from './LightingLayer'
import PeerCursors from './PeerCursors'
import Opening from './Opening'

interface Props {
  plan: Plan
  setPlan: React.Dispatch<React.SetStateAction<Plan>>
  mode: Mode
  setMode: (m: Mode) => void
  sel: Selection
  setSel: (s: Selection) => void
  peers?: Peer[]
  onPointer?: (x: number, y: number) => void
  gearForSettings?: boolean // mobile: show a gear by the selected object to open settings
  onOpenSettings?: () => void
  onDeleteSelected?: () => void
  compactHandles?: boolean // mobile: fewer, bigger resize handles for touch
  resetSignal?: number // bump to force-clear stuck multi-touch / drag state (emergency hatch)
}

type OrigPos = { t: 'room' | 'door' | 'furniture' | 'marker' | 'stair' | 'light'; id: string; x: number; y: number }

type Drag =
  | { kind: 'draw'; ox: number; oy: number; what: 'room' | 'marker' }
  | { kind: 'marquee'; ox: number; oy: number }
  | { kind: 'pan'; cx0: number; cy0: number; vx0: number; vy0: number; moved?: boolean; deselect?: boolean; tapSelect?: SelItem }
  | { kind: 'move-sel'; sx: number; sy: number; orig: OrigPos[]; click: SelItem; moved: boolean }
  | { kind: 'move-room'; id: string; sx: number; sy: number; ox: number; oy: number; pts?: Pt[]; moved?: boolean }
  | { kind: 'resize'; otype: 'room' | 'furniture' | 'marker' | 'stair'; id: string; hx: number; hy: number; sx: number; sy: number; ox: number; oy: number; ow: number; oh: number; rot: number }
  | { kind: 'move-node'; id: string; idx: number; sx: number; sy: number }
  | { kind: 'move-furniture' | 'move-door' | 'move-marker' | 'move-stair' | 'move-light'; id: string; sx: number; sy: number; ox: number; oy: number; moved?: boolean }
  | { kind: 'resize-door'; id: string; orient: 'h' | 'v'; fixed: number }
  | { kind: 'rotate'; otype: 'furniture' | 'stair'; id: string; cx: number; cy: number }
  | { kind: 'measure' }
  | null

export default function Canvas({ plan, setPlan, mode, setMode, sel, setSel, peers = [], onPointer, gearForSettings, onOpenSettings, onDeleteSelected, compactHandles, resetSignal }: Props) {
  const drag = useRef<Drag>(null)
  const [draft, setDraft] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [marquee, setMarquee] = useState<Box | null>(null)
  const [hoverRoom, setHoverRoom] = useState<string | null>(null)
  const [hoverFurn, setHoverFurn] = useState<string | null>(null)
  const [doorGhost, setDoorGhost] = useState<{ x: number; y: number; orientation: 'h' | 'v'; swing: 1 | -1; type: 'swing' | 'window' } | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; items: { item: SelItem; label: string }[] } | null>(null)
  const [snapGuide, setSnapGuide] = useState<{ gx: number | null; gy: number | null } | null>(null)
  const [measure, setMeasure] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null)
  const [dragDims, setDragDims] = useState<{ x1: number; y1: number; x2: number; y2: number; label: string }[] | null>(null)

  const { hostRef, svgRef, viewRef, setView, scale, vw, vh, left, top, toCm, capture, fitView, zoomCentre, zoomAt } = useViewport(plan)

  // Two-finger pinch-to-zoom (touch). Tracks active pointers; 2 down = pinch.
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map())
  const pinchDist = useRef<number | null>(null)
  const pinchMid = useRef<{ x: number; y: number } | null>(null) // last two-finger midpoint (for pan)
  // Long-press (touch) toggles an object in/out of a multi-selection.
  const longPress = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lpStart = useRef<{ x: number; y: number } | null>(null)
  const clearLongPress = () => {
    if (longPress.current) clearTimeout(longPress.current)
    longPress.current = null
    lpStart.current = null
  }

  const spaceRef = useRef(false)
  const [spaceHeld, setSpaceHeld] = useState(false)
  // Selection as it was *before* the current press — lets a no-move click on a
  // stack of overlapping objects cycle to the next one underneath (see onUp).
  const prevSelRef = useRef<Selection>([])
  // Last polygon-vertex press (id+idx+time) — used to detect a double-click /
  // double-tap ourselves, since the SVG-level pointer capture steals the native
  // dblclick from the vertex circle (and this also gives us touch double-tap).
  const lastNodeTap = useRef<{ id: string; idx: number; t: number } | null>(null)

  const { viewMode, units } = plan
  const schematic = viewMode === 'schematic'

  const inSel = (type: SelItem['type'], id: string) => sel.some((s) => s.type === type && s.id === id)

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

  // Drop the measurement overlay when leaving the Measure tool.
  useEffect(() => {
    if (mode !== 'measure') setMeasure(null)
  }, [mode])

  // Clear any pending long-press timer on unmount.
  useEffect(() => () => clearLongPress(), [])

  // Emergency hatch: the external "Select" button bumps resetSignal to clear any
  // stuck interaction state — chiefly a multi-touch gesture that ended without a
  // pointerup (so the canvas still thinks two fingers are down and keeps pinching).
  useEffect(() => {
    pointers.current.clear()
    pinchDist.current = null
    pinchMid.current = null
    drag.current = null
    clearLongPress()
    setDraft(null)
    setMarquee(null)
    setSnapGuide(null)
    setDragDims(null)
    setDoorGhost(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetSignal])

  // Every object whose box contains a point, front-most first.
  // Drag a template from the Inventory panel onto the plan.
  function onDragOver(e: React.DragEvent) {
    if (e.dataTransfer.types.includes('application/furnisher-item')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    }
  }
  function onDrop(e: React.DragEvent) {
    const raw = e.dataTransfer.getData('application/furnisher-item')
    if (!raw) return
    e.preventDefault()
    let parsed: { kind: 'furniture' | 'room' | 'marker'; template: { name: string; w: number; h: number; type?: string; color?: string; url?: string; shape?: 'rect' | 'round'; price?: number; style?: 'frame' | 'shaded' | 'closet' } }
    try {
      parsed = JSON.parse(raw)
    } catch {
      return
    }
    const p = toCm(e)
    const t = parsed.template
    const id = uid()
    const x = snap(p.x - t.w / 2)
    const y = snap(p.y - t.h / 2)
    if (parsed.kind === 'furniture') {
      setPlan((pl) => ({
        ...pl,
        furniture: [...pl.furniture, { id, name: t.name, type: furnitureType(t.type), x, y, w: t.w, h: t.h, rotation: 0, color: t.color ?? '#d8c8a4', shape: t.shape, url: t.url, price: t.price }],
      }))
      setSel([{ type: 'furniture', id }])
    } else if (parsed.kind === 'marker') {
      setPlan((pl) => ({ ...pl, markers: [...pl.markers, { id, name: t.name, style: t.style ?? 'frame', x, y, w: t.w, h: t.h }] }))
      setSel([{ type: 'marker', id }])
    } else {
      setPlan((pl) => ({ ...pl, rooms: [...pl.rooms, { id, name: t.name, x, y, w: t.w, h: t.h }] }))
      setSel([{ type: 'room', id }])
    }
  }

  function onContextMenu(e: React.MouseEvent) {
    const items = pointHits(plan, toCm(e))
    if (items.length === 0) return // let the native menu show on empty space
    e.preventDefault()
    const host = hostRef.current!.getBoundingClientRect()
    setMenu({ x: e.clientX - host.left, y: e.clientY - host.top, items })
  }

  // ── Capture phase: pan (space / middle mouse), measure, or door placement ─
  function onDownCapture(e: React.PointerEvent) {
    if (menu) setMenu(null)
    if (e.pointerType === 'touch') {
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pointers.current.size === 2) {
        // Second finger down → start a pinch; abort any in-progress drag.
        e.stopPropagation()
        drag.current = null
        setDraft(null)
        setMarquee(null)
        const [a, b] = [...pointers.current.values()]
        pinchDist.current = Math.hypot(a.x - b.x, a.y - b.y)
        pinchMid.current = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
        return
      }
    }
    if (spaceRef.current || e.button === 1) {
      e.stopPropagation()
      drag.current = { kind: 'pan', cx0: e.clientX, cy0: e.clientY, vx0: viewRef.current.x, vy0: viewRef.current.y }
      capture(e)
      return
    }
    if (mode === 'measure') {
      // Drag to measure any distance — intercept before objects can select.
      e.stopPropagation()
      const p = toCm(e)
      drag.current = { kind: 'measure' }
      setMeasure({ x1: snap(p.x), y1: snap(p.y), x2: snap(p.x), y2: snap(p.y) })
      capture(e)
      return
    }
    if (mode === 'light') {
      e.stopPropagation()
      const p = toCm(e)
      const id = uid()
      setPlan((pl) => ({ ...pl, lights: [...pl.lights, { id, x: snap(p.x), y: snap(p.y) }] }))
      setSel([{ type: 'light', id }])
      setMode('select')
      return
    }
    if (mode === 'door' || mode === 'window') {
      e.stopPropagation()
      placeDoor(toCm(e), mode === 'window' ? 'window' : 'swing')
    }
  }

  function placeDoor(p: { x: number; y: number }, type: 'swing' | 'window') {
    const hit = snapDoorToWalls(p.x, p.y, DOOR_LEN, plan.rooms)
    const d: Door = hit
      ? {
          id: uid(),
          type,
          x: hit.x,
          y: hit.y,
          length: DOOR_LEN,
          orientation: hit.orientation,
          swing: swingForCursor(hit.orientation, hit.orientation === 'h' ? hit.y : hit.x, p, doorGhost?.swing ?? 1),
          hinge: 1,
        }
      : { id: uid(), type, x: snap(p.x), y: snap(p.y), length: DOOR_LEN, orientation: 'h', swing: 1, hinge: 1 }
    setPlan((pl) => ({ ...pl, doors: [...pl.doors, d] }))
    setSel([{ type: 'door', id: d.id }])
    setDoorGhost(null)
    setMode('select')
  }

  // ── Background: draw a room, pan, or marquee-select ───────────
  function onBgDown(e: React.PointerEvent) {
    if (mode === 'door' || mode === 'window') return // capture handles it
    const p = toCm(e)
    if (mode === 'room' || mode === 'marker') {
      drag.current = { kind: 'draw', ox: snap(p.x), oy: snap(p.y), what: mode === 'marker' ? 'marker' : 'room' }
      setDraft({ x: snap(p.x), y: snap(p.y), w: 0, h: 0 })
    } else if (e.shiftKey) {
      // Shift+drag on empty space = marquee select.
      drag.current = { kind: 'marquee', ox: p.x, oy: p.y }
      setMarquee({ x: p.x, y: p.y, w: 0, h: 0 })
    } else {
      // Plain drag on empty space = pan the grid; a no-move click deselects.
      drag.current = { kind: 'pan', cx0: e.clientX, cy0: e.clientY, vx0: viewRef.current.x, vy0: viewRef.current.y, deselect: true }
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
      } else if (s.type === 'light') {
        const l = plan.lights.find((l) => l.id === s.id)
        if (l) orig.push({ t: 'light', id: s.id, x: l.x, y: l.y })
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
    prevSelRef.current = sel // remember what was selected before this press (for overlap cycling)
    if (e.shiftKey) {
      toggle(item)
      return
    }
    // Touch: a stationary long-press toggles the object in/out of the selection
    // (multi-select) — the only way to select several at once without a keyboard.
    if (e.pointerType === 'touch') {
      lpStart.current = { x: e.clientX, y: e.clientY }
      longPress.current = setTimeout(() => {
        toggle(item)
        drag.current = null // cancel the pending pan / move
        setSnapGuide(null)
        setDragDims(null)
        clearLongPress()
      }, 450)
    }
    // Touch (maps-style): a one-finger drag on an object that isn't already
    // selected pans the grid; a tap selects it. Drag a selected object to move
    // it. (Mouse keeps the immediate drag-to-move behaviour.)
    if (e.pointerType === 'touch' && !inSel(item.type, item.id)) {
      drag.current = { kind: 'pan', cx0: e.clientX, cy0: e.clientY, vx0: viewRef.current.x, vy0: viewRef.current.y, tapSelect: item }
      capture(e)
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
      drag.current = { kind: 'move-room', id, sx: p.x, sy: p.y, ox: r.x, oy: r.y, pts: r.points }
      capture(e)
    })
  }

  // Generic border/corner resize for room/furniture/marker/stair. hx,hy are the
  // handle's local sign (-1/0/1). Math runs in the object's local (rotated) frame
  // so the opposite edge stays anchored.
  function onResizeStart(e: React.PointerEvent, otype: 'room' | 'furniture' | 'marker' | 'stair', id: string, hx: number, hy: number) {
    e.stopPropagation()
    const o =
      otype === 'room'
        ? plan.rooms.find((r) => r.id === id)
        : otype === 'furniture'
          ? plan.furniture.find((f) => f.id === id)
          : otype === 'marker'
            ? plan.markers.find((m) => m.id === id)
            : plan.stairs.find((s) => s.id === id)
    if (!o) return
    const rot = 'rotation' in o ? (o.rotation as number) : 0
    const p = toCm(e)
    drag.current = { kind: 'resize', otype, id, hx, hy, sx: p.x, sy: p.y, ox: o.x, oy: o.y, ow: o.w, oh: o.h, rot }
    setSel([{ type: otype, id }])
    capture(e)
  }

  // Drag the rotate knob to spin a piece around its centre (snaps to 15°, Shift = free).
  function onRotateStart(e: React.PointerEvent, otype: 'furniture' | 'stair', id: string) {
    e.stopPropagation()
    const o = otype === 'furniture' ? plan.furniture.find((f) => f.id === id) : plan.stairs.find((s) => s.id === id)
    if (!o) return
    drag.current = { kind: 'rotate', otype, id, cx: o.x + o.w / 2, cy: o.y + o.h / 2 }
    setSel([{ type: otype, id }])
    capture(e)
  }

  // ── Polygon room node editing ─────────────────────────────────
  function setRoomPoints(id: string, pts: Pt[]) {
    const bb = bboxOf(pts)
    setPlan((pl) => ({ ...pl, rooms: pl.rooms.map((r) => (r.id === id ? { ...r, points: pts, ...bb } : r)) }))
  }

  function onNodeDown(e: React.PointerEvent, id: string, idx: number) {
    e.stopPropagation()
    if (e.button === 2) return // right-click is handled by onContextMenu → deleteNode
    // Double-click / double-tap the same corner → remove it. Detected here (not
    // via a native onDoubleClick) because capture() redirects the dblclick to the
    // SVG root, so the vertex never sees it. Works for mouse and touch alike.
    const now = e.timeStamp
    const last = lastNodeTap.current
    if (last && last.id === id && last.idx === idx && now - last.t < 350) {
      lastNodeTap.current = null
      removeNode(id, idx)
      return
    }
    lastNodeTap.current = { id, idx, t: now }
    const p = toCm(e)
    drag.current = { kind: 'move-node', id, idx, sx: p.x, sy: p.y }
    setSel([{ type: 'room', id }])
    capture(e)
  }

  // Drop a polygon corner, keeping at least a triangle.
  function removeNode(id: string, idx: number) {
    const r = plan.rooms.find((r) => r.id === id)
    if (!r?.points || r.points.length <= 3) return
    setRoomPoints(id, r.points.filter((_, i) => i !== idx))
  }

  function insertNode(e: React.PointerEvent, id: string, edge: number) {
    e.stopPropagation()
    const r = plan.rooms.find((r) => r.id === id)!
    const pts = roomCorners(r)
    const a = pts[edge]
    const b = pts[(edge + 1) % pts.length]
    const mid = { x: snap((a.x + b.x) / 2), y: snap((a.y + b.y) / 2) }
    setRoomPoints(id, [...pts.slice(0, edge + 1), mid, ...pts.slice(edge + 1)])
    setSel([{ type: 'room', id }])
  }

  // Right-click (or the native dblclick, when it does land) on a corner → remove.
  function deleteNode(e: React.MouseEvent, id: string, idx: number) {
    e.preventDefault()
    e.stopPropagation()
    removeNode(id, idx)
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

  // Drag a window/door end to lengthen or shorten it; the opposite end stays put.
  function onDoorResizeStart(e: React.PointerEvent, id: string, end: 0 | 1) {
    e.stopPropagation()
    const dd = plan.doors.find((d) => d.id === id)
    if (!dd) return
    const start = dd.orientation === 'h' ? dd.x : dd.y
    const fixed = end === 0 ? start + dd.length : start // the end NOT being dragged
    drag.current = { kind: 'resize-door', id, orient: dd.orientation, fixed }
    setSel([{ type: 'door', id }])
    capture(e)
  }

  function onMarkerDown(e: React.PointerEvent, id: string) {
    onObjDown(e, { type: 'marker', id }, () => {
      const m = plan.markers.find((m) => m.id === id)!
      const p = toCm(e)
      drag.current = { kind: 'move-marker', id, sx: p.x, sy: p.y, ox: m.x, oy: m.y }
      capture(e)
    })
  }

  function onStairDown(e: React.PointerEvent, id: string) {
    onObjDown(e, { type: 'stair', id }, () => {
      const st = plan.stairs.find((s) => s.id === id)!
      const p = toCm(e)
      drag.current = { kind: 'move-stair', id, sx: p.x, sy: p.y, ox: st.x, oy: st.y }
      capture(e)
    })
  }

  function onLightDown(e: React.PointerEvent, id: string) {
    onObjDown(e, { type: 'light', id }, () => {
      const l = plan.lights.find((l) => l.id === id)!
      const p = toCm(e)
      drag.current = { kind: 'move-light', id, sx: p.x, sy: p.y, ox: l.x, oy: l.y }
      capture(e)
    })
  }

  // Auto-snap a dragged object to nearby walls + other objects' edges. Returns
  // the resolved x/y (+ rotation for face-snapping furniture) and updates the
  // guide-line state. Falls back to grid snapping when nothing is in range.
  function snapMove(
    obj: { id: string; x: number; y: number; w: number; h: number; rotation?: number; snap?: boolean; face?: boolean },
    rawX: number,
    rawY: number,
    kind: 'furniture' | 'marker' | 'stair',
  ): { x: number; y: number; rotation?: number } {
    const wantSnap = obj.snap || plan.snapAll
    if (!wantSnap) {
      setSnapGuide(null)
      return { x: snap(rawX), y: snap(rawY), rotation: obj.rotation }
    }
    const { w, h } = obj
    // Candidate lines: room walls + every other object's bounding-box edges.
    const vLines: number[] = []
    const hLines: number[] = []
    for (const r of plan.rooms) { vLines.push(r.x, r.x + r.w); hLines.push(r.y, r.y + r.h) }
    for (const f of plan.furniture) if (f.id !== obj.id) { vLines.push(f.x, f.x + f.w); hLines.push(f.y, f.y + f.h) }
    for (const m of plan.markers) if (m.id !== obj.id) { vLines.push(m.x, m.x + m.w); hLines.push(m.y, m.y + m.h) }
    for (const s of plan.stairs) if (s.id !== obj.id) { vLines.push(s.x, s.x + s.w); hLines.push(s.y, s.y + s.h) }

    let cx = rawX + w / 2
    let cy = rawY + h / 2
    let rotation = obj.rotation ?? 0
    // Face-snap (furniture only): rotate the back against the nearest wall, flush.
    if (kind === 'furniture' && obj.face) {
      const fs = faceSnap(cx, cy, w, h, plan.rooms, 35)
      if (fs) {
        rotation = fs.rot
        if (fs.axis === 'x') cx = fs.value
        else cy = fs.value
      }
    }
    const { hw, hh } = bboxHalf(w, h, rotation)
    const s = snapBBox(cx, cy, hw, hh, vLines, hLines, 20)
    setSnapGuide(s.gx !== null || s.gy !== null ? { gx: s.gx, gy: s.gy } : null)
    return {
      x: s.gx !== null ? s.cx - w / 2 : snap(rawX),
      y: s.gy !== null ? s.cy - h / 2 : snap(rawY),
      rotation,
    }
  }

  // Smart-alignment snap (always on, for pieces without wall-snap): nudge the
  // dragged object so an edge/centre lines up with another object's edge/centre
  // or a wall, drawing a guide line. Falls back to the grid when nothing aligns.
  function alignMove(obj: { id: string; x: number; y: number; w: number; h: number; rotation?: number }, rawX: number, rawY: number): { x: number; y: number } {
    const { w, h } = obj
    const { hw, hh } = bboxHalf(w, h, obj.rotation ?? 0)
    const vLines: number[] = []
    const hLines: number[] = []
    const addBox = (x: number, y: number, bw: number, bh: number) => {
      vLines.push(x, x + bw / 2, x + bw)
      hLines.push(y, y + bh / 2, y + bh)
    }
    for (const r of plan.rooms) addBox(r.x, r.y, r.w, r.h)
    for (const f of plan.furniture)
      if (f.id !== obj.id) {
        const b = bboxHalf(f.w, f.h, f.rotation)
        addBox(f.x + f.w / 2 - b.hw, f.y + f.h / 2 - b.hh, b.hw * 2, b.hh * 2)
      }
    for (const m of plan.markers) if (m.id !== obj.id) addBox(m.x, m.y, m.w, m.h)
    for (const s of plan.stairs)
      if (s.id !== obj.id) {
        const b = bboxHalf(s.w, s.h, s.rotation)
        addBox(s.x + s.w / 2 - b.hw, s.y + s.h / 2 - b.hh, b.hw * 2, b.hh * 2)
      }
    for (const l of plan.lights) if (l.id !== obj.id) addBox(l.x, l.y, 0, 0)

    const cx = rawX + w / 2
    const cy = rawY + h / 2
    const a = alignBBox(cx, cy, hw, hh, vLines, hLines, 8 / (scale || 1))
    setSnapGuide(a.gx !== null || a.gy !== null ? { gx: a.gx, gy: a.gy } : null)
    return {
      x: a.gx !== null ? a.cx - w / 2 : snap(rawX),
      y: a.gy !== null ? a.cy - h / 2 : snap(rawY),
    }
  }

  // Move helper: wall-snap when the piece (or global) has snap on, else smart
  // alignment. Returns the resolved x/y (+ rotation from face-snap).
  function moveResolve(obj: { id: string; x: number; y: number; w: number; h: number; rotation?: number; snap?: boolean; face?: boolean }, rawX: number, rawY: number, kind: 'furniture' | 'marker' | 'stair'): { x: number; y: number; rotation?: number } {
    if (obj.snap || plan.snapAll) return snapMove(obj, rawX, rawY, kind)
    return alignMove(obj, rawX, rawY)
  }

  // Live gap labels from a dragged piece's bounding box to its room's walls.
  function wallDims(bx: number, by: number, bw: number, bh: number): { x1: number; y1: number; x2: number; y2: number; label: string }[] {
    const pcx = bx + bw / 2
    const pcy = by + bh / 2
    const room = plan.rooms.find((r) => inRoom(pcx, pcy, r))
    if (!room) return []
    const L = room.x
    const R = room.x + room.w
    const T = room.y
    const B = room.y + room.h
    const dims: { x1: number; y1: number; x2: number; y2: number; label: string }[] = []
    if (bx - L > 1) dims.push({ x1: L, y1: pcy, x2: bx, y2: pcy, label: formatLength(bx - L, units) })
    if (R - (bx + bw) > 1) dims.push({ x1: bx + bw, y1: pcy, x2: R, y2: pcy, label: formatLength(R - (bx + bw), units) })
    if (by - T > 1) dims.push({ x1: pcx, y1: T, x2: pcx, y2: by, label: formatLength(by - T, units) })
    if (B - (by + bh) > 1) dims.push({ x1: pcx, y1: by + bh, x2: pcx, y2: B, label: formatLength(B - (by + bh), units) })
    return dims
  }

  // ── Move / resize / pan / marquee ─────────────────────────────
  function onMove(e: React.PointerEvent) {
    // Moving the finger cancels a pending long-press (it's a drag, not a hold).
    if (longPress.current && lpStart.current && (Math.abs(e.clientX - lpStart.current.x) > 8 || Math.abs(e.clientY - lpStart.current.y) > 8)) clearLongPress()
    // Pinch-to-zoom: while two fingers are down, zoom around their midpoint.
    if (e.pointerType === 'touch' && pointers.current.has(e.pointerId)) {
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pinchDist.current !== null && pointers.current.size >= 2) {
        const [a, b] = [...pointers.current.values()]
        const mx = (a.x + b.x) / 2
        const my = (a.y + b.y) / 2
        const dist = Math.hypot(a.x - b.x, a.y - b.y)
        // Two-finger pan: follow the midpoint's movement (maps-style pinch+drag).
        if (pinchMid.current) {
          const sc = viewRef.current.scale || scale
          const dxp = mx - pinchMid.current.x
          const dyp = my - pinchMid.current.y
          if (dxp || dyp) setView({ x: viewRef.current.x - dxp / sc, y: viewRef.current.y - dyp / sc, scale: sc })
        }
        pinchMid.current = { x: mx, y: my }
        if (pinchDist.current > 0 && dist > 0) zoomAt(mx, my, dist / pinchDist.current)
        pinchDist.current = dist
        return
      }
    }
    if (onPointer) {
      const c = toCm(e)
      onPointer(c.x, c.y)
    }
    const d = drag.current
    if (!d) {
      if (mode === 'door' || mode === 'window') {
        const p = toCm(e)
        const hit = snapDoorToWalls(p.x, p.y, DOOR_LEN, plan.rooms)
        setDoorGhost(
          hit
            ? {
                x: hit.x,
                y: hit.y,
                orientation: hit.orientation,
                swing: swingForCursor(hit.orientation, hit.orientation === 'h' ? hit.y : hit.x, p, doorGhost?.swing ?? 1),
                type: mode === 'window' ? 'window' : 'swing',
              }
            : null,
        )
      }
      return
    }

    if (d.kind === 'pan') {
      if (Math.abs(e.clientX - d.cx0) > 3 || Math.abs(e.clientY - d.cy0) > 3) d.moved = true
      const sc = viewRef.current.scale || scale
      setView({ x: d.vx0 - (e.clientX - d.cx0) / sc, y: d.vy0 - (e.clientY - d.cy0) / sc, scale: sc })
      return
    }

    if (d.kind === 'measure') {
      const p = toCm(e)
      setMeasure((m) => (m ? { ...m, x2: snap(p.x), y2: snap(p.y) } : m))
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
        lights: pl.lights.map((l) => {
          const o = d.orig.find((x) => x.t === 'light' && x.id === l.id)
          return o ? { ...l, x: o.x + dx, y: o.y + dy } : l
        }),
      }))
      return
    }

    if (d.kind === 'resize-door') {
      const MIN_OPENING = 30
      const dragged = snap(d.orient === 'h' ? p.x : p.y)
      let lo = Math.min(d.fixed, dragged)
      let hi = Math.max(d.fixed, dragged)
      if (hi - lo < MIN_OPENING) {
        if (dragged >= d.fixed) { lo = d.fixed; hi = d.fixed + MIN_OPENING } else { hi = d.fixed; lo = d.fixed - MIN_OPENING }
      }
      const length = hi - lo
      setPlan((pl) => ({
        ...pl,
        doors: pl.doors.map((dd) => (dd.id === d.id ? (d.orient === 'h' ? { ...dd, x: lo, length } : { ...dd, y: lo, length }) : dd)),
      }))
      return
    }

    if (d.kind === 'rotate') {
      const ang = (Math.atan2(p.y - d.cy, p.x - d.cx) * 180) / Math.PI + 90 // handle points "up" at rotation 0
      let r = ((ang % 360) + 360) % 360
      if (!e.shiftKey) r = (Math.round(r / 15) * 15) % 360 // snap to 15° unless Shift
      setPlan((pl) =>
        d.otype === 'furniture'
          ? { ...pl, furniture: pl.furniture.map((f) => (f.id === d.id ? { ...f, rotation: r } : f)) }
          : { ...pl, stairs: pl.stairs.map((s) => (s.id === d.id ? { ...s, rotation: r } : s)) },
      )
      return
    }

    const dx = p.x - d.sx
    const dy = p.y - d.sy

    // Flag a real displacement so onUp can tell a drag from a click (cycling).
    if (
      (d.kind === 'move-room' || d.kind === 'move-furniture' || d.kind === 'move-door' || d.kind === 'move-marker' || d.kind === 'move-stair' || d.kind === 'move-light') &&
      (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5)
    ) {
      d.moved = true
    }

    if (d.kind === 'move-room') {
      const ndx = snap(d.ox + dx) - d.ox
      const ndy = snap(d.oy + dy) - d.oy
      if (d.pts) {
        const np = d.pts.map((pt) => ({ x: pt.x + ndx, y: pt.y + ndy }))
        const bb = bboxOf(np)
        setPlan((pl) => ({ ...pl, rooms: pl.rooms.map((r) => (r.id === d.id ? { ...r, points: np, ...bb } : r)) }))
      } else {
        setPlan((pl) => ({ ...pl, rooms: pl.rooms.map((r) => (r.id === d.id ? { ...r, x: d.ox + ndx, y: d.oy + ndy } : r)) }))
      }
    } else if (d.kind === 'move-node') {
      setPlan((pl) => ({
        ...pl,
        rooms: pl.rooms.map((r) => {
          if (r.id !== d.id || !r.points) return r
          const np = r.points.map((pt, i) => (i === d.idx ? { x: snap(p.x), y: snap(p.y) } : pt))
          return { ...r, points: np, ...bboxOf(np) }
        }),
      }))
    } else if (d.kind === 'resize') {
      const nb = resizeRect(d.ox, d.oy, d.ow, d.oh, d.rot, d.hx, d.hy, p.x, p.y, d.otype === 'furniture' ? 10 : 30, e.shiftKey)
      setPlan((pl) => {
        if (d.otype === 'room') return { ...pl, rooms: pl.rooms.map((r) => (r.id === d.id ? { ...r, ...nb } : r)) }
        if (d.otype === 'furniture') return { ...pl, furniture: pl.furniture.map((f) => (f.id === d.id ? { ...f, ...nb } : f)) }
        if (d.otype === 'marker') return { ...pl, markers: pl.markers.map((m) => (m.id === d.id ? { ...m, ...nb } : m)) }
        return { ...pl, stairs: pl.stairs.map((s) => (s.id === d.id ? { ...s, ...nb } : s)) }
      })
    } else if (d.kind === 'move-furniture') {
      const f0 = plan.furniture.find((f) => f.id === d.id)
      if (!f0) return
      const m = moveResolve(f0, d.ox + dx, d.oy + dy, 'furniture')
      const fbb = bboxHalf(f0.w, f0.h, m.rotation ?? f0.rotation)
      setDragDims(wallDims(m.x + f0.w / 2 - fbb.hw, m.y + f0.h / 2 - fbb.hh, fbb.hw * 2, fbb.hh * 2))
      setPlan((pl) => ({ ...pl, furniture: pl.furniture.map((f) => (f.id === d.id ? { ...f, x: m.x, y: m.y, rotation: m.rotation ?? f.rotation } : f)) }))
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
      const m0 = plan.markers.find((m) => m.id === d.id)
      if (!m0) return
      const r = moveResolve(m0, d.ox + dx, d.oy + dy, 'marker')
      setDragDims(wallDims(r.x, r.y, m0.w, m0.h))
      setPlan((pl) => ({ ...pl, markers: pl.markers.map((m) => (m.id === d.id ? { ...m, x: r.x, y: r.y } : m)) }))
    } else if (d.kind === 'move-stair') {
      const s0 = plan.stairs.find((s) => s.id === d.id)
      if (!s0) return
      const r = moveResolve(s0, d.ox + dx, d.oy + dy, 'stair')
      const sbb = bboxHalf(s0.w, s0.h, s0.rotation)
      setDragDims(wallDims(r.x + s0.w / 2 - sbb.hw, r.y + s0.h / 2 - sbb.hh, sbb.hw * 2, sbb.hh * 2))
      setPlan((pl) => ({ ...pl, stairs: pl.stairs.map((s) => (s.id === d.id ? { ...s, x: r.x, y: r.y } : s)) }))
    } else if (d.kind === 'move-light') {
      setPlan((pl) => ({ ...pl, lights: pl.lights.map((l) => (l.id === d.id ? { ...l, x: snap(d.ox + dx), y: snap(d.oy + dy) } : l)) }))
    }
  }

  function onUp(e: React.PointerEvent) {
    clearLongPress()
    if (e.pointerType === 'touch') {
      pointers.current.delete(e.pointerId)
      if (pointers.current.size < 2) {
        pinchDist.current = null
        pinchMid.current = null
      }
    }
    const d = drag.current
    // Recompute the final rect from the event (don't depend on React state,
    // which can lag a fast drag).
    if (d?.kind === 'draw') {
      const p = toCm(e)
      let x = Math.min(d.ox, snap(p.x))
      let y = Math.min(d.oy, snap(p.y))
      let w = Math.abs(snap(p.x) - d.ox)
      let h = Math.abs(snap(p.y) - d.oy)
      // A tap (or too-small drag) drops a default-sized object centred on the
      // tap — so on touch you can just tap to place, then resize/drag.
      if (w < MIN_ROOM || h < MIN_ROOM) {
        w = d.what === 'marker' ? 200 : 300
        h = d.what === 'marker' ? 150 : 240
        x = snap(d.ox - w / 2)
        y = snap(d.oy - h / 2)
      }
      const id = uid()
      if (d.what === 'marker') {
        setPlan((pl) => ({ ...pl, markers: [...pl.markers, { id, name: `Floor ${pl.markers.length + 1}`, style: 'frame', x, y, w, h }] }))
        setSel([{ type: 'marker', id }])
      } else {
        // Also save the drawn room to the Rooms inventory for reuse.
        setPlan((pl) => {
          const name = `Room ${pl.rooms.length + 1}`
          return {
            ...pl,
            rooms: [...pl.rooms, { id, name, x, y, w, h }],
            inventory: { ...pl.inventory, rooms: [...pl.inventory.rooms, { id: uid(), name, w, h }] },
          }
        })
        setSel([{ type: 'room', id }])
      }
      setDraft(null)
      // Drop straight back to select so one placement = one room/marker, matching
      // every other add tool (door/window/light). Re-arm from the toolbar to add more.
      setMode('select')
    } else if (d?.kind === 'marquee') {
      const p = toCm(e)
      const box: Box = { x: Math.min(d.ox, p.x), y: Math.min(d.oy, p.y), w: Math.abs(p.x - d.ox), h: Math.abs(p.y - d.oy) }
      if (box.w < 5 && box.h < 5) {
        setSel([]) // a plain click on empty space clears the selection
      } else {
        setSel(objectsInMarquee(plan, box))
      }
      setMarquee(null)
    } else if (d?.kind === 'pan' && !d.moved && (d.tapSelect || d.deselect)) {
      // A tap that didn't pan: select the tapped object (touch) or, on empty
      // space, clear the selection.
      setSel(d.tapSelect ? [d.tapSelect] : [])
    } else if (d?.kind === 'move-sel' && !d.moved) {
      // Pressed (without dragging) a member of a multi-selection → narrow to it.
      setSel([d.click])
    } else if (
      d &&
      (d.kind === 'move-room' || d.kind === 'move-furniture' || d.kind === 'move-door' || d.kind === 'move-marker' || d.kind === 'move-stair' || d.kind === 'move-light') &&
      !d.moved
    ) {
      // A no-move click on a stack of overlapping objects: advance the selection
      // to the next object underneath the one that was selected before the press.
      const hits = pointHits(plan, toCm(e))
      const prev = prevSelRef.current.length === 1 ? prevSelRef.current[0] : null
      const next = cycleNext(hits, prev)
      if (next) setSel([next])
    }
    drag.current = null
    setSnapGuide(null)
    setDragDims(null)
    svgRef.current?.releasePointerCapture(e.pointerId)
  }

  // A pointer the browser took away (palm rejection, an OS gesture, an interrupted
  // multi-touch). pointerup never fires for it, so without this the finger lingers
  // in `pointers` and the canvas stays stuck in pinch mode. Clean up, don't finalize.
  function onCancel(e: React.PointerEvent) {
    clearLongPress()
    if (e.pointerType === 'touch') {
      pointers.current.delete(e.pointerId)
      if (pointers.current.size < 2) {
        pinchDist.current = null
        pinchMid.current = null
      }
    }
    drag.current = null
    setDraft(null)
    setMarquee(null)
    setSnapGuide(null)
    setDragDims(null)
    setDoorGhost(null)
    svgRef.current?.releasePointerCapture(e.pointerId)
  }

  // ── Grid lines ────────────────────────────────────────────────
  const minor = gridStep(scale, units)
  const major = minor * 4
  const right = left + vw
  const bottom = top + vh
  const vLines: number[] = []
  for (let x = Math.floor(left / minor) * minor; x <= right; x += minor) vLines.push(x)
  const hLines: number[] = []
  for (let y = Math.floor(top / minor) * minor; y <= bottom; y += minor) hLines.push(y)
  const isMajor = (v: number) => {
    const m = ((v % major) + major) % major
    return m < 0.5 || major - m < 0.5
  }


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

  // Right-edge midpoint (cm) of the single selected object — anchors the mobile
  // action cluster (gear + trash), clear of the corner resize handles. Null if
  // nothing (or more than one) is selected.
  function selectedAnchor(): { x: number; y: number } | null {
    if (sel.length !== 1) return null
    const s = sel[0]
    if (s.type === 'furniture') {
      const f = plan.furniture.find((f) => f.id === s.id)
      if (!f) return null
      const { hw } = bboxHalf(f.w, f.h, f.rotation)
      return { x: f.x + f.w / 2 + hw, y: f.y + f.h / 2 }
    }
    if (s.type === 'stair') {
      const st = plan.stairs.find((st) => st.id === s.id)
      if (!st) return null
      const { hw } = bboxHalf(st.w, st.h, st.rotation)
      return { x: st.x + st.w / 2 + hw, y: st.y + st.h / 2 }
    }
    if (s.type === 'room') {
      const r = plan.rooms.find((r) => r.id === s.id)
      return r ? { x: r.x + r.w, y: r.y + r.h / 2 } : null
    }
    if (s.type === 'marker') {
      const m = plan.markers.find((m) => m.id === s.id)
      return m ? { x: m.x + m.w, y: m.y + m.h / 2 } : null
    }
    if (s.type === 'door') {
      const d = plan.doors.find((d) => d.id === s.id)
      if (!d) return null
      const b = doorBox(d)
      return { x: b.x + b.w, y: b.y + b.h / 2 }
    }
    const l = plan.lights.find((l) => l.id === s.id)
    return l ? { x: l.x, y: l.y } : null
  }

  // ── Lighting overlay (sun cones from windows + lamp glows) ────
  const sun = plan.lighting ? sunAt(plan.sunTime ?? 12, plan.northDeg ?? 0, plan.latitude ?? 40) : null
  const coneColor = sunColor(plan.sunTime ?? 12)
  const cones = plan.lighting ? windowCones(plan, sun) : []
  const glows = plan.lighting ? lampGlows(plan, sun) : []
  const warn = plan.warnings === false ? null : computeWarnings(plan)
  const gaps = plan.clearance ? computeClearance(plan) : []

  const bgCursor = spaceHeld ? 'grab' : mode === 'room' || mode === 'marker' || mode === 'measure' ? 'crosshair' : mode === 'door' || mode === 'window' ? 'copy' : 'grab'

  return (
    <div className="canvas-host" ref={hostRef}>
      <svg
        ref={svgRef}
        className="canvas"
        viewBox={`${left} ${top} ${vw} ${vh}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ touchAction: 'none', ...(spaceHeld ? { cursor: 'grab' } : {}) }}
        onPointerDownCapture={onDownCapture}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onCancel}
        onPointerLeave={() => setDoorGhost(null)}
        onContextMenu={onContextMenu}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        <defs>
          <pattern id="closet-hatch" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="14" stroke="#b3a78f" strokeWidth="1.4" />
          </pattern>
        </defs>

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

        {/* Markers — frame (dashed), shaded (solid tint), or closet (hatch) */}
        {plan.markers.map((m) => {
          const active = inSel('marker', m.id)
          const style = m.style ?? 'frame'
          const fill = style === 'closet' ? 'url(#closet-hatch)' : style === 'shaded' ? 'rgba(140,124,96,0.14)' : 'rgba(140,124,96,0.04)'
          return (
            <g key={m.id}>
              <rect
                x={m.x}
                y={m.y}
                width={m.w}
                height={m.h}
                rx={style === 'frame' ? 10 : 4}
                fill={fill}
                fillOpacity={style === 'closet' ? 0.55 : 1}
                stroke={active ? '#b5714e' : '#c9bca6'}
                strokeWidth={active ? 2.5 : 1.5}
                strokeDasharray={style === 'frame' ? '10 6' : undefined}
                vectorEffect="non-scaling-stroke"
                style={{ cursor: 'move' }}
                onPointerDown={(e) => onMarkerDown(e, m.id)}
              />
              <text x={m.x + 12} y={m.y + 22} fontSize={style === 'frame' ? 18 : 14} fill="#b3a488" fontWeight={700} pointerEvents="none">
                {m.name}
              </text>
              {active && sel.length === 1 && <Handles otype="marker" id={m.id} x={m.x} y={m.y} w={m.w} h={m.h} scale={scale} compact={compactHandles} onResizeStart={onResizeStart} />}
            </g>
          )
        })}

        {/* Rooms */}
        {plan.rooms.map((r) => {
          const active = inSel('room', r.id)
          return (
            <RoomShape
              key={r.id}
              r={r}
              active={active}
              showLabel={plan.roomLabels === 'always' || active || hoverRoom === r.id}
              above={spaceAbove(r)}
              units={units}
              showEdgeLengths={!!plan.edgeLengths}
              showHandles={active && sel.length === 1}
              onEnter={setHoverRoom}
              onLeave={(id) => setHoverRoom((h) => (h === id ? null : h))}
              onDown={onRoomDown}
              onNodeDown={onNodeDown}
              onInsertNode={insertNode}
              onDeleteNode={deleteNode}
              rectHandles={<Handles otype="room" id={r.id} x={r.x} y={r.y} w={r.w} h={r.h} scale={scale} compact={compactHandles} onResizeStart={onResizeStart} />}
            />
          )
        })}

        {/* Doors / windows */}
        {plan.doors.map((d) => (
          <Opening
            key={d.id}
            door={d}
            active={inSel('door', d.id)}
            showHandles={inSel('door', d.id) && sel.length === 1}
            onDown={onDoorDown}
            onResizeStart={onDoorResizeStart}
            warn={!!warn?.doors.has(d.id)}
          />
        ))}

        {/* Door placement ghost */}
        {(mode === 'door' || mode === 'window') && doorGhost && (() => {
          const g = doorGeom(doorGhost.x, doorGhost.y, DOOR_LEN, doorGhost.orientation, doorGhost.swing, 1)
          const horiz = doorGhost.orientation === 'h'
          return (
            <g className="export-hide" pointerEvents="none" opacity={0.65}>
              <line x1={g.ax} y1={g.ay} x2={g.bx} y2={g.by} stroke="#b5714e" strokeWidth={6} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
              {doorGhost.type === 'window' ? (
                horiz ? (
                  <>
                    <line x1={g.ax} y1={g.ay - 2} x2={g.bx} y2={g.by - 2} stroke="#b5714e" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
                    <line x1={g.ax} y1={g.ay + 2} x2={g.bx} y2={g.by + 2} stroke="#b5714e" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
                  </>
                ) : (
                  <>
                    <line x1={g.ax - 2} y1={g.ay} x2={g.bx - 2} y2={g.by} stroke="#b5714e" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
                    <line x1={g.ax + 2} y1={g.ay} x2={g.bx + 2} y2={g.by} stroke="#b5714e" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
                  </>
                )
              ) : (
                <>
                  <path d={g.leaf} stroke="#b5714e" strokeWidth={3} vectorEffect="non-scaling-stroke" fill="none" />
                  <path d={g.arc} stroke="#b5714e" strokeWidth={1.5} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" fill="none" />
                </>
              )}
            </g>
          )
        })()}

        {/* Furniture */}
        {plan.furniture.map((f) => {
          const active = inSel('furniture', f.id)
          return (
            <FurniturePiece
              key={f.id}
              f={f}
              active={active}
              schematic={schematic}
              showLabel={(plan.furnitureLabels ?? 'always') === 'always' || active || hoverFurn === f.id}
              units={units}
              onDown={onFurnDown}
              onEnter={setHoverFurn}
              onLeave={(id) => setHoverFurn((h) => (h === id ? null : h))}
              handles={
                active && sel.length === 1 ? (
                  <Handles otype="furniture" id={f.id} x={f.x} y={f.y} w={f.w} h={f.h} scale={scale} compact={compactHandles} showRotate onResizeStart={onResizeStart} onRotate={onRotateStart} />
                ) : null
              }
              warn={!!warn?.furniture.has(f.id)}
            />
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
          return (
            <Stairs
              key={s.id}
              s={s}
              active={active}
              onDown={onStairDown}
              handles={
                active && sel.length === 1 ? (
                  <Handles otype="stair" id={s.id} x={s.x} y={s.y} w={s.w} h={s.h} scale={scale} compact={compactHandles} showRotate onResizeStart={onResizeStart} onRotate={onRotateStart} />
                ) : null
              }
            />
          )
        })}

        {/* Lighting overlay: window cones (colour shifts with the sun) + lamp glows */}
        {plan.lighting && <LightingLayer cones={cones} glows={glows} coneColor={coneColor} />}

        {/* Ceiling lights — point fixtures (no floor footprint) drawn above the glow */}
        {plan.lights.map((l) => (
          <CeilingLight key={l.id} l={l} active={inSel('light', l.id)} scale={scale} onDown={onLightDown} />
        ))}

        {/* Draft room */}
        {draft && (
          <rect x={draft.x} y={draft.y} width={draft.w} height={draft.h} fill="rgba(181,113,78,0.09)" stroke="#b5714e" strokeWidth={2} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" pointerEvents="none" />
        )}

        {/* Marquee selection box */}
        {marquee && (
          <rect x={marquee.x} y={marquee.y} width={marquee.w} height={marquee.h} fill="rgba(181,113,78,0.07)" stroke="#b5714e" strokeWidth={1} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" pointerEvents="none" />
        )}

        {/* Auto-snap guide line(s) — shown while a snapping piece hugs a wall */}
        {snapGuide?.gx != null && (
          <line className="export-hide" x1={snapGuide.gx} y1={top} x2={snapGuide.gx} y2={top + vh} stroke="#b5714e" strokeWidth={1} strokeDasharray="5 4" vectorEffect="non-scaling-stroke" pointerEvents="none" />
        )}
        {snapGuide?.gy != null && (
          <line className="export-hide" x1={left} y1={snapGuide.gy} x2={left + vw} y2={snapGuide.gy} stroke="#b5714e" strokeWidth={1} strokeDasharray="5 4" vectorEffect="non-scaling-stroke" pointerEvents="none" />
        )}

        {/* Live gap dimensions while dragging a piece */}
        {dragDims?.map((d, i) => {
          const horiz = Math.abs(d.y1 - d.y2) < 0.5
          return (
            <g key={`dd${i}`} pointerEvents="none">
              <line x1={d.x1} y1={d.y1} x2={d.x2} y2={d.y2} stroke="#b5714e" strokeWidth={1} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
              <text
                x={(d.x1 + d.x2) / 2 + (horiz ? 0 : 7 / scale)}
                y={(d.y1 + d.y2) / 2 - (horiz ? 5 / scale : 0)}
                fontSize={12 / scale}
                fill="#8a5a3c"
                textAnchor={horiz ? 'middle' : 'start'}
                dominantBaseline="central"
                style={{ paintOrder: 'stroke' }}
                stroke="#fdfbf7"
                strokeWidth={3 / scale}
                strokeLinejoin="round"
              >
                {d.label}
              </text>
            </g>
          )
        })}

        {/* Clearance: red dimension lines flagging too-narrow walkways */}
        {gaps.map((g, i) => {
          const horiz = Math.abs(g.y2 - g.y1) < 0.5
          const t = 6 / scale
          const lx = (g.x1 + g.x2) / 2 + (horiz ? 0 : 8 / scale)
          const ly = (g.y1 + g.y2) / 2 - (horiz ? 6 / scale : 0)
          return (
            <g key={`gap${i}`} className="export-hide" pointerEvents="none">
              <line x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2} stroke="#c0392b" strokeWidth={1.5} strokeDasharray="5 3" vectorEffect="non-scaling-stroke" />
              {horiz ? (
                <>
                  <line x1={g.x1} y1={g.y1 - t} x2={g.x1} y2={g.y1 + t} stroke="#c0392b" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
                  <line x1={g.x2} y1={g.y2 - t} x2={g.x2} y2={g.y2 + t} stroke="#c0392b" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
                </>
              ) : (
                <>
                  <line x1={g.x1 - t} y1={g.y1} x2={g.x1 + t} y2={g.y1} stroke="#c0392b" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
                  <line x1={g.x2 - t} y1={g.y2} x2={g.x2 + t} y2={g.y2} stroke="#c0392b" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
                </>
              )}
              <text
                x={lx}
                y={ly}
                fontSize={12 / scale}
                fill="#c0392b"
                fontWeight={700}
                textAnchor={horiz ? 'middle' : 'start'}
                dominantBaseline={horiz ? 'auto' : 'central'}
                style={{ paintOrder: 'stroke' }}
                stroke="#fdfbf7"
                strokeWidth={3.5 / scale}
                strokeLinejoin="round"
              >
                {formatLength(g.dist, units)}
              </text>
            </g>
          )
        })}

        {/* Measure tool: a measured line with a distance label */}
        {measure &&
          (() => {
            const dist = Math.hypot(measure.x2 - measure.x1, measure.y2 - measure.y1)
            return (
              <g className="export-hide" pointerEvents="none">
                <line x1={measure.x1} y1={measure.y1} x2={measure.x2} y2={measure.y2} stroke="#b5714e" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
                <circle cx={measure.x1} cy={measure.y1} r={3 / scale} fill="#b5714e" />
                <circle cx={measure.x2} cy={measure.y2} r={3 / scale} fill="#b5714e" />
                <text
                  x={(measure.x1 + measure.x2) / 2}
                  y={(measure.y1 + measure.y2) / 2 - 7 / scale}
                  fontSize={13 / scale}
                  fill="#8a5a3c"
                  fontWeight={600}
                  textAnchor="middle"
                  style={{ paintOrder: 'stroke' }}
                  stroke="#fdfbf7"
                  strokeWidth={3.5 / scale}
                  strokeLinejoin="round"
                >
                  {formatLength(dist, units)}
                </text>
              </g>
            )
          })()}

        {/* Mobile: gear (settings) + trash (delete) stacked off the object's right edge */}
        {gearForSettings &&
          (() => {
            const a = selectedAnchor()
            if (!a) return null
            const r = 15 / scale
            const cx = a.x + r + 8 / scale
            const gy = a.y - (r + 3 / scale) // gear above
            const ty = a.y + (r + 3 / scale) // trash below
            const btn = (cy: number, glyph: string, color: string, onTap: () => void) => (
              <g style={{ cursor: 'pointer' }} onPointerDown={(e) => { e.stopPropagation(); onTap() }}>
                <circle cx={cx} cy={cy} r={r + 5 / scale} fill="transparent" />
                <circle cx={cx} cy={cy} r={r} fill="#fff" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" />
                <text x={cx} y={cy} fontSize={16 / scale} textAnchor="middle" dominantBaseline="central" pointerEvents="none">
                  {glyph}
                </text>
              </g>
            )
            return (
              <g className="export-hide">
                {btn(gy, '⚙', '#b5714e', () => onOpenSettings?.())}
                {btn(ty, '🗑', '#d4564f', () => onDeleteSelected?.())}
              </g>
            )
          })()}

        {/* Collaborator cursors */}
        <PeerCursors peers={peers} scale={scale} />
      </svg>

      {/* Right-click: pick among overlapping objects */}
      {menu && (
        <div className="ctx-menu" style={{ left: menu.x, top: menu.y }}>
          {menu.items.map((it, i) => (
            <button
              key={i}
              className="ctx-item"
              onClick={() => {
                setSel([it.item])
                setMenu(null)
              }}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}

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

      {/* Sun indicator */}
      {plan.lighting && (
        <div className="sun-badge">
          <span className="sun-time">{sun ? '☀' : '☾'} {formatHour(plan.sunTime ?? 12)}</span>
          {sun && (
            <span className="sun-arrow" style={{ transform: `rotate(${(Math.atan2(-sun.dir.x, sun.dir.y) * 180) / Math.PI}deg)` }}>
              ↑
            </span>
          )}
          <span className="sun-n" style={{ transform: `rotate(${-(plan.northDeg ?? 0)}deg)` }} title="North">
            ⇧N
          </span>
        </div>
      )}
    </div>
  )
}
