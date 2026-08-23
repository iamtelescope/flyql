import '@fontsource/inter'
import '@fontsource/inter/500.css'

import { useMemo, useRef, useState } from 'react'
import { FlyqlEditor, FlyqlColumns, ColumnSchema } from '../../javascript/packages/flyql-react/src/index.js'
import { EditorEngine } from '../../javascript/packages/flyql/src/editor/engine.js'
import { ColumnsEngine } from '../../javascript/packages/flyql/src/editor/columns-engine.js'
import { parse } from '../../javascript/packages/flyql/src/core/parser.js'
import { generateWhere as generateClickHouse, generateSelect as chSelect, newColumn as chNewColumn } from '../../javascript/packages/flyql/src/generators/clickhouse/index.js'
import { generateWhere as generatePostgreSQL, generateSelect as pgSelect, newColumn as pgNewColumn } from '../../javascript/packages/flyql/src/generators/postgresql/index.js'
import { generateWhere as generateStarRocks, generateSelect as srSelect, newColumn as srNewColumn } from '../../javascript/packages/flyql/src/generators/starrocks/index.js'
import { match } from '../../javascript/packages/flyql/src/matcher/index.js'
import { defaultRegistry } from '../../javascript/packages/flyql/src/transformers/registry.js'
import { demoRendererRegistry } from './renderers.js'

const _transformerRegistry = defaultRegistry()
const _rendererRegistry = demoRendererRegistry()

import otelLogs from '../../tests-data/otel/logs.json'
import logoSvg from './flyql.svg'
import chIconLight from './clickhouse_light.svg'
import chIconDark from './clickhouse_dark.svg'
import pgIcon from './postgresql.svg'
import srIcon from './starrocks.svg'

const schemaColumns = otelLogs.schemaColumns

const editorColumns = ColumnSchema.fromPlainObject(otelLogs.editorColumns)

function resolveDialectSpec(entry) {
    return typeof entry === 'string' ? entry : entry?.flyql || entry?.db || ''
}
function resolveDialectDb(entry) {
    return typeof entry === 'string' ? entry : entry?.db || ''
}
const chColumns = Object.fromEntries(Object.entries(otelLogs.dialectTypes.clickhouse).map(([name, t]) => [name, chNewColumn({ name, type: resolveDialectSpec(t) })]))
const pgColumns = Object.fromEntries(Object.entries(otelLogs.dialectTypes.postgresql).map(([name, t]) => [name, pgNewColumn({ name, type: resolveDialectSpec(t) })]))
const srColumns = Object.fromEntries(Object.entries(otelLogs.dialectTypes.starrocks).map(([name, t]) => [name, srNewColumn({ name, type: resolveDialectSpec(t) })]))

const dialects = [
    { key: 'ch', name: 'ClickHouse', icon: chIconLight, iconDark: chIconDark, dialectTypeKey: 'clickhouse' },
    { key: 'pg', name: 'PostgreSQL', icon: pgIcon, iconDark: null, dialectTypeKey: 'postgresql' },
    { key: 'sr', name: 'StarRocks', icon: srIcon, iconDark: null, dialectTypeKey: 'starrocks' },
]

// ── Label / icon controls for the editors (the `label` and `icon` props) ──
// `icon: null` keeps the component's built-in glyph, `false` drops the icon
// entirely, and any other node is rendered as-is. The built-in glyphs are 13px
// Feather-style strokes, so these match them rather than using emoji.
const strokeIcon = (...paths) => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {paths.map((d, i) => <path key={i} d={d} />)}
    </svg>
)

const iconOptions = [
    { key: 'default', text: 'Built-in icon', value: null },
    { key: 'filter', text: 'Filter', value: strokeIcon('M22 3H2l8 9.46V19l4 2v-8.54L22 3z') },
    { key: 'terminal', text: 'Terminal', value: strokeIcon('M4 17l6-6-6-6', 'M12 19h8') },
    { key: 'hash', text: 'Hash', value: strokeIcon('M4 9h16', 'M4 15h16', 'M10 3L8 21', 'M16 3l-2 18') },
    { key: 'bolt', text: 'Bolt', value: strokeIcon('M13 2L3 14h9l-1 8 10-12h-9l1-8z') },
    { key: 'none', text: 'No icon', value: false },
]

