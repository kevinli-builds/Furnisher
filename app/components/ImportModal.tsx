'use client'

import { useState } from 'react'
import type { Plan } from '../lib/types'
import { uid } from '../lib/geometry'
import { SWATCHES } from '../lib/palette'
import { FURNITURE_META } from '../lib/furniture'
import {
  getApiKey,
  setApiKey,
  hasApiKey,
  readBlueprint,
  readFurniture,
  type ImageInput,
  type BlueprintResult,
  type FurnitureResult,
} from '../lib/anthropic'

interface Props {
  mode: 'blueprint' | 'furniture'
  setPlan: React.Dispatch<React.SetStateAction<Plan>>
  onClose: () => void
}

interface Picked extends ImageInput {
  url: string
}

export default function ImportModal({ mode, setPlan, onClose }: Props) {
  const [keyInput, setKeyInput] = useState(getApiKey())
  const [keySaved, setKeySaved] = useState(hasApiKey())
  const [editingKey, setEditingKey] = useState(!hasApiKey())
  const [img, setImg] = useState<Picked | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [blueprint, setBlueprint] = useState<BlueprintResult | null>(null)
  const [furniture, setFurniture] = useState<FurnitureResult | null>(null)

  const title = mode === 'blueprint' ? 'Import blueprint' : 'Import furniture'

  function saveKey() {
    setApiKey(keyInput)
    setKeySaved(hasApiKey())
    setEditingKey(false)
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const url = String(reader.result)
      const comma = url.indexOf(',')
      const meta = url.slice(5, url.indexOf(';')) // between "data:" and ";base64"
      setImg({ url, mediaType: meta || file.type || 'image/png', data: url.slice(comma + 1) })
      setBlueprint(null)
      setFurniture(null)
      setError('')
    }
    reader.readAsDataURL(file)
  }

  async function run() {
    if (!img) return
    setBusy(true)
    setError('')
    try {
      if (mode === 'blueprint') setBlueprint(await readBlueprint(img))
      else setFurniture(await readFurniture(img))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  function contentRightTop(pl: Plan): { right: number; top: number } | null {
    const xe: number[] = []
    const ys: number[] = []
    for (const r of pl.rooms) xe.push(r.x + r.w), ys.push(r.y)
    for (const f of pl.furniture) xe.push(f.x + f.w), ys.push(f.y)
    if (!xe.length) return null
    return { right: Math.max(...xe), top: Math.min(...ys) }
  }

  function addBlueprint(replace: boolean) {
    if (!blueprint) return
    setPlan((pl) => {
      let dx = 0
      let dy = 0
      if (!replace) {
        const b = contentRightTop(pl)
        if (b && blueprint.rooms.length) {
          const minX = Math.min(...blueprint.rooms.map((r) => r.x))
          const minY = Math.min(...blueprint.rooms.map((r) => r.y))
          dx = b.right + 100 - minX
          dy = b.top - minY
        }
      }
      const rooms = blueprint.rooms.map((r) => ({ id: uid(), name: r.name, x: r.x + dx, y: r.y + dy, w: r.w, h: r.h }))
      const doors = blueprint.doors.map((d) => ({
        id: uid(),
        x: d.x + dx,
        y: d.y + dy,
        length: d.length,
        orientation: d.orientation,
        swing: 1 as const,
        hinge: 1 as const,
      }))
      return replace
        ? { ...pl, rooms, doors }
        : { ...pl, rooms: [...pl.rooms, ...rooms], doors: [...pl.doors, ...doors] }
    })
    onClose()
  }

  function addFurniture() {
    if (!furniture) return
    setPlan((pl) => ({
      ...pl,
      furniture: [
        ...pl.furniture,
        { id: uid(), name: furniture.name, type: furniture.type, x: 100, y: 100, w: furniture.w, h: furniture.h, rotation: 0, color: SWATCHES[0] },
      ],
    }))
    onClose()
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="settings-x" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="modal-body">
          {/* API key */}
          {editingKey ? (
            <section className="sect">
              <label className="sect-label">Anthropic API key</label>
              <p className="sect-note">
                Bring your own key. It’s stored only in this browser and sent directly to Anthropic — never to our servers.{' '}
                <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">
                  Get a key
                </a>
                .
              </p>
              <input
                className="field"
                type="password"
                placeholder="sk-ant-…"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
              />
              <button className="btn" onClick={saveKey} disabled={!keyInput.trim()}>
                Save key
              </button>
            </section>
          ) : (
            <p className="key-line">
              Using your saved API key · <button className="link-x" onClick={() => setEditingKey(true)}>change</button>
            </p>
          )}

          {/* Image picker */}
          {keySaved && !editingKey && (
            <section className="sect">
              <label className="sect-label">
                {mode === 'blueprint' ? 'Floor-plan image' : 'Furniture photo'}
              </label>
              <input className="field" type="file" accept="image/*" onChange={onFile} />
              {img && (
                <div className="img-preview">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.url} alt="upload preview" />
                </div>
              )}
              <button className="btn" onClick={run} disabled={!img || busy}>
                {busy ? 'Reading with Claude…' : 'Read with Claude'}
              </button>
              {error && <p className="modal-error">{error}</p>}
            </section>
          )}

          {/* Blueprint result */}
          {blueprint && (
            <section className="sect result">
              <label className="sect-label">Found</label>
              <p className="sect-note">
                {blueprint.rooms.length} room{blueprint.rooms.length === 1 ? '' : 's'}
                {blueprint.rooms.length > 0 && `: ${blueprint.rooms.map((r) => r.name).join(', ')}`}
                {' · '}
                {blueprint.doors.length} door{blueprint.doors.length === 1 ? '' : 's'}.
              </p>
              <div className="modal-actions">
                <button className="btn" onClick={() => addBlueprint(false)} disabled={blueprint.rooms.length === 0}>
                  Add to plan
                </button>
                <button className="btn-ghost" onClick={() => addBlueprint(true)} disabled={blueprint.rooms.length === 0}>
                  Replace rooms
                </button>
              </div>
              <p className="sect-note">Tip: dimensions are estimates — nudge rooms after importing.</p>
            </section>
          )}

          {/* Furniture result */}
          {furniture && (
            <section className="sect result">
              <label className="sect-label">Found</label>
              <p className="sect-note">
                <strong>{furniture.name}</strong> · {FURNITURE_META[furniture.type].label} · {furniture.w} × {furniture.h} cm
              </p>
              <button className="btn" onClick={addFurniture}>
                Add to plan
              </button>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
