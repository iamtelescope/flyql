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
                @submit="onSubmit"
            />
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
import { ref, computed } from 'vue'
import { FlyqlEditor } from '../src/editor/index.js'

const query = ref('')
const editor = ref(null)
const isDark = ref(false)
const log = ref([])

const columns = ref({
    level: { type: 'enum', suggest: true, autocomplete: true, values: ['debug', 'info', 'warning', 'error', 'critical'] },
    service: { type: 'string', suggest: true, autocomplete: true },
    message: { type: 'string', suggest: true, autocomplete: false },
    status_code: { type: 'number', suggest: true, autocomplete: true, values: [200, 201, 204, 301, 400, 401, 403, 404, 500, 502, 503] },
    host: { type: 'string', suggest: true, autocomplete: true },
    path: { type: 'string', suggest: true, autocomplete: true },
    duration_ms: { type: 'number', suggest: true, autocomplete: false },
    timestamp: { type: 'string', suggest: false, autocomplete: false },
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
    await new Promise((r) => setTimeout(r, 300))
    const mockData = {
        service: ['api-gateway', 'api-users', 'api-billing', 'worker-email', 'worker-ingest', 'frontend-web', 'frontend-mobile'],
        host: ['prod-us-1', 'prod-us-2', 'prod-eu-1', 'staging-1', 'dev-local'],
        path: ['/api/v1/users', '/api/v1/auth', '/api/v1/billing', '/api/v2/search', '/health', '/metrics'],
    }
    return { items: mockData[key] || [] }
}

function onSubmit() {
    const status = editor.value?.getQueryStatus()
    addLog(`submit: "${query.value}" (${status?.valid ? 'valid' : 'invalid'}: ${status?.message})`)
}

function focusEditor() {
    editor.value?.focus()
    addLog('focus()')
}

function checkStatus() {
    const status = editor.value?.getQueryStatus()
    addLog(`status: ${JSON.stringify(status)}`)
}
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