const CONTROL_CLS = 'px-2 py-1 text-xs rounded-md border border-gray-200 dark:border-gray-700 bg-transparent text-gray-700 dark:text-gray-300 focus:outline-none focus:border-gray-400 dark:focus:border-gray-500 transition-colors'

function PrefixControls({ label, onLabel, iconKey, onIconKey, children }) {
    return (
        <div className="flex items-center gap-2">
            <input
                type="text"
                value={label}
                placeholder="label"
                onChange={(e) => onLabel(e.target.value)}
                className={CONTROL_CLS + ' w-32 placeholder-gray-400 dark:placeholder-gray-600'}
            />
            <select
                value={iconKey}
                onChange={(e) => onIconKey(e.target.value)}
                className={CONTROL_CLS + ' dark:bg-gray-950 cursor-pointer'}
            >
                {iconOptions.map((opt) => (
                    <option key={opt.key} value={opt.key}>{opt.text}</option>
                ))}
            </select>
            {children}
        </div>
    )
}

const columnPresets = [
    { label: 'All columns', value: schemaColumns.map((c) => c.name).join(', ') },
]

const examples = otelLogs.examples

const highlightEngine = new EditorEngine(editorColumns)
const exampleHighlights = examples.map((q) => highlightEngine.getHighlightTokens(q))

const columnsHighlightEngine = new ColumnsEngine(editorColumns, { rendererRegistry: _rendererRegistry })
const presetHighlights = columnPresets.map((p) => columnsHighlightEngine.getHighlightTokens(p.value) || p.label)

// Resolve ResourceAttributes references from shared JSON (records store service name as string ref)
const sampleRecords = otelLogs.records.map((r) => ({
    ...r,
    ResourceAttributes: otelLogs.resourceAttributes[r.ResourceAttributes] || r.ResourceAttributes,
}))

// Apply dark classes immediately (before mount) to avoid flash — the inline
// script in index.html adds only `dark`; `flyql-dark` is added here at startup.
if (localStorage.getItem('flyql-dark') === 'true') {
    document.documentElement.classList.add('dark', 'flyql-dark')
}

const DEFAULT_PARSED_COLUMNS = [
    { name: 'Timestamp', transformers: [] },
    { name: 'SeverityText', transformers: [{ name: 'lower', arguments: [] }], alias: 'Severity' },
    { name: 'ServiceName', transformers: [] },
    { name: 'Body', transformers: [] },
    { name: 'LogAttributes.http.status_code', transformers: [], alias: 'StatusCode' },
]

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

// If the parsed column at `colIdx` has a `|tag` renderer, return the class list
// to paint the value as a pill/badge. First arg (optional) is a color keyword:
// 'red' | 'green' | 'blue' | 'yellow' | 'gray' (default: gray).
const TAG_COLORS = new Set(['gray', 'red', 'green', 'blue', 'yellow'])

function isEmptyCell(val) {
    return val == null || val === '' || val === '-'
}

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

