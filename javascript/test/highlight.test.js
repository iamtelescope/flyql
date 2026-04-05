import { describe, it, expect } from 'vitest'
import { highlight } from '../src/highlight.js'

describe('highlight', () => {
    it('returns empty string for empty input', () => {
        expect(highlight('')).toBe('')
        expect(highlight(null)).toBe('')
        expect(highlight(undefined)).toBe('')
    })

    it('highlights key=value', () => {
        const html = highlight('status=200')
        expect(html).toContain('flyql-key')
        expect(html).toContain('flyql-operator')
        expect(html).toContain('flyql-number')
        expect(html).toContain('status')
        expect(html).toContain('200')
    })

    it('highlights boolean operators', () => {
        const html = highlight('a=1 and b=2')
        expect(html).toContain('flyql-operator">and</span>')
    })

    it('highlights string values', () => {
        const html = highlight("name='alice'")
        expect(html).toContain('flyql-value')
        expect(html).toContain("'alice'")
    })

    it('highlights json paths as keys', () => {
        const html = highlight("meta.region='us-east'")
        expect(html).toContain('flyql-key">meta.region</span>')
    })

    it('highlights transformers', () => {
        const html = highlight("message|upper='HELLO'")
        expect(html).toContain('flyql-pipe">|</span>')
        expect(html).toContain('flyql-transformer">upper</span>')
    })

    it('highlights boolean literals', () => {
        const html = highlight('active=true')
        expect(html).toContain('flyql-boolean">true</span>')
    })

    it('highlights null literal', () => {
        const html = highlight('field=null')
        expect(html).toContain('flyql-null">null</span>')
    })

    it('handles complex expressions', () => {
        const html = highlight('(status=200 or status=201) and active')
        expect(html).toContain('flyql-key">status</span>')
        expect(html).toContain('flyql-operator">or</span>')
        expect(html).toContain('flyql-operator">and</span>')
    })

    it('escapes html characters', () => {
        const html = highlight("a='<b>'")
        expect(html).not.toContain('<b>')
        expect(html).toContain('&lt;b&gt;')
    })
})
