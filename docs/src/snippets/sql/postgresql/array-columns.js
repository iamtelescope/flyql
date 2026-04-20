export const rows = [
    { flyql: `tags.0 = 'first'`, sql: `"tags"[1] = 'first'` },
    { flyql: `tags.1 = 'second'`, sql: `"tags"[2] = 'second'` },
    { flyql: `tags.0 ~ 'tag.*'`, sql: `"tags"[1] ~ 'tag.*'` },
]
