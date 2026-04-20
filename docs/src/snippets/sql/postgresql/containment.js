export const rows = [
    { flyql: `message has 'error'`, sql: `position('error' in "message") > 0` },
    { flyql: `message not has 'error'`, sql: `("message" IS NULL OR position('error' in "message") = 0)` },
    { flyql: `tags has 'web'`, sql: `'web' = ANY("tags")` },
    { flyql: `tags not has 'web'`, sql: `NOT ('web' = ANY("tags"))` },
    { flyql: `data has 'key'`, sql: `"data" ? 'key'` },
    { flyql: `data not has 'key'`, sql: `NOT ("data" ? 'key')` },
    { flyql: `metadata has 'key'`, sql: `"metadata" ? 'key'` },
]
