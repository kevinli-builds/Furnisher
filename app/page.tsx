'use client'

import { useEffect, useState } from 'react'
import type { Plan, Mode, Selection } from './lib/types'
import { loadPlan, savePlan, defaultPlan } from './lib/storage'
import { usePlanHistory } from './lib/usePlanHistory'
import Canvas from './components/Canvas'
import FurniturePanel from './components/FurniturePanel'
import SettingsPanel from './components/SettingsPanel'
import AccountMenu from './components/AccountMenu'
import ImportModal from './components/ImportModal'
import ViewOptionsMenu from './components/ViewOptionsMenu'

export default function Page() {
  const { plan, setPlan, undo, redo, replace, canUndo, canRedo } = usePlanHistory(defaultPlan())
  const [mode, setMode] = useState<Mode>('select')
  const [sel, setSel] = useState<Selection>([])
  const [mounted, setMounted] = useState(false)
  const [importMode, setImportMode] = useState<'blueprint' | 'furniture' | null>(null)

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
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (typing || sel.length === 0) return
        e.preventDefault()
        const has = (t: string, id: string) => sel.some((s) => s.type === t && s.id === id)
        setPlan((p) => ({
          ...p,
          rooms: p.rooms.filter((r) => !has('room', r.id)),
          doors: p.doors.filter((d) => !has('door', d.id)),
          furniture: p.furniture.filter((f) => !has('furniture', f.id)),
        }))
        setSel([])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sel, undo, redo, setPlan])

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
          </div>

          <div className="seg">
            <button className="seg-btn" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">
              ↶ Undo
            </button>
            <button className="seg-btn" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">
              ↷ Redo
            </button>
          </div>

          <ViewOptionsMenu plan={plan} setPlan={setPlan} />

          <div className="seg" title="Read a floor plan or furniture photo with Claude">
            <button className="seg-btn" onClick={() => setImportMode('blueprint')}>
              ⌖ Blueprint
            </button>
            <button className="seg-btn" onClick={() => setImportMode('furniture')}>
              ⌖ Furniture
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

          <AccountMenu
            plan={plan}
            onLoadPlan={(p) => {
              replace(p)
              setSel([])
            }}
          />
        </div>
      </header>

      <main className="workspace">
        <div className="canvas-wrap">
          <Canvas plan={plan} setPlan={setPlan} mode={mode} setMode={setMode} sel={sel} setSel={setSel} />
          <p className="hint">
            {mode === 'room' && 'Click and drag on the grid to draw a room.'}
            {mode === 'door' && "Click a room's wall to place a door — it snaps onto the border. Drag to slide it along."}
            {mode === 'select' && 'Drag empty space to box-select · Shift-click to add · Space or middle-mouse drag to pan · Delete removes selection.'}
          </p>
        </div>

        <div className="right">
          <FurniturePanel plan={plan} setPlan={setPlan} sel={sel} setSel={setSel} />
          {sel.length === 1 && <SettingsPanel key={`${sel[0].type}-${sel[0].id}`} plan={plan} setPlan={setPlan} sel={sel[0]} setSel={setSel} />}
        </div>
      </main>

      {importMode && <ImportModal mode={importMode} setPlan={setPlan} onClose={() => setImportMode(null)} />}
    </div>
  )
}
