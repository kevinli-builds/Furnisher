import type { LabelConfig, LabelPos, LabelAlign } from './types'

// Geometry helpers for a box's text label. All coordinates are in cm (canonical),
// matching the rest of the app. Kept pure (no React) so it can be unit-tested.

export interface LabelBox {
  x: number
  y: number
  w: number
  h: number
}

// Gap between the label and the box edge, in cm.
export const LABEL_PAD = 10

const num = (v: number | undefined): number => (Number.isFinite(v) ? (v as number) : 0)

// Greedy word-wrap so the text fits `box.w` at `fontSize` (both cm). Always
// returns at least one line. With wrap off it's a single line. Width is estimated
// from an average glyph width — good enough for a planning tool (SVG can't wrap).
export function wrapLabel(text: string, boxW: number, fontSize: number, wrap: boolean): string[] {
  const t = (text ?? '').trim()
  if (!t) return ['']
  if (!wrap) return [t]
  const charW = fontSize * 0.55
  const maxChars = Math.max(1, Math.floor((boxW - LABEL_PAD * 2) / charW))
  const lines: string[] = []
  let cur = ''
  for (const word of t.split(/\s+/)) {
    if (!cur) {
      cur = word
    } else if ((cur + ' ' + word).length <= maxChars) {
      cur += ' ' + word
    } else {
      lines.push(cur)
      cur = word
    }
  }
  if (cur) lines.push(cur)
  return lines.length ? lines : ['']
}

export interface LabelLayout {
  x: number
  topY: number // y of the FIRST line's top (dominant-baseline: hanging)
  anchor: 'start' | 'middle' | 'end'
}

// Resolve where the label's text block sits, given its config and the wrapped
// line count. Lines are drawn at topY + i*lineHeight with a hanging baseline.
export function layoutLabel(box: LabelBox, cfg: LabelConfig | undefined, fontSize: number, lineCount: number, lineHeight: number): LabelLayout {
  const align: LabelAlign = cfg?.align ?? 'left'
  const pos: LabelPos = cfg?.pos ?? 'top'
  const inside = cfg?.inside ?? true
  const blockH = lineCount * lineHeight

  // Horizontal placement + text anchor from `align` (the default for the
  // top/bottom/center/custom positions).
  let x: number
  let anchor: 'start' | 'middle' | 'end'
  if (align === 'center') {
    x = box.x + box.w / 2
    anchor = 'middle'
  } else if (align === 'right') {
    x = box.x + box.w - LABEL_PAD
    anchor = 'end'
  } else {
    x = box.x + LABEL_PAD
    anchor = 'start'
  }

  let topY = box.y + LABEL_PAD
  switch (pos) {
    case 'custom':
      x = box.x + num(cfg?.dx)
      topY = box.y + num(cfg?.dy)
      break
    case 'top':
      topY = inside ? box.y + LABEL_PAD : box.y - LABEL_PAD - blockH
      break
    case 'bottom':
      topY = inside ? box.y + box.h - LABEL_PAD - blockH : box.y + box.h + LABEL_PAD
      break
    case 'center':
      topY = box.y + box.h / 2 - blockH / 2
      break
    case 'left':
      // Vertical side: anchor follows inside/outside, not `align`.
      x = inside ? box.x + LABEL_PAD : box.x - LABEL_PAD
      anchor = inside ? 'start' : 'end'
      topY = box.y + box.h / 2 - blockH / 2
      break
    case 'right':
      x = inside ? box.x + box.w - LABEL_PAD : box.x + box.w + LABEL_PAD
      anchor = inside ? 'end' : 'start'
      topY = box.y + box.h / 2 - blockH / 2
      break
  }
  return { x, topY, anchor }
}
