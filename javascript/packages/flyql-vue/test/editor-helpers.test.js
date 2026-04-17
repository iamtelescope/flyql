import { describe, it, expect, vi, afterEach } from 'vitest'
import { truncateLabel, labelWasTruncated, insertAtSelection } from '../src/editor-helpers.js'

describe('truncateLabel', () => {
    it('returns empty string unchanged', () => {
        expect(truncateLabel('')).toBe('')
    })

    it('returns null unchanged', () => {
        expect(truncateLabel(null)).toBe(null)
    })

    it('returns undefined unchanged', () => {
        expect(truncateLabel(undefined)).toBe(undefined)
    })

    it('returns flat label unchanged regardless of length', () => {
        const short = 'emailAddress'
        expect(truncateLabel(short)).toBe(short)
        const long = 'a'.repeat(200)
        expect(truncateLabel(long)).toBe(long)
    })

    it('returns dotted label ≤ maxLen unchanged', () => {
        expect(truncateLabel('foo.bar.baz')).toBe('foo.bar.baz')
    })

    it('truncates long dotted label preserving whole segments', () => {
        const input = 'service.api.users.profile.emailAddress'
        expect(input.length).toBe(38)
        const result = truncateLabel(input)
        expect(result).toBe('\u2026api.users.profile.emailAddress')
        expect(result.length).toBeLessThanOrEqual(32)
    })

    it('returns ellipsis + leaf when leaf alone exceeds budget', () => {
        const leaf = 'thisIsAVeryLongLeafSegmentNameIndeedBeyondBudget'
        const input = 'a.' + leaf
        const result = truncateLabel(input)
        expect(result.startsWith('\u2026')).toBe(true)
        expect(result).toContain(leaf)
    })

    it('label length exactly 32 is unchanged', () => {
        const input = 'a.b.c.d.e.f.g.h.i.j.k.l.m.n.o.pq'
        expect(input.length).toBe(32)
        expect(truncateLabel(input)).toBe(input)
    })

    it('label length 33 with many segments is truncated per algorithm', () => {
        const input = 'a.b.c.d.e.f.g.h.i.j.k.l.m.n.o.p.q'
        expect(input.length).toBe(33)
        const result = truncateLabel(input)
        expect(result.startsWith('\u2026')).toBe(true)
        expect(result.length).toBeLessThanOrEqual(32)
    })

    it('honors custom maxLen opt', () => {
        const input = 'foo.bar.baz.qux.emailAddress'
        const result = truncateLabel(input, { maxLen: 16 })
        expect(result.startsWith('\u2026')).toBe(true)
        expect(result.length).toBeLessThanOrEqual(16)
    })

    it('honors custom ellipsis opt (three dots)', () => {
        const input = 'service.api.users.profile.emailAddress'
        const result = truncateLabel(input, { maxLen: 32, ellipsis: '...' })
        expect(result.startsWith('...')).toBe(true)
        expect(result.length).toBeLessThanOrEqual(32)
        expect(result).toBe('...users.profile.emailAddress')
    })
})

describe('labelWasTruncated', () => {
    it('false for empty/null/undefined', () => {
        expect(labelWasTruncated('')).toBe(false)
        expect(labelWasTruncated(null)).toBe(false)
        expect(labelWasTruncated(undefined)).toBe(false)
    })

    it('false for any flat label regardless of length', () => {
        expect(labelWasTruncated('emailAddress')).toBe(false)
        expect(labelWasTruncated('a'.repeat(200))).toBe(false)
    })

    it('false for dotted label ≤ maxLen', () => {
        expect(labelWasTruncated('foo.bar.baz')).toBe(false)
    })

    it('true for dotted label > maxLen', () => {
        expect(labelWasTruncated('service.api.users.profile.emailAddress')).toBe(true)
    })

    it('agrees with truncateLabel over a random sample (AC 15)', () => {
        const sampleLabels = [
            '',
            'flat',
            'a.b',
            'service.api',
            'service.api.users',
            'service.api.users.profile',
            'service.api.users.profile.emailAddress',
            'a.b.c.d.e.f.g.h.i.j.k.l.m.n.o.pq',
            'a.b.c.d.e.f.g.h.i.j.k.l.m.n.o.p.q',
            'reallyLongFlatLabelWithNoDotsAtAllEver',
            'x.'.repeat(40) + 'leaf',
            'a.' + 'leaf'.repeat(20),
            'one.two.three.four.five.six.seven.eight',
            'l'.repeat(33),
            'foo.bar.baz.qux.quux.corge.grault.garply',
            'alpha.beta',
            'alpha.beta.gamma.delta.epsilon.zeta.eta.theta',
            'singleSegment',
            'short.label',
            'deep.nested.path.with.many.segments.indeed',
        ]
        for (const label of sampleLabels) {
            const got = labelWasTruncated(label)
            const expected = truncateLabel(label) !== label
            expect(got, `mismatch for label: ${JSON.stringify(label)}`).toBe(expected)
        }
    })
})

/**
 * insertAtSelection is tested against lightweight stand-ins for `textarea` and
 * the `document`/`InputEvent` globals. The vitest default environment is
 * 'node' in this package — spinning up jsdom just for this file would drag in
 * a heavy dev dep. The helper's real browser path is covered by the manual
 * smoke test (Task 12 / AC 1 / AC 2).
 */
