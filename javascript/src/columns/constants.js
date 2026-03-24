export const DOT = '.'
export const DOUBLE_QUOTE = '"'
export const SINGLE_QUOTE = "'"
export const MODIFIER_OPERATOR = '|'
export const MODIFIER_ARGUMENT_DELIMITER = ','
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

export const MODIFIER_INFO = {
    chars: { args: [{ type: 'int' }, { type: 'int', optional: true }] },
    slice: { args: [{ type: 'int' }, { type: 'int', optional: true }] },
    lines: { args: [{ type: 'int' }, { type: 'int', optional: true }] },
    split: { args: [{ type: 'string' }] },
    join: { args: [{ type: 'string', optional: true }] },
    upper: { args: [] },
    lower: { args: [] },
    firstline: { args: [] },
    lastline: { args: [] },
    oneline: { args: [] },
    json: { args: [] },
    str: { args: [] },
    type: { args: [] },
    fmt: { args: [{ type: 'string', optional: true }] },
    format: { args: [{ type: 'string', optional: true }] },
    hl: { args: [{ type: 'string', optional: true }] },
    highlight: { args: [{ type: 'string', optional: true }] },
    href: { args: [{ type: 'string' }, { type: 'string', optional: true }] },
}

export const KNOWN_MODIFIERS = Object.keys(MODIFIER_INFO)

// Token types for Monaco editor syntax highlighting
export const CharType = {
    COLUMN: 'column',
    ALIAS: 'alias',
    OPERATOR: 'operator',
    MODIFIER: 'modifier',
    ARGUMENT: 'argument',
    ERROR: 'error',
}

export const tokenTypes = [
    CharType.COLUMN,
    CharType.ALIAS,
    CharType.OPERATOR,
    CharType.MODIFIER,
    CharType.ARGUMENT,
    CharType.ERROR,
]
