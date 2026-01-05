export function validateColumns(columns, schema, options = {}) {
    const errors = []
    const warnings = []
    const validatedColumns = []

    const schemaColumnNames = Object.keys(schema || {})

    for (const column of columns) {
        const columnName = column.name.split('.')[0]

        if (!schema || !schema[columnName]) {
            errors.push({
                column: column.name,
                error: `Column '${columnName}' not found in schema`,
                errno: 100,
            })
            continue
        }

        const schemaColumn = schema[columnName]

        if (options.validateModifiers && column.modifiers) {
            const allowedModifiers = options.allowedModifiers || []
            for (const modifier of column.modifiers) {
                if (allowedModifiers.length > 0 && !allowedModifiers.includes(modifier.name)) {
                    warnings.push({
                        column: column.name,
                        modifier: modifier.name,
                        warning: `Unknown modifier '${modifier.name}'`,
                    })
                }
            }
        }

        validatedColumns.push({
            ...column,
            schema: schemaColumn,
        })
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings,
        columns: validatedColumns,
    }
}

export function validateColumnNames(columnNames, schema) {
    const errors = []
    for (const name of columnNames) {
        const columnName = name.split('.')[0]
        if (!schema || !schema[columnName]) {
            errors.push(`Column '${columnName}' not found in schema`)
        }
    }
    return {
        valid: errors.length === 0,
        errors,
    }
}
