'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Plan } from '../lib/types'
import { defaultPlan, normalizePlan } from '../lib/storage'
import { supabaseEnabled } from '../lib/supabase'
import { useAuth, signInWithGoogle, signOut } from '../lib/auth'
import {
  listProjects,
  createProject,
  updateProject,
  deleteProject,
  enableSharing,
  joinByToken,
  getProject,
  type ProjectRow,
} from '../lib/projects'

interface Props {
  plan: Plan
  onLoadPlan: (p: Plan) => void
  onProjectChange?: (id: string | null) => void
}

const PENDING_JOIN = 'furnisher.pendingJoin'
const CURRENT_KEY = 'furnisher.currentProject'

export default function AccountMenu({ plan, onLoadPlan, onProjectChange }: Props) {
  const { user, ready } = useAuth()
  const [open, setOpen] = useState(false)
  const [projects, setProjects] = useState<ProjectRow[]>([])
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [currentName, setCurrentName] = useState<string>('Untitled plan')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const wrapRef = useRef<HTMLDivElement>(null)

  // Latest plan, for use inside async callbacks/timeouts without stale closures.
  const planRef = useRef(plan)
  planRef.current = plan
  // Skip the autosave that an applied remote update would otherwise trigger.
  const skipNextSave = useRef(false)

  const refresh = useCallback(async () => {
    try {
      setProjects(await listProjects())
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    if (user) refresh()
    else {
      setProjects([])
      setCurrentId(null)
    }
  }, [user, refresh])

  // Stash a ?join token immediately so it survives the OAuth redirect.
  useEffect(() => {
    const t = new URL(window.location.href).searchParams.get('join')
    if (t) localStorage.setItem(PENDING_JOIN, t)
  }, [])

  // Once signed in, redeem any pending share token and open that plan.
  useEffect(() => {
    if (!user) return
    const url = new URL(window.location.href)
    const token = url.searchParams.get('join') || localStorage.getItem(PENDING_JOIN)
    ;(async () => {
      try {
        if (token) {
          // Redeem a share link → join + open that plan.
          localStorage.removeItem(PENDING_JOIN)
          if (url.searchParams.has('join')) {
            url.searchParams.delete('join')
            window.history.replaceState({}, '', url.toString())
          }
          const pid = await joinByToken(token)
          if (!pid) return flash('Share link is invalid')
          const row = await getProject(pid)
          if (row) {
            skipNextSave.current = true
            onLoadPlan(normalizePlan(row.data))
            rememberCurrent(row.id, row.name)
            flash('Joined shared plan')
          }
          return
        }
        // No join token → reopen the last project (latest cloud copy).
        const saved = localStorage.getItem(CURRENT_KEY)
        if (saved) {
          const { id } = JSON.parse(saved) as { id: string }
          const row = await getProject(id)
          if (row) {
            skipNextSave.current = true
            onLoadPlan(normalizePlan(row.data))
            rememberCurrent(row.id, row.name)
          } else {
            localStorage.removeItem(CURRENT_KEY) // gone / no access
          }
        }
      } catch {
        flash('Could not open your saved plan')
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  // Autosave the open cloud project (debounced) so collaborators stay in sync.
  // Errors are surfaced (not swallowed) so a misconfigured backend is visible.
  useEffect(() => {
    if (!user || !currentId) return
    if (skipNextSave.current) {
      skipNextSave.current = false
      return
    }
    const t = setTimeout(() => {
      updateProject(currentId, { data: planRef.current }).then(
        () => flash('Saved ✓'),
        (err) => flash(`Cloud save failed: ${err?.message ?? 'check setup'}`),
      )
    }, 1200)
    return () => clearTimeout(t)
  }, [plan, currentId, user])

  // (Live collaborator sync is handled by useCollab via op broadcast; the DB row
  // is just durability + initial load.)

  // Close on outside click.
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  function flash(msg: string) {
    setStatus(msg)
    setTimeout(() => setStatus(''), 2500)
  }

  // Set + persist the open project so it survives reloads / new devices.
  function rememberCurrent(id: string | null, name: string) {
    setCurrentId(id)
    setCurrentName(name)
    onProjectChange?.(id) // drives the live-collaboration channel
    try {
      if (id) localStorage.setItem(CURRENT_KEY, JSON.stringify({ id, name }))
      else localStorage.removeItem(CURRENT_KEY)
    } catch {
      /* ignore */
    }
  }

  if (!supabaseEnabled || !ready) return null

  if (!user) {
    return (
      <button className="seg-btn solo google-btn" onClick={signInWithGoogle} title="Sign in to save & share projects">
        <GoogleG /> Sign in
      </button>
    )
  }

  async function save() {
    setBusy(true)
    try {
      if (currentId) {
        await updateProject(currentId, { data: plan, name: currentName })
      } else {
        const name = (window.prompt('Name this plan:', currentName) || '').trim()
        if (!name) {
          setBusy(false)
          return
        }
        const row = await createProject(name, plan)
        rememberCurrent(row.id, row.name)
      }
      await refresh()
      flash('Saved ✓')
    } catch (e) {
      flash(`Save failed: ${(e as Error)?.message ?? 'check setup'}`)
    } finally {
      setBusy(false)
    }
  }

  async function saveAsNew() {
    const name = (window.prompt('Name for the new plan:', `${currentName} copy`) || '').trim()
    if (!name) return
    setBusy(true)
    try {
      const row = await createProject(name, plan)
      rememberCurrent(row.id, row.name)
      await refresh()
      flash('Saved ✓')
    } catch (e) {
      flash(`Save failed: ${(e as Error)?.message ?? 'check setup'}`)
    } finally {
      setBusy(false)
    }
  }

  function openProject(row: ProjectRow) {
    skipNextSave.current = true
    onLoadPlan(normalizePlan(row.data))
    rememberCurrent(row.id, row.name)
    setOpen(false)
    flash(`Opened “${row.name}”`)
  }

  function newPlan() {
    onLoadPlan(defaultPlan())
    rememberCurrent(null, 'Untitled plan')
    setOpen(false)
  }

  async function rename(row: ProjectRow) {
    const name = (window.prompt('Rename plan:', row.name) || '').trim()
    if (!name || name === row.name) return
    await updateProject(row.id, { name })
    if (currentId === row.id) rememberCurrent(row.id, name)
    await refresh()
  }

  async function remove(row: ProjectRow) {
    if (!window.confirm(`Delete “${row.name}”? This can't be undone.`)) return
    await deleteProject(row.id)
    if (currentId === row.id) rememberCurrent(null, 'Untitled plan')
    await refresh()
  }

  async function share(row: ProjectRow) {
    try {
      const token = row.share_token ?? (await enableSharing(row.id))
      const link = `${window.location.origin}/?join=${token}`
      await navigator.clipboard.writeText(link)
      await refresh()
      flash('Share link copied ✓')
    } catch {
      flash('Could not create link')
    }
  }

  return (
    <div className="account" ref={wrapRef}>
      <button className="seg-btn solo" onClick={() => setOpen((o) => !o)}>
        ☁ {currentId ? currentName : 'My plans'} ▾
      </button>
      {status && <span className="account-status">{status}</span>}

      {open && (
        <div className="account-menu">
          <div className="account-head">
            <span className="account-email">{user.email}</span>
            <button className="link-x" onClick={signOut}>
              Sign out
            </button>
          </div>

          <div className="account-actions">
            <button className="btn" onClick={save} disabled={busy}>
              {currentId ? 'Save' : 'Save plan…'}
            </button>
            <button className="btn-ghost" onClick={saveAsNew} disabled={busy}>
              Save as new
            </button>
            <button className="btn-ghost" onClick={newPlan}>
              New plan
            </button>
          </div>

          <div className="account-list">
            {projects.length === 0 && <p className="empty sm">No saved plans yet.</p>}
            {projects.map((p) => {
              const owner = p.user_id === user.id
              return (
                <div key={p.id} className={`proj${currentId === p.id ? ' on' : ''}`}>
                  <button className="proj-open" onClick={() => openProject(p)} title="Open">
                    <span className="proj-name">
                      {p.name}
                      {!owner && <span className="proj-tag">shared</span>}
                      {owner && p.share_token && <span className="proj-tag">shared by you</span>}
                    </span>
                    <span className="proj-date">{new Date(p.updated_at).toLocaleDateString()}</span>
                  </button>
                  {owner && (
                    <button className="proj-act" onClick={() => share(p)} title="Copy share link">
                      🔗
                    </button>
                  )}
                  {owner && (
                    <button className="proj-act" onClick={() => rename(p)} title="Rename">
                      ✎
                    </button>
                  )}
                  {owner && (
                    <button className="proj-act danger" onClick={() => remove(p)} title="Delete">
                      ✕
                    </button>
                  )}
                </div>
              )
            })}
          </div>
          <p className="inv-hint">Open a plan to auto-save &amp; sync. Share a plan to collaborate (last edit wins).</p>
        </div>
      )}
    </div>
  )
}

function GoogleG() {
  return (
    <svg width="14" height="14" viewBox="0 0 48 48" aria-hidden="true" style={{ verticalAlign: '-2px' }}>
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.6 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.3 13.2 17.6 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.6c0-1.6-.1-3.1-.4-4.6H24v9.1h12.4c-.5 2.9-2.1 5.3-4.6 7l7.1 5.5c4.2-3.9 6.6-9.6 6.6-16z" />
      <path fill="#FBBC05" d="M10.4 28.7c-.5-1.4-.7-2.9-.7-4.7s.3-3.3.7-4.7l-7.8-6.1C1 16.3 0 20 0 24s1 7.7 2.6 10.8l7.8-6.1z" />
      <path fill="#34A853" d="M24 48c6.2 0 11.5-2 15.3-5.5l-7.1-5.5c-2 1.3-4.6 2.1-8.2 2.1-6.4 0-11.7-3.7-13.6-9.8l-7.8 6.1C6.5 42.6 14.6 48 24 48z" />
    </svg>
  )
}
