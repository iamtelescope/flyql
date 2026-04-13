<template>
    <div class="min-h-screen w-full bg-white dark:bg-[#1C1C1C] flex flex-col">
        <!-- Navbar -->
        <nav class="fixed top-0 left-0 right-0 z-50 bg-white dark:bg-black border-b border-gray-200 dark:border-transparent">
            <div class="px-2 lg:px-6 flex items-center h-14">
                <a href="/" class="flex items-center gap-2 no-underline">
                    <img :src="logoSvg" alt="FlyQL" class="h-7 w-7" />
                    <span class="text-xl font-semibold text-gray-900 dark:text-white">FlyQL Playground</span>
                </a>
                <div class="flex items-center gap-6 ml-auto">
                    <a href="https://docs.flyql.dev" target="_blank" rel="noopener"
                       class="text-sm font-medium text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors">
                        Docs ↗
                    </a>
                    <a href="https://github.com/iamtelescope/flyql" target="_blank" rel="noopener"
                       class="text-sm font-medium text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors flex items-center gap-1">
                        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
                        GitHub ↗
                    </a>
                    <div class="w-px h-5 bg-gray-200 dark:bg-gray-700"></div>
                    <button class="text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors cursor-pointer" @click="toggleDark" aria-label="Toggle theme">
                        <svg v-if="isDark" class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clip-rule="evenodd" /></svg>
                        <svg v-else class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" /></svg>
                    </button>
                </div>
            </div>
        </nav>

        <!-- Main -->
        <main class="flex-1">
            <div class="px-2 lg:px-6 pt-16 lg:pt-20 pb-10 lg:pb-16">
                <div class="lg:flex lg:gap-6">
                    <!-- Content -->
                    <div class="flex-1 min-w-0 lg:order-1">
                        <!-- Columns editor -->
                        <div class="rounded-lg bg-white dark:bg-gray-950 overflow-hidden border border-gray-200 dark:border-gray-800">
                            <div class="flex items-center justify-between gap-2 px-4 py-2 border-b border-gray-200 dark:border-gray-800">
                                <div class="flex items-center gap-2">
                                    <img :src="logoSvg" alt="" class="h-4 w-4" />
                                    <span class="text-xs text-gray-500 dark:text-gray-400 font-mono tracking-wider">Columns</span>
                                </div>
                                <span v-if="selectExpr" class="text-xs text-gray-400 dark:text-gray-500">{{ parsedColumnsCount }} column{{ parsedColumnsCount !== 1 ? 's' : '' }}</span>
                            </div>
                            <div class="p-2">
                                <FlyqlColumns
                                    v-model="selectExpr"
                                    :columns="editorColumns"
                                    :dark="isDark"
                                    :placeholder="otelLogs.defaults.columnsPlaceholder"
                                    @update:parsed="onColumnsParsed"
                                />
                            </div>
                        </div>
                        <div class="mt-2 ml-2 flex flex-wrap gap-2">
                            <button
                                class="px-3 py-1 text-xs rounded-md bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-300 transition-all cursor-pointer hover:scale-105 active:scale-95"
                                @click="selectExpr = otelLogs.defaults.selectExpr"
                            >Reset to default</button>
                            <button v-for="(preset, i) in columnPresets" :key="i"
                                class="px-3 py-1 text-xs font-mono border border-gray-300 dark:border-gray-600 rounded-full hover:border-gray-400 dark:hover:border-gray-400 transition-colors cursor-pointer"
                                @click="selectExpr = preset.value"
                                v-html="presetHighlights[i]"
                            />
                        </div>

                        <!-- Query editor -->
                        <div class="mt-3 rounded-lg bg-white dark:bg-gray-950 overflow-hidden border border-gray-200 dark:border-gray-800">
                            <div class="flex items-center justify-between gap-2 px-4 py-2 border-b border-gray-200 dark:border-gray-800">
                                <div class="flex items-center gap-2">
                                    <img :src="logoSvg" alt="" class="h-4 w-4" />
                                    <span class="text-xs text-gray-500 dark:text-gray-400 font-mono tracking-wider">Query</span>
                                </div>
                            </div>
                            <div class="p-2">
                                <FlyqlEditor
                                    ref="editorRef"
                                    v-model="query"
                                    :columns="editorColumns"
                                    :dark="isDark"
                                    :placeholder="otelLogs.defaults.queryPlaceholder"
                                    @submit="runQuery"
                                    @parse-error="onParseError"
                                />
                            </div>
                        </div>
                        <div v-if="parseError" class="mt-2 text-sm text-red-500 font-mono">{{ parseError }}</div>

                        <!-- Examples -->
                        <div class="mt-3 ml-2 flex flex-wrap gap-2">
                            <button
                                class="px-3 py-1 text-xs rounded-md bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-300 transition-all cursor-pointer hover:scale-105 active:scale-95"
                                @click="query = otelLogs.defaults.query"
                            >Reset to default</button>
                            <button v-for="(ex, i) in examples" :key="i"
                                class="px-3 py-1 text-xs font-mono border border-gray-300 dark:border-gray-600 rounded-full hover:border-gray-400 dark:hover:border-gray-400 transition-colors flyql-highlight"
                                @click="query = ex"
                                v-html="exampleHighlights[i]"
                            />
                        </div>

                        <!-- Run -->
                        <div class="mt-6 ml-2">
                            <button
                                class="inline-flex items-center gap-2 px-4 py-1.5 text-sm bg-green-600 hover:bg-green-700 dark:bg-emerald-700 dark:hover:bg-emerald-600 text-white rounded-md font-medium transition-colors cursor-pointer active:scale-95"
                                :class="{ 'opacity-40 !cursor-not-allowed': !canRun }"
                                :disabled="!canRun"
                                @click="runQuery"
                            >
                                <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                                Run
                            </button>
                        </div>

                        <!-- Output tabs -->
                        <div class="mt-4">
                            <div class="flex gap-1 mb-3">
                                <button
                                    class="px-4 py-2 text-xs font-medium rounded-t-md transition-colors border-b-2 cursor-pointer"
                                    :class="outputTab === 'sql'
                                        ? 'border-green-600 dark:border-emerald-500 text-gray-900 dark:text-white'
                                        : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'"
                                    @click="outputTab = 'sql'"
                                >Generate SQL</button>
                                <button
                                    class="px-4 py-2 text-xs font-medium rounded-t-md transition-colors border-b-2 cursor-pointer"
                                    :class="outputTab === 'filter'
                                        ? 'border-green-600 dark:border-emerald-500 text-gray-900 dark:text-white'
                                        : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'"
                                    @click="outputTab = 'filter'"
                                >
                                    Filter data
                                    <span v-if="hasRun && !matchError" class="ml-1 text-gray-400 dark:text-gray-500">({{ matchedCount }}/{{ sampleRecords.length }})</span>
                                </button>
                            </div>

                            <!-- SQL -->
                            <div v-if="outputTab === 'sql'" class="rounded-lg bg-white dark:bg-gray-950 overflow-hidden border border-gray-200 dark:border-gray-800">
                                <div class="flex border-b border-gray-200 dark:border-gray-800">
                                    <button v-for="(d, i) in dialects" :key="d.key"
                                        class="flex items-center gap-2 px-4 py-2 text-xs font-medium transition-colors border-r border-gray-200 dark:border-gray-800 last:border-r-0 cursor-pointer"
                                        :class="dialectIdx === i
                                            ? 'bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-white'
                                            : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'"
                                        @click="dialectIdx = i"
                                    >
                                        <img v-if="isDark && d.iconDark" :src="d.iconDark" :alt="d.name" class="h-4 w-4" />
                                        <img v-else :src="d.icon" :alt="d.name" class="h-4 w-4" />
                                        <span>{{ d.name }}</span>
                                    </button>
                                </div>
                                <div class="min-h-[120px]">
                                    <div v-if="!hasRun" class="flex items-center justify-center min-h-[120px] text-gray-500 text-sm">Type a query above and click Run</div>
                                    <div v-else-if="sqlResults[dialectIdx]?.error" class="p-4 text-sm text-red-500 font-mono">{{ sqlResults[dialectIdx].error }}</div>
                                    <pre v-else class="px-4 py-3 text-sm font-mono text-gray-800 dark:text-gray-200 leading-relaxed whitespace-pre-wrap break-words"><code v-html="highlightedSql"></code></pre>
                                </div>
                            </div>

                            <!-- Filter -->
                            <div v-if="outputTab === 'filter'" class="rounded-lg bg-white dark:bg-gray-950 overflow-hidden border border-gray-200 dark:border-gray-800">
                                <div v-if="matchError" class="px-4 py-2 border-b border-gray-200 dark:border-gray-800">
                                    <span class="text-xs text-red-500 font-mono">{{ matchError }}</span>
                                </div>
                                <div class="overflow-x-auto">
                                    <table class="w-full text-xs font-mono">
                                        <thead class="bg-gray-50 dark:bg-gray-900 text-gray-500 dark:text-gray-400">
                                            <tr>
                                                <th class="text-left px-3 py-2 font-medium w-10"></th>
                                                <th v-for="col in displayColumns" :key="col" class="text-left px-3 py-2 font-medium">{{ col }}</th>
                                            </tr>
                                        </thead>
                                        <tbody class="divide-y divide-gray-200 dark:divide-gray-800">
                                            <tr v-for="(row, i) in sampleRecords" :key="i"
                                                :class="matchResults[i] === true ? 'bg-green-50 dark:bg-green-900/20' : ''">
                                                <td class="px-3 py-2 align-top">
                                                    <span v-if="matchResults[i] === true" class="inline-flex items-center justify-center w-4 h-4 rounded-full bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-400">
                                                        <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
                                                    </span>
                                                    <span v-else-if="matchResults[i] === false" class="inline-flex items-center justify-center w-4 h-4 rounded-full bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-600">
                                                        <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                                                    </span>
                                                </td>
                                                <td v-for="(col, ci) in displayColumns" :key="ci"
                                                    class="px-3 py-2 text-gray-700 dark:text-gray-300 align-top"
                                                    :class="typeof getRowValue(row, ci) === 'string' && getRowValue(row, ci)?.startsWith('{') ? 'text-gray-500 dark:text-gray-400 text-[11px] whitespace-nowrap' : 'whitespace-nowrap'"
                                                >{{ getRowValue(row, ci) }}</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Schema sidebar -->
                    <div class="mt-6 lg:mt-0 lg:w-[280px] lg:flex-shrink-0 lg:sticky lg:top-20 lg:self-start lg:order-2">
                        <div class="rounded-lg bg-white dark:bg-gray-950 overflow-hidden border border-gray-200 dark:border-gray-800">
                            <div class="flex items-center gap-2 px-4 py-2 border-b border-gray-200 dark:border-gray-800">
                                <svg class="w-4 h-4 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4"/></svg>
                                <span class="text-xs text-gray-500 dark:text-gray-400 font-mono tracking-wider">Columns</span>
                            </div>
                            <div class="p-3 max-h-[60vh] overflow-y-auto">
                                <div v-for="col in schemaColumns" :key="col.name" class="flex items-center justify-between py-0.5 px-1 text-sm font-mono">
                                    <span class="flyql-col-column">{{ col.name }}</span>
                                    <span class="text-xs flyql-schema-type" :data-type="col.type">{{ col.type }}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </main>

        <!-- Footer -->
        <footer class="w-full border-t border-gray-200 dark:border-gray-800">
            <div class="px-2 lg:px-6 py-8 flex justify-center items-center">
                <div class="text-sm text-gray-400 dark:text-gray-500">
                    &copy; 2026 FlyQL &middot;&nbsp;<a href="https://opensource.org/licenses/MIT" target="_blank" rel="noopener" class="hover:text-gray-900 dark:hover:text-white transition-colors">MIT License</a>
                </div>
            </div>
        </footer>
    </div>
