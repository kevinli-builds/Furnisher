'use client'

import { useState } from 'react'
import type { Plan, Tracker, TrackerColumn, TrackerColumnType } from '../lib/types'
import { TRACKER_TEMPLATES, trackerFromTemplate, newTracker, newColumn, newEntry } from '../lib/tracker'

const COL_TYPE_LABEL: Record<TrackerColumnType, string> = { text: 'Text', date: 'Date', number: 'Number' }
const CYCLE: TrackerColumnType[] = ['text', 'date', 'number']

export default function TrackerView({ plan, setPlan }: { plan: Plan; setPlan: (u: (p: Plan) => Plan) => void }) {
  const trackers = plan.trackers
  const [selId, setSelId] = useState<string | null>(trackers[0]?.id ?? null)
  const [picking, setPicking] = useState(false) // template chooser open

  // Selected tracker, tolerant of deletion / stale id.
  const selected = trackers.find((t) => t.id === selId) ?? trackers[0] ?? null

  // ── Mutators ─────────────────────────────────────────────────
  const patch = (id: string, fn: (t: Tracker) => Tracker) =>
    setPlan((p) => ({ ...p, trackers: p.trackers.map((t) => (t.id === id ? fn(t) : t)) }))

  function addTracker(t: Tracker) {
    setPlan((p) => ({ ...p, trackers: [...p.trackers, t] }))
    setSelId(t.id)
    setPicking(false)
  }

  function deleteTracker(id: string) {
    if (!confirm('Delete this tracker and all its entries?')) return
    setPlan((p) => ({ ...p, trackers: p.trackers.filter((t) => t.id !== id) }))
    setSelId((cur) => (cur === id ? null : cur))
  }

  // ── Empty state / template chooser ───────────────────────────
  if (trackers.length === 0 || picking) {
    return (
      <div className="tracker">
        {trackers.length > 0 && (
          <div className="tracker-rail">
            <RailList trackers={trackers} selId={selected?.id ?? null} onSelect={(id) => { setSelId(id); setPicking(false) }} onNew={() => setPicking(true)} />
          </div>
        )}
        <div className="tracker-main tracker-empty">
          <h2>{trackers.length === 0 ? 'Track what you’ve been up to' : 'New tracker'}</h2>
          <p className="tracker-sub">Pick a template to start — you can edit its columns anytime.</p>
          <div className="tracker-templates">
            {TRACKER_TEMPLATES.map((t) => (
              <button key={t.name} className="tracker-tpl" onClick={() => addTracker(trackerFromTemplate(t))}>
                <span className="tracker-tpl-ico">{t.icon}</span>
                <span className="tracker-tpl-name">{t.name}</span>
                <span className="tracker-tpl-cols">{t.columns.map(([n]) => n).join(' · ')}</span>
              </button>
            ))}
            <button className="tracker-tpl tracker-tpl-blank" onClick={() => addTracker(newTracker('Untitled', '📋', [newColumn('Name', 'text')]))}>
              <span className="tracker-tpl-ico">＋</span>
              <span className="tracker-tpl-name">Blank</span>
              <span className="tracker-tpl-cols">Start from scratch</span>
            </button>
          </div>
          {trackers.length > 0 && (
            <button className="seg-btn solo" onClick={() => setPicking(false)} style={{ marginTop: 18 }}>
              Cancel
            </button>
          )}
        </div>
      </div>
    )
  }

  const cur = selected as Tracker

  return (
    <div className="tracker">
      <div className="tracker-rail">
        <RailList trackers={trackers} selId={cur.id} onSelect={setSelId} onNew={() => setPicking(true)} />
      </div>

      <div className="tracker-main">
        <div className="tracker-head">
          <input
            className="tracker-title"
            value={cur.icon ? `${cur.icon} ${cur.name}` : cur.name}
            onChange={(e) => {
              // Split a leading emoji token from the rest as name.
              const v = e.target.value
              const m = v.match(/^(\S+)\s+(.*)$/)
              if (m && /\p{Extended_Pictographic}/u.test(m[1])) patch(cur.id, (t) => ({ ...t, icon: m[1], name: m[2] }))
              else patch(cur.id, (t) => ({ ...t, icon: undefined, name: v }))
            }}
            aria-label="Tracker name"
          />
          <span className="tracker-count">{cur.entries.length} {cur.entries.length === 1 ? 'entry' : 'entries'}</span>
          <button className="seg-btn solo tracker-del" onClick={() => deleteTracker(cur.id)} title="Delete tracker">
            🗑 Delete
          </button>
        </div>

        <div className="tracker-table-wrap">
          <table className="tracker-table">
            <thead>
              <tr>
                {cur.columns.map((c) => (
                  <ColHeader
                    key={c.id}
                    col={c}
                    onRename={(name) => patch(cur.id, (t) => ({ ...t, columns: t.columns.map((x) => (x.id === c.id ? { ...x, name } : x)) }))}
                    onType={(type) => patch(cur.id, (t) => ({ ...t, columns: t.columns.map((x) => (x.id === c.id ? { ...x, type } : x)) }))}
                    onDelete={
                      cur.columns.length > 1
                        ? () =>
                            patch(cur.id, (t) => ({
                              ...t,
                              columns: t.columns.filter((x) => x.id !== c.id),
                              entries: t.entries.map((e) => {
                                const { [c.id]: _drop, ...rest } = e.values
                                return { ...e, values: rest }
                              }),
                            }))
                        : null
                    }
                  />
                ))}
                <th className="tracker-addcol">
                  <button
                    onClick={() =>
                      patch(cur.id, (t) => {
                        const col = newColumn('New column', 'text')
                        return {
                          ...t,
                          columns: [...t.columns, col],
                          entries: t.entries.map((e) => ({ ...e, values: { ...e.values, [col.id]: '' } })),
                        }
                      })
                    }
                    title="Add a column"
                  >
                    ＋
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {cur.entries.map((entry) => (
                <tr key={entry.id}>
                  {cur.columns.map((c) => (
                    <td key={c.id}>
                      <input
                        className="tracker-cell"
                        type={c.type === 'date' ? 'date' : c.type === 'number' ? 'number' : 'text'}
                        value={entry.values[c.id] ?? ''}
                        onChange={(e) =>
                          patch(cur.id, (t) => ({
                            ...t,
                            entries: t.entries.map((x) => (x.id === entry.id ? { ...x, values: { ...x.values, [c.id]: e.target.value } } : x)),
                          }))
                        }
                      />
                    </td>
                  ))}
                  <td className="tracker-rowdel">
                    <button onClick={() => patch(cur.id, (t) => ({ ...t, entries: t.entries.filter((x) => x.id !== entry.id) }))} title="Delete row">
                      🗑
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <button className="tracker-addrow" onClick={() => patch(cur.id, (t) => ({ ...t, entries: [...t.entries, newEntry(t.columns)] }))}>
            ＋ Add entry
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Rail: the list of trackers ─────────────────────────────────
function RailList({ trackers, selId, onSelect, onNew }: { trackers: Tracker[]; selId: string | null; onSelect: (id: string) => void; onNew: () => void }) {
  return (
    <>
      <div className="tracker-rail-head">Trackers</div>
      <div className="tracker-rail-list">
        {trackers.map((t) => (
          <button key={t.id} className={`tracker-rail-item${t.id === selId ? ' on' : ''}`} onClick={() => onSelect(t.id)}>
            <span className="tracker-rail-ico">{t.icon ?? '📋'}</span>
            <span className="tracker-rail-name">{t.name || 'Untitled'}</span>
            <span className="tracker-rail-count">{t.entries.length}</span>
          </button>
        ))}
      </div>
      <button className="btn tracker-new" onClick={onNew}>
        ＋ New tracker
      </button>
    </>
  )
}

// ── Column header with an inline menu ──────────────────────────
function ColHeader({ col, onRename, onType, onDelete }: { col: TrackerColumn; onRename: (n: string) => void; onType: (t: TrackerColumnType) => void; onDelete: (() => void) | null }) {
  const [menu, setMenu] = useState(false)
  return (
    <th>
      <div className="tracker-colhead">
        <input className="tracker-colname" value={col.name} onChange={(e) => onRename(e.target.value)} aria-label="Column name" />
        <button className="tracker-colmenu-btn" onClick={() => setMenu((m) => !m)} title="Column options">
          ⋯
        </button>
        {menu && (
          <>
            <div className="tracker-menu-backdrop" onClick={() => setMenu(false)} />
            <div className="tracker-colmenu">
              <div className="tracker-colmenu-label">Type</div>
              {CYCLE.map((ty) => (
                <button key={ty} className={ty === col.type ? 'on' : ''} onClick={() => { onType(ty); setMenu(false) }}>
                  {COL_TYPE_LABEL[ty]}
                </button>
              ))}
              {onDelete && (
                <button className="tracker-colmenu-del" onClick={() => { onDelete(); setMenu(false) }}>
                  Delete column
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </th>
  )
}
