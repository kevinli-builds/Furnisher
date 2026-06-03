'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Plan, Mode, Selection, Door } from '../lib/types'
import { snap, clamp, uid, snapDoorToWalls } from '../lib/geometry'
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

type Drag =
  | { kind: 'draw'; ox: number; oy: number }
  | { kind: 'pan'; cx0: number; cy0: number; vx0: number; vy0: number; moved: boolean }
  | { kind: 'move-room' | 'resize-room'; id: string; sx: number; sy: number; ox: number; oy: number; ow: number; oh: number }
  | { kind: 'move-furniture'; id: string; sx: number; sy: number; ox: number; oy: number }
  | { kind: 'move-door'; id: string; sx: number; sy: number; ox: number; oy: number }
  | null

interface View {
  x: number // cm at the left edge of the viewport
  y: number // cm at the top edge
  scale: number // pixels per cm (0 = not yet initialised)
}

const MIN_ROOM = 50 // cm
const DOOR_LEN = 80
const SWING_DEADZONE = 25 // cm — cursor must be this far off the wall to flip swing
const MIN_SCALE = 0.05
const MAX_SCALE = 6

// Which way the door should swing given where the cursor is relative to its wall.
// Within the deadzone of the wall line, keep the previous swing (avoids flicker).
function swingForCursor(orientation: 'h' | 'v', wall: number, cursor: { x: number; y: number }, prev: 1 | -1): 1 | -1 {
  if (orientation === 'h') {
    const dy = cursor.y - wall
    if (dy <= -SWING_DEADZONE) return 1 // cursor above the wall → swing up
    if (dy >= SWING_DEADZONE) return -1 // below → swing down
  } else {
    const dx = cursor.x - wall
    if (dx >= SWING_DEADZONE) return 1 // cursor right of the wall → swing right
    if (dx <= -SWING_DEADZONE) return -1 // left → swing left
  }
  return prev
}

// Adaptive grid spacing (cm) so cells stay a sensible size on screen at any zoom.
function gridStep(scale: number): number {
  const steps = [10, 25, 50, 100, 200, 500, 1000, 2000, 5000]
  for (const s of steps) if (s * scale >= 16) return s
  return 10000
}

