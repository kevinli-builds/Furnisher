'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Plan } from '../lib/types'
import { defaultPlan } from '../lib/storage'
import { supabaseEnabled } from '../lib/supabase'
import { useAuth, signInWithGoogle, signOut } from '../lib/auth'
import { listProjects, createProject, updateProject, deleteProject, type ProjectRow } from '../lib/projects'

interface Props {
  plan: Plan
  onLoadPlan: (p: Plan) => void
}

export default function AccountMenu({ plan, onLoadPlan }: Props) {
  const { user, ready } = useAuth()
  const [open, setOpen] = useState(false)
  const [projects, setProjects] = useState<ProjectRow[]>([])
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [currentName, setCurrentName] = useState<string>('Untitled plan')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const wrapRef = useRef<HTMLDivElement>(null)

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
    setTimeout(() => setStatus(''), 2000)
  }

  if (!supabaseEnabled || !ready) return null

  if (!user) {
    return (
      <button className="seg-btn solo google-btn" onClick={signInWithGoogle} title="Sign in to save projects to the cloud">
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
        setCurrentId(row.id)
        setCurrentName(row.name)
      }
      await refresh()
      flash('Saved ✓')
    } catch (e) {
      flash('Save failed')
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
      setCurrentId(row.id)
      setCurrentName(row.name)
      await refresh()
      flash('Saved ✓')
    } catch {
      flash('Save failed')
    } finally {
      setBusy(false)
    }
  }

  function openProject(row: ProjectRow) {
    onLoadPlan(row.data)
    setCurrentId(row.id)
    setCurrentName(row.name)
    setOpen(false)
    flash(`Opened “${row.name}”`)
  }

  function newPlan() {
    onLoadPlan(defaultPlan())
    setCurrentId(null)
    setCurrentName('Untitled plan')
    setOpen(false)
  }

  async function rename(row: ProjectRow) {
    const name = (window.prompt('Rename plan:', row.name) || '').trim()
    if (!name || name === row.name) return
    await updateProject(row.id, { name })
    if (currentId === row.id) setCurrentName(name)
    await refresh()
  }

  async function remove(row: ProjectRow) {
    if (!window.confirm(`Delete “${row.name}”? This can't be undone.`)) return
    await deleteProject(row.id)
    if (currentId === row.id) {
      setCurrentId(null)
      setCurrentName('Untitled plan')
    }
    await refresh()
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
            {projects.map((p) => (
              <div key={p.id} className={`proj${currentId === p.id ? ' on' : ''}`}>
                <button className="proj-open" onClick={() => openProject(p)} title="Open">
                  <span className="proj-name">{p.name}</span>
                  <span className="proj-date">{new Date(p.updated_at).toLocaleDateString()}</span>
                </button>
                <button className="proj-act" onClick={() => rename(p)} title="Rename">
                  ✎
                </button>
                <button className="proj-act danger" onClick={() => remove(p)} title="Delete">
                  ✕
                </button>
              </div>
            ))}
          </div>
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
