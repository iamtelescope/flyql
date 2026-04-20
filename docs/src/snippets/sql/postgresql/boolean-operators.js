export const rows = [
    { flyql: `a = '1' and b > 10`, sql: `"a" = '1' AND "b" > 10` },
    { flyql: `a = '1' or b = '2'`, sql: `"a" = '1' OR "b" = '2'` },
    { flyql: `not a = '1'`, sql: `NOT ("a" = '1')` },
]
