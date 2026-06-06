'use client'

import type { Plan, Selection, SelItem, Rotation } from '../lib/types'
import { snap } from '../lib/geometry'
import { inputUnit, toCm, fromCm, formatLength } from '../lib/units'
import { SWATCHES } from '../lib/palette'
import { FURNITURE_TYPES, FURNITURE_META, furnitureType, type FurnitureType } from '../lib/furniture'
import { safeUrl } from '../lib/url'

interface Props {
  plan: Plan
  setPlan: React.Dispatch<React.SetStateAction<Plan>>
  sel: SelItem
  setSel: (s: Selection) => void
}

const ROTATIONS: Rotation[] = [0, 90, 180, 270]

// Settings / "format options" panel — slides in when something is selected.
// Keyed on the selection in the parent, so uncontrolled inputs reset cleanly
// when you switch between objects.
export default function SettingsPanel({ plan, setPlan, sel, setSel }: Props) {
  const { units } = plan
  const u = inputUnit(units)

  const room = sel.type === 'room' ? plan.rooms.find((r) => r.id === sel.id) : null
  const furn = sel.type === 'furniture' ? plan.furniture.find((f) => f.id === sel.id) : null
  const door = sel.type === 'door' ? plan.doors.find((d) => d.id === sel.id) : null
  const marker = sel.type === 'marker' ? plan.markers.find((m) => m.id === sel.id) : null
  const stair = sel.type === 'stair' ? plan.stairs.find((s) => s.id === sel.id) : null

  function patchRoom(patch: Partial<NonNullable<typeof room>>) {
    setPlan((p) => ({ ...p, rooms: p.rooms.map((r) => (r.id === sel.id ? { ...r, ...patch } : r)) }))
  }
  function patchFurn(patch: Partial<NonNullable<typeof furn>>) {
    setPlan((p) => ({ ...p, furniture: p.furniture.map((f) => (f.id === sel.id ? { ...f, ...patch } : f)) }))
  }
  function patchDoor(patch: Partial<NonNullable<typeof door>>) {
    setPlan((p) => ({ ...p, doors: p.doors.map((d) => (d.id === sel.id ? { ...d, ...patch } : d)) }))
  }
  function patchMarker(patch: Partial<NonNullable<typeof marker>>) {
    setPlan((p) => ({ ...p, markers: p.markers.map((m) => (m.id === sel.id ? { ...m, ...patch } : m)) }))
  }
  function patchStair(patch: Partial<NonNullable<typeof stair>>) {
    setPlan((p) => ({ ...p, stairs: p.stairs.map((s) => (s.id === sel.id ? { ...s, ...patch } : s)) }))
  }

  function close() {
    setSel([])
  }

  function remove() {
    setPlan((p) => {
      if (sel.type === 'room') return { ...p, rooms: p.rooms.filter((r) => r.id !== sel.id) }
      if (sel.type === 'door') return { ...p, doors: p.doors.filter((d) => d.id !== sel.id) }
      if (sel.type === 'marker') return { ...p, markers: p.markers.filter((m) => m.id !== sel.id) }
      if (sel.type === 'stair') return { ...p, stairs: p.stairs.filter((s) => s.id !== sel.id) }
      return { ...p, furniture: p.furniture.filter((f) => f.id !== sel.id) }
    })
    setSel([])
  }

  // size input → snapped cm (with a sensible floor)
  const sizeCm = (v: string, fallback: number, min: number) => {
    const cm = snap(toCm(parseFloat(v) || 0, units))
    return cm < min ? fallback : cm
  }

  const title = room ? 'Room' : furn ? 'Furniture' : door ? 'Door' : marker ? 'Marker' : 'Stairs'
  if (!room && !furn && !door && !marker && !stair) return null

  return (
    <aside className="settings">
      <div className="settings-head">
        <span className="settings-title">{title}</span>
        <button className="settings-x" onClick={close} aria-label="Close settings">
          ✕
        </button>
      </div>

      <div className="settings-body">
        {/* Name — room, furniture, marker */}
        {(room || furn || marker) && (
          <section className="sect">
            <label className="sect-label">Name</label>
            <input
              className="field"
              defaultValue={room ? room.name : marker ? marker.name : furn!.name}
              onChange={(e) => (room ? patchRoom({ name: e.target.value }) : marker ? patchMarker({ name: e.target.value }) : patchFurn({ name: e.target.value }))}
            />
          </section>
        )}

        {/* Size — room, furniture, marker, stairs */}
        {(room || furn || marker || stair) && (
          <section className="sect">
            <label className="sect-label">Size</label>
            <div className="dim-row">
              <label className="dim">
                <span>Width ({u})</span>
                <input
                  className="field"
                  inputMode="decimal"
                  defaultValue={fromCm(room ? room.w : marker ? marker.w : stair ? stair.w : furn!.w, units)}
                  onChange={(e) =>
                    room
                      ? patchRoom({ w: sizeCm(e.target.value, room.w, 50) })
                      : marker
                        ? patchMarker({ w: sizeCm(e.target.value, marker.w, 50) })
                        : stair
                          ? patchStair({ w: sizeCm(e.target.value, stair.w, 30) })
                          : patchFurn({ w: sizeCm(e.target.value, furn!.w, 10) })
                  }
                />
              </label>
              <label className="dim">
                <span>Depth ({u})</span>
                <input
                  className="field"
                  inputMode="decimal"
                  defaultValue={fromCm(room ? room.h : marker ? marker.h : stair ? stair.h : furn!.h, units)}
                  onChange={(e) =>
                    room
                      ? patchRoom({ h: sizeCm(e.target.value, room.h, 50) })
                      : marker
                        ? patchMarker({ h: sizeCm(e.target.value, marker.h, 50) })
                        : stair
                          ? patchStair({ h: sizeCm(e.target.value, stair.h, 30) })
                          : patchFurn({ h: sizeCm(e.target.value, furn!.h, 10) })
                  }
                />
              </label>
            </div>
          </section>
        )}

        {/* Room shape */}
        {room && (
          <section className="sect">
            <label className="sect-label">Shape</label>
            {room.points ? (
              <>
                <p className="sect-note">Drag corner dots to reshape · white edge dots add a corner · double-click a corner to remove it.</p>
                <button
                  className="btn-ghost"
                  onClick={() => setPlan((p) => ({ ...p, rooms: p.rooms.map((r) => (r.id === sel.id ? { id: r.id, name: r.name, x: r.x, y: r.y, w: r.w, h: r.h } : r)) }))}
                >
                  Reset to rectangle
                </button>
              </>
            ) : (
              <>
                <p className="sect-note">Drag the border handles to resize, or convert to a polygon to make an L-shape.</p>
                <button
                  className="btn-ghost"
                  onClick={() =>
                    setPlan((p) => ({
                      ...p,
                      rooms: p.rooms.map((r) =>
                        r.id === sel.id
                          ? { ...r, points: [{ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y }, { x: r.x + r.w, y: r.y + r.h }, { x: r.x, y: r.y + r.h }] }
                          : r,
                      ),
                    }))
                  }
                >
                  Make non-square
                </button>
              </>
            )}
          </section>
        )}

        {/* Stair controls */}
        {stair && (
          <>
            <section className="sect">
              <label className="sect-label">Role</label>
              <div className="seg full">
                <button className={`seg-btn${stair.role === 'entry' ? ' on' : ''}`} onClick={() => patchStair({ role: 'entry' })}>
                  Entry
                </button>
                <button className={`seg-btn${stair.role === 'exit' ? ' on' : ''}`} onClick={() => patchStair({ role: 'exit' })}>
                  Exit
                </button>
              </div>
            </section>
            <section className="sect">
              <label className="sect-label">Rotation · {Math.round(((stair.rotation % 360) + 360) % 360)}°</label>
              <div className="seg full">
                {ROTATIONS.map((r) => (
                  <button key={r} className={`seg-btn${Math.round(((stair.rotation % 360) + 360) % 360) === r ? ' on' : ''}`} onClick={() => patchStair({ rotation: r })}>
                    {r}°
                  </button>
                ))}
              </div>
              <input
                type="range"
                className="slider"
                min={0}
                max={359}
                step={1}
                value={Math.round(((stair.rotation % 360) + 360) % 360)}
                onChange={(e) => patchStair({ rotation: Number(e.target.value) })}
              />
            </section>
          </>
        )}

        {/* Type — furniture */}
        {furn && (
          <section className="sect">
            <label className="sect-label">Type</label>
            <select
              className="field"
              value={furnitureType(furn.type)}
              onChange={(e) => patchFurn({ type: e.target.value as FurnitureType })}
            >
              {FURNITURE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {FURNITURE_META[t].label}
                </option>
              ))}
            </select>
          </section>
        )}

        {/* Shape — furniture (round rugs, round tables, …) */}
        {furn && (
          <section className="sect">
            <label className="sect-label">Shape</label>
            <div className="seg full">
              <button className={`seg-btn${(furn.shape ?? 'rect') === 'rect' ? ' on' : ''}`} onClick={() => patchFurn({ shape: 'rect' })}>
                Square
              </button>
              <button className={`seg-btn${furn.shape === 'round' ? ' on' : ''}`} onClick={() => patchFurn({ shape: 'round' })}>
                Round
              </button>
            </div>
          </section>
        )}

        {/* Rotation + colour — furniture */}
        {furn && (
          <>
            <section className="sect">
              <label className="sect-label">Rotation · {Math.round(((furn.rotation % 360) + 360) % 360)}°</label>
              <div className="seg full">
                {ROTATIONS.map((r) => (
                  <button
                    key={r}
                    className={`seg-btn${Math.round(((furn.rotation % 360) + 360) % 360) === r ? ' on' : ''}`}
                    onClick={() => patchFurn({ rotation: r })}
                  >
                    {r}°
                  </button>
                ))}
              </div>
              <input
                type="range"
                className="slider"
                min={0}
                max={359}
                step={1}
                value={Math.round(((furn.rotation % 360) + 360) % 360)}
                onChange={(e) => patchFurn({ rotation: Number(e.target.value) })}
              />
            </section>
            <section className="sect">
              <label className="sect-label">Colour</label>
              <div className="swatches">
                {SWATCHES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={`swatch${furn.color === s ? ' on' : ''}`}
                    style={{ background: s }}
                    onClick={() => patchFurn({ color: s })}
                    aria-label={`colour ${s}`}
                  />
                ))}
                <input
                  type="color"
                  className="swatch swatch-custom"
                  value={furn.color}
                  onChange={(e) => patchFurn({ color: e.target.value })}
                  title="Custom colour"
                />
              </div>
            </section>
            <section className="sect">
              <label className="sect-label">Link</label>
              <input
                className="field"
                type="url"
                placeholder="https://… (product page)"
                defaultValue={furn.url ?? ''}
                onChange={(e) => patchFurn({ url: e.target.value })}
              />
              {safeUrl(furn.url) && (
                <a className="open-link" href={safeUrl(furn.url) as string} target="_blank" rel="noreferrer noopener">
                  ↗ Open link
                </a>
              )}
            </section>
            <section className="sect">
              <label className="sect-label">Light source</label>
              <div className="seg full">
                <button
                  className={`seg-btn${(furn.light ?? furnitureType(furn.type) === 'lamp') ? ' on' : ''}`}
                  onClick={() => patchFurn({ light: true })}
                >
                  Emits light
                </button>
                <button
                  className={`seg-btn${!(furn.light ?? furnitureType(furn.type) === 'lamp') ? ' on' : ''}`}
                  onClick={() => patchFurn({ light: false })}
                >
                  None
                </button>
              </div>
            </section>
          </>
        )}

        {/* Opening controls — orientation is set by the wall it snaps to. */}
        {door && (
          <>
            <section className="sect">
              <label className="sect-label">Opening</label>
              <div className="seg full">
                <button className={`seg-btn${(door.type ?? 'swing') === 'swing' ? ' on' : ''}`} onClick={() => patchDoor({ type: 'swing' })}>
                  Swing
                </button>
                <button className={`seg-btn${door.type === 'sliding' ? ' on' : ''}`} onClick={() => patchDoor({ type: 'sliding' })}>
                  Sliding
                </button>
                <button className={`seg-btn${door.type === 'window' ? ' on' : ''}`} onClick={() => patchDoor({ type: 'window' })}>
                  Window
                </button>
              </div>
            </section>
            {(door.type ?? 'swing') === 'swing' && (
              <section className="sect">
                <label className="sect-label">Swing &amp; hinge</label>
                <div className="dim-row">
                  <button className="btn-ghost" onClick={() => patchDoor({ swing: (door.swing * -1) as 1 | -1 })}>
                    ⤡ Flip swing
                  </button>
                  <button className="btn-ghost" onClick={() => patchDoor({ hinge: ((door.hinge ?? 1) * -1) as 1 | -1 })}>
                    ⇄ Flip hinge
                  </button>
                </div>
              </section>
            )}
            <section className="sect">
              <label className="sect-label">Width ({u})</label>
              <input
                className="field"
                inputMode="decimal"
                defaultValue={fromCm(door.length, units)}
                onChange={(e) => patchDoor({ length: sizeCm(e.target.value, door.length, 40) })}
              />
            </section>
          </>
        )}

        {/* Marker style */}
        {marker && (
          <section className="sect">
            <label className="sect-label">Style</label>
            <div className="seg full">
              <button className={`seg-btn${(marker.style ?? 'frame') === 'frame' ? ' on' : ''}`} onClick={() => patchMarker({ style: 'frame' })}>
                Frame
              </button>
              <button className={`seg-btn${marker.style === 'shaded' ? ' on' : ''}`} onClick={() => patchMarker({ style: 'shaded' })}>
                Shaded
              </button>
              <button className={`seg-btn${marker.style === 'closet' ? ' on' : ''}`} onClick={() => patchMarker({ style: 'closet' })}>
                Hatch
              </button>
            </div>
          </section>
        )}

        {/* Position (read-only — drag on the plan to move) */}
        <section className="sect">
          <label className="sect-label">Position</label>
          <p className="sect-note">
            {formatLength(room?.x ?? furn?.x ?? marker?.x ?? stair?.x ?? door!.x, units)} ×{' '}
            {formatLength(room?.y ?? furn?.y ?? marker?.y ?? stair?.y ?? door!.y, units)} from top-left. Drag on the plan to move.
          </p>
        </section>

        <button className="btn-ghost danger full-btn" onClick={remove}>
          Delete {title.toLowerCase()}
        </button>
      </div>
    </aside>
  )
}