describe('insertAtSelection', () => {
    const origDocument = globalThis.document
    const origInputEvent = globalThis.InputEvent

    afterEach(() => {
        if (origDocument === undefined) delete globalThis.document
        else globalThis.document = origDocument
        if (origInputEvent === undefined) delete globalThis.InputEvent
        else globalThis.InputEvent = origInputEvent
        vi.restoreAllMocks()
    })

    function mkTextarea(value = '', selStart = 0, selEnd = 0) {
        const ta = {
            _value: value,
            get value() {
                return this._value
            },
            set value(v) {
                this._value = v
            },
            selectionStart: selStart,
            selectionEnd: selEnd,
            focus: vi.fn(),
            setSelectionRange(s, e) {
                this.selectionStart = s
                this.selectionEnd = e
            },
            _listeners: {},
            addEventListener(name, fn) {
                ;(this._listeners[name] = this._listeners[name] || []).push(fn)
            },
            dispatchEvent(ev) {
                for (const fn of this._listeners[ev.type] || []) fn(ev)
                return true
            },
        }
        return ta
    }

    function setupDocEnv({ execCommand, activeElement } = {}) {
        globalThis.document = {
            activeElement: activeElement ?? null,
            execCommand: execCommand ?? (() => false),
        }
        globalThis.InputEvent = class {
            constructor(type, init = {}) {
                this.type = type
                this.inputType = init.inputType
                this.data = init.data
                this.bubbles = !!init.bubbles
            }
        }
    }

    it('returns "no-op" on null/undefined textarea', () => {
        setupDocEnv()
        expect(insertAtSelection(null, { start: 0, end: 0 }, 'x')).toBe('no-op')
        expect(insertAtSelection(undefined, { start: 0, end: 0 }, 'x')).toBe('no-op')
    })

    it('falls back when execCommand is absent (node env) and fires input event', () => {
        const ta = mkTextarea('hello world', 6, 6)
        setupDocEnv({ execCommand: undefined, activeElement: ta })
        const events = []
        ta.addEventListener('input', (e) => events.push(e))
        const result = insertAtSelection(ta, { start: 6, end: 6 }, 'brave ')
        expect(result).toBe('fallback')
        expect(ta.value).toBe('hello brave world')
        expect(ta.selectionStart).toBe(12)
        expect(ta.selectionEnd).toBe(12)
        expect(events.length).toBe(1)
        expect(events[0].inputType).toBe('insertText')
        expect(events[0].data).toBe('brave ')
    })

    it('replaces an existing selection', () => {
        const ta = mkTextarea('hello world', 6, 11)
        setupDocEnv({ activeElement: ta })
        const result = insertAtSelection(ta, { start: 6, end: 11 }, 'there')
        expect(result).toBe('fallback')
        expect(ta.value).toBe('hello there')
        expect(ta.selectionStart).toBe(11)
        expect(ta.selectionEnd).toBe(11)
    })

    it('does not call focus() when textarea is already activeElement', () => {
        const ta = mkTextarea('hi', 2, 2)
        setupDocEnv({ activeElement: ta })
        insertAtSelection(ta, { start: 2, end: 2 }, '!')
        expect(ta.focus).not.toHaveBeenCalled()
    })

    it('calls focus() when another element has focus', () => {
        const ta = mkTextarea('hi', 2, 2)
        setupDocEnv({ activeElement: { other: true } })
        insertAtSelection(ta, { start: 2, end: 2 }, '!')
        expect(ta.focus).toHaveBeenCalled()
    })

    it('returns "native" when execCommand succeeds and mutates value', () => {
        const ta = mkTextarea('abcxyz', 3, 3)
        const execCommand = vi.fn((cmd, _ui, arg) => {
            if (cmd !== 'insertText') return false
            const s = ta.selectionStart
            const e = ta.selectionEnd
            ta.value = ta.value.substring(0, s) + arg + ta.value.substring(e)
            const end = s + arg.length
            ta.setSelectionRange(end, end)
            return true
        })
        setupDocEnv({ execCommand, activeElement: ta })
        const result = insertAtSelection(ta, { start: 3, end: 3 }, '-')
        expect(result).toBe('native')
        expect(ta.value).toBe('abc-xyz')
        expect(execCommand).toHaveBeenCalled()
    })

    it('falls back when execCommand returns true but does not mutate value (silent success)', () => {
        const ta = mkTextarea('abcxyz', 3, 3)
        setupDocEnv({ execCommand: () => true, activeElement: ta })
        const result = insertAtSelection(ta, { start: 3, end: 3 }, '-')
        expect(result).toBe('fallback')
        expect(ta.value).toBe('abc-xyz')
    })

    it('falls back when execCommand throws', () => {
        const ta = mkTextarea('abcxyz', 3, 3)
        setupDocEnv({
            execCommand: () => {
                throw new Error('security error')
            },
            activeElement: ta,
        })
        const result = insertAtSelection(ta, { start: 3, end: 3 }, '-')
        expect(result).toBe('fallback')
        expect(ta.value).toBe('abc-xyz')
    })
})
