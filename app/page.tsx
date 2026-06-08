'use client'

import { useEffect, useRef, useState } from 'react'
import type { Plan, Mode, Selection } from './lib/types'
import { loadPlan, savePlan, defaultPlan } from './lib/storage'
import { usePlanHistory } from './lib/usePlanHistory'
import { useCollab } from './lib/collab'
import { uid, snap, SNAP } from './lib/geometry'
import { furnitureType } from './lib/furniture'
import type { FurnTemplate, RoomTemplate, MarkerTemplate } from './lib/types'
import Canvas from './components/Canvas'
import InventoryPanel from './components/InventoryPanel'
import SettingsPanel from './components/SettingsPanel'
import AccountMenu from './components/AccountMenu'
import ImportModal from './components/ImportModal'
import ViewOptionsMenu from './components/ViewOptionsMenu'
import StatsPanel from './components/StatsPanel'
import { exportPng } from './lib/exportImage'

export default function Page() {
  const { plan, setPlan, applyRemote, undo, redo, replace, canUndo, canRedo } = usePlanHistory(defaultPlan())
  const [mode, setMode] = useState<Mode>('select')
  const [sel, setSel] = useState<Selection>([])
  const [mounted, setMounted] = useState(false)
  const [importMode, setImportMode] = useState<'blueprint' | 'furniture' | null>(null)
  const [showStats, setShowStats] = useState(false)
  const [collabId, setCollabId] = useState<string | null>(null)
  const { peers, onPointer } = useCollab(collabId, plan, applyRemote)
  const clipboard = useRef<Pick<Plan, 'rooms' | 'doors' | 'furniture' | 'markers' | 'stairs'> | null>(null)

  // Load from localStorage after mount (avoids SSR/hydration mismatch).
  useEffect(() => {
    replace(loadPlan())
    setMounted(true)
  }, [replace])

  useEffect(() => {
    if (mounted) savePlan(plan)
  }, [plan, mounted])

  // Keyboard: undo/redo + delete the selection.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null
      const typing =
        !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
      const meta = e.ctrlKey || e.metaKey

      if (meta && (e.key === 'z' || e.key === 'Z')) {
        if (typing) return // let the focused field handle its own undo
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
        return
      }
      if (meta && (e.key === 'y' || e.key === 'Y')) {
        if (typing) return
        e.preventDefault()
        redo()
        return
      }

      // Copy / paste / duplicate of the current selection.
      const copy = () => {
        const has = (t: string, id: string) => sel.some((s) => s.type === t && s.id === id)
        clipboard.current = {
          rooms: plan.rooms.filter((r) => has('room', r.id)),
          doors: plan.doors.filter((d) => has('door', d.id)),
          furniture: plan.furniture.filter((f) => has('furniture', f.id)),
          markers: plan.markers.filter((m) => has('marker', m.id)),
          stairs: plan.stairs.filter((s) => has('stair', s.id)),
        }
      }
      const paste = () => {
        const c = clipboard.current
        if (!c) return
        const O = 30 // offset each paste so copies don't sit exactly on top
        const linkMap = new Map<string, string>()
        const rooms = c.rooms.map((r) => ({ ...r, id: uid(), x: r.x + O, y: r.y + O }))
        const furniture = c.furniture.map((f) => ({ ...f, id: uid(), x: f.x + O, y: f.y + O }))
        const markers = c.markers.map((m) => ({ ...m, id: uid(), x: m.x + O, y: m.y + O }))
        const doors = c.doors.map((d) => ({ ...d, id: uid(), x: d.x + O, y: d.y + O }))
        const stairs = c.stairs.map((s) => {
          let nl = linkMap.get(s.link)
          if (!nl) {
            nl = uid()
            linkMap.set(s.link, nl)
          }
          return { ...s, id: uid(), link: nl, x: s.x + O, y: s.y + O }
        })
        setPlan((p) => ({
          ...p,
          rooms: [...p.rooms, ...rooms],
          furniture: [...p.furniture, ...furniture],
          markers: [...p.markers, ...markers],
          doors: [...p.doors, ...doors],
          stairs: [...p.stairs, ...stairs],
        }))
        setSel([
          ...rooms.map((r) => ({ type: 'room' as const, id: r.id })),
          ...furniture.map((f) => ({ type: 'furniture' as const, id: f.id })),
          ...markers.map((m) => ({ type: 'marker' as const, id: m.id })),
          ...doors.map((d) => ({ type: 'door' as const, id: d.id })),
          ...stairs.map((s) => ({ type: 'stair' as const, id: s.id })),
        ])
        clipboard.current = { rooms, furniture, markers, doors, stairs } // cascade on repeat paste
      }

      if (meta && (e.key === 'c' || e.key === 'C')) {
        if (typing || sel.length === 0) return
        e.preventDefault()
        copy()
        return
      }
      if (meta && (e.key === 'v' || e.key === 'V')) {
        if (typing || !clipboard.current) return
        e.preventDefault()
        paste()
        return
      }
      if (meta && (e.key === 'd' || e.key === 'D')) {
        if (typing || sel.length === 0) return
        e.preventDefault()
        copy()
        paste()
        return
      }

      // Arrow keys nudge the selection (grid step; Shift = 1 cm fine).
      if (e.key.startsWith('Arrow')) {
        if (typing || sel.length === 0) return
        e.preventDefault()
        const step = e.shiftKey ? 1 : SNAP
        const d: Record<string, [number, number]> = {
          ArrowLeft: [-step, 0],
          ArrowRight: [step, 0],
          ArrowUp: [0, -step],
          ArrowDown: [0, step],
        }
        const mv = d[e.key]
        if (!mv) return
        const [dx, dy] = mv
        const has = (t: string, id: string) => sel.some((s) => s.type === t && s.id === id)
        setPlan((p) => ({
          ...p,
          rooms: p.rooms.map((r) => (has('room', r.id) ? { ...r, x: r.x + dx, y: r.y + dy, points: r.points?.map((pt) => ({ x: pt.x + dx, y: pt.y + dy })) } : r)),
          doors: p.doors.map((dd) => (has('door', dd.id) ? { ...dd, x: dd.x + dx, y: dd.y + dy } : dd)),
          furniture: p.furniture.map((f) => (has('furniture', f.id) ? { ...f, x: f.x + dx, y: f.y + dy } : f)),
          markers: p.markers.map((m) => (has('marker', m.id) ? { ...m, x: m.x + dx, y: m.y + dy } : m)),
          stairs: p.stairs.map((s) => (has('stair', s.id) ? { ...s, x: s.x + dx, y: s.y + dy } : s)),
        }))
        return
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (typing || sel.length === 0) return
        e.preventDefault()
        const has = (t: string, id: string) => sel.some((s) => s.type === t && s.id === id)
        setPlan((p) => ({
          ...p,
          rooms: p.rooms.filter((r) => !has('room', r.id)),
          doors: p.doors.filter((d) => !has('door', d.id)),
          furniture: p.furniture.filter((f) => !has('furniture', f.id)),
          markers: p.markers.filter((m) => !has('marker', m.id)),
          stairs: p.stairs.filter((s) => !has('stair', s.id)),
        }))
        setSel([])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sel, plan, undo, redo, setPlan])

  // Centre of existing content (fallback to plan centre) — for click-to-place.
  function contentCenter() {
    const xs: number[] = []
    const ys: number[] = []
    const xe: number[] = []
    const ye: number[] = []
    const push = (x: number, y: number, w: number, h: number) => {
      xs.push(x), ys.push(y), xe.push(x + w), ye.push(y + h)
    }
    plan.rooms.forEach((r) => push(r.x, r.y, r.w, r.h))
    plan.furniture.forEach((f) => push(f.x, f.y, f.w, f.h))
    plan.markers.forEach((m) => push(m.x, m.y, m.w, m.h))
    plan.stairs.forEach((s) => push(s.x, s.y, s.w, s.h))
    return {
      cx: xs.length ? (Math.min(...xs) + Math.max(...xe)) / 2 : plan.width / 2,
      cy: ys.length ? (Math.min(...ys) + Math.max(...ye)) / 2 : plan.height / 2,
    }
  }

  function placeFurnitureTemplate(t: FurnTemplate) {
    const { cx, cy } = contentCenter()
    const id = uid()
    setPlan((p) => ({
      ...p,
      furniture: [...p.furniture, { id, name: t.name, type: furnitureType(t.type), x: snap(cx - t.w / 2), y: snap(cy - t.h / 2), w: t.w, h: t.h, rotation: 0, color: t.color, shape: t.shape, url: t.url }],
    }))
    setSel([{ type: 'furniture', id }])
  }

  function placeRoomTemplate(t: RoomTemplate) {
    const { cx, cy } = contentCenter()
    const id = uid()
    setPlan((p) => ({ ...p, rooms: [...p.rooms, { id, name: t.name, x: snap(cx - t.w / 2), y: snap(cy - t.h / 2), w: t.w, h: t.h }] }))
    setSel([{ type: 'room', id }])
  }

  function placeMarkerTemplate(t: MarkerTemplate) {
    const { cx, cy } = contentCenter()
    const id = uid()
    setPlan((p) => ({ ...p, markers: [...p.markers, { id, name: t.name, style: t.style, x: snap(cx - t.w / 2), y: snap(cy - t.h / 2), w: t.w, h: t.h }] }))
    setSel([{ type: 'marker', id }])
  }

  // Add a linked entry+exit stair pair near the centre of existing content.
  function addStairs() {
    const { cx, cy } = contentCenter()
    const link = uid()
    const sw = 120
    const sh = 240
    const entry = { id: uid(), link, role: 'entry' as const, x: snap(cx - sw - 40), y: snap(cy - sh / 2), w: sw, h: sh, rotation: 0 as const }
    const exit = { id: uid(), link, role: 'exit' as const, x: snap(cx + 40), y: snap(cy - sh / 2), w: sw, h: sh, rotation: 0 as const }
    setPlan((p) => ({ ...p, stairs: [...p.stairs, entry, exit] }))
    setSel([{ type: 'stair', id: entry.id }])
  }

  if (!mounted) return <div className="boot" />

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <h1>Furnisher</h1>
          <span className="tag">Plan your space before you move in</span>
        </div>

        <div className="tools">
          <div className="seg">
            <button className={`seg-btn${mode === 'select' ? ' on' : ''}`} onClick={() => setMode('select')}>
              ↖ Select
            </button>
            <button className={`seg-btn${mode === 'room' ? ' on' : ''}`} onClick={() => setMode('room')}>
              ▭ Draw room
            </button>
            <button className={`seg-btn${mode === 'door' ? ' on' : ''}`} onClick={() => setMode('door')}>
              ⌐ Add door
            </button>
            <button className={`seg-btn${mode === 'window' ? ' on' : ''}`} onClick={() => setMode('window')} title="Place a window on a wall">
              ⊟ Window
            </button>
            <button className={`seg-btn${mode === 'marker' ? ' on' : ''}`} onClick={() => setMode('marker')} title="Draw a labelled box, e.g. to frame a floor or a closet">
              ▢ Marker
            </button>
            <button className="seg-btn" onClick={addStairs} title="Add a linked entry + exit stair pair">
              ⟚ Stairs
            </button>
            <button className={`seg-btn${mode === 'measure' ? ' on' : ''}`} onClick={() => setMode('measure')} title="Drag to measure any distance">
              📏 Measure
            </button>
          </div>

          <div className="seg">
            <button className="seg-btn" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">
              ↶ Undo
            </button>
            <button className="seg-btn" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">
              ↷ Redo
            </button>
          </div>

          <button
            className="seg-btn solo"
            onClick={() => {
              if (confirm('Reset the plan? This clears all rooms, doors and furniture.')) {
                replace(defaultPlan())
                setSel([])
              }
            }}
          >
            Reset
          </button>

          <button className={`seg-btn solo${showStats ? ' on' : ''}`} onClick={() => setShowStats((s) => !s)} title="Room areas & free floor space">
            📊 Stats
          </button>

          <button
            className="seg-btn solo"
            title="Download the plan as a PNG image"
            onClick={() => {
              setSel([]) // drop selection so handles aren't captured
              requestAnimationFrame(() => exportPng(plan))
            }}
          >
            ⤓ Image
          </button>

          {peers.length > 0 && (
            <div className="presence" title={`${peers.length} collaborator${peers.length === 1 ? '' : 's'} online`}>
              {peers.slice(0, 5).map((p) => (
                <span key={p.id} className="avatar" style={{ background: p.color }} title={p.name}>
                  {p.name.slice(0, 1).toUpperCase()}
                </span>
              ))}
              {peers.length > 5 && <span className="avatar more">+{peers.length - 5}</span>}
            </div>
          )}

          <AccountMenu
            plan={plan}
            onLoadPlan={(p) => {
              replace(p)
              setSel([])
            }}
            onProjectChange={setCollabId}
          />
        </div>
      </header>

      <main className="workspace">
        <div className="left">
          <InventoryPanel
            plan={plan}
            setPlan={setPlan}
            onPlaceFurniture={placeFurnitureTemplate}
            onPlaceRoom={placeRoomTemplate}
            onPlaceMarker={placeMarkerTemplate}
            onImport={setImportMode}
          />
        </div>

        <div className="canvas-wrap">
          <div className="display-fab">
            <ViewOptionsMenu plan={plan} setPlan={setPlan} />
          </div>
          {showStats && <StatsPanel plan={plan} onClose={() => setShowStats(false)} />}
          <Canvas plan={plan} setPlan={setPlan} mode={mode} setMode={setMode} sel={sel} setSel={setSel} peers={peers} onPointer={onPointer} />
          <p className="hint">
            {mode === 'room' && 'Click and drag on the grid to draw a room.'}
            {mode === 'marker' && 'Click and drag to draw a labelled box — handy for framing each floor.'}
            {mode === 'door' && "Click a room's wall to place a door — it snaps onto the border. Drag to slide it along. (Switch to sliding in its settings.)"}
            {mode === 'window' && "Click a room's wall to place a window — it snaps onto the border."}
            {mode === 'measure' && 'Drag between two points to measure the distance. Drag a piece (in Select) to see live gaps to the walls.'}
            {mode === 'select' && 'Drag empty space to pan · Shift-drag to box-select · Shift-click to add · click again on a stack to cycle · arrow keys nudge (Shift = fine) · Delete removes.'}
          </p>
        </div>

        {sel.length === 1 && (
          <div className="right">
            <SettingsPanel key={`${sel[0].type}-${sel[0].id}`} plan={plan} setPlan={setPlan} sel={sel[0]} setSel={setSel} />
          </div>
        )}
      </main>

      {importMode && <ImportModal mode={importMode} setPlan={setPlan} onClose={() => setImportMode(null)} />}
    </div>
  )
}
