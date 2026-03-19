<template>
    <div class="flyql-editor" :class="{ 'flyql-editor--focused': focused }" ref="editorRoot">
        <span class="flyql-editor__icon">
            <slot name="icon">
                <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                >
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
            </slot>
        </span>
        <div class="flyql-editor__container" ref="containerRef">
            <pre class="flyql-editor__highlight" ref="highlightRef" v-html="highlightedHtml" aria-hidden="true"></pre>
            <textarea
                class="flyql-editor__input"
                ref="textareaRef"
                rows="1"
                :value="modelValue"
                :placeholder="placeholder"
                @input="onInput"
                @keydown="onKeydown"
                @focus="onFocus"
                @blur="onBlur"
                @scroll="onScroll"
                @click="onCursorMove"
                @compositionstart="composing = true"
                @compositionend="onCompositionEnd"
                spellcheck="false"
                autocomplete="off"
                autocorrect="off"
                autocapitalize="off"
            ></textarea>
        </div>
        <!-- Suggestion panel -->
        <Teleport to="body">
            <div v-if="focused && activated" class="flyql-panel" @mousedown.prevent :style="panelStyle">
                <div class="flyql-panel__header flyql-panel__debug">
                    <span v-if="lastContext"
                        >state={{ lastContext.state }} expecting={{ lastContext.expecting }} key={{
                            lastContext.key
                        }}
                        value={{ lastContext.value }} op={{ lastContext.keyValueOperator }}</span
                    >
                    <span v-else>no context</span>
                    <button class="flyql-panel__clear" title="Close suggestions" @click="activated = false">
                        <svg
                            width="10"
                            height="10"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2.5"
                            stroke-linecap="round"
                        >
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>
                <div class="flyql-panel__header">
                    Suggestions: <span class="flyql-panel__state">{{ stateLabel }}</span>
                </div>
                <div class="flyql-panel__body">
                    <div v-if="isLoading" class="flyql-panel__loading">
                        <slot name="loading">
                            <span class="flyql-panel__spinner"></span>
                        </slot>
                    </div>
                    <ul v-else-if="suggestions.length > 0" ref="listRef" class="flyql-panel__list">
                        <li
                            v-for="(item, index) in suggestions"
                            :key="index"
                            :ref="(el) => setItemRef(el, index)"
                            class="flyql-panel__item"
                            :class="{ 'flyql-panel__item--active': index === selectedIndex }"
                            @click="onSuggestionSelect(index)"
                        >
                            <span class="flyql-panel__badge" :class="'flyql-panel__badge--' + item.type">
                                {{ badgeText(item.type) }}
                            </span>
                            <span class="flyql-panel__label" v-html="highlightMatch(item.label)"></span>
                            <span
                                v-if="item.detail"
                                class="flyql-panel__detail"
                                :class="'flyql-panel__detail--' + item.type"
                                >{{ item.detail }}</span
                            >
                        </li>
                    </ul>
                    <div v-else-if="!isLoading && message" class="flyql-panel__message">{{ message }}</div>
                    <div v-else-if="!isLoading" class="flyql-panel__empty">No suggestions</div>
                </div>
            </div>
        </Teleport>
    </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { Parser, CharType, State, Operator, VALID_KEY_VALUE_OPERATORS, isNumeric } from '../core/index.js'

// ── Props & Emits ──

