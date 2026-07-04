'use client'

import type { Plan } from '../lib/types'
import { TEMPLATES, type Template } from '../lib/templates'
import { roomColor } from '../lib/roomTypes'
import { normalizePlan } from '../lib/storage'

interface Props {
  onPick: (plan: Plan) => void // open a copy of a template
  onBlank: () => void
  onImport: () => void // launch the AI blueprint importer
  onClose: () => void
  dismissable?: boolean // first run has no plan to fall back to → not dismissable
}

// A tiny top-down preview of a template plan: room tints + furniture footprints,
// auto-framed to the plan's content. Pure SVG, no interaction.
function Thumb({ plan }: { plan: Plan }) {
  const xs: number[] = []
  const ys: number[] = []
  const push = (x: number, y: number, w: number, h: number) => {
    xs.push(x, x + w), ys.push(y, y + h)
  }
  plan.rooms.forEach((r) => push(r.x, r.y, r.w, r.h))
  plan.furniture.forEach((f) => push(f.x, f.y, f.w, f.h))
  const pad = 30
  const minX = (xs.length ? Math.min(...xs) : 0) - pad
  const minY = (ys.length ? Math.min(...ys) : 0) - pad
  const w = (xs.length ? Math.max(...xs) : 100) - minX + pad
  const h = (ys.length ? Math.max(...ys) : 100) - minY + pad
  return (
    <svg className="thumb" viewBox={`${minX} ${minY} ${w} ${h}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      {plan.rooms.map((r) => {
        const c = roomColor(r)
        return (
          <rect key={r.id} x={r.x} y={r.y} width={r.w} height={r.h} fill={c ?? '#e9e0cc'} fillOpacity={c ? 0.35 : 0.5} stroke="#8a7a5c" strokeWidth={4} />
        )
      })}
      {plan.furniture.map((f) => (
        <rect
          key={f.id}
          x={f.x}
          y={f.y}
          width={f.w}
          height={f.h}
          rx={f.shape === 'round' ? Math.min(f.w, f.h) / 2 : 6}
          fill={f.color}
          stroke="#5c4d38"
          strokeWidth={2}
          transform={f.rotation ? `rotate(${f.rotation} ${f.x + f.w / 2} ${f.y + f.h / 2})` : undefined}
        />
      ))}
    </svg>
  )
}

export default function WelcomeModal({ onPick, onBlank, onImport, onClose, dismissable = true }: Props) {
  // Open a deep copy through the same normalize path as any loaded plan, so the
  // frozen template object is never touched and colours are re-sanitized.
  function open(t: Template) {
    onPick(normalizePlan(JSON.parse(JSON.stringify(t.plan))))
  }

  return (
    <div className="modal-backdrop" onMouseDown={dismissable ? onClose : undefined}>
      <div className="modal welcome" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2>Start your plan</h2>
            <p className="sect-note">Open an example to explore, or start from scratch. You can change everything.</p>
          </div>
          {dismissable && (
            <button className="settings-x" onClick={onClose} aria-label="Close">
              ✕
            </button>
          )}
        </div>

        <div className="modal-body">
          <div className="tpl-grid">
            {TEMPLATES.map((t) => (
              <button key={t.id} className="tpl-card" onClick={() => open(t)}>
                <Thumb plan={t.plan} />
                <div className="tpl-meta">
                  <strong>{t.name}</strong>
                  <span>{t.blurb}</span>
                </div>
              </button>
            ))}
          </div>

          <div className="welcome-actions">
            <button className="btn-ghost" onClick={onBlank}>
              ▭ Blank canvas
            </button>
            <button className="btn-ghost" onClick={onImport}>
              ⌖ Import a blueprint with AI
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
