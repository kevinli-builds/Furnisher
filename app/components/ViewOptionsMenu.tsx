'use client'

import { useEffect, useRef, useState } from 'react'
import type { Plan } from '../lib/types'
import { safeUrl } from '../lib/url'
import { formatHour } from '../lib/sun'
import { LAYERS } from '../lib/layers/registry'

interface Props {
  plan: Plan
  setPlan: React.Dispatch<React.SetStateAction<Plan>>
  onShowTips?: () => void
}

export default function ViewOptionsMenu({ plan, setPlan, onShowTips }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const set = (patch: Partial<Plan>) => setPlan((p) => ({ ...p, ...patch }))

  const activeLayers = plan.layers ?? []
  const toggleLayer = (id: string, on: boolean) =>
    setPlan((p) => {
      const cur = (p.layers ?? []).filter((l) => l !== id)
      return { ...p, layers: on ? [...cur, id] : cur }
    })

  return (
    <div className="account" ref={ref}>
      <button className={`seg-btn solo${open ? ' on' : ''}`} onClick={() => setOpen((o) => !o)} title="Display options">
        ⚙ Display ▾
      </button>
      {open && (
        <div className="account-menu opts-menu">
          <Row label="Furniture style">
            <Seg on={plan.viewMode === 'schematic'} onClick={() => set({ viewMode: 'schematic' })}>
              Schematic
            </Seg>
            <Seg on={plan.viewMode === 'sim'} onClick={() => set({ viewMode: 'sim' })}>
              Simulator
            </Seg>
          </Row>
          <Row label="Room names">
            <Seg on={plan.roomLabels === 'always'} onClick={() => set({ roomLabels: 'always' })}>
              Always
            </Seg>
            <Seg on={plan.roomLabels === 'hover'} onClick={() => set({ roomLabels: 'hover' })}>
              On hover
            </Seg>
          </Row>
          <Row label="Furniture names">
            <Seg on={(plan.furnitureLabels ?? 'always') === 'always'} onClick={() => set({ furnitureLabels: 'always' })}>
              Always
            </Seg>
            <Seg on={plan.furnitureLabels === 'hover'} onClick={() => set({ furnitureLabels: 'hover' })}>
              On hover
            </Seg>
          </Row>
          <Row label="Units">
            <Seg on={plan.units === 'imperial'} onClick={() => set({ units: 'imperial' })}>
              ft / in
            </Seg>
            <Seg on={plan.units === 'metric'} onClick={() => set({ units: 'metric' })}>
              m / cm
            </Seg>
          </Row>
          <Row label="Grid">
            <Seg on={plan.showGrid} onClick={() => set({ showGrid: true })}>
              Show
            </Seg>
            <Seg on={!plan.showGrid} onClick={() => set({ showGrid: false })}>
              Hide
            </Seg>
          </Row>
          <Row label="Edge lengths">
            <Seg on={!!plan.edgeLengths} onClick={() => set({ edgeLengths: true })}>
              Show
            </Seg>
            <Seg on={!plan.edgeLengths} onClick={() => set({ edgeLengths: false })}>
              Hide
            </Seg>
          </Row>
          <Row label="Auto-snap (all)">
            <Seg on={!!plan.snapAll} onClick={() => set({ snapAll: true })}>
              On
            </Seg>
            <Seg on={!plan.snapAll} onClick={() => set({ snapAll: false })}>
              Off
            </Seg>
          </Row>
          <Row label="Warnings">
            <Seg on={plan.warnings !== false} onClick={() => set({ warnings: true })}>
              On
            </Seg>
            <Seg on={plan.warnings === false} onClick={() => set({ warnings: false })}>
              Off
            </Seg>
          </Row>
          <Row label="Clearance">
            <Seg on={!!plan.clearance} onClick={() => set({ clearance: true })}>
              On
            </Seg>
            <Seg on={!plan.clearance} onClick={() => set({ clearance: false })}>
              Off
            </Seg>
          </Row>
          <Row label="Lighting">
            <Seg on={!!plan.lighting} onClick={() => set({ lighting: true })}>
              On
            </Seg>
            <Seg on={!plan.lighting} onClick={() => set({ lighting: false })}>
              Off
            </Seg>
          </Row>
          {plan.lighting && (
            <>
              <div className="opts-row">
                <span className="sect-label">Time · {formatHour(plan.sunTime ?? 12)}</span>
                <input
                  type="range"
                  className="slider"
                  min={0}
                  max={24}
                  step={0.5}
                  value={plan.sunTime ?? 12}
                  onChange={(e) => set({ sunTime: Number(e.target.value) })}
                />
              </div>
              <div className="opts-row">
                <span className="sect-label">North · {Math.round(plan.northDeg ?? 0)}°</span>
                <input
                  type="range"
                  className="slider"
                  min={0}
                  max={359}
                  step={5}
                  value={plan.northDeg ?? 0}
                  onChange={(e) => set({ northDeg: Number(e.target.value) })}
                />
              </div>
              <div className="opts-row">
                <span className="sect-label">Latitude · {Math.round(plan.latitude ?? 40)}°</span>
                <input
                  type="range"
                  className="slider"
                  min={-60}
                  max={60}
                  step={1}
                  value={plan.latitude ?? 40}
                  onChange={(e) => set({ latitude: Number(e.target.value) })}
                />
                <button
                  className="btn-ghost"
                  onClick={() =>
                    navigator.geolocation?.getCurrentPosition(
                      (pos) => set({ latitude: Math.round(pos.coords.latitude) }),
                      () => {},
                    )
                  }
                >
                  📍 Use my location
                </button>
              </div>
            </>
          )}
          {LAYERS.length > 0 && (
            <>
              <div className="opts-sep" />
              <span className="sect-label opts-group-label">Insight layers</span>
              {LAYERS.map((l) => {
                const on = activeLayers.includes(l.id)
                return (
                  <div key={l.id} className="opts-row layer-row">
                    <div className="layer-row-head">
                      <span className="sect-label">
                        {l.icon ? `${l.icon} ` : ''}
                        {l.label}
                      </span>
                      <div className="seg">
                        <Seg on={on} onClick={() => toggleLayer(l.id, true)}>
                          On
                        </Seg>
                        <Seg on={!on} onClick={() => toggleLayer(l.id, false)}>
                          Off
                        </Seg>
                      </div>
                    </div>
                    <p className="layer-desc">{l.desc}</p>
                    {l.id === 'sun-hours' && on && (
                      <div className="seg full layer-subcontrol">
                        {(['summer', 'equinox', 'winter'] as const).map((s) => (
                          <Seg key={s} on={(plan.sunSeason ?? 'equinox') === s} onClick={() => set({ sunSeason: s })}>
                            {s === 'summer' ? 'Summer' : s === 'winter' ? 'Winter' : 'Equinox'}
                          </Seg>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
              <div className="opts-sep" />
            </>
          )}
          <div className="opts-row">
            <span className="sect-label">Blueprint link</span>
            <input
              className="field"
              type="url"
              placeholder="https://… (listing)"
              defaultValue={plan.blueprintUrl ?? ''}
              onChange={(e) => set({ blueprintUrl: e.target.value })}
            />
            {safeUrl(plan.blueprintUrl) && (
              <a className="open-link" href={safeUrl(plan.blueprintUrl) as string} target="_blank" rel="noreferrer noopener">
                ↗ Open blueprint
              </a>
            )}
          </div>
          {onShowTips && (
            <div className="opts-row">
              <button
                className="btn-ghost"
                onClick={() => {
                  setOpen(false)
                  onShowTips()
                }}
              >
                💡 Show tips
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="opts-row">
      <span className="sect-label">{label}</span>
      <div className="seg full">{children}</div>
    </div>
  )
}

function Seg({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button className={`seg-btn${on ? ' on' : ''}`} onClick={onClick}>
      {children}
    </button>
  )
}