const props = defineProps({
    modelValue: { type: String, default: '' },
    columns: { type: Object, default: () => ({}) },
    onAutocomplete: { type: Function, default: null },
    placeholder: { type: String, default: '' },
    autofocus: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue', 'submit'])

// ── Refs ──

const textareaRef = ref(null)
const highlightRef = ref(null)
const containerRef = ref(null)
const editorRoot = ref(null)
const listRef = ref(null)
const focused = ref(false)
const activated = ref(false)
const composing = ref(false)
const panelLeft = ref(0)
const panelTop = ref(0)

const panelStyle = computed(() => ({
    left: panelLeft.value + 'px',
    top: panelTop.value + 'px',
}))

// ── Highlighting ──

const CHAR_TYPE_CLASS = {
    [CharType.KEY]: 'flyql-key',
    [CharType.OPERATOR]: 'flyql-operator',
    [CharType.VALUE]: 'flyql-value',
    [CharType.NUMBER]: 'flyql-number',
    [CharType.STRING]: 'flyql-string',
    [CharType.SPACE]: 'flyql-space',
}

function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function wrapSpan(charType, text) {
    const escaped = escapeHtml(text)
    const cls = CHAR_TYPE_CLASS[charType]
    if (cls) {
        return `<span class="${cls}">${escaped}</span>`
    }
    return escaped
}

const text = computed(() => props.modelValue)

const highlightedHtml = computed(() => {
    const value = text.value
    if (!value) return ''

    const parser = new Parser()
    try {
        parser.parse(value, false, true)
    } catch {
        return escapeHtml(value)
    }

    const typedChars = parser.typedChars
    if (!typedChars || typedChars.length === 0) {
        return escapeHtml(value)
    }

    let html = ''
    let currentType = null
    let currentText = ''

    for (const [char, charType] of typedChars) {
        const ch = char.value
        if (charType === currentType && ch !== '\n') {
            currentText += ch
        } else {
            if (currentText) {
                html += wrapSpan(currentType, currentText)
            }
            currentType = charType
            currentText = ch
        }
    }
    if (currentText) {
        html += wrapSpan(currentType, currentText)
    }

    if (parser.state === State.ERROR && typedChars.length < value.length) {
        const remaining = value.substring(typedChars.length)
        html += `<span class="flyql-error">${escapeHtml(remaining)}</span>`
    }

    return html
})

// ── Autocompletion ──

const suggestions = ref([])
const selectedIndex = ref(0)
const isLoading = ref(false)
const suggestionType = ref('')
const message = ref('')
const lastContext = ref(null)
const valueCache = ref({}) // key → raw items from onAutocomplete

const STATE_LABELS = {
    column: 'column name',
    operator: 'operator',
    operatorOrBool: 'operator or boolean',
    value: 'value',
    boolOp: 'boolean operator',
}

const stateLabel = computed(() => STATE_LABELS[suggestionType.value] || '')

const filterPrefix = computed(() => {
    const ctx = lastContext.value
    if (!ctx) return ''
    if (ctx.expecting === 'column') return ctx.key || ''
    if (ctx.expecting === 'value') return ctx.value || ''
    if (ctx.expecting === 'boolOp') {
        const match = ctx.textBeforeCursor.match(/(\S*)$/)
        return match ? match[1] : ''
    }
    return ''
})

function highlightMatch(label) {
    const prefix = filterPrefix.value
    if (!prefix) return escapeHtml(label)
    if (!label.toLowerCase().startsWith(prefix.toLowerCase())) return escapeHtml(label)
    const matched = escapeHtml(label.substring(0, prefix.length))
    const rest = escapeHtml(label.substring(prefix.length))
    return `<span class="flyql-panel__match">${matched}</span>${rest}`
}

const itemRefs = ref({})

function setItemRef(el, index) {
    if (el) {
        itemRefs.value[index] = el
    } else {
        delete itemRefs.value[index]
    }
}

function badgeText(type) {
    switch (type) {
        case 'column':
            return 'C'
        case 'operator':
            return 'Op'
        case 'value':
            return 'V'
        case 'boolOp':
            return 'B'
        default:
            return '?'
    }
}

function getColumns() {
    return props.columns
}

function getColumnNames() {
    return Object.keys(getColumns())
}

function getColumn(name) {
    return getColumns()[name]
}

function getKeySuggestions(prefix) {
    const result = []
    const lowerPrefix = prefix.toLowerCase()
    for (const name of getColumnNames()) {
        const col = getColumn(name)
        if (!col.suggest) continue
        if (lowerPrefix && !name.toLowerCase().startsWith(lowerPrefix)) continue
        result.push({
            label: name,
            insertText: name,
            type: 'column',
            detail: col.type,
        })
    }
    return result
}

const OPERATOR_NAMES = {
    [Operator.EQUALS]: 'equals',
    [Operator.NOT_EQUALS]: 'not equals',
    [Operator.REGEX]: 'regex match',
    [Operator.NOT_REGEX]: 'not regex match',
    [Operator.GREATER_THAN]: 'greater than',
    [Operator.GREATER_OR_EQUALS_THAN]: 'greater or equals',
    [Operator.LOWER_THAN]: 'lower than',
    [Operator.LOWER_OR_EQUALS_THAN]: 'lower or equals',
    [Operator.IN]: 'in list',
}

function getOperatorSuggestions(fieldName) {
    const col = getColumn(fieldName)
    const ops = [
        { label: Operator.EQUALS, insertText: Operator.EQUALS, sortText: 'a' },
        { label: Operator.NOT_EQUALS, insertText: Operator.NOT_EQUALS, sortText: 'b' },
        { label: Operator.GREATER_THAN, insertText: Operator.GREATER_THAN, sortText: 'e' },
        { label: Operator.GREATER_OR_EQUALS_THAN, insertText: Operator.GREATER_OR_EQUALS_THAN, sortText: 'f' },
        { label: Operator.LOWER_THAN, insertText: Operator.LOWER_THAN, sortText: 'g' },
        { label: Operator.LOWER_OR_EQUALS_THAN, insertText: Operator.LOWER_OR_EQUALS_THAN, sortText: 'h' },
        { label: Operator.IN, insertText: ' ' + Operator.IN + ' ', sortText: 'i' },
    ]
    if (!col || col.type !== 'enum') {
        ops.push({ label: Operator.REGEX, insertText: Operator.REGEX, sortText: 'c' })
        ops.push({ label: Operator.NOT_REGEX, insertText: Operator.NOT_REGEX, sortText: 'd' })
    }
    ops.sort((a, b) => a.sortText.localeCompare(b.sortText))
    return ops.map((op) => ({
        label: op.label,
        insertText: op.insertText,
        type: 'operator',
        detail: OPERATOR_NAMES[op.label] || '',
    }))
}

function getBoolSuggestions() {
    return [
        { label: 'and', insertText: 'and ', type: 'boolOp', detail: '' },
        { label: 'or', insertText: 'or ', type: 'boolOp', detail: '' },
        { label: 'and not', insertText: 'and not ', type: 'boolOp', detail: 'negate' },
        { label: 'or not', insertText: 'or not ', type: 'boolOp', detail: 'negate' },
    ]
}

function prepareSuggestionValues(items, quoteChar, filterPrefix) {
    const quoted = !!quoteChar
    const defaultQuote = quoteChar || '"'
    const lowerPrefix = filterPrefix ? filterPrefix.toLowerCase() : ''
    return items
        .filter((item) => {
            if (!lowerPrefix) return true
            return String(item).toLowerCase().startsWith(lowerPrefix)
        })
        .map((item) => {
            if (isNumeric(item)) {
                return { label: item, insertText: item, type: 'value', detail: '' }
            }
            let text = ''
            if (!quoted) text += defaultQuote
            for (const ch of item) {
                text += ch === defaultQuote ? `\\${defaultQuote}` : ch
            }
            text += defaultQuote
            return { label: item, insertText: text, type: 'value', detail: '' }
        })
}

async function getValueSuggestions(key, value, quoteChar) {
    const col = getColumn(key)
    if (!col) return []
    if (!col.autocomplete) {
        message.value = 'Autocompletion is disabled for this column'
        return []
    }

    if (col.values && col.values.length > 0) {
        return prepareSuggestionValues(col.values, quoteChar, value)
    }

    if (props.onAutocomplete) {
        // Use cached results if available, otherwise fetch once per column
        if (valueCache.value[key]) {
            return prepareSuggestionValues(valueCache.value[key], quoteChar, value)
        }
        const loadingTimer = setTimeout(() => {
            isLoading.value = true
        }, 200)
        try {
            const result = await props.onAutocomplete(key, value)
            if (result && result.items) {
                valueCache.value[key] = result.items
                return prepareSuggestionValues(result.items, quoteChar, value)
            }
        } finally {
            clearTimeout(loadingTimer)
            isLoading.value = false
        }
    }
    return []
}

async function updateSuggestions(ctx) {
    lastContext.value = ctx
    message.value = ''
    isLoading.value = false
    suggestions.value = []
    selectedIndex.value = 0

    if (!ctx) {
        suggestions.value = getKeySuggestions('')
        suggestionType.value = 'column'
        return
    }

    if (ctx.state === 'ERROR') {
        suggestions.value = []
        suggestionType.value = ''
        message.value = ctx.error
        return
    }

    let newSuggestions = []
    let newType = ''

    if (ctx.expecting === 'column') {
        if (getColumnNames().includes(ctx.key)) {
            newSuggestions = getOperatorSuggestions(ctx.key)
            newType = 'operator'
        } else {
            newSuggestions = getKeySuggestions(ctx.key)
            newType = 'column'
        }
    } else if (ctx.expecting === 'operatorOrBool') {
        newSuggestions = [...getOperatorSuggestions(ctx.key), ...getBoolSuggestions()]
        newType = 'operator'
    } else if (ctx.expecting === 'list') {
        newSuggestions = [{ label: '[]', insertText: '[]', type: 'value', detail: 'empty list', cursorOffset: -1 }]
        newType = 'value'
    } else if (ctx.expecting === 'value') {
        suggestionType.value = 'value'
        newSuggestions = await getValueSuggestions(ctx.key, ctx.value, ctx.quoteChar)
        newType = 'value'
    } else if (ctx.expecting === 'boolOp') {
        newSuggestions = getBoolSuggestions()
        newType = 'boolOp'
    }

    if (newSuggestions.length === 0 && !newType && ctx.expecting !== 'none') {
        newSuggestions = getKeySuggestions('')
        newType = 'column'
    }

    if (newSuggestions.length > 0) {
        message.value = ''
    }
    suggestions.value = newSuggestions
    suggestionType.value = newType
    selectedIndex.value = 0
}

function getInsertRange(ctx, fullText) {
    if (!ctx) return { start: 0, end: 0 }

    const cursorPos = ctx.textBeforeCursor.length

    // Find how far the current token extends after the cursor
    let endPos = cursorPos
    if (fullText) {
        const afterCursor = fullText.substring(cursorPos)
        const trailingMatch = afterCursor.match(/^[^\s=!<>~&|()'"]+/)
        if (trailingMatch) {
            endPos = cursorPos + trailingMatch[0].length
        }
    }

    if (ctx.expecting === 'column') {
        if (suggestionType.value === 'operator') {
            return { start: cursorPos, end: endPos }
        }
        const keyLen = (ctx.key || '').length
        return { start: cursorPos - keyLen, end: endPos }
    } else if (ctx.expecting === 'operatorOrBool' || ctx.expecting === 'list') {
        return { start: cursorPos, end: endPos }
    } else if (ctx.expecting === 'value') {
        const valLen = (ctx.value || '').length
        // For quoted values, also consume closing quote after cursor
        let valueEnd = endPos
        if (fullText && ctx.quoteChar && fullText[endPos] === ctx.quoteChar) {
            valueEnd = endPos + 1
        }
        return { start: cursorPos - valLen, end: valueEnd }
    } else if (ctx.expecting === 'boolOp') {
        const match = ctx.textBeforeCursor.match(/(\S*)$/)
        const wordLen = match ? match[1].length : 0
        return { start: cursorPos - wordLen, end: endPos }
    }

    return { start: cursorPos, end: cursorPos }
}

function selectSuggestion(index) {
    const suggestion = suggestions.value[index]
    if (!suggestion) return null
    return suggestion
}

function navigateUp() {
    if (suggestions.value.length === 0) return
    selectedIndex.value = selectedIndex.value <= 0 ? suggestions.value.length - 1 : selectedIndex.value - 1
}

function navigateDown() {
    if (suggestions.value.length === 0) return
    selectedIndex.value = selectedIndex.value >= suggestions.value.length - 1 ? 0 : selectedIndex.value + 1
}

// ── Context Building ──

function buildContext(textBeforeCursor) {
    if (!textBeforeCursor) {
        return {
            expecting: 'column',
            key: '',
            value: '',
            quoteChar: '',
            keyValueOperator: '',
            state: 'INITIAL',
            textBeforeCursor: '',
        }
    }

    const parser = new Parser()
    try {
        parser.parse(textBeforeCursor, false, true)
    } catch (e) {
        return {
            expecting: '',
            key: '',
            value: '',
            quoteChar: '',
            keyValueOperator: '',
            state: 'ERROR',
            error: e.message || 'Parse error',
            textBeforeCursor,
        }
    }

    if (parser.state === State.ERROR) {
        return {
            expecting: '',
            key: '',
            value: '',
            quoteChar: '',
            keyValueOperator: '',
            state: 'ERROR',
            error: parser.errorText || 'Parse error',
            textBeforeCursor,
        }
    }

    const ctx = {
        state: parser.state,
        key: parser.key || '',
        value: parser.value || '',
        keyValueOperator: parser.keyValueOperator || '',
        quoteChar: '',
        expecting: '',
        textBeforeCursor,
    }

    if (
        parser.state === State.KEY ||
        parser.state === State.INITIAL ||
        parser.state === State.BOOL_OP_DELIMITER ||
        parser.state === State.SINGLE_QUOTED_KEY ||
        parser.state === State.DOUBLE_QUOTED_KEY
    ) {
        ctx.expecting = 'column'
    } else if (parser.state === State.KEY_OR_BOOL_OP) {
        ctx.expecting = 'operatorOrBool'
    } else if (parser.state === State.EXPECT_OPERATOR) {
        ctx.expecting = 'operatorOrBool'
    } else if (parser.state === State.EXPECT_LIST_START) {
        ctx.expecting = 'list'
    } else if (
        parser.state === State.EXPECT_LIST_VALUE ||
        parser.state === State.IN_LIST_VALUE ||
        parser.state === State.IN_LIST_SINGLE_QUOTED_VALUE ||
        parser.state === State.IN_LIST_DOUBLE_QUOTED_VALUE ||
        parser.state === State.EXPECT_LIST_COMMA_OR_END
    ) {
        ctx.expecting = 'none'
    } else if (parser.state === State.KEY_VALUE_OPERATOR) {
        if (VALID_KEY_VALUE_OPERATORS.includes(parser.keyValueOperator)) {
            ctx.expecting = 'value'
        }
    } else if (
        parser.state === State.VALUE ||
        parser.state === State.EXPECT_VALUE ||
        parser.state === State.DOUBLE_QUOTED_VALUE ||
        parser.state === State.SINGLE_QUOTED_VALUE
    ) {
        ctx.expecting = 'value'
        if (parser.state === State.DOUBLE_QUOTED_VALUE) ctx.quoteChar = '"'
        else if (parser.state === State.SINGLE_QUOTED_VALUE) ctx.quoteChar = "'"
    } else if (parser.state === State.EXPECT_BOOL_OP) {
        ctx.expecting = 'boolOp'
    } else if (parser.state === State.EXPECT_NOT_TARGET) {
        ctx.expecting = 'column'
    } else if (parser.state === State.EXPECT_IN_KEYWORD) {
        ctx.expecting = 'none'
    }

    return ctx
}

// ── Panel Positioning ──

function updatePanelPosition(ctx) {
    const ta = textareaRef.value
    if (!ta || !ctx) return

    const range = getInsertRange(ctx, ta.value)
    const textBeforeToken = ta.value.substring(0, range.start)

    const mirror = document.createElement('div')
    const style = getComputedStyle(ta)

    mirror.style.position = 'absolute'
    mirror.style.visibility = 'hidden'
    mirror.style.whiteSpace = 'pre-wrap'
    mirror.style.wordWrap = 'break-word'
    mirror.style.overflowWrap = 'break-word'
    mirror.style.width = style.width
    mirror.style.fontFamily = style.fontFamily
    mirror.style.fontSize = style.fontSize
    mirror.style.lineHeight = style.lineHeight
    mirror.style.padding = style.padding
    mirror.style.border = style.border
    mirror.style.boxSizing = style.boxSizing
    mirror.style.letterSpacing = style.letterSpacing
    mirror.style.tabSize = style.tabSize

    const textNode = document.createTextNode(textBeforeToken)
    const span = document.createElement('span')
    span.textContent = '|'

    mirror.appendChild(textNode)
    mirror.appendChild(span)
    document.body.appendChild(mirror)

    try {
        const spanRect = span.getBoundingClientRect()
        const mirrorRect = mirror.getBoundingClientRect()
        const taRect = ta.getBoundingClientRect()
        panelLeft.value = taRect.left + (spanRect.left - mirrorRect.left) - ta.scrollLeft
        panelTop.value = taRect.bottom + 4
    } finally {
        document.body.removeChild(mirror)
    }
}

// ── Event Handlers ──

function triggerSuggestions() {
    const ta = textareaRef.value
    if (!ta) return
    const textBeforeCursor = ta.value.substring(0, ta.selectionStart)
    const ctx = buildContext(textBeforeCursor)
    updateSuggestions(ctx)
    nextTick(() => {
        updatePanelPosition(ctx)
    })
}

function onCursorMove() {
    activated.value = true
    nextTick(() => {
        triggerSuggestions()
    })
}

function onInput(e) {
    activated.value = true
    const value = e.target.value
    emit('update:modelValue', value)
    if (composing.value) return
    nextTick(() => {
        autoResize()
        triggerSuggestions()
    })
}

function onCompositionEnd(e) {
    composing.value = false
    const value = e.target.value
    emit('update:modelValue', value)
    nextTick(() => {
        triggerSuggestions()
    })
}

function onKeydown(e) {
    if (suggestions.value.length > 0) {
        if (e.key === 'ArrowUp') {
            e.preventDefault()
            navigateUp()
            return
        }
        if (e.key === 'ArrowDown') {
            e.preventDefault()
            navigateDown()
            return
        }
        if (e.key === 'PageUp') {
            e.preventDefault()
            selectedIndex.value = 0
            return
        }
        if (e.key === 'PageDown') {
            e.preventDefault()
            selectedIndex.value = suggestions.value.length - 1
            return
        }
        if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
            e.preventDefault()
            acceptSuggestion(selectedIndex.value)
            return
        }
    }

    if (e.key === 'Escape') {
        e.preventDefault()
        activated.value = false
        return
    }

    if (e.key === 'Tab') {
        e.preventDefault()
        if (!activated.value) {
            activated.value = true
            triggerSuggestions()
        }
        return
    }

    if (e.key === 'Home') {
        e.preventDefault()
        const ta = textareaRef.value
        if (ta) {
            ta.selectionStart = 0
            if (!e.shiftKey) ta.selectionEnd = 0
        }
        nextTick(() => {
            triggerSuggestions()
        })
        return
    }

    if (e.key === 'End') {
        e.preventDefault()
        const ta = textareaRef.value
        if (ta) {
            const len = ta.value.length
            ta.selectionEnd = len
            if (!e.shiftKey) ta.selectionStart = len
        }
        nextTick(() => {
            triggerSuggestions()
        })
        return
    }

    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        nextTick(() => {
            triggerSuggestions()
        })
        return
    }

    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault()
        emit('submit')
        return
    }
    if (e.shiftKey && e.key === 'Enter') {
        e.preventDefault()
        emit('submit')
        return
    }
}

function acceptSuggestion(index) {
    const suggestion = selectSuggestion(index)
    if (!suggestion) return

    const ta = textareaRef.value
    if (!ta) return

    const currentValue = ta.value
    const cursorPos = ta.selectionStart
    const selectionEnd = ta.selectionEnd
    const textBeforeCursor = currentValue.substring(0, cursorPos)

    const ctx = lastContext.value || buildContext(textBeforeCursor)
    const range = getInsertRange(ctx, currentValue)

    // Extend range to cover any selected text
    if (selectionEnd > range.end) {
        range.end = selectionEnd
    }
    let insertText = suggestion.insertText

    if (!suggestion.cursorOffset && !insertText.endsWith(' ')) {
        const charAfter = currentValue[range.end] || ''
        if (charAfter === ' ') {
            // Space already exists after the token — skip over it
            range.end += 1
            insertText += ' '
        } else {
            insertText += ' '
        }
    }

    ta.focus()
    ta.selectionStart = range.start
    ta.selectionEnd = range.end

    // Use InputEvent to replace selected text — preserves undo history
    // in browsers that support getTargetRanges-based undo.
    const inputEvent = new InputEvent('beforeinput', {
        inputType: 'insertText',
        data: insertText,
        bubbles: true,
        cancelable: true,
    })
    const cancelled = !ta.dispatchEvent(inputEvent)
    if (!cancelled) {
        const before = ta.value.substring(0, range.start)
        const after = ta.value.substring(range.end)
        ta.value = before + insertText + after
        ta.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: insertText, bubbles: true }))
    }

    let newCursorPos = range.start + insertText.length
    if (suggestion.cursorOffset) {
        newCursorPos += suggestion.cursorOffset
        ta.selectionStart = newCursorPos
        ta.selectionEnd = newCursorPos
    }
    const newValue = ta.value

    const newTextBeforeCursor = newValue.substring(0, newCursorPos)
    const nextCtx = buildContext(newTextBeforeCursor)
    updateSuggestions(nextCtx)

    emit('update:modelValue', newValue)

    nextTick(() => {
        autoResize()
        updatePanelPosition(nextCtx)
    })
}