</template>

<script setup>
import '@fontsource/inter'
import '@fontsource/inter/500.css'

import { ref, computed, onMounted } from 'vue'
import { FlyqlEditor, FlyqlColumns, ColumnSchema } from '../javascript/packages/flyql-vue/src/index.js'
import { EditorEngine } from '../javascript/packages/flyql-vue/src/engine.js'
import { ColumnsEngine } from '../javascript/packages/flyql-vue/src/columns-engine.js'
import { parse } from '../javascript/packages/flyql/src/core/parser.js'
import { generateWhere as generateClickHouse, generateSelect as chSelect, newColumn as chNewColumn } from '../javascript/packages/flyql/src/generators/clickhouse/index.js'
import { generateWhere as generatePostgreSQL, generateSelect as pgSelect, newColumn as pgNewColumn } from '../javascript/packages/flyql/src/generators/postgresql/index.js'
import { generateWhere as generateStarRocks, generateSelect as srSelect, newColumn as srNewColumn } from '../javascript/packages/flyql/src/generators/starrocks/index.js'
import { match } from '../javascript/packages/flyql/src/matcher/index.js'
import { defaultRegistry } from '../javascript/packages/flyql/src/transformers/registry.js'

const _transformerRegistry = defaultRegistry()

import otelLogs from '../tests-data/otel/logs.json'
import logoSvg from './flyql.svg'
import chIconLight from './clickhouse_light.svg'
import chIconDark from './clickhouse_dark.svg'
import pgIcon from './postgresql.svg'
import srIcon from './starrocks.svg'

