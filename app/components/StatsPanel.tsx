'use client'

import { useState } from 'react'
import type { Plan } from '../lib/types'
import { computeStats, formatArea, formatPrice, fitFacts } from '../lib/stats'
import { moveInCheck } from '../lib/warnings'
import { buildShareUrl, buildMovedayUrl, MOVEDAY_LISTING_KEY } from '../lib/share'
import { formatLength } from '../lib/units'

interface Props {
  plan: Plan
  setPlan: React.Dispatch<React.SetStateAction<Plan>>
  onClose: () => void
  onSelectPiece?: (id: string) => void // click a move-in issue → select that piece on the canvas
}

// Floating read-out of room areas, furniture footprint, and free floor space.
export default function StatsPanel({ plan, setPlan, onClose, onSelectPiece }: Props) {
  const s = computeStats(plan)
  const u = plan.units
  const budget = plan.budget
  const remaining = budget != null ? budget - s.totalCost : 0
  const over = budget != null && remaining < 0
  const facts = fitFacts(plan)
  const [showMoveIn, setShowMoveIn] = useState(false)
  const hasDoorway = plan.doors.some((d) => (d.type ?? 'swing') !== 'window')
  const issues = showMoveIn ? moveInCheck(plan) : []
  return (
    <div className="stats-panel">
      <div className="stats-head">
        <span className="stats-title">Plan stats</span>
        <button
          className="settings-x"
          aria-label="Copy share link"
          title="Copy a link that opens this plan for anyone (or in MoveDay's fit-check flow)"
          onClick={() => {
            const url = buildShareUrl(window.location.origin, plan, plan.rooms[0]?.name ? `${plan.rooms[0].name} plan` : 'Shared plan')
            if (!url) return void alert('This plan is too large for a link — use PNG/PDF export instead.')
            navigator.clipboard?.writeText(url).then(
              () => alert('Share link copied — anyone who opens it gets a copy of this plan.'),
              () => window.prompt('Copy the share link:', url),
            )
          }}
        >
          🔗
        </button>
        <button
          className="settings-x"
          aria-label="Send to MoveDay"
          title="Send this arranged plan back to MoveDay to attach to a listing"
          onClick={() => {
            let listingId: string | undefined
            try {
              listingId = localStorage.getItem(MOVEDAY_LISTING_KEY) || undefined
            } catch {}
            const name = plan.rooms[0]?.name ? `${plan.rooms[0].name} plan` : 'Furnished plan'
            const url = buildMovedayUrl(plan, name, listingId)
            if (!url) return void alert('This plan is too large for a link — use PNG/PDF export instead.')
            window.open(url, '_blank', 'noopener')
          }}
        >
          📦
        </button>
        <button className="settings-x" onClick={onClose} aria-label="Close stats">
          ✕
        </button>
      </div>
      <div className="stats-body">
        {facts.length > 0 && (
          <div className="fit-facts">
            {facts.map((f) => (
              <span key={f} className="fit-chip">
                {f}
              </span>
            ))}
          </div>
        )}
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
        <div className="stats-row">
          <span>Budget</span>
          <input
            className="stats-budget"
            inputMode="decimal"
            placeholder="set target"
            defaultValue={budget ?? ''}
            onChange={(e) => {
              const v = parseFloat(e.target.value)
              setPlan((p) => ({ ...p, budget: Number.isFinite(v) && v > 0 ? v : undefined }))
            }}
          />
        </div>
        {budget != null && (
          <div className={`stats-row stats-total${over ? ' stats-over' : ''}`}>
            <span>{over ? 'Over budget' : 'Remaining'}</span>
            <strong>{formatPrice(Math.abs(remaining))}</strong>
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

        <div className="stats-divider" />
        <button
          className={`movein-btn${showMoveIn ? ' on' : ''}`}
          onClick={() => setShowMoveIn((v) => !v)}
          title="Will each piece actually fit through the doorways on the way in?"
        >
          🚪 Move-in check
        </button>
        {showMoveIn && (
          <div className="movein-results">
            {!hasDoorway ? (
              <p className="sect-note">Add a door so pieces have a way in, then re-run the check.</p>
            ) : issues.length === 0 ? (
              <p className="sect-note movein-ok">✓ Every piece can reach its spot through the doorways.</p>
            ) : (
              issues.map((it) => (
                <button
                  key={it.id}
                  className={`movein-issue${it.verdict === 'tight' ? ' tight' : ' wont'}`}
                  onClick={() => onSelectPiece?.(it.id)}
                >
                  <span className="movein-verdict">
                    {it.verdict === 'wont' ? "Won't fit" : it.verdict === 'turn' ? "Won't make the turn" : 'Might be tight'}
                  </span>
                  <span className="movein-detail">
                    {it.verdict === 'turn'
                      ? `${it.name} (${formatLength(it.length ?? it.cross, u)}) clears the doors but can't turn through ${it.roomName ?? 'the route'} carried flat` +
                        (it.maxLength && it.maxLength >= it.cross
                          ? ` — about ${formatLength(it.maxLength, u)} is the longest that can. Standing it on end may still work.`
                          : `. Standing it on end may still work.`)
                      : `${it.name} (${formatLength(it.cross, u)}) ${it.verdict === 'wont' ? 'is wider than' : 'barely clears'} the ${formatLength(it.doorway, u)} doorway on the way in.`}
                  </span>
                </button>
              ))
            )}
            <p className="sect-note movein-note">Checks each piece’s narrowest side against the doorways on its route, plus whether long pieces can rotate through right-angle bends (rooms are treated as their bounding box; standing pieces on end isn’t modelled). Treat “tight” as “measure twice.”</p>
          </div>
        )}
      </div>
    </div>
  )
}
