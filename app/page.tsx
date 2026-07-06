'use client'

import { useEffect, useRef, useState } from 'react'
import type { Plan, Mode, Selection } from './lib/types'
import { loadPlan, savePlan, defaultPlan, hasSavedPlan } from './lib/storage'
import { emptyLibrary, loadLibrary, saveLibrary, fetchCloudLibrary, pushCloudLibrary, mergeLibraries, type Library } from './lib/library'
import { useAuth } from './lib/auth'
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
import WelcomeModal from './components/WelcomeModal'
import IntroTips from './components/IntroTips'
import ViewOptionsMenu from './components/ViewOptionsMenu'
import StatsPanel from './components/StatsPanel'
import { exportPng } from './lib/exportImage'
import { printPlan } from './lib/print'

export default function Page() {
  const { plan, setPlan, applyRemote, undo, redo, replace, canUndo, canRedo } = usePlanHistory(defaultPlan())
  const [mode, setMode] = useState<Mode>('select')
  const [sel, setSel] = useState<Selection>([])
  const [mounted, setMounted] = useState(false)
  const [library, setLibrary] = useState<Library>(emptyLibrary()) // personal furniture library (cross-plan)
  const { user } = useAuth()
  const [importMode, setImportMode] = useState<'blueprint' | 'furniture' | null>(null)
  const [showStats, setShowStats] = useState(false)
  const [invOpen, setInvOpen] = useState(false) // mobile inventory bottom-sheet
  const [addOpen, setAddOpen] = useState(false) // mobile "Add" menu
  const [invMode, setInvMode] = useState<'browse' | 'add'>('browse') // mobile inventory: browse-only vs add tools
  const [settingsOpen, setSettingsOpen] = useState(false) // mobile: settings sheet opened via the gear
  const [isMobile, setIsMobile] = useState(false)
  const [resetSignal, setResetSignal] = useState(0) // bump → Canvas clears stuck multi-touch/drag state
  const [showWelcome, setShowWelcome] = useState(false) // first-run template chooser (also reopenable)
  const [showTips, setShowTips] = useState(false) // first-run coach tips (after the welcome closes)
  const firstRunRef = useRef(false) // true only for a brand-new visitor this load

  // Drop to Select and clear any stuck interaction state (the emergency hatch for
  // a touch gesture that left the canvas thinking fingers are still down).
  function goSelect() {
    setMode('select')
    setAddOpen(false)
    setInvOpen(false)
    setResetSignal((n) => n + 1)
  }
  const [collabId, setCollabId] = useState<string | null>(null)
  const { peers, onPointer } = useCollab(collabId, plan, applyRemote)
  const clipboard = useRef<Pick<Plan, 'rooms' | 'doors' | 'furniture' | 'markers' | 'stairs' | 'lights'> | null>(null)

  // Load from localStorage after mount (avoids SSR/hydration mismatch). A
  // brand-new visitor (nothing saved) meets the template chooser instead of a
  // blank canvas — the P1 activation flow.
  useEffect(() => {
    if (hasSavedPlan()) replace(loadPlan())
    else {
      setShowWelcome(true)
      firstRunRef.current = true
    }
    setMounted(true)
  }, [replace])

  // After a brand-new visitor makes their welcome choice, run the coach tips
  // once (localStorage 'furnisher.tourSeen'; Display → Show tips reopens them).
  function maybeStartTips() {
    if (!firstRunRef.current) return
    try {
      if (!localStorage.getItem('furnisher.tourSeen')) setShowTips(true)
    } catch {}
  }

  function dismissTips() {
    setShowTips(false)
    try {
      localStorage.setItem('furnisher.tourSeen', '1')
    } catch {}
  }

  // Track phone-width so selection can be drag-first (settings via a gear) there.
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 760px)')
    const on = () => setIsMobile(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])

  // Changing the selection closes the (mobile) settings sheet.
  useEffect(() => {
    setSettingsOpen(false)
  }, [sel])

  useEffect(() => {
    if (mounted) savePlan(plan)
  }, [plan, mounted])

  // Load the personal furniture library. First run (no library saved yet) seeds
  // it from the current plan's inventory so existing users keep their pieces.
  useEffect(() => {
    const saved = loadLibrary()
    if (saved) {
      setLibrary(saved)
    } else {
      const inv = loadPlan().inventory
      setLibrary({ furniture: inv.furniture, groups: inv.groups ?? ['General'] })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Persist the library locally on every change (independent of the open plan).
  useEffect(() => {
    if (mounted) saveLibrary(library)
  }, [library, mounted])

  // When signed in: pull the cloud copy once and merge it into the local library…
  useEffect(() => {
    if (!user) return
    let cancelled = false
    fetchCloudLibrary().then((cloud) => {
      if (!cancelled && cloud) setLibrary((local) => mergeLibraries(local, cloud))
    })
    return () => {
      cancelled = true
    }
  }, [user])

  // …and push local changes back up (debounced), so the library follows devices.
  useEffect(() => {
    if (!user || !mounted) return
    const t = setTimeout(() => {
      pushCloudLibrary(library)
    }, 1200)
    return () => clearTimeout(t)
  }, [library, user, mounted])

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
          lights: plan.lights.filter((l) => has('light', l.id)),
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
        const lights = c.lights.map((l) => ({ ...l, id: uid(), x: l.x + O, y: l.y + O }))
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
          lights: [...p.lights, ...lights],
        }))
        setSel([
          ...rooms.map((r) => ({ type: 'room' as const, id: r.id })),
          ...furniture.map((f) => ({ type: 'furniture' as const, id: f.id })),
          ...markers.map((m) => ({ type: 'marker' as const, id: m.id })),
          ...doors.map((d) => ({ type: 'door' as const, id: d.id })),
          ...stairs.map((s) => ({ type: 'stair' as const, id: s.id })),
          ...lights.map((l) => ({ type: 'light' as const, id: l.id })),
        ])
        clipboard.current = { rooms, furniture, markers, doors, stairs, lights } // cascade on repeat paste
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
          lights: p.lights.map((l) => (has('light', l.id) ? { ...l, x: l.x + dx, y: l.y + dy } : l)),
        }))
        return
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (typing || sel.length === 0) return
        e.preventDefault()
        deleteSelection()
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
    setInvOpen(false)
    const { cx, cy } = contentCenter()
    const id = uid()
    setPlan((p) => ({
      ...p,
      furniture: [...p.furniture, { id, name: t.name, type: furnitureType(t.type), x: snap(cx - t.w / 2), y: snap(cy - t.h / 2), w: t.w, h: t.h, rotation: 0, color: t.color, shape: t.shape, url: t.url, price: t.price }],
    }))
    setSel([{ type: 'furniture', id }])
  }

  function placeRoomTemplate(t: RoomTemplate) {
    setInvOpen(false)
    const { cx, cy } = contentCenter()
    const id = uid()
    setPlan((p) => ({ ...p, rooms: [...p.rooms, { id, name: t.name, x: snap(cx - t.w / 2), y: snap(cy - t.h / 2), w: t.w, h: t.h }] }))
    setSel([{ type: 'room', id }])
  }

  function placeMarkerTemplate(t: MarkerTemplate) {
    setInvOpen(false)
    const { cx, cy } = contentCenter()
    const id = uid()
    setPlan((p) => ({ ...p, markers: [...p.markers, { id, name: t.name, style: t.style, x: snap(cx - t.w / 2), y: snap(cy - t.h / 2), w: t.w, h: t.h }] }))
    setSel([{ type: 'marker', id }])
  }

  // Delete whatever is selected (keyboard Delete + the mobile trash button).
  function deleteSelection() {
    if (sel.length === 0) return
    const has = (t: string, id: string) => sel.some((s) => s.type === t && s.id === id)
    setPlan((p) => ({
      ...p,
      rooms: p.rooms.filter((r) => !has('room', r.id)),
      doors: p.doors.filter((d) => !has('door', d.id)),
      furniture: p.furniture.filter((f) => !has('furniture', f.id)),
      markers: p.markers.filter((m) => !has('marker', m.id)),
      stairs: p.stairs.filter((s) => !has('stair', s.id)),
      lights: p.lights.filter((l) => !has('light', l.id)),
    }))
    setSel([])
  }

  // Mobile "Add" menu → route each choice to its tool / action, then close.
  function chooseAdd(kind: 'room' | 'door' | 'window' | 'marker' | 'light' | 'measure' | 'furniture' | 'stairs' | 'import') {
    setAddOpen(false)
    if (kind === 'furniture') {
      setInvMode('browse') // open the browsable catalog; AI import / custom pieces are their own entry
      setInvOpen(true)
      return
    }
    if (kind === 'import') {
      setInvMode('add') // the build-a-piece form + AI import (plan / item) tools
      setInvOpen(true)
      return
    }
    if (kind === 'stairs') {
      addStairs()
      return
    }
    setSel([])
    setMode(kind)
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
          {/* Desktop: full set of tool buttons */}
          <div className="seg desktop-only">
            <button className={`seg-btn${mode === 'select' ? ' on' : ''}`} onClick={goSelect}>
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
            <button className={`seg-btn${mode === 'light' ? ' on' : ''}`} onClick={() => setMode('light')} title="Place a ceiling light (no floor space; lights up the room)">
              ☀ Light
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

          <button className="seg-btn solo" onClick={() => setShowWelcome(true)} title="Open an example plan / template gallery">
            ✨ Templates
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

          <button
            className="seg-btn solo"
            title="Print / save as PDF — to scale, one page"
            onClick={() => {
              setSel([]) // drop selection so handles aren't captured
              requestAnimationFrame(() => printPlan(plan))
            }}
          >
            🖨 PDF
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
        {(invOpen || addOpen) && <div className="sheet-backdrop" onClick={() => { setInvOpen(false); setAddOpen(false) }} />}

        {addOpen && (
          <div className="add-sheet">
            <div className="add-sheet-head">
              <span>Add to plan</span>
              <button className="settings-x" onClick={() => setAddOpen(false)} aria-label="Close">
                ✕
              </button>
            </div>
            <div className="add-grid">
              <button onClick={() => chooseAdd('room')}>▭<span>Room</span></button>
              <button onClick={() => chooseAdd('door')}>⌐<span>Door</span></button>
              <button onClick={() => chooseAdd('window')}>⊟<span>Window</span></button>
              <button onClick={() => chooseAdd('furniture')}>🛋<span>Furniture</span></button>
              <button onClick={() => chooseAdd('import')}>⌖<span>AI import</span></button>
              <button onClick={() => chooseAdd('marker')}>▢<span>Marker</span></button>
              <button onClick={() => chooseAdd('stairs')}>⟚<span>Stairs</span></button>
              <button onClick={() => chooseAdd('light')}>☀<span>Ceiling light</span></button>
              <button onClick={() => chooseAdd('measure')}>📏<span>Measure</span></button>
            </div>
          </div>
        )}

        <div className={`left${invOpen ? ' open' : ''}`}>
          <InventoryPanel
            key={!isMobile || invMode === 'add' ? 'inv-add' : 'inv-browse'}
            plan={plan}
            setPlan={setPlan}
            library={library}
            setLibrary={setLibrary}
            onPlaceFurniture={placeFurnitureTemplate}
            onPlaceRoom={placeRoomTemplate}
            onPlaceMarker={placeMarkerTemplate}
            onImport={setImportMode}
            showAdd={!isMobile || invMode === 'add'}
          />
        </div>

        <div className="canvas-wrap">
          <div className="display-fab">
            <ViewOptionsMenu plan={plan} setPlan={setPlan} onShowTips={() => setShowTips(true)} />
          </div>
          {showStats && (
            <StatsPanel
              plan={plan}
              setPlan={setPlan}
              onClose={() => setShowStats(false)}
              onSelectPiece={(id) => setSel([{ type: 'furniture', id }])}
            />
          )}
          <Canvas
            plan={plan}
            setPlan={setPlan}
            mode={mode}
            setMode={setMode}
            sel={sel}
            setSel={setSel}
            peers={peers}
            onPointer={onPointer}
            gearForSettings={isMobile && sel.length === 1 && !settingsOpen}
            onOpenSettings={() => setSettingsOpen(true)}
            onDeleteSelected={deleteSelection}
            compactHandles={isMobile}
            resetSignal={resetSignal}
          />
          <p className={`hint${mode === 'select' ? ' hint-select' : ''}`}>
            {mode === 'room' && 'Tap the grid to drop a room — or drag to size it. Then drag to move, or use the handles to resize.'}
            {mode === 'marker' && 'Tap to drop a labelled box — or drag to size it. Handy for framing each floor.'}
            {mode === 'door' && "Tap a room's wall to place a door — it snaps onto the border. Drag to slide it along."}
            {mode === 'window' && "Tap a room's wall to place a window — it snaps onto the border."}
            {mode === 'light' && 'Tap inside a room to place a ceiling light. It takes no floor space but lights the room (Display → Lighting).'}
            {mode === 'measure' && 'Drag between two points to measure the distance.'}
            {mode === 'select' && 'Drag empty space to pan · Shift-drag to box-select · Shift-click to add · click again on a stack to cycle · arrow keys nudge (Shift = fine) · Delete removes.'}
          </p>
        </div>

        {sel.length === 1 && (!isMobile || settingsOpen) && (
          <>
            {isMobile && <div className="sheet-backdrop" onClick={() => setSettingsOpen(false)} />}
            <div className="right">
              <SettingsPanel key={`${sel[0].type}-${sel[0].id}`} plan={plan} setPlan={setPlan} sel={sel[0]} setSel={setSel} />
            </div>
          </>
        )}
      </main>

      {/* Mobile multi-select action bar (long-press objects to build a selection). */}
      {isMobile && sel.length > 1 && (
        <div className="multisel-bar">
          <span>{sel.length} selected</span>
          <button onClick={deleteSelection}>🗑 Delete</button>
          <button onClick={() => setSel([])}>Clear</button>
        </div>
      )}

      {/* Mobile bottom tab bar — always-visible primary actions. */}
      <nav className="mobile-tabbar">
        <button className={`tab-btn${mode === 'select' && !addOpen && !invOpen ? ' on' : ''}`} onClick={goSelect}>
          <span className="tab-ico">↖</span>
          Select
        </button>
        <button className={`tab-btn${addOpen ? ' on' : ''}`} onClick={() => { setAddOpen((o) => !o); setInvOpen(false) }}>
          <span className="tab-ico">＋</span>
          Add
        </button>
        <button className={`tab-btn${invOpen ? ' on' : ''}`} onClick={() => { setInvOpen((o) => !o); setInvMode('browse'); setAddOpen(false) }}>
          <span className="tab-ico">▤</span>
          Inventory
        </button>
      </nav>

      {importMode && <ImportModal mode={importMode} setPlan={setPlan} onClose={() => setImportMode(null)} />}

      {showWelcome && (
        <WelcomeModal
          dismissable={hasSavedPlan()}
          onPick={(p) => {
            replace(p)
            setSel([])
            setShowWelcome(false)
            maybeStartTips()
          }}
          onBlank={() => {
            replace(defaultPlan())
            setSel([])
            setShowWelcome(false)
            maybeStartTips()
          }}
          onImport={() => {
            setShowWelcome(false)
            setImportMode('blueprint')
            maybeStartTips()
          }}
          onClose={() => {
            setShowWelcome(false)
            maybeStartTips()
          }}
        />
      )}

      {showTips && !showWelcome && !importMode && <IntroTips onClose={dismissTips} />}
    </div>
  )
}
