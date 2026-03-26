<template>
    <div class="app">
        <h1>FlyQL Editor</h1>
        <p class="subtitle">Development test page</p>

        <div class="toolbar">
            <button @click="toggleDark">{{ isDark ? 'Light' : 'Dark' }} mode</button>
        </div>

        <div class="tabs">
            <button class="tab" :class="{ 'tab--active': tab === 'query' }" @click="tab = 'query'">Query</button>
            <button class="tab" :class="{ 'tab--active': tab === 'columns' }" @click="tab = 'columns'">Columns</button>
        </div>

        <!-- Query tab -->
        <template v-if="tab === 'query'">
            <div class="tab-toolbar">
                <button @click="query = ''">Clear</button>
                <button @click="query = 'level=&quot;error&quot; and service~&quot;api.*&quot;'">Sample query</button>
                <button @click="focusEditor">Focus</button>
                <button @click="checkStatus">Check status</button>
            </div>

            <div class="section">
                <FlyqlEditor
                    ref="editor"
                    v-model="query"
                    :columns="columns"
                    :on-autocomplete="onAutocomplete"
                    :on-key-discovery="onKeyDiscovery"
                    placeholder="Type a FlyQL query..."
                    :autofocus="tab === 'query'"
                    :debug="false"
                    :dark="isDark"
                    @submit="onSubmit"
                    @focus="addLog('focus')"
                    @blur="addLog('blur')"
                    @parse-error="(err) => addLog(`parse-error: ${err || '(cleared)'}`)"
                />
            </div>

            <div class="section">
                <div class="section-title">SQL Generator</div>
                <div class="generator">
                    <select v-model="dialect" class="dialect-select">
                        <option value="clickhouse">ClickHouse</option>
                        <option value="postgresql">PostgreSQL</option>
                        <option value="starrocks">StarRocks</option>
                    </select>
                    <button class="generate-btn" :disabled="!isValid || generating" @click="generate">
                        {{ generating ? 'Generating...' : 'Generate SQL' }}
                    </button>
                </div>
                <div v-if="generatedSQL" class="sql-output">
                    <pre><code class="language-sql" v-html="highlightedSQL"></code></pre>
                </div>
                <div v-if="generateError" class="sql-error">{{ generateError }}</div>
            </div>

            <div class="section">
                <div class="section-title">Model value</div>
                <div class="status" :class="statusClass">{{ query || '(empty)' }}</div>
            </div>
        </template>

        <!-- Columns tab -->
        <template v-if="tab === 'columns'">
            <div class="tab-toolbar">
                <button @click="columnsExpr = ''">Clear</button>
            </div>

            <div class="section">
                <FlyqlColumns
                    v-model="columnsExpr"
                    :columns="columns"
                    :on-key-discovery="onKeyDiscovery"
                    placeholder="message, status|upper, host as h"
                    :debug="false"
                    :dark="isDark"
                    @update:parsed="onColumnsParsed"
                    @submit="onSubmit"
                />
            </div>

            <div v-if="parsedColumns.length > 0" class="section">
                <div class="section-title">Parsed columns ({{ parsedColumns.length }})</div>
                <div class="status">{{ parsedColumnsText }}</div>
            </div>

            <div class="section">
                <div class="section-title">Model value</div>
                <div class="status">{{ columnsExpr || '(empty)' }}</div>
            </div>
        </template>

        <div class="section">
            <div class="section-title">Event log</div>
            <div class="log">
                <div v-if="log.length === 0" style="color: #888; font-style: italic">No events yet</div>
                <div v-for="(entry, i) in log" :key="i" class="log-entry">
                    <span class="log-time">{{ entry.time }}</span>
                    <span>{{ entry.text }}</span>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import { FlyqlEditor, FlyqlColumns } from '../javascript/src/editor/index.js'

const tab = ref('query')
const query = ref('')
const columnsExpr = ref('')
const parsedColumns = ref([])
const editor = ref(null)
const isDark = ref(false)
const log = ref([])
const dialect = ref('clickhouse')
const generatedSQL = ref('')
const generateError = ref('')
const generating = ref(false)

const columns = ref({})

onMounted(async () => {
    try {
        const resp = await fetch('/api/columns')
        if (resp.ok) {
            columns.value = await resp.json()
        }
    } catch (err) {
        console.error('Failed to load columns:', err)
    }
})

const isValid = computed(() => {
    if (!editor.value || !query.value) return false
    try {
        return editor.value.getQueryStatus().valid
    } catch {
        return false
    }
})

const statusClass = computed(() => {
    if (!editor.value || !query.value) return ''
    try {
        const s = editor.value.getQueryStatus()
        return s.valid ? 'status--valid' : 'status--invalid'
    } catch {
        return ''
    }
})

