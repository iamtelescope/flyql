<template>
    <div class="flyql-columns" :class="{ 'flyql-columns--focused': focused, 'flyql-dark': dark }" ref="editorRoot">
        <span class="flyql-columns__icon">
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
                    <rect x="3" y="3" width="7" height="7" />
                    <rect x="14" y="3" width="7" height="7" />
                    <rect x="3" y="14" width="7" height="7" />
                    <rect x="14" y="14" width="7" height="7" />
                </svg>
            </slot>
        </span>
        <div class="flyql-columns__container" ref="containerRef">
            <pre class="flyql-columns__highlight" ref="highlightRef" v-html="highlightedHtml" aria-hidden="true"></pre>
            <textarea
                class="flyql-columns__input"
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
                aria-label="FlyQL columns expression input"
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
                        >state={{ context.state }} expecting={{ context.expecting }} col={{ context.column }} mod={{
                            context.transformer
                        }}</span
                    >
                    <span v-else>no context</span>
                </div>
                <div class="flyql-panel__header">
                    Suggestions: <span class="flyql-panel__state">{{ stateLabel }}</span>
                    <span
                        v-if="isLoading && suggestions.length > 0"
                        class="flyql-panel__spinner flyql-panel__spinner--inline"
                    ></span>
                </div>
                <div class="flyql-panel__body" aria-live="polite">
                    <div v-if="isLoading && suggestions.length === 0" class="flyql-panel__loading">
                        <slot name="loading">
                            <span class="flyql-panel__spinner"></span>
                        </slot>
                    </div>
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
                            <span v-if="item.detail" class="flyql-panel__detail">{{ item.detail }}</span>
                        </li>
                    </ul>
                    <div v-if="!isLoading && suggestions.length === 0 && message" class="flyql-panel__message">
                        {{ message }}
                    </div>
                    <div v-if="!isLoading && suggestions.length === 0 && !message" class="flyql-panel__empty">
                        No suggestions
                    </div>
                </div>
                <div v-if="suggestions.length > 0" class="flyql-panel__spacer"></div>
            </div>
        </Teleport>
    </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { ColumnsEngine } from './columns-engine.js'
import './flyql.css'

