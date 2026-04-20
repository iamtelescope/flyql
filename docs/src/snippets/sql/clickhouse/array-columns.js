export const rows = [
    { flyql: `tags.0 = 'first'`, sql: `equals(tags[1], 'first')` },
    { flyql: `tags.1 = 'second'`, sql: `equals(tags[2], 'second')` },
    { flyql: `tags.0 ~ 'tag.*'`, sql: `match(tags[1], 'tag.*')` },
]
