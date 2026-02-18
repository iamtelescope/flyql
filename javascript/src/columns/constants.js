export const AT = '@'
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

export const KNOWN_MODIFIERS = [
    'chars',
    'slice',
    'split',
    'lines',
    'firstline',
    'lastline',
    'oneline',
    'lower',
    'upper',
    'join',
    'json',
    'str',
    'href',
    'hl',
    'highlight',
    'fmt',
    'format',
    'type',
]

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