function onSuggestionSelect(index) {
    acceptSuggestion(index)
    textareaRef.value?.focus()
}

function onScroll() {
    const ta = textareaRef.value
    const hl = highlightRef.value
    if (ta && hl) {
        hl.scrollTop = ta.scrollTop
        hl.scrollLeft = ta.scrollLeft
    }
}

function onFocus() {
    focused.value = true
}

function onBlur() {
    focused.value = false
    activated.value = false
}

function autoResize() {
    const ta = textareaRef.value
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = ta.scrollHeight + 'px'
}

// ── Scroll into view for selected suggestion ──

watch(activated, (val) => {
    if (!val) {
        valueCache.value = {}
    }
})

watch(selectedIndex, async (idx) => {
    await nextTick()
    const el = itemRefs.value[idx]
    if (el) {
        el.scrollIntoView({ block: 'nearest' })
    }
})

watch(
    () => props.modelValue,
    () => {
        nextTick(autoResize)
    },
)

onMounted(() => {
    autoResize()
    if (props.autofocus) {
        nextTick(() => {
            textareaRef.value?.focus()
        })
    }
})

onBeforeUnmount(() => {
    activated.value = false
})

// ── Public API ──

function focus() {
    textareaRef.value?.focus()
}

function blur() {
    textareaRef.value?.blur()
}

