import { match } from 'flyql/matcher'

const data = {
    status: 200,
    active: true,
    host: "prod-api-01",
}

const matches = match("status = 200 and active", data)
console.log(`Matches: ${matches}`) // true
