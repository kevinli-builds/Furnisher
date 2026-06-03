import { supabase } from './supabase'
import type { Plan } from './types'

export interface ProjectRow {
  id: string
  name: string
  data: Plan
  updated_at: string
}

function client() {
  if (!supabase) throw new Error('Cloud saving is not configured.')
  return supabase
}

export async function listProjects(): Promise<ProjectRow[]> {
  const { data, error } = await client()
    .from('projects')
    .select('id, name, data, updated_at')
    .order('updated_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as ProjectRow[]
}

export async function createProject(name: string, data: Plan): Promise<ProjectRow> {
  const { data: row, error } = await client()
    .from('projects')
    .insert({ name, data })
    .select('id, name, data, updated_at')
    .single()
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
