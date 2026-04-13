import { parse, parseToJson } from 'flyql/columns'

// Parse basic columns (transformers disabled by default)
const parsed = parse("message, status")
for (const col of parsed) {
    console.log(`${col.name} (display: ${JSON.stringify(col.displayName)}, segments: ${col.segments})`)
}

// Enable transformers via capabilities
const withTransforms = parse("message|chars(25) as msg, status", { transformers: true })

// Or serialize directly to JSON for API responses
const json = parseToJson("message, status|upper", { transformers: true })
console.log(json)
