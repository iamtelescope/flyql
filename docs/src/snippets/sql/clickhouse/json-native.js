export const rows = [
    { flyql: `data.name = 'test'`, sql: "data.`name` = 'test'" },
    { flyql: `data.user.name = 'john'`, sql: "data.`user`.`name` = 'john'" },
    { flyql: `data.age = 25`, sql: "data.`age` = 25" },
]
