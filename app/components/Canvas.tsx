'use client'

import { useEffect, useRef, useState } from 'react'
import type { Plan, Mode, Selection, Door } from '../lib/types'
import { snap, clamp, uid, snapDoorToWalls, GRID_MINOR, GRID_MAJOR } from '../lib/geometry'
import { formatSize } from '../lib/units'

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
  | { kind: 'move-room' | 'resize-room'; id: string; sx: number; sy: number; ox: number; oy: number; ow: number; oh: number }
  | { kind: 'move-furniture'; id: string; sx: number; sy: number; ox: number; oy: number }
  | { kind: 'move-door'; id: string; sx: number; sy: number; ox: number; oy: number }
  | null

const MIN_ROOM = 50 // cm

export default function Canvas({ plan, setPlan, mode, setMode, sel, setSel }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const drag = useRef<Drag>(null)
  const [draft, setDraft] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [hoverRoom, setHoverRoom] = useState<string | null>(null)
  // Preview of where a door will land while in Add-door mode.
  const [doorGhost, setDoorGhost] = useState<{ x: number; y: number; orientation: 'h' | 'v' } | null>(null)

  const DOOR_LEN = 80

  // Drop any stale placement preview when leaving Add-door mode.
  useEffect(() => {
    if (mode !== 'door') setDoorGhost(null)
  }, [mode])

  const { width, height, units, viewMode } = plan
  const schematic = viewMode === 'schematic'

  // Pointer (client px) → SVG user units (cm).
  function toCm(e: React.PointerEvent): { x: number; y: number } {
    const svg = svgRef.current!
    const ctm = svg.getScreenCTM()
    if (!ctm) return { x: 0, y: 0 }
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse())
    return { x: p.x, y: p.y }
  }

  function capture(e: React.PointerEvent) {
    svgRef.current?.setPointerCapture(e.pointerId)
  }

  // In Add-door mode, intercept the press at the SVG level (capture phase) so a
  // click anywhere — including on top of a room, e.g. a wall shared by two
  // rooms — places a door rather than selecting/dragging whatever is underneath.
  function onDownCapture(e: React.PointerEvent) {
    if (mode !== 'door') return
    e.stopPropagation()
    placeDoor(toCm(e))
  }

  function placeDoor(p: { x: number; y: number }) {
    const hit = snapDoorToWalls(p.x, p.y, DOOR_LEN, plan.rooms)
    const d: Door = hit
      ? { id: uid(), x: hit.x, y: hit.y, length: DOOR_LEN, orientation: hit.orientation, swing: 1 }
      : {
          // No rooms to snap to — fall back to a free-placed door.
          id: uid(),
          x: snap(clamp(p.x, 0, width - DOOR_LEN)),
          y: snap(clamp(p.y, 0, height)),
          length: DOOR_LEN,
          orientation: 'h',
          swing: 1,
        }
    setPlan((pl) => ({ ...pl, doors: [...pl.doors, d] }))
    setSel({ type: 'door', id: d.id })
    setDoorGhost(null)
    // People place doors one at a time — drop back to Select after each.
    setMode('select')
  }

  // ── Background ────────────────────────────────────────────────
  function onBgDown(e: React.PointerEvent) {
    if (mode === 'door') return // handled by onDownCapture
    const p = toCm(e)
    if (mode === 'room') {
      const x = snap(clamp(p.x, 0, width))
      const y = snap(clamp(p.y, 0, height))
      drag.current = { kind: 'draw', ox: x, oy: y }
      setDraft({ x, y, w: 0, h: 0 })
      capture(e)
    } else {
      setSel(null)
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

  // ── Move / resize ─────────────────────────────────────────────
  function onMove(e: React.PointerEvent) {
    const d = drag.current
    const p = toCm(e)

    // Not dragging: in door mode, preview where the door would snap.
    if (!d) {
      if (mode === 'door') setDoorGhost(snapDoorToWalls(p.x, p.y, DOOR_LEN, plan.rooms))
      return
    }

    if (d.kind === 'draw') {
      const x = Math.min(d.ox, snap(p.x))
      const y = Math.min(d.oy, snap(p.y))
      const w = Math.abs(snap(p.x) - d.ox)
      const h = Math.abs(snap(p.y) - d.oy)
      setDraft({ x, y, w, h })
      return
    }

    const dx = p.x - d.sx
    const dy = p.y - d.sy

    if (d.kind === 'move-room') {
      const nx = clamp(snap(d.ox + dx), 0, width - d.ow)
      const ny = clamp(snap(d.oy + dy), 0, height - d.oh)
      setPlan((pl) => ({
        ...pl,
        rooms: pl.rooms.map((r) => (r.id === d.id ? { ...r, x: nx, y: ny } : r)),
      }))
    } else if (d.kind === 'resize-room') {
      const nw = clamp(snap(d.ow + dx), MIN_ROOM, width - d.ox)
      const nh = clamp(snap(d.oh + dy), MIN_ROOM, height - d.oy)
      setPlan((pl) => ({
        ...pl,
        rooms: pl.rooms.map((r) => (r.id === d.id ? { ...r, w: nw, h: nh } : r)),
      }))
    } else if (d.kind === 'move-furniture') {
      setPlan((pl) => ({
        ...pl,
        furniture: pl.furniture.map((f) => {
          if (f.id !== d.id) return f
          const nx = clamp(snap(d.ox + dx), 0, width - f.w)
          const ny = clamp(snap(d.oy + dy), 0, height - f.h)
          return { ...f, x: nx, y: ny }
        }),
      }))
    } else if (d.kind === 'move-door') {
      setPlan((pl) => ({
        ...pl,
        doors: pl.doors.map((dd) => {
          if (dd.id !== d.id) return dd
          // Glue the door to whichever wall the cursor is nearest.
          const hit = snapDoorToWalls(p.x, p.y, dd.length, pl.rooms)
          if (hit) return { ...dd, x: hit.x, y: hit.y, orientation: hit.orientation }
          // Fallback (no rooms): plain free move.
          return { ...dd, x: clamp(snap(d.ox + dx), 0, width), y: clamp(snap(d.oy + dy), 0, height) }
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
    drag.current = null
    svgRef.current?.releasePointerCapture(e.pointerId)
  }

  // ── Grid lines ────────────────────────────────────────────────
  const vLines: number[] = []
  for (let x = 0; x <= width; x += GRID_MINOR) vLines.push(x)
  const hLines: number[] = []
  for (let y = 0; y <= height; y += GRID_MINOR) hLines.push(y)

  const fontDim = 16 // furniture labels
  const roomName = 15 // smaller, subtler room labels
  const roomDim = 12

  // Is there clear space just above this room to float its label outside?
  // If the room is tucked against the top edge or another room sits directly
  // above it (e.g. fully surrounded), we fall back to labelling inside.
  function spaceAbove(r: { id: string; x: number; y: number; w: number; h: number }): boolean {
    if (r.y < 70) return false
    return !plan.rooms.some(
      (o) => o.id !== r.id && o.x < r.x + r.w && o.x + o.w > r.x && o.y < r.y && o.y + o.h >= r.y - 2,
    )
  }

  // Door symbol paths (leaf line + swing arc) + far jamb endpoint.
  function doorGeom(x: number, y: number, length: number, orientation: 'h' | 'v', swing: number) {
    if (orientation === 'h') {
      const ty = y - length * swing
      return {
        leaf: `M ${x} ${y} L ${x} ${ty}`,
        arc: `M ${x} ${ty} A ${length} ${length} 0 0 ${swing > 0 ? 0 : 1} ${x + length} ${y}`,
        x2: x + length,
        y2: y,
      }
    }
    const tx = x + length * swing
    return {
      leaf: `M ${x} ${y} L ${tx} ${y}`,
      arc: `M ${tx} ${y} A ${length} ${length} 0 0 ${swing > 0 ? 1 : 0} ${x} ${y + length}`,
      x2: x,
      y2: y + length,
    }
  }

  return (
    <svg
      ref={svgRef}
      className={`canvas mode-${mode}`}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      onPointerDownCapture={onDownCapture}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerLeave={() => setDoorGhost(null)}
    >
      {/* Backdrop */}
      <rect x={0} y={0} width={width} height={height} fill="#fdfbf7" onPointerDown={onBgDown} />

      {/* Grid */}
      <g pointerEvents="none">
        {vLines.map((x) => (
          <line
            key={`v${x}`}
            x1={x}
            y1={0}
            x2={x}
            y2={height}
            stroke={x % GRID_MAJOR === 0 ? '#e6dccb' : '#f0e9db'}
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {hLines.map((y) => (
          <line
            key={`h${y}`}
            x1={0}
            y1={y}
            x2={width}
            y2={y}
            stroke={y % GRID_MAJOR === 0 ? '#e6dccb' : '#f0e9db'}
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </g>

      {/* Rooms */}
      {plan.rooms.map((r) => {
        const active = sel?.type === 'room' && sel.id === r.id
        // Labels stay hidden until you hover the room (or it's selected).
        const showLabel = active || hoverRoom === r.id
        const above = spaceAbove(r)
        // Two stacked lines: name on top, dimensions below.
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

      {/* Doors */}
      {plan.doors.map((d) => {
        const active = sel?.type === 'door' && sel.id === d.id
        const color = active ? '#b5714e' : '#6b5f4f'
        const { leaf, arc } = doorGeom(d.x, d.y, d.length, d.orientation, d.swing)
        return (
          <g key={d.id} style={{ cursor: 'move' }} onPointerDown={(e) => onDoorDown(e, d.id)}>
            {/* Opening jamb line */}
            <line
              x1={d.x}
              y1={d.y}
              x2={d.orientation === 'h' ? d.x + d.length : d.x}
              y2={d.orientation === 'h' ? d.y : d.y + d.length}
              stroke="#fdfbf7"
              strokeWidth={6}
              vectorEffect="non-scaling-stroke"
            />
            <path d={leaf} stroke={color} strokeWidth={3} vectorEffect="non-scaling-stroke" fill="none" />
            {!schematic && (
              <path d={arc} stroke={color} strokeWidth={1.5} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" fill="none" />
            )}
            {active && <circle cx={d.x} cy={d.y} r={6} fill="#b5714e" vectorEffect="non-scaling-stroke" />}
          </g>
        )
      })}

      {/* Door placement ghost (Add-door hover preview) */}
      {mode === 'door' && doorGhost && (() => {
        const g = doorGeom(doorGhost.x, doorGhost.y, DOOR_LEN, doorGhost.orientation, 1)
        return (
          <g pointerEvents="none">
            <line
              x1={doorGhost.x}
              y1={doorGhost.y}
              x2={g.x2}
              y2={g.y2}
              stroke="#b5714e"
              strokeWidth={6}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
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
        return (
          <g
            key={f.id}
            transform={`rotate(${f.rotation} ${cx} ${cy})`}
            style={{ cursor: 'move' }}
            onPointerDown={(e) => onFurnDown(e, f.id)}
          >
            <rect
              x={f.x}
              y={f.y}
              width={f.w}
              height={f.h}
              rx={schematic ? 2 : 6}
              fill={schematic ? '#faf6ee' : f.color}
              fillOpacity={schematic ? 1 : 0.85}
              stroke={active ? '#b5714e' : schematic ? '#cabfa9' : '#7a6e5b'}
              strokeWidth={active ? 3 : schematic ? 1 : 1.5}
              strokeDasharray={schematic ? '5 3' : undefined}
              vectorEffect="non-scaling-stroke"
            />
            {/* In schematic mode the colour survives as a small corner tag. */}
            {schematic && (
              <rect x={f.x + 6} y={f.y + 6} width={12} height={12} rx={2} fill={f.color} stroke="rgba(0,0,0,0.12)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            )}
            <text x={cx} y={cy - 2} fontSize={fontDim} fill="#2f2a22" fontWeight={600} textAnchor="middle" pointerEvents="none">
              {f.name}
            </text>
            <text x={cx} y={cy + fontDim} fontSize={fontDim - 3} fill={schematic ? '#9a9082' : '#6b5f4f'} textAnchor="middle" pointerEvents="none">
              {formatSize(f.w, f.h, units)}
            </text>
          </g>
        )
      })}

      {/* Draft room being drawn */}
      {draft && (
        <rect
          x={draft.x}
          y={draft.y}
          width={draft.w}
          height={draft.h}
          fill="rgba(181,113,78,0.09)"
          stroke="#b5714e"
          strokeWidth={2}
          strokeDasharray="6 4"
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
        />
      )}
    </svg>
  )
}
