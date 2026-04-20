import { readdirSync, readFileSync, statSync } from 'fs'
import { join, relative, dirname, extname, basename } from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { parse } from '../../javascript/packages/flyql/src/index.js'
import { generateWhere as chGen, newColumn as chNew } from '../../javascript/packages/flyql/src/generators/clickhouse/index.js'
import { generateWhere as pgGen, newColumn as pgNew } from '../../javascript/packages/flyql/src/generators/postgresql/index.js'
import { generateWhere as srGen, newColumn as srNew } from '../../javascript/packages/flyql/src/generators/starrocks/index.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SNIPPETS_ROOT = join(__dirname, '..', 'src', 'snippets', 'sql')
const COLUMNS_ROOT = join(SNIPPETS_ROOT, 'columns')

const DIALECTS = {
    clickhouse: { generateWhere: chGen, newColumn: chNew, schemaFile: 'clickhouse.json' },
    postgresql: { generateWhere: pgGen, newColumn: pgNew, schemaFile: 'postgresql.json' },
    starrocks: { generateWhere: srGen, newColumn: srNew, schemaFile: 'starrocks.json' },
}

function loadColumns(dialect) {
    const raw = JSON.parse(readFileSync(join(COLUMNS_ROOT, DIALECTS[dialect].schemaFile), 'utf8'))
    const newColumn = DIALECTS[dialect].newColumn
    return Object.fromEntries(Object.entries(raw.columns).map(([name, def]) => [name, newColumn(def)]))
}

function* walkJsFiles(dir) {
    let entries
    try {
        entries = readdirSync(dir)
    } catch {
        return
    }
    for (const entry of entries) {
        const full = join(dir, entry)
        const st = statSync(full)
        if (st.isDirectory()) {
            if (entry === 'columns') continue
            yield* walkJsFiles(full)
        } else if (extname(entry) === '.js') {
            yield full
        }
    }
}

async function main() {
    const dialectColumns = {
        clickhouse: loadColumns('clickhouse'),
        postgresql: loadColumns('postgresql'),
        starrocks: loadColumns('starrocks'),
    }
    const failures = []
    let totalRows = 0
    for (const file of walkJsFiles(SNIPPETS_ROOT)) {
        const module = await import(pathToFileURL(file).href)
        const rows = module.rows
        if (!Array.isArray(rows)) {
            failures.push({ file, reason: 'missing `export const rows = [...]`' })
            continue
        }
        const dirDialect = basename(dirname(file)) === 'shared' ? null : basename(dirname(file))
        for (let i = 0; i < rows.length; i++) {
            totalRows++
            const row = rows[i]
            const d = dirDialect ?? row.dialect
            if (!d || !DIALECTS[d]) {
                failures.push({ file, i, flyql: row.flyql, reason: `invalid dialect '${d}' (shared/ rows need dialect field)` })
                continue
            }
            let parsed
            try {
                parsed = parse(row.flyql)
            } catch (e) {
                failures.push({ file, i, flyql: row.flyql, reason: `parse threw: ${e.message}` })
                continue
            }
            if (!parsed || !parsed.root) {
                failures.push({ file, i, flyql: row.flyql, reason: `parse returned empty tree` })
                continue
            }
            let actual
            try {
                actual = DIALECTS[d].generateWhere(parsed.root, dialectColumns[d])
            } catch (e) {
                failures.push({ file, i, flyql: row.flyql, reason: `generator threw: ${e.message}` })
                continue
            }
            if (actual !== row.sql) {
                failures.push({ file, i, flyql: row.flyql, expected: row.sql, actual })
            }
        }
    }
    if (failures.length) {
        for (const f of failures) {
            console.error(`\nFAIL ${relative(process.cwd(), f.file)}${f.i !== undefined ? `[row ${f.i}]` : ''}`)
            if (f.flyql) console.error(`  FlyQL:    ${f.flyql}`)
            if (f.expected !== undefined) {
                console.error(`  Expected: ${f.expected}`)
                console.error(`  Actual:   ${f.actual}`)
            }
            if (f.reason) console.error(`  Reason:   ${f.reason}`)
        }
        console.error(`\n${failures.length} failures across ${totalRows} rows.`)
        process.exit(1)
    }
    console.log(`✓ ${totalRows} snippet rows verified against live generators.`)
}

main().catch((e) => {
    console.error(e)
    process.exit(1)
})
