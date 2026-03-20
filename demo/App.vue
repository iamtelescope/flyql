<template>
    <div class="app">
        <h1>FlyQL Editor</h1>
        <p class="subtitle">Development test page</p>

        <div class="toolbar">
            <button @click="toggleDark">{{ isDark ? 'Light' : 'Dark' }} mode</button>
            <button @click="query = ''">Clear</button>
            <button @click="query = 'level=&quot;error&quot; and service~&quot;api.*&quot;'">Sample query</button>
            <button @click="focusEditor">Focus</button>
            <button @click="checkStatus">Check status</button>
        </div>

        <div class="section">
            <div class="section-title">Editor</div>
            <FlyqlEditor
                ref="editor"
                v-model="query"
                :columns="columns"
                :on-autocomplete="onAutocomplete"
                placeholder="Type a FlyQL query..."
                :autofocus="true"
                :debug="true"
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
import { ref, computed, watch, nextTick } from 'vue'
import { FlyqlEditor } from '../javascript/src/editor/index.js'

const query = ref('')
const editor = ref(null)
const isDark = ref(false)
const log = ref([])
const dialect = ref('clickhouse')
const generatedSQL = ref('')
const generateError = ref('')
const generating = ref(false)

const columns = ref({
    level: { type: 'enum', suggest: true, autocomplete: true, values: ['debug', 'info', 'warning', 'error', 'critical'] },
    service: { type: 'string', suggest: true, autocomplete: true },
    message: { type: 'string', suggest: true, autocomplete: false },
    status_code: { type: 'number', suggest: true, autocomplete: true, values: [200, 201, 204, 301, 400, 401, 403, 404, 500, 502, 503] },
    host: { type: 'string', suggest: true, autocomplete: true },
    path: { type: 'string', suggest: true, autocomplete: true },
    duration_ms: { type: 'number', suggest: true, autocomplete: false },
    method: { type: 'enum', suggest: true, autocomplete: true, values: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] },
    role: { type: 'enum', suggest: true, autocomplete: true, values: ['admin', 'editor', 'viewer', 'guest'] },
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
    margin-bottom: 24px;
}
.toolbar button {
    padding: 6px 14px;
    border: 1px solid #ccc;
    border-radius: 6px;
    background: #fff;
    cursor: pointer;
    font-size: 13px;
}
.dark .toolbar button {
    background: #2a2a2a;
    border-color: #555;
    color: #d4d4d4;
}
.toolbar button:hover {
    opacity: 0.8;
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
}
.dark .sql-output code {
    color: #d4d4d4;
}
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
    max-height: 200px;
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
