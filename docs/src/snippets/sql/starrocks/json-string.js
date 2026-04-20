export const rows = [
    { flyql: `log.name = 'test'`, sql: "parse_json(`log`)->'\"name\"' = 'test'" },
    { flyql: `log.user.name = 'john'`, sql: "parse_json(`log`)->'\"user\"'->'\"name\"' = 'john'" },
]
