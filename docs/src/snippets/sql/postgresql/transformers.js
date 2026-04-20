export const rows = [
    { flyql: `status|upper = "ERROR"`, sql: `UPPER("status") = 'ERROR'` },
    { flyql: `status|lower = "info"`, sql: `LOWER("status") = 'info'` },
    { flyql: `message|len > 100`, sql: `LENGTH("message") > 100` },
    { flyql: `message|lower|len > 100`, sql: `LENGTH(LOWER("message")) > 100` },
    { flyql: `tags|split(",") has "urgent"`, sql: `'urgent' = ANY(STRING_TO_ARRAY("tags", ','))` },
]