export default function Canvas({ plan, setPlan, mode, setMode, sel, setSel }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const drag = useRef<Drag>(null)
  const [draft, setDraft] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [hoverRoom, setHoverRoom] = useState<string | null>(null)
  const [doorGhost, setDoorGhost] = useState<{ x: number; y: number; orientation: 'h' | 'v'; swing: 1 | -1 } | null>(null)

  const [size, setSize] = useState({ cw: 0, ch: 0 })
  const [view, setViewState] = useState<View>({ x: 0, y: 0, scale: 0 })
  const viewRef = useRef(view)
  function setView(v: View) {
    viewRef.current = v
    setViewState(v)
  }

  const { viewMode, units } = plan
  const schematic = viewMode === 'schematic'

  // ── Viewport sizing ───────────────────────────────────────────
  useLayoutEffect(() => {
    const el = hostRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      setSize({ cw: el.clientWidth, ch: el.clientHeight })
    })
    ro.observe(el)
    setSize({ cw: el.clientWidth, ch: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  // Bounding box of all content (fallback to the default plan extent).
  function contentBounds() {
    const xs: number[] = []
    const ys: number[] = []
    const xe: number[] = []
    const ye: number[] = []
    for (const r of plan.rooms) {
      xs.push(r.x), ys.push(r.y), xe.push(r.x + r.w), ye.push(r.y + r.h)
    }
    for (const f of plan.furniture) {
      xs.push(f.x), ys.push(f.y), xe.push(f.x + f.w), ye.push(f.y + f.h)
    }
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
    const vw = cw / sc
    const vh = ch / sc
    setView({ x: b.x + b.w / 2 - vw / 2, y: b.y + b.h / 2 - vh / 2, scale: sc })
  }

  // Initialise the view once we know the container size.
  useEffect(() => {
    if (size.cw > 0 && viewRef.current.scale === 0) fitView()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size])

  const scale = view.scale || (size.cw ? size.cw / Math.max(plan.width, 1) : 1)
  const vw = size.cw ? size.cw / scale : plan.width
  const vh = size.ch ? size.ch / scale : plan.height

  // ── Coordinate conversion ─────────────────────────────────────
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

  // Wheel needs a non-passive listener to call preventDefault.
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

  // ── Door placement (capture phase, so clicks on rooms still work) ─
  function onDownCapture(e: React.PointerEvent) {
    if (mode !== 'door') return
    e.stopPropagation()
    placeDoor(toCm(e))
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
    setSel({ type: 'door', id: d.id })
    setDoorGhost(null)
    setMode('select')
  }

  // ── Background: draw a room, or pan/deselect ──────────────────
  function onBgDown(e: React.PointerEvent) {
    if (mode === 'door') return // handled by onDownCapture
    if (mode === 'room') {
      const p = toCm(e)
      const x = snap(p.x)
      const y = snap(p.y)
      drag.current = { kind: 'draw', ox: x, oy: y }
      setDraft({ x, y, w: 0, h: 0 })
      capture(e)
    } else {
      drag.current = { kind: 'pan', cx0: e.clientX, cy0: e.clientY, vx0: viewRef.current.x, vy0: viewRef.current.y, moved: false }
      capture(e)
    }
  }

  // ── Object pointer-downs ──────────────────────────────────────
  function onRoomDown(e: React.PointerEvent, id: string) {
    e.stopPropagation()
    const r = plan.rooms.find((r) => r.id === id)!
    const p = toCm(e)
    drag.current = { kind: 'move-room', id, sx: p.x, sy: p.y, ox: r.x, oy: r.y, ow: r.w, oh: r.h }
    setSel({ type: 'room', id })
    capture(e)
  }

  function onRoomResize(e: React.PointerEvent, id: string) {
    e.stopPropagation()
    const r = plan.rooms.find((r) => r.id === id)!
    const p = toCm(e)
    drag.current = { kind: 'resize-room', id, sx: p.x, sy: p.y, ox: r.x, oy: r.y, ow: r.w, oh: r.h }
    setSel({ type: 'room', id })
    capture(e)
  }

  function onFurnDown(e: React.PointerEvent, id: string) {
    e.stopPropagation()
    const f = plan.furniture.find((f) => f.id === id)!
    const p = toCm(e)
    drag.current = { kind: 'move-furniture', id, sx: p.x, sy: p.y, ox: f.x, oy: f.y }
    setSel({ type: 'furniture', id })
    capture(e)
  }

  function onDoorDown(e: React.PointerEvent, id: string) {
    e.stopPropagation()
    const d = plan.doors.find((d) => d.id === id)!
    const p = toCm(e)
    drag.current = { kind: 'move-door', id, sx: p.x, sy: p.y, ox: d.x, oy: d.y }
    setSel({ type: 'door', id })
    capture(e)
  }

  // ── Move / resize / pan ───────────────────────────────────────
  function onMove(e: React.PointerEvent) {
    const d = drag.current
    if (!d) {
      if (mode === 'door') {
        const p = toCm(e)
        const hit = snapDoorToWalls(p.x, p.y, DOOR_LEN, plan.rooms)
        setDoorGhost(
          hit
            ? {
                x: hit.x,
                y: hit.y,
                orientation: hit.orientation,
                swing: swingForCursor(hit.orientation, hit.orientation === 'h' ? hit.y : hit.x, p, doorGhost?.swing ?? 1),
              }
            : null,
        )
      }
      return
    }

    if (d.kind === 'pan') {
      const sc = viewRef.current.scale || scale
      if (Math.abs(e.clientX - d.cx0) + Math.abs(e.clientY - d.cy0) > 3) d.moved = true
      setView({ x: d.vx0 - (e.clientX - d.cx0) / sc, y: d.vy0 - (e.clientY - d.cy0) / sc, scale: sc })
      return
    }

    const p = toCm(e)

    if (d.kind === 'draw') {
      setDraft({
        x: Math.min(d.ox, snap(p.x)),
        y: Math.min(d.oy, snap(p.y)),
        w: Math.abs(snap(p.x) - d.ox),
        h: Math.abs(snap(p.y) - d.oy),
      })
      return
    }

    const dx = p.x - d.sx
    const dy = p.y - d.sy

    if (d.kind === 'move-room') {
      const nx = snap(d.ox + dx)
      const ny = snap(d.oy + dy)
      setPlan((pl) => ({ ...pl, rooms: pl.rooms.map((r) => (r.id === d.id ? { ...r, x: nx, y: ny } : r)) }))
    } else if (d.kind === 'resize-room') {
      const nw = Math.max(MIN_ROOM, snap(d.ow + dx))
      const nh = Math.max(MIN_ROOM, snap(d.oh + dy))
      setPlan((pl) => ({ ...pl, rooms: pl.rooms.map((r) => (r.id === d.id ? { ...r, w: nw, h: nh } : r)) }))
    } else if (d.kind === 'move-furniture') {
      const nx = snap(d.ox + dx)
      const ny = snap(d.oy + dy)
      setPlan((pl) => ({ ...pl, furniture: pl.furniture.map((f) => (f.id === d.id ? { ...f, x: nx, y: ny } : f)) }))
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
    }
  }

  function onUp(e: React.PointerEvent) {
    const d = drag.current
    if (d?.kind === 'draw' && draft) {
      if (draft.w >= MIN_ROOM && draft.h >= MIN_ROOM) {
        const id = uid()
        const n = plan.rooms.length + 1
        setPlan((pl) => ({
          ...pl,
          rooms: [...pl.rooms, { id, name: `Room ${n}`, x: draft.x, y: draft.y, w: draft.w, h: draft.h }],
        }))
        setSel({ type: 'room', id })
      }
      setDraft(null)
    }
    if (d?.kind === 'pan' && !d.moved) setSel(null)
    drag.current = null
    svgRef.current?.releasePointerCapture(e.pointerId)
  }

  // ── Grid lines across the visible region ──────────────────────
  const minor = gridStep(scale)
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

  function spaceAbove(r: { id: string; x: number; y: number; w: number; h: number }): boolean {
    return !plan.rooms.some(
      (o) => o.id !== r.id && o.x < r.x + r.w && o.x + o.w > r.x && o.y < r.y && o.y + o.h >= r.y - 2,
    )
  }

  // Door symbol: leaf line from the hinge + swing arc to the far jamb.
  // swing = which side of the wall it opens; hinge = which end the hinge is on.
  function doorGeom(x: number, y: number, length: number, orientation: 'h' | 'v', swing: number, hinge: number) {
    const ax = x
    const ay = y
    const bx = orientation === 'h' ? x + length : x
    const by = orientation === 'h' ? y : y + length
    const hx = hinge > 0 ? ax : bx
    const hy = hinge > 0 ? ay : by
    const jx = hinge > 0 ? bx : ax
    const jy = hinge > 0 ? by : ay
    const nx = orientation === 'h' ? 0 : swing
    const ny = orientation === 'h' ? -swing : 0
    const tx = hx + nx * length
    const ty = hy + ny * length
    const cross = (tx - hx) * (jy - hy) - (ty - hy) * (jx - hx)
    const sweep = cross > 0 ? 1 : 0
    return {
      leaf: `M ${hx} ${hy} L ${tx} ${ty}`,
      arc: `M ${tx} ${ty} A ${length} ${length} 0 0 ${sweep} ${jx} ${jy}`,
      hx,
      hy,
      ax,
      ay,
      bx,
      by,
    }
  }

  const bgCursor = mode === 'room' ? 'crosshair' : mode === 'door' ? 'copy' : 'grab'

  return (
    <div className="canvas-host" ref={hostRef}>
      <svg
        ref={svgRef}
        className="canvas"
        viewBox={`${left} ${top} ${vw} ${vh}`}
        preserveAspectRatio="xMidYMid meet"
        onPointerDownCapture={onDownCapture}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={() => setDoorGhost(null)}
      >
        {/* Backdrop covering the visible region */}
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

        {/* Rooms */}
        {plan.rooms.map((r) => {
          const active = sel?.type === 'room' && sel.id === r.id
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
                stroke={active ? '#b5714e' : '#4a4136'}
                strokeWidth={active ? 3 : 2}
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
              {active && (
                <rect
                  x={r.x + r.w - 14}
                  y={r.y + r.h - 14}
                  width={28}
                  height={28}
                  fill="#b5714e"
                  rx={3}
                  style={{ cursor: 'nwse-resize' }}
                  onPointerDown={(e) => onRoomResize(e, r.id)}
                />
              )}
            </g>
          )
        })}

        {/* Doors — swing arc shown in both modes */}
        {plan.doors.map((d) => {
          const active = sel?.type === 'door' && sel.id === d.id
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
          const active = sel?.type === 'furniture' && sel.id === f.id
          const cx = f.x + f.w / 2
          const cy = f.y + f.h / 2
          const t = furnitureType(f.type)
          return (
            <g key={f.id} transform={`rotate(${f.rotation} ${cx} ${cy})`} style={{ cursor: 'move' }} onPointerDown={(e) => onFurnDown(e, f.id)}>
              {schematic ? (
                <rect
                  x={f.x}
                  y={f.y}
                  width={f.w}
                  height={f.h}
                  rx={6}
                  fill={f.color}
                  fillOpacity={0.85}
                  stroke={active ? '#b5714e' : '#7a6e5b'}
                  strokeWidth={active ? 3 : 1.5}
                  vectorEffect="non-scaling-stroke"
                />
              ) : (
                <>
                  <rect
                    x={f.x}
                    y={f.y}
                    width={f.w}
                    height={f.h}
                    rx={6}
                    fill={f.color}
                    fillOpacity={0.16}
                    stroke={active ? '#b5714e' : '#cabfa9'}
                    strokeWidth={active ? 3 : 1.2}
                    vectorEffect="non-scaling-stroke"
                  />
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

        {/* Draft room being drawn */}
        {draft && (
          <rect x={draft.x} y={draft.y} width={draft.w} height={draft.h} fill="rgba(181,113,78,0.09)" stroke="#b5714e" strokeWidth={2} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" pointerEvents="none" />
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
