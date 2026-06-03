'use client'

import { useState } from 'react'
import type { Plan, Selection } from '../lib/types'
import { uid, snap } from '../lib/geometry'
import { inputUnit, toCm, formatSize } from '../lib/units'
import { SWATCHES } from '../lib/palette'

interface Props {
  plan: Plan
  setPlan: React.Dispatch<React.SetStateAction<Plan>>
  sel: Selection
  setSel: (s: Selection) => void
}

export default function FurniturePanel({ plan, setPlan, sel, setSel }: Props) {
  const { units } = plan
  const u = inputUnit(units)

  const [name, setName] = useState('')
  const [w, setW] = useState(units === 'metric' ? '90' : '36')
  const [d, setD] = useState(units === 'metric' ? '90' : '36')
  const [color, setColor] = useState(SWATCHES[0])

  function add() {
    const wCm = snap(toCm(parseFloat(w) || 0, units))
    const hCm = snap(toCm(parseFloat(d) || 0, units))
    if (wCm < 10 || hCm < 10) return
    const id = uid()
    // Drop it near the top-left, snapped, nudged so stacked adds don't overlap exactly.
    const offset = (plan.furniture.length % 6) * 30
    setPlan((pl) => ({
      ...pl,
      furniture: [
        ...pl.furniture,
        {
          id,
          name: name.trim() || 'Furniture',
          x: snap(100 + offset),
          y: snap(100 + offset),
          w: wCm,
          h: hCm,
          rotation: 0,
          color,
        },
      ],
    }))
    setSel({ type: 'furniture', id })
    setName('')
  }

  return (
    <aside className="panel">
      <h2 className="panel-title">Furniture</h2>

      <div className="add-form">
        <input
          className="field"
          placeholder="Name (e.g. Sofa)"
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