const highlightedSQL = computed(() => {
    if (!generatedSQL.value) return ''
    if (window.Prism) {
        return window.Prism.highlight(generatedSQL.value, window.Prism.languages.sql, 'sql')
    }
    return escapeHtml(generatedSQL.value)
})

function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function addLog(text) {
    const now = new Date()
    const time = now.toLocaleTimeString('en', { hour12: false }) + '.' + String(now.getMilliseconds()).padStart(3, '0')
    log.value.unshift({ time, text })
    if (log.value.length > 50) log.value.length = 50
}

function toggleDark() {
    isDark.value = !isDark.value
    document.documentElement.classList.toggle('dark', isDark.value)
    addLog(`Theme: ${isDark.value ? 'dark' : 'light'}`)
}

async function onAutocomplete(key, value) {
    addLog(`autocomplete: key=${key} value=${value}`)
    try {
        const resp = await fetch(`/api/autocomplete?key=${encodeURIComponent(key)}&value=${encodeURIComponent(value)}`)
        if (!resp.ok) {
            addLog(`autocomplete error: ${resp.status}`)
            return { items: [] }
        }
        const data = await resp.json()
        addLog(`autocomplete result: ${data.items?.length || 0} items`)
        return data
    } catch (err) {
        addLog(`autocomplete error: ${err.message}`)
        return { items: [] }
    }
}

async function onKeyDiscovery(columnName, segments) {
    addLog(`key-discovery: column=${columnName} segments=${segments.join(',')}`)
    try {
        const resp = await fetch(`/api/discover-keys?column=${encodeURIComponent(columnName)}&segments=${segments.map(encodeURIComponent).join(',')}`)
        if (!resp.ok) {
            addLog(`key-discovery error: ${resp.status}`)
            return []
        }
        const data = await resp.json()
        addLog(`key-discovery result: ${data.keys?.length || 0} keys`)
        return data.keys || []
    } catch (err) {
        addLog(`key-discovery error: ${err.message}`)
        return []
    }
}

const parsedColumnsText = computed(() => {
    return parsedColumns.value.map((c) => {
        let text = c.name
        if (c.modifiers && c.modifiers.length > 0) {
            text += '|' + c.modifiers.map((m) => m.name + (m.arguments.length ? `(${m.arguments.join(',')})` : '')).join('|')
        }
        if (c.alias) text += ' as ' + c.alias
        return text
    }).join(', ')
})

function onColumnsParsed(cols) {
    parsedColumns.value = cols
    addLog(`columns parsed: ${cols.length} columns`)
}

function onSubmit() {
    const status = editor.value?.getQueryStatus()
    addLog(`submit: "${query.value}" (${status?.valid ? 'valid' : 'invalid'}: ${status?.message})`)
    if (status?.valid) generate()
}

function focusEditor() {
    editor.value?.focus()
    addLog('focus()')
}

function checkStatus() {
    const status = editor.value?.getQueryStatus()
    addLog(`status: ${JSON.stringify(status)}`)
}

async function generate() {
    if (!isValid.value || generating.value) return
    generating.value = true
    generateError.value = ''
    generatedSQL.value = ''
    addLog(`generate: dialect=${dialect.value} query="${query.value}"`)
    try {
        const resp = await fetch('/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: query.value, dialect: dialect.value }),
        })
        const data = await resp.json()
        if (!resp.ok) {
            generateError.value = data.error || 'Generation failed'
            addLog(`generate error: ${generateError.value}`)
        } else {
            generatedSQL.value = data.sql
            addLog(`generate result: ${data.sql}`)
            nextTick(() => {
                if (window.Prism) window.Prism.highlightAll()
            })
        }
    } catch (err) {
        generateError.value = err.message
        addLog(`generate error: ${err.message}`)
    } finally {
        generating.value = false
    }
}

watch(query, () => {
    generatedSQL.value = ''
    generateError.value = ''
})

watch(dialect, () => {
    if (isValid.value && generatedSQL.value) generate()
})
</script>

<style>
* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}
body {
    font-family: system-ui, -apple-system, sans-serif;
    padding: 32px;
    background: #f5f5f5;
    color: #1e1e1e;
    transition: background 0.2s, color 0.2s;
}
.dark body,
body.dark {
    background: #1a1a1a;
    color: #d4d4d4;
}
h1 {
    font-size: 20px;
    margin-bottom: 4px;
}
.subtitle {
    font-size: 13px;
    color: #888;
    margin-bottom: 24px;
}
.toolbar {
    display: flex;
    gap: 12px;
    align-items: center;
    margin-bottom: 16px;
}
.toolbar button,
.tab-toolbar button {
    padding: 6px 14px;
    border: 1px solid #ccc;
    border-radius: 6px;
    background: #fff;
    cursor: pointer;
    font-size: 13px;
}
.dark .toolbar button,
.dark .tab-toolbar button {
    background: #2a2a2a;
    border-color: #555;
    color: #d4d4d4;
}
.toolbar button:hover,
.tab-toolbar button:hover {
    opacity: 0.8;
}

