import type { Plan } from './types'

// Bounding box (cm) covering every object in the plan.
export function contentBounds(plan: Plan): { x: number; y: number; w: number; h: number } {
  const xs: number[] = []
  const ys: number[] = []
  const xe: number[] = []
  const ye: number[] = []
  const add = (x: number, y: number, w: number, h: number) => {
    xs.push(x), ys.push(y), xe.push(x + w), ye.push(y + h)
  }
  plan.rooms.forEach((r) => add(r.x, r.y, r.w, r.h))
  plan.furniture.forEach((f) => add(f.x, f.y, f.w, f.h))
  plan.markers.forEach((m) => add(m.x, m.y, m.w, m.h))
  plan.stairs.forEach((s) => add(s.x, s.y, s.w, s.h))
  plan.doors.forEach((d) => add(d.x, d.y, d.orientation === 'h' ? d.length : 0, d.orientation === 'v' ? d.length : 0))
  if (!xs.length) return { x: 0, y: 0, w: plan.width, h: plan.height }
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, w: Math.max(...xe) - x, h: Math.max(...ye) - y }
}

// Render the whole plan (regardless of current pan/zoom) to a downloaded PNG by
// cloning the live canvas SVG, reframing it to the content bounds, and rasterizing.
export async function exportPng(plan: Plan, filename = 'furnisher-plan.png'): Promise<void> {
  const live = document.querySelector('.canvas-host svg') as SVGSVGElement | null
  if (!live) return
  const clone = live.cloneNode(true) as SVGSVGElement

  const b = contentBounds(plan)
  const pad = 40
  const vbw = b.w + pad * 2
  const vbh = b.h + pad * 2
  clone.setAttribute('viewBox', `${b.x - pad} ${b.y - pad} ${vbw} ${vbh}`)

  // Scale so the longest side is ~1800px (crisp without huge files).
  const k = 1800 / Math.max(vbw, vbh, 1)
  const outW = Math.round(vbw * k)
  const outH = Math.round(vbh * k)
  clone.setAttribute('width', String(outW))
  clone.setAttribute('height', String(outH))
  clone.style.fontFamily = 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif'

  const xml = new XMLSerializer().serializeToString(clone)
  const svgUrl = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }))
  try {
    const img = new Image()
    await new Promise<void>((res, rej) => {
      img.onload = () => res()
      img.onerror = () => rej(new Error('render failed'))
      img.src = svgUrl
    })
    const canvas = document.createElement('canvas')
    canvas.width = outW
    canvas.height = outH
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#fdfbf7' // plan background
    ctx.fillRect(0, 0, outW, outH)
    ctx.drawImage(img, 0, 0, outW, outH)
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'))
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  } finally {
    URL.revokeObjectURL(svgUrl)
  }
}
