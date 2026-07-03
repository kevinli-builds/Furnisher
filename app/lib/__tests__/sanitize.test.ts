import { describe, it, expect } from 'vitest'
import { safeColorField, SAFE_COLOR } from '../sanitize'

describe('SAFE_COLOR', () => {
  it('accepts hex, rgb(a) and bare keywords', () => {
    for (const c of ['#fff', '#ffffff', '#ffffffff', 'rgb(1,2,3)', 'rgba(1,2,3,0.5)', 'red', 'transparent']) {
      expect(SAFE_COLOR.test(c)).toBe(true)
    }
  })

  it('rejects url() paint servers and other injection', () => {
    for (const c of ['url(http://evil.test/x)', 'url(#g)', 'red;background:url(x)', '#xyz', 'expression(alert(1))', '']) {
      expect(SAFE_COLOR.test(c)).toBe(false)
    }
  })
})

describe('safeColorField', () => {
  it('replaces a hostile url() colour with the fallback', () => {
    const out = safeColorField({ id: 'a', color: 'url(http://evil.test)' })
    expect(out.color).toBe('#d8c8a4')
  })

  it('keeps a valid colour untouched (same reference)', () => {
    const item = { id: 'a', color: '#b5714e' }
    expect(safeColorField(item)).toBe(item)
  })

  it('leaves an object with no colour field alone', () => {
    const item: { id: string; color?: string } = { id: 'a' }
    expect(safeColorField(item)).toBe(item)
  })

  it('replaces a non-string colour', () => {
    const out = safeColorField({ id: 'a', color: 123 as unknown as string })
    expect(out.color).toBe('#d8c8a4')
  })
})