function getQueryStatus() {
    const value = text.value
    if (!value) return { valid: true, message: 'Empty query' }
    const parser = new Parser()
    try {
        parser.parse(value, false, false)
    } catch (e) {
        return { valid: false, message: e.message || 'Parse error' }
    }
    if (parser.state === State.ERROR) {
        return { valid: false, message: parser.errorText || 'Parse error' }
    }
    if (parser.state === State.EXPECT_BOOL_OP) {
        return { valid: true, message: 'Valid query' }
    }
    return { valid: false, message: 'Incomplete query' }
}

defineExpose({ focus, blur, getQueryStatus })
</script>

<style scoped>
.flyql-editor {
    position: relative;
    background: var(--flyql-bg);
    border: 1px solid var(--flyql-border);
    border-radius: 8px;
    transition: border-color 0.15s;
}

.flyql-editor--focused {
    border-color: var(--flyql-border-focus);
}

.flyql-editor__icon {
    position: absolute;
    left: 10px;
    top: 9px;
    font-size: 13px;
    color: var(--flyql-placeholder-color);
    pointer-events: none;
    z-index: 1;
}

.flyql-editor__container {
    position: relative;
}

.flyql-editor__highlight,
.flyql-editor__input {
    font-family: var(--flyql-code-font-family);
    font-size: var(--flyql-font-size);
    line-height: 18px;
    padding: 6px 8px 6px 32px;
    margin: 0;
    white-space: pre-wrap;
    word-wrap: break-word;
    overflow-wrap: break-word;
    border: none;
    outline: none;
    box-sizing: border-box;
    width: 100%;
}

