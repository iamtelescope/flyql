export const rows = [
    { flyql: `message = 'hello'`, sql: "`message` = 'hello'" },
    { flyql: `message != 'hello'`, sql: "`message` != 'hello'" },
    { flyql: `count > 10`, sql: '`count` > 10' },
    { flyql: `count <= 100`, sql: '`count` <= 100' },
    { flyql: `message ~ 'error.*'`, sql: "regexp(`message`, 'error.*')" },
    { flyql: `message !~ 'test.*'`, sql: "NOT regexp(`message`, 'test.*')" },
    { flyql: `host = 'prod'`, sql: "`host` = 'prod'" },
]
