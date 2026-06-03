'use client'

import { useEffect, useState } from 'react'
import type { Plan, Mode, Selection } from './lib/types'
import { loadPlan, savePlan, defaultPlan } from './lib/storage'
import { formatLength } from './lib/units'
import Canvas from './components/Canvas'
import FurniturePanel from './components/FurniturePanel'

export default function Page() {
  const [plan, setPlan] = useState<Plan>(defaultPlan)
  const [mode, setMode] = useState<Mode>('select')
  const [sel, setSel] = useState<Selection>(null)
  const [mounted, setMounted] = useState(false)

  // Load from localStorage after mount (avoids SSR/hydration mismatch).
  useEffect(() => {
    setPlan(loadPlan())
    setMounted(true)
  }, [])

  useEffect(() => {
    if (mounted) savePlan(plan)
  }, [plan, mounted])

  if (!mounted) return <div className="boot" />

  const units = plan.units

  function setUnits(u: Plan['units']) {
    setPlan((p) => ({ ...p, units: u }))
  }

  function setView(v: Plan['viewMode']) {
    setPlan((p) => ({ ...p, viewMode: v }))
  }

  function deleteSel() {
    if (!sel) return
    setPlan((p) => {
      if (sel.type === 'room') return { ...p, rooms: p.rooms.filter((r) => r.id !== sel.id) }
      if (sel.type === 'door') return { ...p, doors: p.doors.filter((d) => d.id !== sel.id) }
      return { ...p, furniture: p.furniture.filter((f) => f.id !== sel.id) }
    })
    setSel(null)
  }

  const room = sel?.type === 'room' ? plan.rooms.find((r) => r.id === sel.id) : null
  const door = sel?.type === 'door' ? plan.doors.find((d) => d.id === sel.id) : null

  function patchDoor(patch: Partial<NonNullable<typeof door>>) {
    if (!door) return
    setPlan((p) => ({ ...p, doors: p.doors.map((d) => (d.id === door.id ? { ...d, ...patch } : d)) }))
  }

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
          </div>

          <div className="seg">
            <button
              className={`seg-btn${plan.viewMode === 'schematic' ? ' on' : ''}`}
              onClick={() => setView('schematic')}
              title="Flat boxes + labels — most minimal"
            >
              Schematic
            </button>
            <button
              className={`seg-btn${plan.viewMode === 'sim' ? ' on' : ''}`}
              onClick={() => setView('sim')}
              title="Colour-filled furniture + door swings"
            >
              Simulator
            </button>
          </div>

          <div className="seg">
            <button className={`seg-btn${units === 'imperial' ? ' on' : ''}`} onClick={() => setUnits('imperial')}>
              ft/in
            </button>
            <button className={`seg-btn${units === 'metric' ? ' on' : ''}`} onClick={() => setUnits('metric')}>
              m/cm
            </button>
          </div>

          <button
            className="seg-btn solo"
            onClick={() => {
              if (confirm('Reset the plan? This clears all rooms, doors and furniture.')) {
                setPlan(defaultPlan())
                setSel(null)
              }
            }}
          >
            Reset
          </button>
        </div>
      </header>

      {/* Contextual inspector for the current selection */}
      <div className={`inspector${sel ? ' show' : ''}`}>
        {room && (
          <>
            <input
              className="field inline"
              value={room.name}
              onChange={(e) => setPlan((p) => ({ ...p, rooms: p.rooms.map((r) => (r.id === room.id ? { ...r, name: e.target.value } : r)) }))}
            />
            <span className="ins-meta">
              {formatLength(room.w, units)} × {formatLength(room.h, units)}
            </span>
            <button className="btn-ghost danger" onClick={deleteSel}>
              Delete
            </button>
          </>
        )}
        {door && (
          <>
            <span className="ins-label">Door</span>
            <button className="btn-ghost" onClick={() => patchDoor({ orientation: door.orientation === 'h' ? 'v' : 'h' })}>
              {door.orientation === 'h' ? '↔ Horizontal' : '↕ Vertical'}
            </button>
            <button className="btn-ghost" onClick={() => patchDoor({ swing: (door.swing * -1) as 1 | -1 })}>
              ⟲ Flip swing
            </button>
            <span className="ins-meta">{formatLength(door.length, units)}</span>
            <button className="btn-ghost" onClick={() => patchDoor({ length: Math.max(40, door.length - 10) })}>
              −
            </button>
            <button className="btn-ghost" onClick={() => patchDoor({ length: Math.min(200, door.length + 10) })}>
              +
            </button>
            <button className="btn-ghost danger" onClick={deleteSel}>
              Delete
            </button>
          </>
        )}
        {sel?.type === 'furniture' && <span className="ins-meta">Editing in the right panel →</span>}
      </div>

      <main className="workspace">
        <div className="canvas-wrap">
          <Canvas plan={plan} setPlan={setPlan} mode={mode} sel={sel} setSel={setSel} />
          <p className="hint">
            {mode === 'room' && 'Click and drag on the grid to draw a room.'}
            {mode === 'door' && 'Click a wall to drop a door, then drag it into place.'}
            {mode === 'select' && 'Drag rooms, doors and furniture to move them. Each grid square is 50 cm.'}
          </p>
        </div>
        <FurniturePanel plan={plan} setPlan={setPlan} sel={sel} setSel={setSel} />
      </main>
    </div>
  )
}