.flyql-editor__highlight {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    pointer-events: none;
    overflow: hidden;
    color: var(--flyql-text);
    background: transparent;
}

.flyql-editor__input {
    position: relative;
    display: block;
    resize: none;
    overflow: hidden;
    background: transparent;
    color: transparent;
    caret-color: var(--flyql-text);
}

.flyql-editor__input::placeholder {
    color: var(--flyql-placeholder-color);
}
</style>

<style>
/* Suggestion panel (unscoped — teleported to body) */
.flyql-panel {
    position: fixed;
    z-index: 100;
    width: 600px;
    min-height: 200px;
    max-height: 400px;
    display: flex;
    flex-direction: column;
    background: var(--flyql-dropdown-bg);
    border: 1px solid var(--flyql-dropdown-border);
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    font-family: var(--flyql-font-family);
    font-size: var(--flyql-font-size);
    overflow: hidden;
}

.flyql-panel__header {
    padding: 6px 6px 6px 10px;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.3px;
    color: var(--flyql-text);
    opacity: 0.6;
    flex-shrink: 0;
}

.flyql-panel__state {
    font-weight: 400;
    font-style: italic;
}

.flyql-panel__clear {
    float: right;
    background: none;
    border: none;
    color: var(--flyql-text);
    opacity: 0.5;
    font-size: 11px;
    line-height: 1;
    padding: 0;
    cursor: pointer;
}

