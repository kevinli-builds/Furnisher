'use client'

import { useState } from 'react'
import type { Plan, FurnTemplate, RoomTemplate } from '../lib/types'
import { uid, snap } from '../lib/geometry'
import { inputUnit, toCm, fromCm, formatSize } from '../lib/units'
import { SWATCHES } from '../lib/palette'
import { FURNITURE_TYPES, FURNITURE_META, type FurnitureType } from '../lib/furniture'

interface Props {
  plan: Plan
  setPlan: React.Dispatch<React.SetStateAction<Plan>>
  onPlaceFurniture: (t: FurnTemplate) => void
  onPlaceRoom: (t: RoomTemplate) => void
  onImport: (mode: 'blueprint' | 'furniture') => void
}

export default function InventoryPanel({ plan, setPlan, onPlaceFurniture, onPlaceRoom, onImport }: Props) {
  const { units } = plan
  const u = inputUnit(units)
  const [tab, setTab] = useState<'furniture' | 'rooms'>('furniture')

  // ── Furniture template form ───────────────────────────────────
  const [ftype, setFtype] = useState<FurnitureType>('sofa')
  const [fname, setFname] = useState(FURNITURE_META.sofa.label)
  const [fw, setFw] = useState(String(fromCm(FURNITURE_META.sofa.w, units)))
  const [fd, setFd] = useState(String(fromCm(FURNITURE_META.sofa.h, units)))
  const [fcolor, setFcolor] = useState(SWATCHES[0])

  function pickType(t: FurnitureType) {
    setFtype(t)
    setFw(String(fromCm(FURNITURE_META[t].w, units)))
    setFd(String(fromCm(FURNITURE_META[t].h, units)))
    setFname((cur) => {
      const wasLabel = (FURNITURE_TYPES as readonly string[]).some((k) => FURNITURE_META[k as FurnitureType].label === cur.trim())
      return cur.trim() === '' || wasLabel ? FURNITURE_META[t].label : cur
    })
  }

  function addFurn() {
    const w = snap(toCm(parseFloat(fw) || 0, units))
    const h = snap(toCm(parseFloat(fd) || 0, units))
    if (w < 10 || h < 10) return
    const t: FurnTemplate = { id: uid(), name: fname.trim() || FURNITURE_META[ftype].label, type: ftype, w, h, color: fcolor }
    setPlan((p) => ({ ...p, inventory: { ...p.inventory, furniture: [...p.inventory.furniture, t] } }))
  }

  // ── Room template form ────────────────────────────────────────
  const [rname, setRname] = useState('Room')
  const [rw, setRw] = useState(units === 'metric' ? '400' : '160')
  const [rd, setRd] = useState(units === 'metric' ? '300' : '120')

  function addRoom() {
    const w = snap(toCm(parseFloat(rw) || 0, units))
    const h = snap(toCm(parseFloat(rd) || 0, units))
    if (w < 50 || h < 50) return
    const t: RoomTemplate = { id: uid(), name: rname.trim() || 'Room', w, h }
    setPlan((p) => ({ ...p, inventory: { ...p.inventory, rooms: [...p.inventory.rooms, t] } }))
  }

  function removeFurn(id: string) {
    setPlan((p) => ({ ...p, inventory: { ...p.inventory, furniture: p.inventory.furniture.filter((t) => t.id !== id) } }))
  }
  function removeRoom(id: string) {
    setPlan((p) => ({ ...p, inventory: { ...p.inventory, rooms: p.inventory.rooms.filter((t) => t.id !== id) } }))
  }

  function dragStart(e: React.DragEvent, kind: 'furniture' | 'room', template: FurnTemplate | RoomTemplate) {
    e.dataTransfer.setData('application/furnisher-item', JSON.stringify({ kind, template }))
    e.dataTransfer.effectAllowed = 'copy'
  }

  return (
    <aside className="panel inventory">
      <h2 className="panel-title">Inventory</h2>

      <div className="seg full inv-tabs">
        <button className={`seg-btn${tab === 'furniture' ? ' on' : ''}`} onClick={() => setTab('furniture')}>
          Furniture
        </button>
        <button className={`seg-btn${tab === 'rooms' ? ' on' : ''}`} onClick={() => setTab('rooms')}>
          Rooms
        </button>
      </div>

      {tab === 'furniture' ? (
        <>
          <div className="add-form">
            <label className="dim">
              <span>Type</span>
              <select className="field" value={ftype} onChange={(e) => pickType(e.target.value as FurnitureType)}>
                {FURNITURE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {FURNITURE_META[t].label}
                  </option>
                ))}
              </select>
            </label>
            <input className="field" placeholder="Name" value={fname} onChange={(e) => setFname(e.target.value)} />
            <div className="dim-row">
              <label className="dim">
                <span>W ({u})</span>
                <input className="field" inputMode="decimal" value={fw} onChange={(e) => setFw(e.target.value)} />
              </label>
              <label className="dim">
                <span>D ({u})</span>
                <input className="field" inputMode="decimal" value={fd} onChange={(e) => setFd(e.target.value)} />
              </label>
            </div>
            <div className="swatches">
              {SWATCHES.map((s) => (
                <button key={s} type="button" className={`swatch${fcolor === s ? ' on' : ''}`} style={{ background: s }} onClick={() => setFcolor(s)} aria-label={`colour ${s}`} />
              ))}
              <input type="color" className="swatch swatch-custom" value={fcolor} onChange={(e) => setFcolor(e.target.value)} title="Custom colour" />
            </div>
            <button className="btn" onClick={addFurn}>
              Save to inventory
            </button>
          </div>

          <p className="inv-hint">Drag a piece onto the plan (or click to drop it in view).</p>
          <div className="list">
            {plan.inventory.furniture.length === 0 && <p className="empty sm">No saved furniture yet.</p>}
            {plan.inventory.furniture.map((t) => (
              <div key={t.id} className="inv-card" draggable onDragStart={(e) => dragStart(e, 'furniture', t)} onClick={() => onPlaceFurniture(t)} title="Drag onto the plan, or click to place">
                <span className="dot" style={{ background: t.color }} />
                <span className="item-name">{t.name}</span>
                <span className="item-size">{formatSize(t.w, t.h, units)}</span>
                <button
                  className="proj-act danger"
                  onClick={(e) => {
                    e.stopPropagation()
                    removeFurn(t.id)
                  }}
                  title="Remove"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="add-form">
            <input className="field" placeholder="Name" value={rname} onChange={(e) => setRname(e.target.value)} />
            <div className="dim-row">
              <label className="dim">
                <span>W ({u})</span>
                <input className="field" inputMode="decimal" value={rw} onChange={(e) => setRw(e.target.value)} />
              </label>
              <label className="dim">
                <span>D ({u})</span>
                <input className="field" inputMode="decimal" value={rd} onChange={(e) => setRd(e.target.value)} />
              </label>
            </div>
            <button className="btn" onClick={addRoom}>
              Save to inventory
            </button>
          </div>

          <p className="inv-hint">Drag a room onto the plan (or click to drop it in view).</p>
          <div className="list">
            {plan.inventory.rooms.length === 0 && <p className="empty sm">No saved rooms yet.</p>}
            {plan.inventory.rooms.map((t) => (
              <div key={t.id} className="inv-card" draggable onDragStart={(e) => dragStart(e, 'room', t)} onClick={() => onPlaceRoom(t)} title="Drag onto the plan, or click to place">
                <span className="item-name">{t.name}</span>
                <span className="item-size">{formatSize(t.w, t.h, units)}</span>
                <button
                  className="proj-act danger"
                  onClick={(e) => {
                    e.stopPropagation()
                    removeRoom(t.id)
                  }}
                  title="Remove"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="inv-footer">
        <span className="inv-footer-label">AI import</span>
        <div className="inv-footer-btns">
          <button className="icon-btn" onClick={() => onImport('blueprint')} title="Read a floor-plan image with Claude">
            ⌖ Plan
          </button>
          <button className="icon-btn" onClick={() => onImport('furniture')} title="Read a furniture photo / link with Claude">
            ⌖ Item
          </button>
        </div>
      </div>
    </aside>
  )
}
