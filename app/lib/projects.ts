import { supabase } from './supabase'
import type { Plan } from './types'

export interface ProjectRow {
  id: string
  user_id: string // owner
  name: string
  data: Plan
  updated_at: string
  share_token: string | null
}

function client() {
  if (!supabase) throw new Error('Cloud saving is not configured.')
  return supabase
}

const COLS = 'id, user_id, name, data, updated_at, share_token'

export async function listProjects(): Promise<ProjectRow[]> {
  const { data, error } = await client().from('projects').select(COLS).order('updated_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as ProjectRow[]
}

export async function getProject(id: string): Promise<ProjectRow | null> {
  const { data, error } = await client().from('projects').select(COLS).eq('id', id).maybeSingle()
  if (error) throw error
  return (data as ProjectRow) ?? null
}

export async function createProject(name: string, data: Plan): Promise<ProjectRow> {
  const { data: row, error } = await client().from('projects').insert({ name, data }).select(COLS).single()
  if (error) throw error
  return row as ProjectRow
}

export async function updateProject(id: string, patch: { name?: string; data?: Plan }): Promise<void> {
  const { error } = await client()
    .from('projects')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function deleteProject(id: string): Promise<void> {
  const { error } = await client().from('projects').delete().eq('id', id)
  if (error) throw error
}

// Owner enables sharing → returns the share token (creates one if needed).
export async function enableSharing(id: string): Promise<string> {
  const token = crypto.randomUUID()
  const { error } = await client().from('projects').update({ share_token: token }).eq('id', id)
  if (error) throw error
  return token
}

export async function disableSharing(id: string): Promise<void> {
  const { error } = await client().from('projects').update({ share_token: null }).eq('id', id)
  if (error) throw error
}

// Redeem a share token (becomes a collaborator). Returns the project id.
export async function joinByToken(token: string): Promise<string | null> {
  const { data, error } = await client().rpc('join_project', { p_token: token })
  if (error) throw error
  return (data as string) ?? null
}
