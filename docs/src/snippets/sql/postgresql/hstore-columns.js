export const rows = [
    { flyql: `metadata.key1 = 'value1'`, sql: `"metadata"->'key1' = 'value1'` },
    { flyql: `metadata.key1 != 'value1'`, sql: `"metadata"->'key1' != 'value1'` },
    { flyql: `metadata.pattern ~ 'test.*'`, sql: `"metadata"->'pattern' ~ 'test.*'` },
]
