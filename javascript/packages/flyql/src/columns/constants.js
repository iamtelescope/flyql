export const AT = '@'
export const DOT = '.'
export const DOUBLE_QUOTE = '"'
export const SINGLE_QUOTE = "'"
export const TRANSFORMER_OPERATOR = '|'
export const TRANSFORMER_ARGUMENT_DELIMITER = ','
export const COLUMNS_DELIMITER = ','
export const SPACE = ' '
export const ALIAS_DELIMITER = ' '
export const COLON = ':'
export const SLASH = '/'
export const BACKSLASH = '\\'
export const BRACKET_OPEN = '('
export const BRACKET_CLOSE = ')'
export const UNDERSCORE = '_'
export const HYPHEN = '-'
export const NEWLINE = '\n'
export const VALID_ALIAS_OPERATOR = 'as'

export const ESCAPE_SEQUENCES = {
    b: '\b',
    f: '\f',
    n: '\n',
    r: '\r',
    t: '\t',
    v: '\v',
    '\\': '\\',
}

export const CharType = {
    COLUMN: 'column',
    ALIAS: 'alias',
    ALIAS_OPERATOR: 'aliasOperator',
    OPERATOR: 'operator',
    TRANSFORMER: 'transformer',
    ARGUMENT: 'argument',
    SPACE: 'space',
    ERROR: 'error',
    RENDERER: 'renderer',
    RENDERER_ARGUMENT: 'renderer_argument',
    RENDERER_PIPE: 'renderer_pipe',
}
