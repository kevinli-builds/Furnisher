import { describe, it, expect } from 'vitest'
import { safeUrl } from '../url'

describe('safeUrl', () => {
  it('blocks javascript:, data: and file: schemes', () => {
    expect(safeUrl('javascript:alert(1)')).toBeNull()
    expect(safeUrl('data:text/html,<script>alert(1)</script>')).toBeNull()
    expect(safeUrl('file:///etc/passwd')).toBeNull()
  })

  it('passes through http(s) links', () => {
    expect(safeUrl('https://ikea.com/p/x')).toBe('https://ikea.com/p/x')
    expect(safeUrl('http://example.com')).toBe('http://example.com/')
  })

  it('defaults a bare host to https', () => {
    expect(safeUrl('example.com/sofa')).toBe('https://example.com/sofa')
  })

  it('returns null for empty / nullish input', () => {
    expect(safeUrl('')).toBeNull()
    expect(safeUrl('   ')).toBeNull()
    expect(safeUrl(null)).toBeNull()
    expect(safeUrl(undefined)).toBeNull()
  })
})
