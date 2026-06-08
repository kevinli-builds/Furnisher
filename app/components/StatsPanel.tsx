'use client'

import type { Plan } from '../lib/types'
import { computeStats, formatArea, formatPrice } from '../lib/stats'

interface Props {
  plan: Plan
  onClose: () => void
}

// Floating read-out of room areas, furniture footprint, and free floor space.
export default function StatsPanel({ plan, onClose }: Props) {
  const s = computeStats(plan)
  const u = plan.units
  return (
    <div className="stats-panel">
      <div className="stats-head">
        <span className="stats-title">Plan stats</span>
        <button className="settings-x" onClick={onClose} aria-label="Close stats">
          ✕
        </button>
      </div>
      <div className="stats-body">
        <div className="stats-row stats-total">
          <span>Total floor</span>
          <strong>{formatArea(s.totalArea, u)}</strong>
        </div>
        <div className="stats-row">
          <span>Furniture footprint</span>
          <strong>{formatArea(s.furnArea, u)}</strong>
        </div>
        <div className="stats-row">
          <span>Free floor</span>
          <strong>{s.freePct}%</strong>
        </div>
        {s.totalCost > 0 && (
          <div className="stats-row stats-total">
            <span>Total cost</span>
            <strong>{formatPrice(s.totalCost)}</strong>
          </div>
        )}
        {s.rooms.length > 0 && <div className="stats-divider" />}
        {s.rooms.map((r) => (
          <div key={r.id} className="stats-room">
            <span className="stats-room-name">{r.name}</span>
            <span className="stats-room-meta">
              {formatArea(r.area, u)} · {r.freePct}% free{r.cost > 0 ? ` · ${formatPrice(r.cost)}` : ''}
            </span>
          </div>
        ))}
        {s.rooms.length === 0 && <p className="sect-note">Draw a room to see its area.</p>}
      </div>
    </div>
  )
}
