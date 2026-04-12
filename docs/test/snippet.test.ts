import { describe, it, expect } from 'vitest'
import { extractSlice } from '../src/components/snippet-slice.ts'

describe('extractSlice', () => {
  it('returns whole file trimmed when no markers present and none requested', () => {
    const src = '\n\nhello\nworld\n\n'
    expect(extractSlice(src, undefined, undefined)).toBe('hello\nworld')
  })

  it('auto-detects default markers when none requested', () => {
    const src = [
      'import x from "y"',
      '// @docs-begin',
      'const a = 1',
      'const b = 2',
      '// @docs-end',
      'export default a',
    ].join('\n')
    expect(extractSlice(src, undefined, undefined)).toBe('const a = 1\nconst b = 2')
  })

  it('uses explicit custom markers', () => {
    const src = ['noise', '// SLICE', 'target', '// END', 'more noise'].join('\n')
    expect(extractSlice(src, '// SLICE', '// END')).toBe('target')
  })

  it('throws on partial markers (from only)', () => {
    expect(() => extractSlice('// A\nx\n// B', '// A', undefined)).toThrow(/both 'from' and 'to'/)
  })

  it('throws on partial markers (to only)', () => {
    expect(() => extractSlice('// A\nx\n// B', undefined, '// B')).toThrow(/both 'from' and 'to'/)
  })

  it('throws when from marker is missing', () => {
    expect(() => extractSlice('x\ny\n// END', '// START', '// END')).toThrow(/expected exactly one '\/\/ START' marker, found 0/)
  })

  it('throws when to marker is missing', () => {
    expect(() => extractSlice('// START\nx\ny', '// START', '// END')).toThrow(/expected exactly one '\/\/ END' marker, found 0/)
  })

  it('throws on multiple from markers', () => {
    const src = '// START\nx\n// START\ny\n// END'
    expect(() => extractSlice(src, '// START', '// END')).toThrow(/expected exactly one '\/\/ START' marker, found 2/)
  })

  it('throws on multiple to markers', () => {
    const src = '// START\nx\n// END\ny\n// END'
    expect(() => extractSlice(src, '// START', '// END')).toThrow(/expected exactly one '\/\/ END' marker, found 2/)
  })

  it('throws on reversed marker order', () => {
    const src = '// END\nx\n// START'
    expect(() => extractSlice(src, '// START', '// END')).toThrow(/must appear after/)
  })

  it('dedents by minimum common leading whitespace', () => {
    const src = [
      'function wrapper() {',
      '  // @docs-begin',
      '    const a = 1',
      '    if (true) {',
      '      const b = 2',
      '    }',
      '  // @docs-end',
      '}',
    ].join('\n')
    expect(extractSlice(src, undefined, undefined)).toBe(
      'const a = 1\nif (true) {\n  const b = 2\n}',
    )
  })

  it('returns whole file trimmed when markers requested but source has none and no default markers', () => {
    // no markers requested, no defaults → whole file
    const src = 'plain\nfile\n'
    expect(extractSlice(src, undefined, undefined)).toBe('plain\nfile')
  })

  it('handles empty slice region', () => {
    const src = '// @docs-begin\n// @docs-end'
    expect(extractSlice(src, undefined, undefined)).toBe('')
  })
})
