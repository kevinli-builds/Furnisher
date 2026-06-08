'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Plan } from './types'
import { clamp, MIN_SCALE, MAX_SCALE } from './geometry'

interface View {
  x: number
  y: number
  scale: number // pixels per cm (0 = not yet initialised)
}

// Owns the canvas viewport: container sizing, pan/zoom state, fit-to-content,
// and pointer→cm conversion. Returns everything the Canvas needs to render and
// interact, so the component itself stays focused on drawing + editing.
export function useViewport(plan: Plan) {
  const hostRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [size, setSize] = useState({ cw: 0, ch: 0 })
  const [view, setViewState] = useState<View>({ x: 0, y: 0, scale: 0 })
  const viewRef = useRef(view)
  const setView = (v: View) => {
    viewRef.current = v
    setViewState(v)
  }

  // Container size.
  useLayoutEffect(() => {
    const el = hostRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ cw: el.clientWidth, ch: el.clientHeight }))
    ro.observe(el)
    setSize({ cw: el.clientWidth, ch: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  function contentBounds() {
    const xs: number[] = []
    const ys: number[] = []
    const xe: number[] = []
    const ye: number[] = []
    for (const r of plan.rooms) xs.push(r.x), ys.push(r.y), xe.push(r.x + r.w), ye.push(r.y + r.h)
    for (const f of plan.furniture) xs.push(f.x), ys.push(f.y), xe.push(f.x + f.w), ye.push(f.y + f.h)
    for (const m of plan.markers) xs.push(m.x), ys.push(m.y), xe.push(m.x + m.w), ye.push(m.y + m.h)
    for (const s of plan.stairs) xs.push(s.x), ys.push(s.y), xe.push(s.x + s.w), ye.push(s.y + s.h)
    if (!xs.length) return { x: 0, y: 0, w: plan.width, h: plan.height }
    const x = Math.min(...xs)
    const y = Math.min(...ys)
    return { x, y, w: Math.max(...xe) - x, h: Math.max(...ye) - y }
  }

  function fitView() {
    const { cw, ch } = size
    if (cw === 0 || ch === 0) return
    const b = contentBounds()
    const pad = 1.15
    const sc = clamp(Math.min(cw / (b.w * pad), ch / (b.h * pad)), MIN_SCALE, MAX_SCALE)
    setView({ x: b.x + b.w / 2 - cw / sc / 2, y: b.y + b.h / 2 - ch / sc / 2, scale: sc })
  }

  // Initialise the view once we know the container size.
  useEffect(() => {
    if (size.cw > 0 && viewRef.current.scale === 0) fitView()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size])

  const scale = view.scale || (size.cw ? size.cw / Math.max(plan.width, 1) : 1)
  const vw = size.cw ? size.cw / scale : plan.width
  const vh = size.ch ? size.ch / scale : plan.height
  const left = view.scale ? view.x : 0
  const top = view.scale ? view.y : 0

  function toCm(e: { clientX: number; clientY: number }): { x: number; y: number } {
    const svg = svgRef.current
    const ctm = svg?.getScreenCTM()
    if (!svg || !ctm) return { x: 0, y: 0 }
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse())
    return { x: p.x, y: p.y }
  }

  function capture(e: { pointerId: number }) {
    svgRef.current?.setPointerCapture(e.pointerId)
  }

  function zoomAt(clientX: number, clientY: number, factor: number) {
    const cur = viewRef.current
    const s0 = cur.scale || scale
    const s2 = clamp(s0 * factor, MIN_SCALE, MAX_SCALE)
    if (s2 === s0) return
    const pc = toCm({ clientX, clientY })
    const offX = (pc.x - cur.x) * s0
    const offY = (pc.y - cur.y) * s0
    setView({ x: pc.x - offX / s2, y: pc.y - offY / s2, scale: s2 })
  }

  function zoomCentre(factor: number) {
    const cur = viewRef.current
    const s0 = cur.scale || scale
    const s2 = clamp(s0 * factor, MIN_SCALE, MAX_SCALE)
    if (s2 === s0) return
    const cxcm = cur.x + size.cw / s0 / 2
    const cycm = cur.y + size.ch / s0 / 2
    setView({ x: cxcm - size.cw / s2 / 2, y: cycm - size.ch / s2 / 2, scale: s2 })
  }

  // Wheel zoom needs a non-passive listener to preventDefault.
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015))
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size])

  return { hostRef, svgRef, size, view, viewRef, setView, scale, vw, vh, left, top, toCm, capture, fitView, zoomCentre, zoomAt }
}