.flyql-panel__clear:hover {
    opacity: 1;
}

.flyql-panel__body {
    flex: 1;
    overflow-y: auto;
    min-height: 0;
}

.flyql-panel__loading {
    padding: 2px 10px;
    display: flex;
}

.flyql-panel__spinner {
    display: inline-block;
    width: 14px;
    height: 14px;
    border: 2px solid var(--flyql-border);
    border-top-color: var(--flyql-key-color);
    border-radius: 50%;
    animation: flyql-spin 0.6s linear infinite;
}

@keyframes flyql-spin {
    to {
        transform: rotate(360deg);
    }
}

.flyql-panel__empty {
    padding: 10px;
    color: var(--flyql-placeholder-color);
    font-style: italic;
}

.flyql-panel__message {
    padding: 10px;
    color: var(--flyql-placeholder-color);
    font-style: italic;
}

.flyql-panel__header--error {
    color: var(--flyql-error-color);
    opacity: 1;
}

.flyql-panel__debug {
    font-family: var(--flyql-code-font-family);
    font-size: 10px;
    opacity: 0.4;
    border-bottom: 1px solid var(--flyql-dropdown-border);
}

.flyql-panel__list {
    list-style: none;
    margin: 0;
    padding: 2px 0;
}

.flyql-panel__item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 4px 10px;
    cursor: pointer;
    white-space: nowrap;
}

