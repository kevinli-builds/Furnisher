import { describe, it, expect } from 'vitest'
import { wrapLabel, layoutLabel, LABEL_PAD } from '../label'

const box = { x: 100, y: 200, w: 300, h: 160 }
const FS = 18
const LH = FS * 1.25

describe('wrapLabel', () => {
  it('returns a single line when wrap is off', () => {
    expect(wrapLabel('a fairly long closet label', box.w, FS, false)).toEqual(['a fairly long closet label'])
  })
  it('breaks into multiple lines when wrap is on', () => {
    const lines = wrapLabel('a fairly long closet label here', box.w, FS, true)
    expect(lines.length).toBeGreaterThan(1)
    // no line exceeds the estimated character budget
    const maxChars = Math.floor((box.w - LABEL_PAD * 2) / (FS * 0.55))
    for (const l of lines) expect(l.length).toBeLessThanOrEqual(maxChars)
  })
  it('never returns zero lines, even for empty text', () => {
    expect(wrapLabel('', box.w, FS, true)).toEqual([''])
    expect(wrapLabel('   ', box.w, FS, false)).toEqual([''])
  })
})

describe('layoutLabel', () => {
  it('defaults to inside the top-left corner', () => {
    const { x, topY, anchor } = layoutLabel(box, undefined, FS, 1, LH)
    expect(x).toBe(box.x + LABEL_PAD)
    expect(topY).toBe(box.y + LABEL_PAD)
    expect(anchor).toBe('start')
  })
  it('right alignment anchors to the right edge', () => {
    const { x, anchor } = layoutLabel(box, { align: 'right' }, FS, 1, LH)
    expect(x).toBe(box.x + box.w - LABEL_PAD)
    expect(anchor).toBe('end')
  })
  it('bottom-outside sits below the box', () => {
    const { topY } = layoutLabel(box, { pos: 'bottom', inside: false }, FS, 1, LH)
    expect(topY).toBe(box.y + box.h + LABEL_PAD)
  })
  it('top-outside stacks the whole block above the box', () => {
    const { topY } = layoutLabel(box, { pos: 'top', inside: false }, FS, 2, LH)
    expect(topY).toBe(box.y - LABEL_PAD - 2 * LH)
  })
  it('center vertically centers the block', () => {
    const { topY } = layoutLabel(box, { pos: 'center' }, FS, 1, LH)
    expect(topY).toBe(box.y + box.h / 2 - LH / 2)
  })
  it('left-outside anchors text to the end, left of the box', () => {
    const { x, anchor } = layoutLabel(box, { pos: 'left', inside: false }, FS, 1, LH)
    expect(x).toBe(box.x - LABEL_PAD)
    expect(anchor).toBe('end')
  })
  it('custom placement offsets from the box top-left and coerces bad offsets', () => {
    expect(layoutLabel(box, { pos: 'custom', dx: 40, dy: 25 }, FS, 1, LH)).toMatchObject({ x: box.x + 40, topY: box.y + 25 })
    expect(layoutLabel(box, { pos: 'custom' }, FS, 1, LH)).toMatchObject({ x: box.x, topY: box.y })
  })
})
