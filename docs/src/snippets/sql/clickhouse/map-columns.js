export const rows = [
    { flyql: `metadata.key1 = 'value1'`, sql: `equals(metadata['key1'], 'value1')` },
    { flyql: `metadata.key1 != 'value1'`, sql: `(mapContains(metadata, 'key1') AND notEquals(metadata['key1'], 'value1'))` },
    { flyql: `metadata.pattern ~ 'test.*'`, sql: `match(metadata['pattern'], 'test.*')` },
]
