export const rows = [
    { flyql: `status|upper = "ERROR"`, sql: `upper(status) = 'ERROR'` },
    { flyql: `status|lower = "info"`, sql: `lower(status) = 'info'` },
    { flyql: `message|len > 100`, sql: `length(message) > 100` },
    { flyql: `message|lower|len > 100`, sql: `length(lower(message)) > 100` },
    { flyql: `tags|split(",") has "urgent"`, sql: `has(splitByChar(',', tags), 'urgent')` },
]
