#!/usr/bin/env node
import { readdir, readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parse as parseVue } from '@vue/compiler-sfc'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const SNIPPETS = join(__dirname, '..', 'snippets')

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(p)
    else yield p
  }
}

function validateCss(src) {
  if (!src.trim()) throw new Error('CSS file is empty')
  let depth = 0
  let line = 1
  let col = 0
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (c === '\n') {
      line++
      col = 0
    } else {
      col++
    }
    if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2)
      if (end === -1) throw new Error(`unterminated comment at ${line}:${col}`)
      i = end + 1
      continue
    }
    if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth < 0) throw new Error(`unmatched '}' at ${line}:${col}`)
    }
  }
  if (depth !== 0) throw new Error(`unbalanced braces: ${depth} unclosed`)
}

let failed = 0
let ran = 0
for await (const f of walk(SNIPPETS)) {
  try {
    if (f.endsWith('.mjs') || f.endsWith('.js')) {
      await import(pathToFileURL(f).href)
      ran++
      console.log('  ok  ' + f)
    } else if (f.endsWith('.vue')) {
      const src = await readFile(f, 'utf8')
      const { errors } = parseVue(src)
      if (errors.length) throw new Error(errors.map((e) => e.message).join('\n'))
      ran++
      console.log('  ok  ' + f)
    } else if (f.endsWith('.css')) {
      const src = await readFile(f, 'utf8')
      validateCss(src)
      ran++
      console.log('  ok  ' + f)
    }
  } catch (e) {
    console.error('  FAIL ' + f + ': ' + e.message)
    failed++
  }
}
console.log(`\n${ran} snippet(s) passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
