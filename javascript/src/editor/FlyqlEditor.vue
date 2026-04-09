<template>
    <div class="flyql-editor" :class="{ 'flyql-editor--focused': focused, 'flyql-dark': dark }" ref="editorRoot">
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
                @paste="onPaste"
                @compositionstart="engine.state.composing = true"
                @compositionend="onCompositionEnd"
                spellcheck="false"
                autocomplete="off"
                autocorrect="off"
                autocapitalize="off"
                aria-label="FlyQL query input"
                role="combobox"
                :aria-expanded="focused && activated && suggestions.length > 0"
                :aria-activedescendant="
                    focused && activated && suggestions.length > 0
                        ? instanceId + '-suggestion-' + selectedIndex
                        : undefined
                "
            ></textarea>
        </div>
        <!-- Suggestion panel -->
        <Teleport to="body">
            <div
                v-if="focused && activated"
                ref="panelRef"
                class="flyql-panel"
                :class="{ 'flyql-dark': dark }"
                @mousedown.prevent
                :style="panelStyle"
            >
                <div v-if="debug" class="flyql-panel__header flyql-panel__debug">
                    <span v-if="context"
                        >state={{ context.state }} expecting={{ context.expecting }} key={{ context.key }} value={{
                            context.value
                        }}
                        op={{ context.keyValueOperator }}</span
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
                <div class="flyql-panel__loader" :class="{ 'flyql-panel__loader--active': isLoading }"></div>
                <div
                    class="flyql-panel__header"
                    :class="{ 'flyql-panel__header--with-toggle': isValueContext && activated }"
                >
                    <span :class="{ 'flyql-panel__header-label': isValueContext && activated }">Suggestions</span>
                    <span v-if="isValueContext && activated" class="flyql-panel__toggle">
                        <span class="flyql-panel__toggle-hint"
                            ><span class="flyql-panel__toggle-hint-icon">⇥</span> tab to switch</span
                        >
                        <span class="flyql-panel__toggle-group" role="tablist">
                            <button
                                role="tab"
                                :aria-selected="activeTab === 'values'"
                                class="flyql-panel__toggle-btn flyql-panel__toggle-btn--values"
                                :class="{ 'flyql-panel__toggle-btn--active': activeTab === 'values' }"
                                @mousedown.prevent="switchTab('values')"
                            >
                                Values
                            </button>
                            <button
                                role="tab"
                                :aria-selected="activeTab === 'columns'"
                                class="flyql-panel__toggle-btn flyql-panel__toggle-btn--columns"
                                :class="{ 'flyql-panel__toggle-btn--active': activeTab === 'columns' }"
                                @mousedown.prevent="switchTab('columns')"
                            >
                                Columns
                            </button>
                        </span>
                    </span>
                </div>
                <div class="flyql-panel__body" aria-live="polite">
                    <ul v-if="suggestions.length > 0" ref="listRef" class="flyql-panel__list" role="listbox">
                        <li
                            v-for="(item, index) in suggestions"
                            :key="index"
                            :id="instanceId + '-suggestion-' + index"
                            :ref="(el) => setItemRef(el, index)"
                            class="flyql-panel__item"
                            :class="{ 'flyql-panel__item--active': index === selectedIndex }"
                            :aria-selected="index === selectedIndex"
                            role="option"
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
                    <div v-if="isLoading && suggestions.length === 0 && !message" class="flyql-panel__skeleton">
                        <div v-for="n in 6" :key="n" class="flyql-panel__skeleton-row">
                            <span class="flyql-panel__skeleton-badge"></span>
                            <span
                                class="flyql-panel__skeleton-text"
                                :style="{ width: 40 + ((n * 17) % 45) + '%' }"
                            ></span>
                        </div>
                    </div>
                    <div v-if="!isLoading && suggestions.length === 0 && message" class="flyql-panel__message">
                        {{ message }}
                    </div>
                    <div v-if="!isLoading && suggestions.length === 0 && !message" class="flyql-panel__empty">
                        No suggestions
                    </div>
                </div>
                <div
                    v-if="diagnostics.length > 0"
                    class="flyql-panel__diagnostics"
                    @mousedown.stop="panelInteracting = true"
                    @mouseup="panelInteracting = false"
                >
                    <div class="flyql-panel__header">Diagnostics</div>
                    <div
                        v-for="(diag, idx) in diagnostics"
                        :key="idx"
                        class="flyql-panel__diagnostic-item"
                        :class="'flyql-panel__diagnostic-item--' + diag.severity"
                        @mouseenter="hoveredDiagIndex = idx"
                        @mouseleave="hoveredDiagIndex = -1"
                    >
                        <span
                            class="flyql-panel__diagnostic-bullet"
                            :class="'flyql-panel__diagnostic-bullet--' + diag.severity"
                        ></span>
                        <span class="flyql-panel__diagnostic-msg">{{ diag.message }}</span>
                    </div>
                </div>
                <div class="flyql-panel__footer">
                    <span v-if="context && context.key && suggestionType === 'value'" class="flyql-panel__footer-col">{{
                        context.key
                    }}</span>
                    <span class="flyql-panel__footer-label">{{ stateLabel }}</span>
                    <span
                        v-if="suggestionType === 'value' && suggestions.length > 0 && incomplete"
                        class="flyql-panel__footer-status"
                        >partial results</span
                    >
                </div>
            </div>
        </Teleport>
    </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { EditorEngine } from './engine.js'
