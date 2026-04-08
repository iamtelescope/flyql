import { parse, ParserError } from 'flyql'

try {
    const result = parse("status = 200 and active")
    console.log(result.root)
} catch (err) {
    if (err instanceof ParserError) {
        console.error(`Parse error: ${err.message}`)
    }
}
