#!/usr/bin/env node
// JS errno-parity CLI. Parses a single flyql query via the core or columns
// parser and prints `{errno, error_text}` as JSON on stdout. Used by the e2e
// parity harness (runner.py --errno-parity) to compare JS's errno emission
// against Python and Go.

import { parseArgs } from 'node:util'
import { Parser as CoreParser, ParserError as CoreParserError } from '../javascript/packages/flyql/src/index.js'
import { parse as columnsParse, ParserError as ColumnsParserError } from '../javascript/packages/flyql/src/columns/index.js'

const { values } = parseArgs({
    options: {
        input: { type: 'string' },
        category: { type: 'string', default: 'core' },
        transformers: { type: 'boolean', default: false },
        renderers: { type: 'boolean', default: false },
    },
})

if (values.input == null) {
    process.stderr.write('--input is required\n')
    process.exit(2)
}

let out = { errno: 0, error_text: '' }

if (values.category === 'core') {
    const parser = new CoreParser()
    try {
        parser.parse(values.input)
    } catch (err) {
        if (err instanceof CoreParserError) {
            out = { errno: err.errno, error_text: parser.errorText }
        } else {
            throw err
        }
    }
} else if (values.category === 'columns') {
    const caps = { transformers: values.transformers, renderers: values.renderers }
    try {
        columnsParse(values.input, caps)
    } catch (err) {
        if (err instanceof ColumnsParserError) {
            out = { errno: err.errno, error_text: err.message }
        } else {
            throw err
        }
    }
} else {
    process.stderr.write(`unknown --category ${values.category}\n`)
    process.exit(2)
}

process.stdout.write(JSON.stringify(out) + '\n')
