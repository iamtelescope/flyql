export const rows = [
    { dialect: 'clickhouse', flyql: `metadata.key1 = 'value1'`, sql: `equals(metadata['key1'], 'value1')` },
    { dialect: 'postgresql', flyql: `metadata.key1 = 'value1'`, sql: `"metadata"->'key1' = 'value1'` },
    { dialect: 'starrocks', flyql: `metadata.key1 = 'value1'`, sql: "`metadata`['key1'] = 'value1'" },
]