export default function App() {
    const [isDark, setIsDark] = useState(() => localStorage.getItem('flyql-dark') === 'true')
    const [query, setQuery] = useState(otelLogs.defaults.query)
    const [selectExpr, setSelectExpr] = useState(otelLogs.defaults.selectExpr)
    const [parsedColumnsCount, setParsedColumnsCount] = useState(5)
    const [queryLabel, setQueryLabel] = useState('')
    const [queryIconKey, setQueryIconKey] = useState('default')
    const [columnsLabel, setColumnsLabel] = useState('')
    const [columnsIconKey, setColumnsIconKey] = useState('default')
    const [outputTab, setOutputTab] = useState('sql')
    const [dialectIdx, setDialectIdx] = useState(0)
    const [sqlResults, setSqlResults] = useState([])
    const [hasRun, setHasRun] = useState(false)
    const [matchError, setMatchError] = useState(null)
    const [matchResults, setMatchResults] = useState(() => sampleRecords.map(() => null))
    // Snapshot set at Run time. When non-empty, replaces the SQL/Filter output
    // area with a diagnostic block. Empties out on the next successful Run.
    const [runDiagnostics, setRunDiagnostics] = useState([])
    // snapshotColumns is what the output tabs render. Only updated on Run — live
    // parsedColumns never feed into the table so a keystroke in the columns editor
    // does not reshape the filtered data preview.
    const [snapshotColumns, setSnapshotColumns] = useState(() => [...DEFAULT_PARSED_COLUMNS])

    const queryIcon = iconOptions.find((o) => o.key === queryIconKey).value
    const columnsIcon = iconOptions.find((o) => o.key === columnsIconKey).value

    const parsedColumnsRef = useRef([...DEFAULT_PARSED_COLUMNS])
    // Live diagnostics — tracked while typing so they can be snapshotted at Run time.
    // Never surfaced at demo-level while typing; editors surface their own in-panel.
    const queryDiagnosticsRef = useRef([])
    const columnsDiagnosticsRef = useRef([])
    const editorRef = useRef(null)
    const columnsRef = useRef(null)

    const displayColumns = useMemo(() => {
        if (snapshotColumns.length > 0) {
            return snapshotColumns.map((c) => c.alias || c.name)
        }
        return schemaColumns.map((c) => c.name)
    }, [snapshotColumns])

    const matchedCount = matchResults.filter((m) => m === true).length

    const highlightedSql = useMemo(() => {
        const r = sqlResults[dialectIdx]
        if (!r || r.error) return ''
        return highlightSQL(r.sql)
    }, [sqlResults, dialectIdx])

    function onColumnsParsed(cols) {
        setParsedColumnsCount(cols.length)
        parsedColumnsRef.current = cols
    }

    function onQueryDiagnostics(diags) {
        queryDiagnosticsRef.current = diags || []
    }
    function onColumnsDiagnostics(diags) {
        columnsDiagnosticsRef.current = diags || []
    }

    function getRowValue(row, colIdx) {
        const cols = snapshotColumns
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

    function getTagClasses(row, colIdx) {
        const col = snapshotColumns[colIdx]
        if (!col || !col.renderers || col.renderers.length === 0) return null
        const tagRenderer = col.renderers.find((r) => r.name === 'tag')
        if (!tagRenderer) return null
        if (isEmptyCell(getRowValue(row, colIdx))) return null
        const raw = tagRenderer.arguments && tagRenderer.arguments[0]
        const color = typeof raw === 'string' && TAG_COLORS.has(raw) ? raw : 'gray'
        return `flyql-demo-tag flyql-demo-tag--${color}`
    }

    function dialectTypeFor(col) {
        const dKey = dialects[dialectIdx]?.dialectTypeKey
        const entry = dKey && otelLogs.dialectTypes[dKey]?.[col.name]
        return resolveDialectDb(entry)
    }

    function toggleDark() {
        const next = !isDark
        setIsDark(next)
        localStorage.setItem('flyql-dark', next)
        document.documentElement.classList.toggle('dark', next)
        document.documentElement.classList.toggle('flyql-dark', next)
    }

    function runQuery() {
        setHasRun(true)
        // Force editors to publish any pending (debounced) diagnostics BEFORE we
        // read from the tracking refs — otherwise a fast Run right after typing
        // would snapshot a stale diagnostic set.
        editorRef.current?.flushDiagnostics?.()
        columnsRef.current?.flushDiagnostics?.()
        // Snapshot editor-reported diagnostics (both editors) at Run time. If any
        // 'error' severity items are present, short-circuit output generation and
        // render the diagnostic block in place of the SQL/Filter tabs.
        const snapshot = [...queryDiagnosticsRef.current, ...columnsDiagnosticsRef.current].filter(
            (d) => d.severity === 'error',
        )
        setRunDiagnostics(snapshot)
        if (snapshot.length > 0) {
            setSqlResults([])
            setMatchResults(sampleRecords.map(() => null))
            setMatchError(null)
            return
        }
        setSnapshotColumns([...parsedColumnsRef.current])

        const hasQuery = query.trim().length > 0
        let parsed = null
        if (hasQuery) {
            try {
                parsed = parse(query)
            } catch (e) {
                const err = e.message || String(e)
                setSqlResults([
                    { dialect: 'ClickHouse', sql: '', error: err },
                    { dialect: 'PostgreSQL', sql: '', error: err },
                    { dialect: 'StarRocks', sql: '', error: err },
                ])
                setMatchResults(sampleRecords.map(() => null))
                setMatchError(err)
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
                if (selectExpr.trim()) {
                    const selectResult = genSelect(selectExpr, cols)
                    selectClause = selectResult.sql
                }
                const sql = `SELECT ${selectClause} FROM table${where ? ' WHERE ' + where : ''}`
                results.push({ dialect: name, sql })
            } catch (e) {
                results.push({ dialect: name, sql: '', error: e.message || String(e) })
            }
        }
        setSqlResults(results)

        try {
            if (hasQuery) {
                setMatchResults(sampleRecords.map((r) => match(query, r)))
            } else {
                setMatchResults(sampleRecords.map(() => true))
            }
            setMatchError(null)
        } catch (e) {
            setMatchError(e?.message || String(e))
            setMatchResults(sampleRecords.map(() => null))
        }
    }

    return (
        <div className="min-h-screen w-full bg-white dark:bg-[#1C1C1C] flex flex-col">
            {/* Navbar */}
            <nav className="fixed top-0 left-0 right-0 z-50 bg-white dark:bg-black border-b border-gray-200 dark:border-transparent">
                <div className="px-2 lg:px-6 flex items-center h-14">
                    <a href="/" className="flex items-center gap-2 no-underline">
                        <img src={logoSvg} alt="FlyQL" className="h-7 w-7" />
                        <span className="text-xl font-semibold text-gray-900 dark:text-white">FlyQL Playground</span>
                    </a>
                    <div className="flex items-center gap-6 ml-auto">
                        <a href="https://docs.flyql.dev" target="_blank" rel="noopener"
                           className="text-sm font-medium text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors">
                            Docs ↗
                        </a>
                        <a href="https://github.com/iamtelescope/flyql" target="_blank" rel="noopener"
                           className="text-sm font-medium text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors flex items-center gap-1">
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
                            GitHub ↗
                        </a>
                        <div className="w-px h-5 bg-gray-200 dark:bg-gray-700"></div>
                        <button className="text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors cursor-pointer" onClick={toggleDark} aria-label="Toggle theme">
                            {isDark ? (
                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd" /></svg>
                            ) : (
                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" /></svg>
                            )}
                        </button>
                    </div>
                </div>
            </nav>

            {/* Main */}
            <main className="flex-1">
                <div className="px-2 lg:px-6 pt-16 lg:pt-20 pb-10 lg:pb-16">
                    <div className="lg:flex lg:gap-6">
                        {/* Content */}
                        <div className="flex-1 min-w-0 lg:order-1">
                            {/* Columns editor */}
                            <div className="rounded-lg bg-white dark:bg-gray-950 overflow-hidden border border-gray-200 dark:border-gray-800">
                                <div className="flex items-center justify-between flex-wrap gap-2 px-4 py-2 border-b border-gray-200 dark:border-gray-800">
                                    <div className="flex items-center gap-2">
                                        <img src={logoSvg} alt="" className="h-4 w-4" />
                                        <span className="text-xs text-gray-500 dark:text-gray-400 font-mono tracking-wider">Columns</span>
                                    </div>
                                    <PrefixControls label={columnsLabel} onLabel={setColumnsLabel} iconKey={columnsIconKey} onIconKey={setColumnsIconKey}>
                                        {selectExpr && <span className="text-xs text-gray-400 dark:text-gray-500">{parsedColumnsCount} column{parsedColumnsCount !== 1 ? 's' : ''}</span>}
                                    </PrefixControls>
                                </div>
                                <div className="p-2">
                                    <FlyqlColumns
                                        ref={columnsRef}
                                        value={selectExpr}
                                        onChange={setSelectExpr}
                                        columns={editorColumns}
                                        label={columnsLabel}
                                        icon={columnsIcon}
                                        rendererRegistry={_rendererRegistry}
                                        dark={isDark}
                                        placeholder={otelLogs.defaults.columnsPlaceholder}
                                        onParsedChange={onColumnsParsed}
                                        onDiagnostics={onColumnsDiagnostics}
                                    />
                                </div>
                            </div>
                            <div className="mt-2 ml-2 flex flex-wrap gap-2">
                                <button
                                    className="px-3 py-1 text-xs rounded-md bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-300 transition-all cursor-pointer hover:scale-105 active:scale-95"
                                    onClick={() => setSelectExpr(otelLogs.defaults.selectExpr)}
                                >Reset to default</button>
                                {columnPresets.map((preset, i) => (
                                    <button key={i}
                                        className="px-3 py-1 text-xs font-mono border border-gray-300 dark:border-gray-600 rounded-full hover:border-gray-400 dark:hover:border-gray-400 transition-colors cursor-pointer"
                                        onClick={() => setSelectExpr(preset.value)}
                                        dangerouslySetInnerHTML={{ __html: presetHighlights[i] }}
                                    />
                                ))}
                            </div>

                            {/* Query editor */}
                            <div className="mt-3 rounded-lg bg-white dark:bg-gray-950 overflow-hidden border border-gray-200 dark:border-gray-800">
                                <div className="flex items-center justify-between flex-wrap gap-2 px-4 py-2 border-b border-gray-200 dark:border-gray-800">
                                    <div className="flex items-center gap-2">
                                        <img src={logoSvg} alt="" className="h-4 w-4" />
                                        <span className="text-xs text-gray-500 dark:text-gray-400 font-mono tracking-wider">Query</span>
                                    </div>
                                    <PrefixControls label={queryLabel} onLabel={setQueryLabel} iconKey={queryIconKey} onIconKey={setQueryIconKey} />
                                </div>
                                <div className="p-2">
                                    <FlyqlEditor
                                        ref={editorRef}
                                        value={query}
                                        onChange={setQuery}
                                        columns={editorColumns}
                                        label={queryLabel}
                                        icon={queryIcon}
                                        dark={isDark}
                                        placeholder={otelLogs.defaults.queryPlaceholder}
                                        onSubmit={runQuery}
                                        onDiagnostics={onQueryDiagnostics}
                                    />
                                </div>
                            </div>

                            {/* Examples */}
                            <div className="mt-3 ml-2 flex flex-wrap gap-2">
                                <button
                                    className="px-3 py-1 text-xs rounded-md bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-300 transition-all cursor-pointer hover:scale-105 active:scale-95"
                                    onClick={() => setQuery(otelLogs.defaults.query)}
                                >Reset to default</button>
                                {examples.map((ex, i) => (
                                    <button key={i}
                                        className="px-3 py-1 text-xs font-mono border border-gray-300 dark:border-gray-600 rounded-full hover:border-gray-400 dark:hover:border-gray-400 transition-colors cursor-pointer flyql-highlight"
                                        onClick={() => setQuery(ex)}
                                        dangerouslySetInnerHTML={{ __html: exampleHighlights[i] }}
                                    />
                                ))}
                            </div>

                            {/* Run */}
                            <div className="mt-6 ml-2">
                                <button
                                    className="inline-flex items-center gap-2 px-4 py-1.5 text-sm bg-green-600 hover:bg-green-700 dark:bg-emerald-700 dark:hover:bg-emerald-600 text-white rounded-md font-medium transition-colors cursor-pointer active:scale-95"
                                    onClick={runQuery}
                                >
                                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                                    Run
                                </button>
                            </div>

                            {/* Output area */}
                            <div className="mt-4">
                                {/* Run-time diagnostic block: replaces tabs when the last Run hit errors */}
                                {runDiagnostics.length > 0 ? (
                                    <div className="rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4">
                                        <div className="text-xs font-medium text-red-700 dark:text-red-300 mb-3 flex items-center gap-2">
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                                <circle cx="12" cy="12" r="10" />
                                                <line x1="12" y1="8" x2="12" y2="12" />
                                                <line x1="12" y1="16" x2="12.01" y2="16" />
                                            </svg>
                                            Cannot run — {runDiagnostics.length} error{runDiagnostics.length === 1 ? '' : 's'} in query or columns
                                        </div>
                                        <ul className="space-y-2">
                                            {runDiagnostics.map((diag, i) => (
                                                <li key={i} className="text-xs">
                                                    <div className="font-mono text-red-800 dark:text-red-200">{diag.message}</div>
                                                    {diag.error && diag.error.description && (
                                                        <div className="mt-1 text-red-600 dark:text-red-300 opacity-80 font-sans">{diag.error.description}</div>
                                                    )}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                ) : (
                                    <>
                                        <div className="flex gap-1 mb-3">
                                            <button
                                                className={'px-4 py-2 text-xs font-medium rounded-t-md transition-colors border-b-2 cursor-pointer ' + (outputTab === 'sql'
                                                    ? 'border-green-600 dark:border-emerald-500 text-gray-900 dark:text-white'
                                                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white')}
                                                onClick={() => setOutputTab('sql')}
                                            >Generate SQL</button>
                                            <button
                                                className={'px-4 py-2 text-xs font-medium rounded-t-md transition-colors border-b-2 cursor-pointer ' + (outputTab === 'filter'
                                                    ? 'border-green-600 dark:border-emerald-500 text-gray-900 dark:text-white'
                                                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white')}
                                                onClick={() => setOutputTab('filter')}
                                            >
                                                Filter data
                                                {hasRun && !matchError && <span className="ml-1 text-gray-400 dark:text-gray-500">({matchedCount}/{sampleRecords.length})</span>}
                                            </button>
                                        </div>

                                        {/* SQL */}
                                        {outputTab === 'sql' && (
                                            <div className="rounded-lg bg-white dark:bg-gray-950 overflow-hidden border border-gray-200 dark:border-gray-800">
                                                <div className="flex border-b border-gray-200 dark:border-gray-800">
                                                    {dialects.map((d, i) => (
                                                        <button key={d.key}
                                                            className={'flex items-center gap-2 px-4 py-2 text-xs font-medium transition-colors border-r border-gray-200 dark:border-gray-800 last:border-r-0 cursor-pointer ' + (dialectIdx === i
                                                                ? 'bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-white'
                                                                : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white')}
                                                            onClick={() => setDialectIdx(i)}
                                                        >
                                                            {isDark && d.iconDark ? (
                                                                <img src={d.iconDark} alt={d.name} className="h-4 w-4" />
                                                            ) : (
                                                                <img src={d.icon} alt={d.name} className="h-4 w-4" />
                                                            )}
                                                            <span>{d.name}</span>
                                                        </button>
                                                    ))}
                                                </div>
                                                <div className="min-h-[120px]">
                                                    {!hasRun ? (
                                                        <div className="flex items-center justify-center min-h-[120px] text-gray-500 text-sm">Type a query above and click Run</div>
                                                    ) : sqlResults[dialectIdx]?.error ? (
                                                        <div className="p-4 text-sm text-red-500 font-mono">{sqlResults[dialectIdx].error}</div>
                                                    ) : (
                                                        <pre className="px-4 py-3 text-sm font-mono text-gray-800 dark:text-gray-200 leading-relaxed whitespace-pre-wrap break-words"><code dangerouslySetInnerHTML={{ __html: highlightedSql }}></code></pre>
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                        {/* Filter */}
                                        {outputTab === 'filter' && (
                                            <div className="rounded-lg bg-white dark:bg-gray-950 overflow-hidden border border-gray-200 dark:border-gray-800">
                                                {matchError && (
                                                    <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-800">
                                                        <span className="text-xs text-red-500 font-mono">{matchError}</span>
                                                    </div>
                                                )}
                                                <div className="overflow-x-auto">
                                                    <table className="w-full text-xs font-mono">
                                                        <thead className="bg-gray-50 dark:bg-gray-900 text-gray-500 dark:text-gray-400">
                                                            <tr>
                                                                <th className="text-left px-3 py-2 font-medium w-10"></th>
                                                                {displayColumns.map((col) => (
                                                                    <th key={col} className="text-left px-3 py-2 font-medium">{col}</th>
                                                                ))}
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                                                            {sampleRecords.map((row, i) => (
                                                                <tr key={i}
                                                                    className={matchResults[i] === true ? 'bg-green-50 dark:bg-green-900/20' : ''}>
                                                                    <td className="px-3 py-2 align-top">
                                                                        {matchResults[i] === true ? (
                                                                            <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-400">
                                                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                                                                            </span>
                                                                        ) : matchResults[i] === false ? (
                                                                            <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-600">
                                                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                                                                            </span>
                                                                        ) : null}
                                                                    </td>
                                                                    {displayColumns.map((col, ci) => (
                                                                        <td key={ci}
                                                                            className={'px-3 py-2 text-gray-700 dark:text-gray-300 align-top ' + (typeof getRowValue(row, ci) === 'string' && getRowValue(row, ci)?.startsWith('{') ? 'text-gray-500 dark:text-gray-400 text-[11px] whitespace-nowrap' : 'whitespace-nowrap')}
                                                                        >
                                                                            {getTagClasses(row, ci) ? (
                                                                                <span className={getTagClasses(row, ci)}>{getRowValue(row, ci)}</span>
                                                                            ) : (
                                                                                getRowValue(row, ci)
                                                                            )}
                                                                        </td>
                                                                    ))}
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Schema sidebar */}
                        <div className="mt-6 lg:mt-0 lg:w-[340px] lg:flex-shrink-0 lg:sticky lg:top-20 lg:self-start lg:order-2 space-y-4">
                            {/* FlyQL columns */}
                            <div className="rounded-lg bg-white dark:bg-gray-950 overflow-hidden border border-gray-200 dark:border-gray-800">
                                <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-200 dark:border-gray-800">
                                    <svg className="w-4 h-4 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4"/></svg>
                                    <span className="text-xs text-gray-500 dark:text-gray-400 font-mono tracking-wider">FlyQL Columns</span>
                                </div>
                                <div className="p-3 max-h-[40vh] overflow-y-auto">
                                    {schemaColumns.map((col) => (
                                        <div key={col.name} className="flex items-center justify-between gap-2 py-0.5 px-1 text-sm font-mono">
                                            <span className="flyql-col-column flex-shrink-0">{col.name}</span>
                                            <span
                                                className="text-xs flyql-schema-type truncate min-w-0 text-right"
                                                data-type={col.type}
                                                title={col.type}
                                            >{col.type}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            {/* Dialect columns (only when SQL tab active) */}
                            {outputTab === 'sql' && (
                                <div className="rounded-lg bg-white dark:bg-gray-950 overflow-hidden border border-gray-200 dark:border-gray-800">
                                    <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-200 dark:border-gray-800">
                                        {isDark && dialects[dialectIdx].iconDark ? (
                                            <img
                                                src={dialects[dialectIdx].iconDark}
                                                alt={dialects[dialectIdx].name}
                                                className="h-4 w-4"
                                            />
                                        ) : (
                                            <img
                                                src={dialects[dialectIdx].icon}
                                                alt={dialects[dialectIdx].name}
                                                className="h-4 w-4"
                                            />
                                        )}
                                        <span className="text-xs text-gray-500 dark:text-gray-400 font-mono tracking-wider">{dialects[dialectIdx].name} Columns</span>
                                    </div>
                                    <div className="p-3 max-h-[40vh] overflow-y-auto">
                                        {schemaColumns.map((col) => (
                                            <div key={col.name} className="flex items-center justify-between gap-2 py-0.5 px-1 text-sm font-mono">
                                                <span className="flyql-col-column flex-shrink-0">{col.name}</span>
                                                <span
                                                    className="text-xs text-gray-600 dark:text-gray-400 truncate min-w-0 text-right"
                                                    title={dialectTypeFor(col)}
                                                >{dialectTypeFor(col)}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </main>

            {/* Footer */}
            <footer className="w-full border-t border-gray-200 dark:border-gray-800">
                <div className="px-2 lg:px-6 py-8 flex justify-center items-center">
                    <div className="text-sm text-gray-400 dark:text-gray-500">
                        &copy; 2026 FlyQL &middot;&nbsp;<a href="https://opensource.org/licenses/MIT" target="_blank" rel="noopener" className="hover:text-gray-900 dark:hover:text-white transition-colors">MIT License</a>
                    </div>
                </div>
            </footer>
        </div>
    )
}
