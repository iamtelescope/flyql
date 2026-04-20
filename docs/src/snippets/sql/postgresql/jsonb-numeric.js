export const rows = [
    {
        flyql: `data.age > 25`,
        sql: `(jsonb_typeof("data"->'age') = 'number' AND ("data"->>'age')::numeric > 25)`,
    },
]