import './flyql.css'

// ── Props & Emits ──

const props = defineProps({
    modelValue: { type: String, default: '' },
    columns: { type: Object, default: null },
    onAutocomplete: { type: Function, default: null },
    onKeyDiscovery: { type: Function, default: null },
    placeholder: { type: String, default: '' },
    autofocus: { type: Boolean, default: false },
    debug: { type: Boolean, default: false },
    debounceMs: { type: Number, default: 150 },
    dark: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue', 'submit', 'parse-error', 'focus', 'blur', 'diagnostics'])

// ── Engine ──

const engine = new EditorEngine(props.columns, {
    onAutocomplete: props.onAutocomplete,
    onKeyDiscovery: props.onKeyDiscovery,
    debounceMs: props.debounceMs,
    onLoadingChange: (loading) => {
        isLoading.value = loading
        stateLabel.value = engine.getStateLabel()
    },
})

// ── Instance ID for unique ARIA references ──

const instanceId = 'flyql-' + Math.random().toString(36).substring(2, 8)

// ── Refs ──

const textareaRef = ref(null)
const highlightRef = ref(null)
const containerRef = ref(null)
const editorRoot = ref(null)
const listRef = ref(null)
const focused = ref(false)
const activated = ref(false)
const panelRef = ref(null)
const panelLeft = ref(0)
const panelTop = ref(0)
let panelInteracting = false

// ── Reactive state read from engine ──

const suggestions = ref([])
const selectedIndex = ref(0)
const isLoading = ref(false)
const incomplete = ref(false)
const suggestionType = ref('')
const message = ref('')
const stateLabel = ref('')
const context = ref(null)
const activeTab = ref('values')
const isValueContext = computed(() => context.value?.expecting === 'value')
const diagnostics = ref([])
const hoveredDiagIndex = ref(-1)
const lastParseError = ref(null)

const panelStyle = computed(() => ({
    left: panelLeft.value + 'px',
    top: panelTop.value + 'px',
}))

function highlightMatch(label) {
    return engine.highlightMatch(label)
}

function filterColumnValueDiagnostics() {
    const ta = textareaRef.value
    if (!ta) return
    const ctx0 = engine.buildContext(ta.value.substring(0, ta.selectionStart))
    if (ctx0 && ctx0.expecting === 'value') {
        const columnValueCodes = new Set(['unknown_column_value', 'invalid_column_value'])
        if (engine.activeTab === 'values') {
            engine.diagnostics = engine.diagnostics.filter((d) => !columnValueCodes.has(d.code))
        } else {
            const colNames = Object.keys(engine.columns.columns).filter(
                (n) => engine.columns.columns[n]?.suggest !== false,
            )
            engine.diagnostics = engine.diagnostics.filter((d) => {
                if (!columnValueCodes.has(d.code)) return true
                const val = (ctx0.value || '').toLowerCase()
                if (!val) return false
                return !colNames.some((n) => n.toLowerCase().startsWith(val))
            })
        }
    }
}

function switchTab(tab) {
    engine.setTab(tab)
    engine.getDiagnostics()
    filterColumnValueDiagnostics()
    syncFromEngine()
}

// ── Sync engine state to Vue refs ──

function syncFromEngine() {
    suggestions.value = engine.suggestions
    selectedIndex.value = engine.state.selectedIndex
    isLoading.value = engine.isLoading
    incomplete.value = engine.incomplete
    suggestionType.value = engine.suggestionType
    message.value = engine.message
    stateLabel.value = engine.getStateLabel()
    context.value = engine.context
    activeTab.value = engine.activeTab
    diagnostics.value = engine.diagnostics

    // Check for parse-error transitions
    const currentError = engine.getParseError()
    if (currentError !== lastParseError.value) {
        lastParseError.value = currentError
        emit('parse-error', currentError)
    }
}

// ── Highlighting ──

const highlightedHtml = computed(() => {
    return engine.getHighlightTokens(props.modelValue, diagnostics.value, hoveredDiagIndex.value)
})

// ── Panel Positioning ──

function updatePanelPosition(ctx) {
    const ta = textareaRef.value
    if (!ta || !ctx) return

    const range = engine.getInsertRange(ctx, ta.value)
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
        const cursorLeft = taRect.left + (spanRect.left - mirrorRect.left) - ta.scrollLeft
        const panelWidth = panelRef.value?.offsetWidth || 600
        const viewportWidth = document.documentElement.clientWidth
        if (cursorLeft + panelWidth > viewportWidth) {
            panelLeft.value = Math.max(0, cursorLeft - panelWidth)
        } else {
            panelLeft.value = cursorLeft
        }
        const panelHeight = panelRef.value?.offsetHeight || 280
        const spaceBelow = window.innerHeight - taRect.bottom - 4
        if (spaceBelow < panelHeight && taRect.top > panelHeight) {
            panelTop.value = taRect.top - panelHeight - 4
        } else {
            panelTop.value = taRect.bottom + 4
        }
    } finally {
        document.body.removeChild(mirror)
    }
}

// ── Event Handlers ──

async function triggerSuggestions() {
    const ta = textareaRef.value
    if (!ta) return
    engine.setQuery(ta.value)
    engine.setCursorPosition(ta.selectionStart)

    // Run diagnostics — fast, sync operation
    engine.getDiagnostics()
    filterColumnValueDiagnostics()
    syncFromEngine()
    emit('diagnostics', diagnostics.value)

    try {
        const promise = engine.updateSuggestions()
        syncFromEngine()
        const ctx = await promise
        syncFromEngine()
        nextTick(() => {
            updatePanelPosition(ctx)
        })
    } catch {
        syncFromEngine()
    }
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
    if (engine.state.composing) return
    nextTick(() => {
        autoResize()
        triggerSuggestions()
    })
}

function onCompositionEnd(e) {
    engine.state.composing = false
    const value = e.target.value
    emit('update:modelValue', value)
    nextTick(() => {
        triggerSuggestions()
    })
}

function onPaste() {
    activated.value = true
    nextTick(() => {
        autoResize()
        triggerSuggestions()
    })
}

function onKeydown(e) {
    if (e.key === 'PageUp' || e.key === 'PageDown') {
        e.preventDefault()
        if (suggestions.value.length > 0) {
            const len = suggestions.value.length
            let idx = engine.state.selectedIndex
            idx = e.key === 'PageUp' ? Math.max(0, idx - 10) : Math.min(len - 1, idx + 10)
            engine.state.selectedIndex = idx
            selectedIndex.value = idx
        }
        return
    }
    if (suggestions.value.length > 0) {
        if (e.key === 'ArrowUp') {
            e.preventDefault()
            engine.navigateUp()
            selectedIndex.value = engine.state.selectedIndex
            return
        }
        if (e.key === 'ArrowDown') {
            e.preventDefault()
            engine.navigateDown()
            selectedIndex.value = engine.state.selectedIndex
            return
        }
        if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
            e.preventDefault()
            acceptSuggestion(selectedIndex.value)
            return
        }

        // When column suggestions are showing and user types an operator character,
        // accept the column and insert the operator with spaces
        if (suggestionType.value === 'column' && '=><~'.includes(e.key) && e.key.length === 1) {
            e.preventDefault()
            acceptSuggestion(selectedIndex.value)
            nextTick(() => {
                const ta = textareaRef.value
                if (ta) {
                    const pos = ta.selectionStart
                    const before = ta.value.substring(0, pos)
                    const after = ta.value.substring(pos)
                    // Remove trailing space that acceptSuggestion added, then insert ' op '
                    const trimmed = before.endsWith(' ') ? before.slice(0, -1) : before
                    ta.value = trimmed + ' ' + e.key + ' ' + after
                    const newPos = trimmed.length + 3
                    ta.selectionStart = newPos
                    ta.selectionEnd = newPos
                    ta.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: e.key, bubbles: true }))
                }
            })
            return
        }
    }

    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        e.preventDefault()
        return
    }

    if (e.key === 'Escape') {
        e.preventDefault()
        activated.value = false
        return
    }

    if (e.key === 'Tab') {
        if (activated.value && engine.context?.expecting === 'value') {
            e.preventDefault()
            engine.cycleTab()
            engine.getDiagnostics()
            filterColumnValueDiagnostics()
            syncFromEngine()
        } else if (activated.value && suggestions.value.length > 0) {
            e.preventDefault()
            acceptSuggestion(selectedIndex.value)
        } else if (!activated.value) {
            e.preventDefault()
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
        // Insert newline for multiline query support (AC #4)
        // Do not preventDefault — let the browser insert the newline naturally
        nextTick(() => {
            autoResize()
            triggerSuggestions()
        })
        return
    }
}