.flyql-panel__item:hover {
    background: var(--flyql-dropdown-item-hover);
}

.flyql-panel__item--active {
    background: var(--flyql-dropdown-item-active);
}

.flyql-panel__badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 18px;
    font-size: 10px;
    font-weight: 600;
    border-radius: 3px;
    flex-shrink: 0;
}

.flyql-panel__badge--column {
    background: var(--flyql-key-color);
    color: #fff;
}

.flyql-panel__badge--operator {
    background: var(--flyql-operator-color);
    color: #fff;
}

.flyql-panel__badge--value {
    background: var(--flyql-value-color);
    color: #fff;
}

.flyql-panel__badge--boolOp {
    background: var(--flyql-operator-color);
    color: #fff;
}

.flyql-panel__label {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--flyql-text);
    font-family: var(--flyql-code-font-family);
}

.flyql-panel__match {
    color: var(--flyql-key-color);
    font-weight: 600;
}

.flyql-panel__detail {
    color: var(--flyql-placeholder-color);
    font-size: 11px;
    margin-left: auto;
    padding-left: 8px;
}

.flyql-panel__detail--boolOp {
    color: var(--flyql-operator-color);
}

/* Token highlighting classes (unscoped so they apply inside v-html) */
.flyql-key {
    color: var(--flyql-key-color);
}