/* Tabs */
.tabs {
    display: flex;
    gap: 0;
    margin-bottom: 20px;
    border-bottom: 2px solid #ddd;
}
.dark .tabs {
    border-bottom-color: #444;
}
.tab {
    padding: 8px 20px;
    border: none;
    background: none;
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
    color: #888;
    border-bottom: 2px solid transparent;
    margin-bottom: -2px;
    transition: color 0.15s, border-color 0.15s;
}
.tab:hover {
    color: #555;
}
.dark .tab:hover {
    color: #bbb;
}
.tab--active {
    color: #075985;
    border-bottom-color: #075985;
}
.dark .tab--active {
    color: #6e9fff;
    border-bottom-color: #6e9fff;
}

.tab-toolbar {
    display: flex;
    gap: 12px;
    align-items: center;
    margin-bottom: 16px;
}

.section {
    margin-bottom: 24px;
}
.section-title {
    font-size: 13px;
    font-weight: 600;
    margin-bottom: 8px;
    color: #666;
}
.dark .section-title {
    color: #999;
}

/* Generator */
.generator {
    display: flex;
    gap: 12px;
    align-items: center;
    margin-bottom: 12px;
}
.dialect-select {
    padding: 6px 12px;
    border: 1px solid #ccc;
    border-radius: 6px;
    background: #fff;
    font-size: 13px;
    cursor: pointer;
}
.dark .dialect-select {
    background: #2a2a2a;
    border-color: #555;
    color: #d4d4d4;
}
.generate-btn {
    padding: 6px 18px;
    border: 1px solid #075985;
    border-radius: 6px;
    background: #075985;
    color: #fff;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
}
.generate-btn:hover:not(:disabled) {
    background: #0369a1;
}
.generate-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
}
.dark .generate-btn {
    background: #0369a1;
    border-color: #0369a1;
}
.sql-output {
    background: #fff;
    border: 1px solid #ddd;
    border-radius: 6px;
    padding: 16px;
    overflow-x: auto;
}
.dark .sql-output {
    background: #252526;
    border-color: #444;
}
.sql-output pre {
    margin: 0;
}
.sql-output code {
    font-family: 'SF Mono', 'Fira Code', 'Fira Mono', monospace;
    font-size: 13px;
    line-height: 1.5;
    color: #1e1e1e;
    white-space: pre-wrap;
    overflow-wrap: break-word;
}
.dark .sql-output code {
    color: #d4d4d4;
}
/* Prism token colors — light */
.sql-output .token.keyword { color: #0451a5; font-weight: 600; }
.sql-output .token.string { color: #8b0000; }
.sql-output .token.number { color: #098658; }
.sql-output .token.operator { color: #1e1e1e; }
.sql-output .token.function { color: #795e26; }
.sql-output .token.punctuation { color: #555; }
.sql-output .token.comment { color: #008000; }
/* Prism token colors — dark */
.dark .sql-output .token.keyword { color: #569cd6; font-weight: 600; }
.dark .sql-output .token.string { color: #ce9178; }
.dark .sql-output .token.number { color: #b5cea8; }
.dark .sql-output .token.operator { color: #d4d4d4; }
.dark .sql-output .token.function { color: #dcdcaa; }
.dark .sql-output .token.punctuation { color: #808080; }
.dark .sql-output .token.comment { color: #6a9955; }
.sql-error {
    padding: 8px 12px;
    background: #fff0f0;
    border: 1px solid #f48771;
    border-radius: 6px;
    color: #c00;
    font-size: 12px;
    font-family: monospace;
}
.dark .sql-error {
    background: #2a1a1a;
    color: #f48771;
}

/* Status & Log */
.status {
    font-family: monospace;
    font-size: 12px;
    padding: 8px 12px;
    background: #fff;
    border: 1px solid #ddd;
    border-radius: 6px;
    white-space: pre-wrap;
    word-break: break-all;
}
.dark .status {
    background: #252526;
    border-color: #444;
}
.status--valid {
    border-left: 3px solid #098658;
}
.status--invalid {
    border-left: 3px solid #f48771;
}
.log {
    font-family: monospace;
    font-size: 11px;
    max-height: 400px;
    overflow-y: auto;
    padding: 8px 12px;
    background: #fff;
    border: 1px solid #ddd;
    border-radius: 6px;
}
.dark .log {
    background: #252526;
    border-color: #444;
}
.log-entry {
    padding: 2px 0;
    border-bottom: 1px solid #f0f0f0;
}
.dark .log-entry {
    border-bottom-color: #333;
}
.log-entry:last-child {
    border-bottom: none;
}
.log-time {
    color: #888;
    margin-right: 8px;
}
</style>
