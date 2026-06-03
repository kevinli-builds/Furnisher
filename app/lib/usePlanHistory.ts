'use client'

import { useCallback, useRef, useState } from 'react'
import type { Plan } from './types'

const LIMIT = 100 // max undo depth
const BURST_MS = 450 // changes within this window collapse into one undo step

type Updater = Plan | ((p: Plan) => Plan)

// Plan state with undo/redo. Rapid changes (a drag, a burst of typing) coalesce
// into a single history entry: the pre-burst state is pushed once when a burst
// starts, and the burst ends after BURST_MS of quiet. `replace` swaps the plan
// without recording history (used for initial load + Reset).
export function usePlanHistory(initial: Plan) {
  const [plan, setState] = useState<Plan>(initial)
  const planRef = useRef<Plan>(initial)
  const past = useRef<Plan[]>([])
  const future = useRef<Plan[]>([])
  const burst = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Bumped whenever history depth changes, so canUndo/canRedo re-render.
  const [, bump] = useState(0)

  const endBurst = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    burst.current = false
  }, [])

  const setPlan = useCallback((arg: Updater) => {
    const prev = planRef.current
    const next = typeof arg === 'function' ? (arg as (p: Plan) => Plan)(prev) : arg
    if (next === prev) return

    if (!burst.current) {
      past.current.push(prev)
      if (past.current.length > LIMIT) past.current.shift()
      future.current = []
      burst.current = true
      bump((n) => n + 1)
    }
    planRef.current = next
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      burst.current = false
      timer.current = null
    }, BURST_MS)
    setState(next)
  }, [])

  const undo = useCallback(() => {
    endBurst()
    if (!past.current.length) return
    future.current.unshift(planRef.current)
    const prev = past.current.pop() as Plan
    planRef.current = prev
    setState(prev)
    bump((n) => n + 1)
  }, [endBurst])

  const redo = useCallback(() => {
    endBurst()
    if (!future.current.length) return
    past.current.push(planRef.current)
    const next = future.current.shift() as Plan
    planRef.current = next
    setState(next)
    bump((n) => n + 1)
  }, [endBurst])

  // Set the plan without touching history (load / reset).
  const replace = useCallback(
    (p: Plan) => {
      endBurst()
      past.current = []
      future.current = []
      planRef.current = p
      setState(p)
      bump((n) => n + 1)
    },
    [endBurst],
  )

  return {
    plan,
    setPlan,
    undo,
    redo,
    replace,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
  }
}
