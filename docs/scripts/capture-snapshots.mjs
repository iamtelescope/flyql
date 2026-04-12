#!/usr/bin/env node
import { readFile, readdir, mkdir, writeFile, cp, rm } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join, relative } from 'node:path'
import { existsSync } from 'node:fs'

const DOCS_ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
const DIST = join(DOCS_ROOT, 'dist')
const OUT_DEFAULT = join(DOCS_ROOT, '..', '_bmad-output', 'implementation-artifacts', 'pre-refactor-snapshots')

function parseArgs(argv) {
  const out = { dir: OUT_DEFAULT }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out' && argv[i + 1]) { out.dir = argv[++i]; continue }
    if (argv[i].startsWith('--out=')) out.dir = argv[i].slice(6)
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
  const { dir: outDir } = parseArgs(process.argv.slice(2))
  if (!existsSync(DIST)) {
    console.error(`ERROR: ${DIST} does not exist. Run 'pnpm astro build' first.`)
    process.exit(1)
  }
  await rm(outDir, { recursive: true, force: true })
  await mkdir(outDir, { recursive: true })
  await cp(DIST, join(outDir, 'dist'), { recursive: true })

  const manifest = {}
  for await (const f of walk(DIST)) {
    if (!f.endsWith('.html')) continue
    const rel = relative(DIST, f)
    const html = await readFile(f, 'utf8')
    const mainHtml = extractMain(html)
    const normalized = normalize(mainHtml)
    manifest[rel] = {
      hash: sha256(normalized),
      excerpt: normalized.slice(0, 200),
    }
  }
  const manifestPath = join(outDir, 'manifest.json')
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2))
  console.log(`Wrote ${Object.keys(manifest).length} page hashes to ${manifestPath}`)
}

main().catch(e => { console.error(e); process.exit(1) })
