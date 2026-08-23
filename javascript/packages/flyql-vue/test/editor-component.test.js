import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const EDITOR_DIR = resolve(import.meta.dirname, '../src')
const vueContent = readFileSync(resolve(EDITOR_DIR, 'FlyqlEditor.vue'), 'utf-8')

describe('FlyqlEditor component', () => {
    describe('UX polish (undo + truncation + footer path)', () => {
        it('imports editor helpers from flyql/editor', () => {
            expect(vueContent).toMatch(/import\s+\{[^}]*insertAtSelection[^}]*\}\s+from\s+'flyql\/editor'/)
        })

        it('uses insertAtSelection for undo-safe insert', () => {
            expect(vueContent).toContain('insertAtSelection(')
        })

        it('truncates long labels in list rendering', () => {
            expect(vueContent).toContain('truncateLabel(')
        })

        it('gates footer path via labelWasTruncated', () => {
            expect(vueContent).toContain('labelWasTruncated(')
        })

        it('renders footer full-path span', () => {
            expect(vueContent).toContain('flyql-panel__footer-path')
        })

        it('removes synthetic beforeinput dispatch (AC 13)', () => {
            expect(vueContent).not.toContain("new InputEvent('beforeinput'")
        })

        it('applies truncateLabel before highlightMatch in list rendering (F19)', () => {
            expect(vueContent).toContain('highlightMatch(item.displayLabel || truncateLabel(item.label), item.label)')
        })
    })

    describe('diagnostic description fallback (AC 16)', () => {
        it('guards the description span with diag.error && diag.error.description', () => {
            expect(vueContent).toContain('flyql-panel__diagnostic-desc')
            expect(vueContent).toContain('diag.error && diag.error.description')
        })
    })
})

describe('prefix slot (icon + label)', () => {
    it('declares the label and icon props', () => {
        expect(vueContent).toContain("label: { type: String, default: '' },")
        expect(vueContent).toContain('icon: { type: [String, Object, Function, Boolean], default: null },')
    })

    it('renders icon and label inside a single prefix element', () => {
        expect(vueContent).toContain('class="flyql-editor__prefix"')
        expect(vueContent).toContain('class="flyql-editor__icon"')
        expect(vueContent).toContain('class="flyql-editor__label"')
    })

    it('keeps the icon slot and adds a label slot', () => {
        expect(vueContent).toContain('<slot name="icon">')
        expect(vueContent).toContain('<slot name="label">')
    })

    it('drops the prefix entirely when there is neither icon nor label', () => {
        expect(vueContent).toContain('v-if="$slots.icon || icon !== false || $slots.label || label"')
        expect(vueContent).toContain('v-if="$slots.icon || icon !== false"')
        expect(vueContent).toContain('v-if="$slots.label || label"')
    })

    it('reads $slots in the template rather than a computed over useSlots', () => {
        // The slots object is not reactive: a computed over it would go stale
        // when the parent toggles a conditional slot on or off.
        expect(vueContent).not.toContain('useSlots')
    })

    it('renders a string icon as text and any other value as a component', () => {
        expect(vueContent).toContain(':is="iconComponent"')
        expect(vueContent).toContain('{{ iconText }}')
        expect(vueContent).toContain(
            "const iconText = computed(() => (typeof props.icon === 'string' ? props.icon : ''))",
        )
    })

    it('focuses the input when the prefix is clicked', () => {
        expect(vueContent).toContain('@mousedown.prevent="focus"')
    })

    it('lets a visible label be the accessible name of the input', () => {
        expect(vueContent).toContain(':aria-label="inputAriaLabel"')
        expect(vueContent).toContain("const inputAriaLabel = computed(() => props.label || 'FlyQL query input')")
    })
})
