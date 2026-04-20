export const rows = [
    { flyql: `message has 'error'`, sql: `position(message, 'error') > 0` },
    { flyql: `message not has 'error'`, sql: `(message IS NULL OR position(message, 'error') = 0)` },
    { flyql: `tags has 'web'`, sql: `has(tags, 'web')` },
    { flyql: `tags not has 'web'`, sql: `NOT has(tags, 'web')` },
    { flyql: `metadata has 'key'`, sql: `mapContains(metadata, 'key')` },
    { flyql: `metadata not has 'key'`, sql: `NOT mapContains(metadata, 'key')` },
    { flyql: `data has 'key'`, sql: `JSONHas(toJSONString(data), 'key')` },
    { flyql: `log has 'key'`, sql: `JSONHas(log, 'key')` },
]
