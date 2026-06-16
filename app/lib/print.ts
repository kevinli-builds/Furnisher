import type { Plan } from './types'
import { contentBounds, stripChrome } from './exportImage'

const NS = 'http://www.w3.org/2000/svg'
// Nice architectural scale denominators (1:n). We pick the smallest that fits.
const SCALES = [10, 20, 25, 50, 100, 200, 500, 1000]
// Printable area on A4 landscape after ~12 mm margins (cm).
const PAGE = { w: 25, h: 17 }

// Open a print view of the whole plan rendered to true scale (1:n), with a 1 m
// reference bar, and trigger the browser's print dialog (→ "Save as PDF").
// Dependency-free: clones the live canvas SVG, sizes it in physical cm, prints
// it in a hidden iframe.
export function printPlan(plan: Plan): void {
  const live = document.querySelector('.canvas-host svg') as SVGSVGElement | null
  if (!live) return
  const clone = live.cloneNode(true) as SVGSVGElement
  stripChrome(clone)

  const b = contentBounds(plan)
  const pad = 40
  const vbx = b.x - pad
  const vby = b.y - pad
  const vbw = b.w + pad * 2
  const vbh = b.h + pad * 2
  clone.setAttribute('viewBox', `${vbx} ${vby} ${vbw} ${vbh}`)

  // Smallest standard scale whose paper size fits one page.
  const need = Math.max(vbw / PAGE.w, vbh / PAGE.h)
  const denom = SCALES.find((d) => d >= need) ?? Math.ceil(need / 100) * 100
  clone.setAttribute('width', `${vbw / denom}cm`)
  clone.setAttribute('height', `${vbh / denom}cm`)

  // A 1 m reference bar (drawn in plan cm) at the bottom-left of the frame.
  const bx = vbx + 24
  const byy = vby + vbh - 24
  const bar = document.createElementNS(NS, 'g')
  bar.innerHTML =
    `<line x1="${bx}" y1="${byy}" x2="${bx + 100}" y2="${byy}" stroke="#2f2a22" stroke-width="2" vector-effect="non-scaling-stroke"/>` +
    `<line x1="${bx}" y1="${byy - 6}" x2="${bx}" y2="${byy + 6}" stroke="#2f2a22" stroke-width="2" vector-effect="non-scaling-stroke"/>` +
    `<line x1="${bx + 100}" y1="${byy - 6}" x2="${bx + 100}" y2="${byy + 6}" stroke="#2f2a22" stroke-width="2" vector-effect="non-scaling-stroke"/>` +
    `<text x="${bx + 50}" y="${byy - 10}" font-size="16" text-anchor="middle" fill="#2f2a22">1 m</text>`
  clone.appendChild(bar)

  const svg = new XMLSerializer().serializeToString(clone)
  const html =
    `<!doctype html><html><head><meta charset="utf-8"><title>Furnisher plan</title>` +
    `<style>@page{margin:12mm} body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#555}` +
    `.meta{font-size:11px;margin:0 0 8px} svg{display:block}</style></head><body>` +
    `<p class="meta">Scale 1:${denom} · print at 100% (turn off &ldquo;Fit to page&rdquo;) · 1&nbsp;m bar for reference</p>` +
    svg +
    `</body></html>`

  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden'
  iframe.srcdoc = html
  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus()
      iframe.contentWindow?.print()
    } catch {
      /* ignore */
    }
    setTimeout(() => iframe.remove(), 1500)
  }
  document.body.appendChild(iframe)
}