function acceptSuggestion(index) {
    const suggestion = engine.selectSuggestion(index)
    if (!suggestion) return

    const ta = textareaRef.value
    if (!ta) return

    const currentValue = ta.value
    const selectionEnd = ta.selectionEnd

    const ctx = engine.context || engine.buildContext(currentValue.substring(0, ta.selectionStart))
    const range = engine.getInsertRange(ctx, currentValue)

    if (selectionEnd > range.end) {
        range.end = selectionEnd
    }
    let insertText = suggestion.insertText

    // Pipe must attach directly to column — consume any preceding whitespace
    if (suggestion.type === 'transformer' && suggestion.label === '|') {
        while (range.start > 0 && currentValue[range.start - 1] === ' ') {
            range.start--
        }
    }

    if (
        !suggestion.cursorOffset &&
        !insertText.endsWith(' ') &&
        !insertText.endsWith('.') &&
        suggestion.type !== 'transformer'
    ) {
        const charAfter = currentValue[range.end] || ''
        if (charAfter === ' ') {
            range.end += 1
            insertText += ' '
        } else {
            insertText += ' '
        }
    }

    ta.focus()
    ta.selectionStart = range.start
    ta.selectionEnd = range.end

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
    }
    ta.selectionStart = newCursorPos
    ta.selectionEnd = newCursorPos
    const newValue = ta.value

    engine.setQuery(newValue)
    engine.setCursorPosition(newCursorPos)

    engine.getDiagnostics()
    syncFromEngine()
    emit('diagnostics', diagnostics.value)

    if (diagnostics.value.length > 0) {
        engine.suggestions = []
        engine.message = ''
        engine.suggestionType = ''
        syncFromEngine()
    } else {
        engine
            .updateSuggestions()
            .then((nextCtx) => {
                syncFromEngine()
                nextTick(() => {
                    updatePanelPosition(nextCtx)
                })
            })
            .catch(() => {
                syncFromEngine()
            })
    }

    emit('update:modelValue', newValue)

    nextTick(() => {
        autoResize()
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
    engine.state.setFocused(true)
    emit('focus')
}

function onBlur() {
    if (panelInteracting) return
    focused.value = false
    activated.value = false
    engine.state.setFocused(false)
    engine.state.setActivated(false)
    emit('blur')
}

function autoResize() {
    const ta = textareaRef.value
    const hl = highlightRef.value
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = ta.scrollHeight + 'px'
    if (hl) {
        hl.style.height = ta.scrollHeight + 'px'
    }
}

// ── Item refs for scroll into view ──

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
        case 'columnRef':
            return 'C'
        case 'operator':
            return 'Op'
        case 'value':
            return 'V'
        case 'boolOp':
            return 'B'
        case 'transformer':
            return 'T'
        default:
            return '?'
    }
}

// ── Watchers ──

watch(activated, (val) => {
    engine.state.setActivated(val)
    if (!val) {
        engine.clearKeyCache()
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

watch(
    () => props.columns,
    (newColumns) => {
        engine.setColumns(newColumns)
    },
)

watch(
    () => props.onAutocomplete,
    (newFn) => {
        engine.onAutocomplete = newFn || null
    },
)

watch(
    () => props.onKeyDiscovery,
    (newFn) => {
        engine.onKeyDiscovery = newFn || null
    },
)

function onWindowScroll() {
    if (focused.value && activated.value && context.value) {
        updatePanelPosition(context.value)
    }
}

onMounted(() => {
    autoResize()
    window.addEventListener('scroll', onWindowScroll, true)
    if (props.autofocus) {
        nextTick(() => {
            textareaRef.value?.focus()
        })
    }
})

onBeforeUnmount(() => {
    activated.value = false
    window.removeEventListener('scroll', onWindowScroll, true)
})

// ── Public API ──

function focus() {
    textareaRef.value?.focus()
}

function blur() {
    textareaRef.value?.blur()
}

function getQueryStatus() {
    engine.setQuery(props.modelValue)
    return engine.getQueryStatus()
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
    bottom: 0;
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
