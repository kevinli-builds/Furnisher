'use client'

import { useState } from 'react'
import type { Plan, Selection } from '../lib/types'
import { uid, snap } from '../lib/geometry'
import { inputUnit, toCm, fromCm, formatSize } from '../lib/units'
import { SWATCHES } from '../lib/palette'
import { FURNITURE_TYPES, FURNITURE_META, type FurnitureType } from '../lib/furniture'

interface Props {
  plan: Plan
  setPlan: React.Dispatch<React.SetStateAction<Plan>>
  sel: Selection
  setSel: (s: Selection) => void
}

export default function FurniturePanel({ plan, setPlan, sel, setSel }: Props) {
  const { units } = plan
  const u = inputUnit(units)

  const [type, setType] = useState<FurnitureType>('sofa')
  const [name, setName] = useState(FURNITURE_META.sofa.label)
  const [w, setW] = useState(String(fromCm(FURNITURE_META.sofa.w, units)))
  const [d, setD] = useState(String(fromCm(FURNITURE_META.sofa.h, units)))
  const [color, setColor] = useState(SWATCHES[0])

  // Picking a type prefills its typical size + name (unless you've renamed it).
  function pickType(t: FurnitureType) {
    setType(t)
    setW(String(fromCm(FURNITURE_META[t].w, units)))
    setD(String(fromCm(FURNITURE_META[t].h, units)))
    setName((cur) => {
      const wasLabel = (FURNITURE_TYPES as readonly string[]).some((k) => FURNITURE_META[k as FurnitureType].label === cur.trim())
      return cur.trim() === '' || wasLabel ? FURNITURE_META[t].label : cur
    })
  }

  function add() {
    const wCm = snap(toCm(parseFloat(w) || 0, units))
    const hCm = snap(toCm(parseFloat(d) || 0, units))
    if (wCm < 10 || hCm < 10) return
    const id = uid()
    const offset = (plan.furniture.length % 6) * 30
    setPlan((pl) => ({
      ...pl,
      furniture: [
        ...pl.furniture,
        { id, name: name.trim() || FURNITURE_META[type].label, type, x: snap(100 + offset), y: snap(100 + offset), w: wCm, h: hCm, rotation: 0, color },
      ],
    }))
    setSel({ type: 'furniture', id })
  }

  return (
    <aside className="panel">
      <h2 className="panel-title">Furniture</h2>

      <div className="add-form">
        <label className="dim">
          <span>Type</span>
          <select className="field" value={type} onChange={(e) => pickType(e.target.value as FurnitureType)}>
            {FURNITURE_TYPES.map((t) => (
              <option key={t} value={t}>
                {FURNITURE_META[t].label}
              </option>
            ))}
          </select>
        </label>
        <input
          className="field"
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <div className="dim-row">
          <label className="dim">
            <span>W ({u})</span>
            <input className="field" inputMode="decimal" value={w} onChange={(e) => setW(e.target.value)} />
          </label>
          <label className="dim">
            <span>D ({u})</span>
            <input className="field" inputMode="decimal" value={d} onChange={(e) => setD(e.target.value)} />
          </label>
        </div>
        <div className="swatches">
          {SWATCHES.map((s) => (
            <button
              key={s}
              type="button"
              className={`swatch${color === s ? ' on' : ''}`}
              style={{ background: s }}
              onClick={() => setColor(s)}
              aria-label={`colour ${s}`}
            />
          ))}
        </div>
        <button className="btn" onClick={add}>
          Add piece
        </button>
      </div>

      <div className="list">
        {plan.furniture.length === 0 && <p className="empty">No furniture yet. Add a piece above, then drag it onto the plan.</p>}
        {plan.furniture.map((f) => {
          const active = sel?.type === 'furniture' && sel.id === f.id
          return (
            <button
              key={f.id}
              className={`item-head item-row${active ? ' active' : ''}`}
              onClick={() => setSel(active ? null : { type: 'furniture', id: f.id })}
            >
              <span className="dot" style={{ background: f.color }} />
              <span className="item-name">{f.name}</span>
              <span className="item-size">{formatSize(f.w, f.h, units)}</span>
            </button>
          )
        })}
      </div>
    </aside>
  )
}
