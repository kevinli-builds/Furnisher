'use client'

import { useState } from 'react'
import type { Plan, FurnTemplate, RoomTemplate, MarkerTemplate, MarkerStyle } from '../lib/types'
import { uid, snap } from '../lib/geometry'
import { inputUnit, toCm, fromCm, formatSize } from '../lib/units'
import { SWATCHES } from '../lib/palette'
import { FURNITURE_TYPES, FURNITURE_META, type FurnitureType } from '../lib/furniture'
import { CATALOG, type CatalogItem } from '../lib/catalog'

interface Props {
  plan: Plan
  setPlan: React.Dispatch<React.SetStateAction<Plan>>
  onPlaceFurniture: (t: FurnTemplate) => void
  onPlaceRoom: (t: RoomTemplate) => void
  onPlaceMarker: (t: MarkerTemplate) => void
  onImport: (mode: 'blueprint' | 'furniture') => void
  showAdd?: boolean // false = browse-only (mobile Inventory tab); adding lives behind the Add button
}

export default function InventoryPanel({ plan, setPlan, onPlaceFurniture, onPlaceRoom, onPlaceMarker, onImport, showAdd = true }: Props) {
  const { units } = plan
  const u = inputUnit(units)
  const [tab, setTab] = useState<'furniture' | 'rooms' | 'markers'>('furniture')

  const groups = plan.inventory.groups?.length ? plan.inventory.groups : ['General']
  const effGroup = (g?: string) => (g && groups.includes(g) ? g : groups[0])

  // ── Furniture template form ───────────────────────────────────
  const [ftype, setFtype] = useState<FurnitureType>('sofa')
  const [fname, setFname] = useState(FURNITURE_META.sofa.label)
  const [fw, setFw] = useState(String(fromCm(FURNITURE_META.sofa.w, units)))
  const [fd, setFd] = useState(String(fromCm(FURNITURE_META.sofa.h, units)))
  const [fcolor, setFcolor] = useState(SWATCHES[0])
  const [fgroup, setFgroup] = useState(groups[0])
  const [fround, setFround] = useState(false)
  const [fprice, setFprice] = useState('')

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
    const priceN = parseFloat(fprice)
    const t: FurnTemplate = { id: uid(), name: fname.trim() || FURNITURE_META[ftype].label, type: ftype, w, h, color: fcolor, group: effGroup(fgroup), shape: fround ? 'round' : undefined, price: Number.isFinite(priceN) && priceN > 0 ? priceN : undefined }
    setPlan((p) => ({ ...p, inventory: { ...p.inventory, furniture: [...p.inventory.furniture, t] } }))
  }

  function addGroup() {
    const name = (window.prompt('New group name (e.g. Kitchen):') || '').trim()
    if (!name || groups.includes(name)) return
    setPlan((p) => ({ ...p, inventory: { ...p.inventory, groups: [...groups, name] } }))
    setFgroup(name)
  }

  function reassignGroup(id: string, group: string) {
    setPlan((p) => ({ ...p, inventory: { ...p.inventory, furniture: p.inventory.furniture.map((t) => (t.id === id ? { ...t, group } : t)) } }))
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

  // ── Marker template form ──────────────────────────────────────
  const [mname, setMname] = useState('Counters')
  const [mw, setMw] = useState(units === 'metric' ? '200' : '80')
  const [md, setMd] = useState(units === 'metric' ? '60' : '24')
  const [mstyle, setMstyle] = useState<MarkerStyle>('shaded')

  function addMarker() {
    const w = snap(toCm(parseFloat(mw) || 0, units))
    const h = snap(toCm(parseFloat(md) || 0, units))
    if (w < 30 || h < 30) return
    const t: MarkerTemplate = { id: uid(), name: mname.trim() || 'Marker', w, h, style: mstyle }
    setPlan((p) => ({ ...p, inventory: { ...p.inventory, markers: [...p.inventory.markers, t] } }))
  }

  function removeFrom(key: 'furniture' | 'rooms' | 'markers', id: string) {
    setPlan((p) => ({ ...p, inventory: { ...p.inventory, [key]: p.inventory[key].filter((t) => t.id !== id) } }))
  }

  function dragStart(e: React.DragEvent, kind: 'furniture' | 'room' | 'marker', template: object) {
    e.dataTransfer.setData('application/furnisher-item', JSON.stringify({ kind, template }))
    e.dataTransfer.effectAllowed = 'copy'
  }

  function catalogCard(item: CatalogItem) {
    const t: FurnTemplate = { id: item.name, name: item.name, type: item.type, w: item.w, h: item.h, color: SWATCHES[0] }
    return (
      <div key={item.name} className="inv-card" draggable onDragStart={(e) => dragStart(e, 'furniture', t)} onClick={() => onPlaceFurniture(t)} title="Drag onto the plan, or tap to place">
        <span className="item-name">{item.name}</span>
        <span className="item-size">{formatSize(item.w, item.h, units)}</span>
      </div>
    )
  }

  function furnCard(t: FurnTemplate) {
    return (
      <div key={t.id} className="inv-card" draggable onDragStart={(e) => dragStart(e, 'furniture', t)} onClick={() => onPlaceFurniture(t)} title="Drag onto the plan or another group, or click to place">
        <span className="dot" style={{ background: t.color }} />
        <span className="item-name">{t.name}</span>
        <span className="item-size">{formatSize(t.w, t.h, units)}</span>
        <button className="proj-act danger" onClick={(e) => { e.stopPropagation(); removeFrom('furniture', t.id) }} title="Remove">
          ✕
        </button>
      </div>
    )
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
        <button className={`seg-btn${tab === 'markers' ? ' on' : ''}`} onClick={() => setTab('markers')}>
          Markers
        </button>
      </div>

      {tab === 'furniture' && (
        <>
          {showAdd && <div className="add-form">
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
            <div className="seg full">
              <button type="button" className={`seg-btn${!fround ? ' on' : ''}`} onClick={() => setFround(false)}>
                Square
              </button>
              <button type="button" className={`seg-btn${fround ? ' on' : ''}`} onClick={() => setFround(true)}>
                Round
              </button>
            </div>
            <div className="dim-row">
              <label className="dim">
                <span>Group</span>
                <select className="field" value={fgroup} onChange={(e) => setFgroup(e.target.value)}>
                  {groups.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </label>
              <label className="dim">
                <span>Price</span>
                <input className="field" inputMode="decimal" placeholder="—" value={fprice} onChange={(e) => setFprice(e.target.value)} />
              </label>
            </div>
            <button className="btn" onClick={addFurn}>
              Save to inventory
            </button>
          </div>}

          <div className="inv-grouphead">
            <p className="inv-hint">{showAdd ? 'Drag a piece onto the plan, or onto a group to move it.' : 'Tap a piece to drop it on the plan.'}</p>
            {showAdd && (
              <button className="link-x" onClick={addGroup}>
                + Group
              </button>
            )}
          </div>

          <div className="list">
            {plan.inventory.furniture.length === 0 && <p className="empty sm">No saved furniture yet.</p>}
            {groups.length <= 1
              ? plan.inventory.furniture.map(furnCard)
              : groups.map((g) => {
                  const items = plan.inventory.furniture.filter((t) => effGroup(t.group) === g)
                  return (
                    <div
                      key={g}
                      className="inv-group"
                      onDragOver={(e) => {
                        if (e.dataTransfer.types.includes('application/furnisher-item')) e.preventDefault()
                      }}
                      onDrop={(e) => {
                        const raw = e.dataTransfer.getData('application/furnisher-item')
                        if (!raw) return
                        try {
                          const { kind, template } = JSON.parse(raw)
                          if (kind === 'furniture') {
                            e.preventDefault()
                            reassignGroup(template.id, g)
                          }
                        } catch {
                          /* ignore */
                        }
                      }}
                    >
                      <div className="inv-group-name">{g}</div>
                      {items.map(furnCard)}
                    </div>
                  )
                })}
          </div>

          <div className="inv-grouphead" style={{ marginTop: 10 }}>
            <p className="inv-hint">Catalog — common pieces at real sizes. Tap to drop one on the plan.</p>
          </div>
          {CATALOG.map((cat) => (
            <div key={cat.group} className="inv-group">
              <div className="inv-group-name">{cat.group}</div>
              {cat.items.map(catalogCard)}
            </div>
          ))}
        </>
      )}

      {tab === 'rooms' && (
        <>
          {showAdd && <div className="add-form">
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
          </div>}

          <p className="inv-hint">Drag a room onto the plan (or click to drop it in view).</p>
          <div className="list">
            {plan.inventory.rooms.length === 0 && <p className="empty sm">No saved rooms yet.</p>}
            {plan.inventory.rooms.map((t) => (
              <div key={t.id} className="inv-card" draggable onDragStart={(e) => dragStart(e, 'room', t)} onClick={() => onPlaceRoom(t)} title="Drag onto the plan, or click to place">
                <span className="item-name">{t.name}</span>
                <span className="item-size">{formatSize(t.w, t.h, units)}</span>
                <button className="proj-act danger" onClick={(e) => { e.stopPropagation(); removeFrom('rooms', t.id) }} title="Remove">
                  ✕
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === 'markers' && (
        <>
          {showAdd && <div className="add-form">
            <input className="field" placeholder="Name (e.g. Counters)" value={mname} onChange={(e) => setMname(e.target.value)} />
            <div className="dim-row">
              <label className="dim">
                <span>W ({u})</span>
                <input className="field" inputMode="decimal" value={mw} onChange={(e) => setMw(e.target.value)} />
              </label>
              <label className="dim">
                <span>D ({u})</span>
                <input className="field" inputMode="decimal" value={md} onChange={(e) => setMd(e.target.value)} />
              </label>
            </div>
            <label className="dim">
              <span>Style</span>
              <select className="field" value={mstyle} onChange={(e) => setMstyle(e.target.value as MarkerStyle)}>
                <option value="frame">Frame</option>
                <option value="shaded">Shaded</option>
                <option value="closet">Hatch</option>
              </select>
            </label>
            <button className="btn" onClick={addMarker}>
              Save to inventory
            </button>
          </div>}

          <p className="inv-hint">Drag a marker onto the plan (or click to drop it in view).</p>
          <div className="list">
            {plan.inventory.markers.length === 0 && <p className="empty sm">No saved markers yet.</p>}
            {plan.inventory.markers.map((t) => (
              <div key={t.id} className="inv-card" draggable onDragStart={(e) => dragStart(e, 'marker', t)} onClick={() => onPlaceMarker(t)} title="Drag onto the plan, or click to place">
                <span className="item-name">{t.name}</span>
                <span className="item-size">{formatSize(t.w, t.h, units)}</span>
                <button className="proj-act danger" onClick={(e) => { e.stopPropagation(); removeFrom('markers', t.id) }} title="Remove">
                  ✕
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {showAdd && (
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
      )}
    </aside>
  )
}
