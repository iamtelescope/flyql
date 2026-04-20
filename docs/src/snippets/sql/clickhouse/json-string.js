export const rows = [
    {
        flyql: `log.name = 'test'`,
        sql: `multiIf(JSONType(log, 'name') = 'String', equals(JSONExtractString(log, 'name'), 'test'),0)`,
    },
    {
        flyql: `log.user.name = 'john'`,
        sql: `multiIf(JSONType(log, 'user', 'name') = 'String', equals(JSONExtractString(log, 'user', 'name'), 'john'),0)`,
    },
]
