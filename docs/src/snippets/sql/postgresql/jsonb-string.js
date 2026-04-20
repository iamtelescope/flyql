export const rows = [
    {
        flyql: `data.name = 'test'`,
        sql: `(jsonb_typeof("data"->'name') = 'string' AND "data"->>'name' = 'test')`,
    },
    {
        flyql: `data.user.name = 'john'`,
        sql: `(jsonb_typeof("data"->'user'->'name') = 'string' AND "data"->'user'->>'name' = 'john')`,
    },
]
