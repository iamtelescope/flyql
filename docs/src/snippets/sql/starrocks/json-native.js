export const rows = [
    { flyql: `data.name = 'test'`, sql: "`data`->'\"name\"' = 'test'" },
    { flyql: `data.user.name = 'john'`, sql: "`data`->'\"user\"'->'\"name\"' = 'john'" },
]