const schemaColumns = otelLogs.schemaColumns

const editorColumns = ColumnSchema.fromPlainObject(otelLogs.editorColumns)

const chColumns = Object.fromEntries(Object.entries(otelLogs.dialectTypes.clickhouse).map(([name, type]) => [name, chNewColumn(name, '', type)]))
const pgColumns = Object.fromEntries(Object.entries(otelLogs.dialectTypes.postgresql).map(([name, type]) => [name, pgNewColumn(name, false, type)]))
const srColumns = Object.fromEntries(Object.entries(otelLogs.dialectTypes.starrocks).map(([name, type]) => [name, srNewColumn(name, '', type)]))

const dialects = [
    { key: 'ch', name: 'ClickHouse', icon: chIconLight, iconDark: chIconDark },
    { key: 'pg', name: 'PostgreSQL', icon: pgIcon, iconDark: null },
    { key: 'sr', name: 'StarRocks', icon: srIcon, iconDark: null },
]

const columnPresets = [
    { label: 'All columns', value: schemaColumns.map((c) => c.name).join(', ') },
]

const examples = otelLogs.examples

const highlightEngine = new EditorEngine(editorColumns)
const exampleHighlights = examples.map((q) => highlightEngine.getHighlightTokens(q))

const columnsHighlightEngine = new ColumnsEngine(editorColumns)
const presetHighlights = columnPresets.map((p) => columnsHighlightEngine.getHighlightTokens(p.value) || p.label)

