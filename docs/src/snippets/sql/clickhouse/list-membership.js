export const rows = [
    { flyql: `status in [200, 201]`, sql: `status IN (200, 201)` },
    { flyql: `env not in ['dev', 'test']`, sql: `env NOT IN ('dev', 'test')` },
    { flyql: `status in []`, sql: `0` },
    { flyql: `status not in []`, sql: `1` },
]
