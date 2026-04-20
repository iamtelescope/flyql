export const rows = [
    { dialect: 'clickhouse', flyql: `tags.0 = 'first'`, sql: `equals(tags[1], 'first')` },
    { dialect: 'postgresql', flyql: `tags.0 = 'first'`, sql: `"tags"[1] = 'first'` },
    { dialect: 'starrocks', flyql: `tags.0 = 'first'`, sql: "`tags`[1] = 'first'" },
]