// Resolve ResourceAttributes references from shared JSON (records store service name as string ref)
const sampleRecords = otelLogs.records.map((r) => ({
    ...r,
    ResourceAttributes: otelLogs.resourceAttributes[r.ResourceAttributes] || r.ResourceAttributes,
}))

const isDark = ref(localStorage.getItem('flyql-dark') === 'true')
// Apply dark class immediately (before mount) to avoid flash
if (isDark.value) document.documentElement.classList.add('dark', 'flyql-dark')
const query = ref(otelLogs.defaults.query)
const selectExpr = ref(otelLogs.defaults.selectExpr)
const parsedColumnsCount = ref(5)

const parsedColumns = ref([
    { name: 'Timestamp', transformers: [] },
    { name: 'SeverityText', transformers: [{ name: 'lower', arguments: [] }], alias: 'Severity' },
    { name: 'ServiceName', transformers: [] },
    { name: 'Body', transformers: [] },
    { name: 'LogAttributes.http.status_code', transformers: [], alias: 'StatusCode' },
])
const snapshotColumns = ref([])
const displayColumns = computed(() => {
    if (snapshotColumns.value.length > 0) {
        return snapshotColumns.value.map((c) => c.alias || c.name)
    }
    if (parsedColumns.value.length > 0) {
        return parsedColumns.value.map((c) => c.alias || c.name)
    }
    return schemaColumns.map((c) => c.name)
})