const props = defineProps({
    modelValue: { type: String, default: '' },
    columns: { type: Object, default: () => ({}) },
    capabilities: { type: Object, default: null },
    onKeyDiscovery: { type: Function, default: null },
    placeholder: { type: String, default: '' },
    autofocus: { type: Boolean, default: false },
    debug: { type: Boolean, default: false },
    dark: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue', 'update:parsed', 'submit', 'parse-error', 'focus', 'blur'])

const isLoading = ref(false)

const engineOpts = {
    onKeyDiscovery: props.onKeyDiscovery,
    onLoadingChange: (loading) => {
        isLoading.value = loading
    },
}
if (props.capabilities) {
    engineOpts.capabilities = props.capabilities
}
const engine = new ColumnsEngine(props.columns, engineOpts)

const instanceId = 'flyql-cols-' + Math.random().toString(36).substring(2, 8)

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

const suggestions = ref([])
const selectedIndex = ref(0)
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

function syncFromEngine() {
    suggestions.value = engine.suggestions
    selectedIndex.value = engine.state.selectedIndex
    message.value = engine.message
    stateLabel.value = engine.getStateLabel()
    context.value = engine.context

    const currentError = engine.getParseError()
    if (currentError !== lastParseError.value) {
        lastParseError.value = currentError
        emit('parse-error', currentError)
    }
}

function emitParsed() {
    const parsed = engine.getParsedColumns()
    emit('update:parsed', parsed)
}

const highlightedHtml = computed(() => {
    return engine.getHighlightTokens(props.modelValue)
})

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

async function triggerSuggestions() {
    const ta = textareaRef.value
    if (!ta) return
    engine.setQuery(ta.value)
    engine.setCursorPosition(ta.selectionStart)
    try {
        const { ctx, seq } = await engine.updateSuggestions()
        if (engine.isStale(seq)) return
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
    setTimeout(() => {
        triggerSuggestions()
    }, 0)
}

function onInput(e) {
    activated.value = true
    const value = e.target.value
    emit('update:modelValue', value)
    if (engine.state.composing) return
    nextTick(() => {
        autoResize()
        triggerSuggestions()
        emitParsed()
    })
}

function onCompositionEnd(e) {
    engine.state.composing = false
    const value = e.target.value
    emit('update:modelValue', value)
    nextTick(() => {
        triggerSuggestions()
        emitParsed()
    })
}

function onPaste() {
    activated.value = true
    nextTick(() => {
        autoResize()
        triggerSuggestions()
        emitParsed()
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

    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault()
        emit('submit')
        return
    }

    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const ta = textareaRef.value
        if (ta) {
            const pos = ta.selectionStart
            const len = ta.value.length
            const newPos = e.key === 'ArrowRight' ? Math.min(pos + 1, len) : Math.max(pos - 1, 0)
            engine.setQuery(ta.value)
            engine.setCursorPosition(newPos)
            engine
                .updateSuggestions()
                .then(({ ctx, seq }) => {
                    if (engine.isStale(seq)) return
                    syncFromEngine()
                    nextTick(() => {
                        updatePanelPosition(ctx)
                    })
                })
                .catch(() => {
                    syncFromEngine()
                })
        }
        return
    }
}

function acceptSuggestion(index) {
    const suggestion = engine.selectSuggestion(index)
    if (!suggestion) return

    const ta = textareaRef.value
    if (!ta) return

    const currentValue = ta.value
    // Use engine's tracked cursor — ta.selectionStart can be stale after Vue re-renders
    const cursorPos = engine.state.cursorPosition
    const ctx = engine.buildContext(currentValue.substring(0, cursorPos), currentValue)
    const range = engine.getInsertRange(ctx, currentValue, suggestion)
    const insertText = suggestion.insertText

    const before = currentValue.substring(0, range.start)
    const after = currentValue.substring(range.end)
    const newValue = before + insertText + after
    let newCursorPos = range.start + insertText.length
    if (suggestion.cursorOffset) {
        newCursorPos += suggestion.cursorOffset
    }

    // Update engine state first
    engine.setQuery(newValue)
    engine.setCursorPosition(newCursorPos)

    // Update DOM and emit
    ta.value = newValue
    ta.selectionStart = newCursorPos
    ta.selectionEnd = newCursorPos
    ta.focus()
    emit('update:modelValue', newValue)
    emitParsed()

    // Restore cursor after Vue re-render, then update suggestions
    nextTick(() => {
        const t = textareaRef.value
        if (t) {
            t.selectionStart = newCursorPos
            t.selectionEnd = newCursorPos
        }
        autoResize()
        engine
            .updateSuggestions()
            .then(({ ctx: nextCtx, seq }) => {
                if (engine.isStale(seq)) return
                syncFromEngine()
                nextTick(() => {
                    updatePanelPosition(nextCtx)
                })
            })
            .catch(() => {
                syncFromEngine()
            })
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
    activated.value = true
    triggerSuggestions()
    emit('focus')
}

function onBlur() {
    focused.value = false
    activated.value = false
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
        case 'transformer':
            return 'T'
        case 'delimiter':
            return 'S'
        default:
            return '?'
    }
}

watch(activated, (val) => {
    if (!val) {
        engine.state.setActivated(false)
        engine.clearKeyCache()
    }
})

watch(
    () => props.onKeyDiscovery,
    (newFn) => {
        engine.onKeyDiscovery = newFn || null
    },
)

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
        nextTick(() => {
            autoResize()
            emitParsed()
        })
    },
)

watch(
    () => props.columns,
    (newColumns) => {
        engine.columns = newColumns || {}
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

function getParsedColumns() {
    engine.setQuery(props.modelValue)
    return engine.getParsedColumns()
}

defineExpose({ focus, blur, getQueryStatus, getParsedColumns })
</script>

<style scoped>
.flyql-columns {
    position: relative;
    background: var(--flyql-bg);
    border: 1px solid var(--flyql-border);
    border-radius: 8px;
    transition: border-color 0.15s;
}

.flyql-columns--focused {
    border-color: var(--flyql-border-focus);
}

.flyql-columns__icon {
    position: absolute;
    left: 10px;
    top: 9px;
    font-size: 13px;
    color: var(--flyql-placeholder-color);
    pointer-events: none;
    z-index: 1;
}

.flyql-columns__container {
    position: relative;
}

.flyql-columns__highlight,
.flyql-columns__input {
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

.flyql-columns__highlight {
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

.flyql-columns__input {
    position: relative;
    display: block;
    resize: none;
    overflow: hidden;
    background: transparent;
    color: transparent;
    caret-color: var(--flyql-text);
}

.flyql-columns__input::placeholder {
    color: var(--flyql-placeholder-color);
}
</style>

<style>
/* Columns highlighting classes (unscoped so they apply inside v-html) */
.flyql-col-column {
    color: var(--flyql-key-color);
}

.flyql-col-operator {
    color: var(--flyql-operator-color);
}

.flyql-col-transformer {
    color: var(--flyql-transformer-color);
}

.flyql-dark .flyql-col-transformer {
    color: var(--flyql-transformer-color);
}

.flyql-col-argument {
    color: var(--flyql-value-color);
}

.flyql-col-alias {
    color: var(--flyql-operator-color);
    font-style: italic;
}

.flyql-col-error {
    color: var(--flyql-error-color);
    text-decoration: wavy underline;
}

/* Columns panel badge styles */
.flyql-panel__badge--transformer {
    background: var(--flyql-transformer-color);
    color: #fff;
}

.flyql-panel__badge--delimiter {
    background: var(--flyql-placeholder-color);
    color: #fff;
}
</style>
