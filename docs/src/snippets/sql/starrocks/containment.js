export const rows = [
    { flyql: `message has 'error'`, sql: "INSTR(`message`, 'error') > 0" },
    { flyql: `message not has 'error'`, sql: "(`message` IS NULL OR INSTR(`message`, 'error') = 0)" },
    { flyql: `tags has 'web'`, sql: "array_contains(`tags`, 'web')" },
    { flyql: `tags not has 'web'`, sql: "NOT array_contains(`tags`, 'web')" },
    { flyql: `metadata has 'key'`, sql: "array_contains(map_keys(`metadata`), 'key')" },
    { flyql: `metadata not has 'key'`, sql: "NOT array_contains(map_keys(`metadata`), 'key')" },
    { flyql: `data has 'key'`, sql: "json_exists(`data`, concat('$.', 'key'))" },
]