function onColumnsParsed(cols) {
    parsedColumnsCount.value = cols.length
    parsedColumns.value = cols
}

function extractValue(row, colName) {
    const parts = colName.split('.')
    let val = row
    for (const p of parts) {
        if (val == null || typeof val !== 'object') return null
        // If it's a JSON string, try parsing
        if (typeof val[p] === 'string' && (val[p].startsWith('{') || val[p].startsWith('['))) {
            try { val = JSON.parse(val[p]) } catch { val = val[p] }
        } else {
            val = val[p]
        }
    }
    return val
}

function applyTransformers(value, transformers) {
    let val = value
    for (const t of transformers) {
        const transformer = _transformerRegistry.get(t.name)
        if (!transformer) continue
        val = transformer.apply(val, t.arguments || [])
    }
    return val
}

function getRowValue(row, colIdx) {
    let cols = snapshotColumns.value.length > 0 ? snapshotColumns.value : parsedColumns.value
    if (cols.length === 0) {
        const name = schemaColumns[colIdx]?.name || ''
        if (!name) return null
        let val = extractValue(row, name)
        if (val != null && typeof val === 'object') return JSON.stringify(val)
        return val
    }
    const col = cols[colIdx]
    if (!col) return null
    let val = extractValue(row, col.name)
    if (col.transformers && col.transformers.length > 0) {
        val = applyTransformers(val, col.transformers)
    }
    if (val != null && typeof val === 'object') return JSON.stringify(val)
    return val
}


const editorRef = ref(null)
const parseError = ref(null)
const outputTab = ref('sql')
const dialectIdx = ref(0)
const sqlResults = ref([])
const hasRun = ref(false)
const matchError = ref(null)
const matchResults = ref(sampleRecords.map(() => null))

const canRun = computed(() => !parseError.value)
const matchedCount = computed(() => matchResults.value.filter((m) => m === true).length)

const highlightedSql = computed(() => {
    const r = sqlResults.value[dialectIdx.value]
    if (!r || r.error) return ''
    return highlightSQL(r.sql)
})

function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function highlightSQL(sql) {
    const keywords = /\b(WHERE|AND|OR|NOT|IN|IS|NULL|LIKE|ILIKE|TRUE|FALSE|BETWEEN|EXISTS|CASE|WHEN|THEN|ELSE|END|AS|FROM|SELECT)\b/gi
    const functions = /\b(match|position|has|mapContains|JSON_EXISTS|JSON_VALUE|JSONExtractString|JSONExtractInt|JSONExtractFloat|JSONType|JSONHas|JSONLength|concat|lower|upper|length|multiIf|INSTR|regexp|parse_json|cast|array_length|jsonb_typeof)\b/g
    const strings = /'(?:[^'\\]|\\.)*'/g
    const numbers = /\b(\d+(?:\.\d+)?)\b/g
    let result = escapeHtml(sql)
    result = result.replace(strings, '<span class="sql-hl-string">$&</span>')
    result = result.replace(keywords, '<span class="sql-hl-keyword">$&</span>')
    result = result.replace(functions, '<span class="sql-hl-function">$&</span>')
    result = result.replace(numbers, '<span class="sql-hl-number">$1</span>')
    return result
}


