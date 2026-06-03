'use client'

import { useState } from 'react'
import type { Plan, Selection, Rotation } from '../lib/types'
import { uid, snap } from '../lib/geometry'
import { inputUnit, toCm, fromCm, formatSize } from '../lib/units'

interface Props {
  plan: Plan
  setPlan: React.Dispatch<React.SetStateAction<Plan>>
  sel: Selection
  setSel: (s: Selection) => void
}

const SWATCHES = ['#d8c8a4', '#b9c2a0', '#d3a87f', '#c79a86', '#bcb482', '#a8b1aa']

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

  function update(id: string, patch: Partial<{ name: string; w: number; h: number; rotation: Rotation; color: string }>) {
    setPlan((pl) => ({
      ...pl,
      furniture: pl.furniture.map((f) => (f.id === id ? { ...f, ...patch } : f)),
    }))
  }

  function remove(id: string) {
    setPlan((pl) => ({ ...pl, furniture: pl.furniture.filter((f) => f.id !== id) }))
    if (sel?.type === 'furniture' && sel.id === id) setSel(null)
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
            <div key={f.id} className={`item${active ? ' active' : ''}`}>
              <button className="item-head" onClick={() => setSel(active ? null : { type: 'furniture', id: f.id })}>
                <span className="dot" style={{ background: f.color }} />
                <span className="item-name">{f.name}</span>
                <span className="item-size">{formatSize(f.w, f.h, units)}</span>
              </button>

              {active && (
                <div className="item-edit">
                  <input className="field" value={f.name} onChange={(e) => update(f.id, { name: e.target.value })} />
                  <div className="dim-row">
                    <label className="dim">
                      <span>W ({u})</span>
                      <input
                        className="field"
                        inputMode="decimal"
                        defaultValue={fromCm(f.w, units)}
                        onChange={(e) => update(f.id, { w: snap(toCm(parseFloat(e.target.value) || f.w, units)) })}
                      />
                    </label>
                    <label className="dim">
                      <span>D ({u})</span>
                      <input
                        className="field"
                        inputMode="decimal"
                        defaultValue={fromCm(f.h, units)}
                        onChange={(e) => update(f.id, { h: snap(toCm(parseFloat(e.target.value) || f.h, units)) })}
                      />
                    </label>
                  </div>
                  <div className="swatches">
                    {SWATCHES.map((s) => (
                      <button
                        key={s}
                        type="button"
                        className={`swatch${f.color === s ? ' on' : ''}`}
                        style={{ background: s }}
                        onClick={() => update(f.id, { color: s })}
                        aria-label={`colour ${s}`}
                      />
                    ))}
                  </div>
                  <div className="item-actions">
                    <button className="btn-ghost" onClick={() => update(f.id, { rotation: ((f.rotation + 90) % 360) as Rotation })}>
                      ⟳ Rotate
                    </button>
                    <button className="btn-ghost danger" onClick={() => remove(f.id)}>
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </aside>
  )
}
