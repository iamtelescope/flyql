#!/usr/bin/env node
import { readFile, readdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join, relative } from 'node:path'
import { existsSync } from 'node:fs'

const DOCS_ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
const DIST = join(DOCS_ROOT, 'dist')
const BASELINE_DEFAULT = join(DOCS_ROOT, '..', '_bmad-output', 'implementation-artifacts', 'pre-refactor-snapshots', 'manifest.json')

function parseArgs(argv) {
  const out = { baseline: BASELINE_DEFAULT }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--baseline' && argv[i + 1]) { out.baseline = argv[++i]; continue }
  }
  return out
}

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(p)
    else yield p
  }
}

function extractMain(html) {
  const m = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)
  return m ? m[1] : html
}

function normalize(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function sha256(s) {
  return createHash('sha256').update(s).digest('hex')
}

async function main() {
  const { baseline: baselinePath } = parseArgs(process.argv.slice(2))
  if (!existsSync(baselinePath)) {
    console.error(`ERROR: baseline manifest not found at ${baselinePath}`)
    process.exit(1)
  }
  if (!existsSync(DIST)) {
    console.error(`ERROR: ${DIST} does not exist. Run 'pnpm astro build' first.`)
    process.exit(1)
  }
  const baseline = JSON.parse(await readFile(baselinePath, 'utf8'))

  const current = {}
  for await (const f of walk(DIST)) {
    if (!f.endsWith('.html')) continue
    const rel = relative(DIST, f)
    const html = await readFile(f, 'utf8')
    current[rel] = sha256(normalize(extractMain(html)))
  }

  const diffs = []
  for (const [page, meta] of Object.entries(baseline)) {
    const cur = current[page]
    if (!cur) { diffs.push(`MISSING: ${page}`); continue }
    if (cur !== meta.hash) diffs.push(`CHANGED: ${page}`)
  }
  for (const page of Object.keys(current)) {
    if (!baseline[page]) diffs.push(`NEW: ${page}`)
  }

  if (diffs.length) {
    console.error(`Snapshot verification FAILED: ${diffs.length} difference(s)`)
    for (const d of diffs) console.error('  ' + d)
    process.exit(1)
  }
  console.log(`Snapshot verification OK: ${Object.keys(baseline).length} pages match`)
}

main().catch(e => { console.error(e); process.exit(1) })