function toggleDark() {
    isDark.value = !isDark.value
    localStorage.setItem('flyql-dark', isDark.value)
    document.documentElement.classList.toggle('dark', isDark.value)
    document.documentElement.classList.toggle('flyql-dark', isDark.value)
}

function onParseError(err) { parseError.value = err }

function runQuery() {
    if (!canRun.value) return
    hasRun.value = true
    snapshotColumns.value = [...parsedColumns.value]

    const hasQuery = query.value.trim().length > 0
    let parsed = null
    if (hasQuery) {
        try {
            parsed = parse(query.value)
        } catch (e) {
            const err = e.message || String(e)
            sqlResults.value = [
                { dialect: 'ClickHouse', sql: '', error: err },
                { dialect: 'PostgreSQL', sql: '', error: err },
                { dialect: 'StarRocks', sql: '', error: err },
            ]
            matchResults.value = sampleRecords.map(() => null)
            matchError.value = err
            return
        }
    }

    const results = []
    for (const [name, cols, genWhere, genSelect] of [
        ['ClickHouse', chColumns, generateClickHouse, chSelect],
        ['PostgreSQL', pgColumns, generatePostgreSQL, pgSelect],
        ['StarRocks', srColumns, generateStarRocks, srSelect],
    ]) {
        try {
            const where = parsed ? genWhere(parsed.root, cols) : ''
            let selectClause = '*'
            if (selectExpr.value.trim()) {
                const selectResult = genSelect(selectExpr.value, cols)
                selectClause = selectResult.sql
            }
            const sql = `SELECT ${selectClause} FROM table${where ? ' WHERE ' + where : ''}`
            results.push({ dialect: name, sql })
        } catch (e) {
            results.push({ dialect: name, sql: '', error: e.message || String(e) })
        }
    }
    sqlResults.value = results

    try {
        if (hasQuery) {
            matchResults.value = sampleRecords.map((r) => match(query.value, r))
        } else {
            matchResults.value = sampleRecords.map(() => true)
        }
        matchError.value = null
    } catch (e) {
        matchError.value = e?.message || String(e)
        matchResults.value = sampleRecords.map(() => null)
    }
}
</script>

<style>
@import "tailwindcss";
@custom-variant dark (&:where(.dark, .dark *));

html, body {
    height: 100%;
    font-family: 'Inter', system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
}

body, nav, footer {
    transition: background-color 0.3s ease, color 0.3s ease, border-color 0.3s ease;
}

body { background-color: #f9fafb; color: #1f2937; }
body:where(.dark, .dark *) { background-color: #1c1c1c; color: #ffffff; }

/* FlyQL editor transparent inside cards */
.flyql-editor, .flyql-columns { background: transparent !important; border: none !important; }

/* FlyQL syntax in example chips — use the same CSS vars as the editor */
.flyql-highlight .flyql-key { color: var(--flyql-key-color); }
.flyql-highlight .flyql-operator { color: var(--flyql-operator-color); }
.flyql-highlight .flyql-value,
.flyql-highlight .flyql-string { color: var(--flyql-value-color); }
.flyql-highlight .flyql-number { color: var(--flyql-number-color); }

/* Schema sidebar type colors */
.flyql-schema-type[data-type="string"] { color: var(--flyql-value-color); }
.flyql-schema-type[data-type="number"] { color: var(--flyql-number-color); }
.flyql-schema-type[data-type="object"] { color: var(--flyql-operator-color); }

/* SQL syntax highlighting */
.sql-hl-keyword { color: #0451a5; font-weight: 600; }
.sql-hl-string { color: #8b0000; }
.sql-hl-number { color: #098658; }
.sql-hl-function { color: #795e26; }
:root.dark .sql-hl-keyword { color: #569cd6; font-weight: 600; }
:root.dark .sql-hl-string { color: #ce9178; }
:root.dark .sql-hl-number { color: #b5cea8; }
:root.dark .sql-hl-function { color: #dcdcaa; }
</style>
