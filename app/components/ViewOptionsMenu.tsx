'use client'

import { useEffect, useRef, useState } from 'react'
import type { Plan } from '../lib/types'

interface Props {
  plan: Plan
  setPlan: React.Dispatch<React.SetStateAction<Plan>>
}

export default function ViewOptionsMenu({ plan, setPlan }: Props) {
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
