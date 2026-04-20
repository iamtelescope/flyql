export const rows = [
    { flyql: `message`, sql: `(message IS NOT NULL AND message != '')` },
    { flyql: `count`, sql: `(count IS NOT NULL AND count != 0)` },
    { flyql: `active`, sql: `active` },
    { flyql: `created_at`, sql: `(created_at IS NOT NULL)` },
    { flyql: `not message`, sql: `(message IS NULL OR message = '')` },
]
