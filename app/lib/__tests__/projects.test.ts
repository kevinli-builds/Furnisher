import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the Supabase singleton so projects.ts sees a fake client (env is unset in
// tests, so the real singleton would be null). vi.hoisted lets the spies exist
// when the hoisted vi.mock factory runs.
const { rpc, from } = vi.hoisted(() => ({
  rpc: vi.fn(async () => ({ data: null, error: null })),
  from: vi.fn(() => ({ update: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })) })),
}))

vi.mock('../supabase', () => ({
  supabase: { rpc, from },
  supabaseEnabled: true,
}))

import { disableSharing } from '../projects'

beforeEach(() => {
  rpc.mockClear()
  from.mockClear()
})

describe('disableSharing (F1: revoke cuts off existing collaborators)', () => {
  it('calls the atomic revoke_sharing RPC, not a bare token-null update', async () => {
    await disableSharing('proj-123')
    // Must go through the RPC that also purges project_members — a plain
    // `from('projects').update({share_token:null})` would leave joined members.
    expect(rpc).toHaveBeenCalledWith('revoke_sharing', { p_project_id: 'proj-123' })
    expect(from).not.toHaveBeenCalled()
  })

  it('propagates a Supabase error', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'nope' } } as never)
    await expect(disableSharing('proj-123')).rejects.toBeTruthy()
  })
})