.flyql-operator {
    color: var(--flyql-operator-color);
}

.flyql-value,
.flyql-string {
    color: var(--flyql-value-color);
}

.flyql-number {
    color: var(--flyql-number-color);
}

.flyql-error {
    color: var(--flyql-error-color);
    text-decoration: wavy underline;
}

/* Theme variables */
:root {
    --flyql-bg: #ffffff;
    --flyql-text: #1e1e1e;
    --flyql-border: #d4d4d4;
    --flyql-border-focus: #075985;
    --flyql-placeholder-color: #a0a0a0;

    --flyql-key-color: #0451a5;
    --flyql-operator-color: #0089ab;
    --flyql-value-color: #8b0000;
    --flyql-number-color: #098658;
    --flyql-error-color: #ff0000;

    --flyql-dropdown-bg: #ffffff;
    --flyql-dropdown-border: #d4d4d4;
    --flyql-dropdown-item-hover: #f7f7f7;
    --flyql-dropdown-item-active: #eef4fb;

    --flyql-font-family: 'Open Sans', sans-serif;
    --flyql-code-font-family: monospace;
    --flyql-font-size: 13px;
}

.dark {
    --flyql-bg: #1e1e1e;
    --flyql-text: #d4d4d4;
    --flyql-border: #525252;
    --flyql-border-focus: #0369a1;
    --flyql-placeholder-color: #676767;

    --flyql-key-color: #6e9fff;
    --flyql-operator-color: #0089ab;
    --flyql-value-color: #ce9178;
    --flyql-number-color: #b5cea8;
    --flyql-error-color: #f48771;

    --flyql-dropdown-bg: #252526;
    --flyql-dropdown-border: #454545;
    --flyql-dropdown-item-hover: #2e3132;
    --flyql-dropdown-item-active: #1a2a3a;
}
</style>
