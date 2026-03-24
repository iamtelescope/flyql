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
            <div v-if="focused && activated" class="flyql-panel" @mousedown.prevent :style="panelStyle">
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
                <div class="flyql-panel__header">
                    Suggestions: <span class="flyql-panel__state">{{ stateLabel }}</span>
                </div>
                <div class="flyql-panel__body" aria-live="polite">
                    <div v-if="isLoading" class="flyql-panel__loading">
                        <slot name="loading">
                            <span class="flyql-panel__spinner"></span>
                        </slot>
                    </div>
                    <ul v-else-if="suggestions.length > 0" ref="listRef" class="flyql-panel__list" role="listbox">
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
                    <div v-else-if="!isLoading && message" class="flyql-panel__message">{{ message }}</div>
                    <div v-else-if="!isLoading" class="flyql-panel__empty">No suggestions</div>
                </div>
            </div>
        </Teleport>
    </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { EditorEngine } from './engine.js'

// ── Props & Emits ──

const props = defineProps({
    modelValue: { type: String, default: '' },
    columns: { type: Object, default: () => ({}) },
    onAutocomplete: { type: Function, default: null },
    onKeyDiscovery: { type: Function, default: null },
    placeholder: { type: String, default: '' },
    autofocus: { type: Boolean, default: false },
    debug: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue', 'submit', 'parse-error', 'focus', 'blur'])

// ── Engine ──

const engine = new EditorEngine(props.columns, {
    onAutocomplete: props.onAutocomplete,
    onKeyDiscovery: props.onKeyDiscovery,
    onLoadingChange: (loading) => {
        isLoading.value = loading
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
const panelLeft = ref(0)
const panelTop = ref(0)

// ── Reactive state read from engine ──

const suggestions = ref([])
const selectedIndex = ref(0)
const isLoading = ref(false)
const message = ref('')
const stateLabel = ref('')
const context = ref(null)
const lastParseError = ref(null)

const panelStyle = computed(() => ({
    left: panelLeft.value + 'px',
    top: panelTop.value + 'px',
}))

function highlightMatch(label) {
    return engine.highlightMatch(label)
}

// ── Sync engine state to Vue refs ──

function syncFromEngine() {
    suggestions.value = engine.suggestions
    selectedIndex.value = engine.state.selectedIndex
    isLoading.value = engine.isLoading
    message.value = engine.message
    stateLabel.value = engine.getStateLabel()
    context.value = engine.context

    // Check for parse-error transitions
    const currentError = engine.getParseError()
    if (currentError !== lastParseError.value) {
        lastParseError.value = currentError
        emit('parse-error', currentError)
    }
}

// ── Highlighting ──

const highlightedHtml = computed(() => {
    return engine.getHighlightTokens(props.modelValue)
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
        panelLeft.value = taRect.left + (spanRect.left - mirrorRect.left) - ta.scrollLeft
        const panelHeight = 400
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
    try {
        const ctx = await engine.updateSuggestions()
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
        if (e.key === 'PageUp') {
            e.preventDefault()
            engine.state.selectedIndex = 0
            selectedIndex.value = 0
            return
        }
        if (e.key === 'PageDown') {
            e.preventDefault()
            engine.state.selectedIndex = suggestions.value.length - 1
            selectedIndex.value = suggestions.value.length - 1
            return
        }
        if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
            e.preventDefault()
            acceptSuggestion(selectedIndex.value)
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
        if (activated.value && suggestions.value.length > 0) {
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

    if (!suggestion.cursorOffset && !insertText.endsWith(' ') && !insertText.endsWith('.')) {
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

// ── Watchers ──

watch(activated, (val) => {
    engine.state.setActivated(val)
    if (!val) {
        engine.clearValueCache()
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
        engine.columns = newColumns || {}
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

<style>
/* Suggestion panel (unscoped — teleported to body) */
.flyql-panel {
    position: fixed;
    z-index: 100;
    max-width: 600px;
    min-width: 300px;
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

.flyql-dark {
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
