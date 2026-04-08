import { parse } from 'flyql'

const result = parse("status = 200 and active")
console.log(result.root)
