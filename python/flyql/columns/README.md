# FlyQL Columns Parser

A standalone columns parser extracted from the Telescope project. Parses column selection syntax with support for nested paths, modifiers (transformations), and aliases.

## Features

- **Simple column names**: `message`, `user_id`, `status`
- **Nested paths**: `metadata:labels:tier`, `user.profile.name`
- **Modifiers (transformations)**: `message|upper`, `text|chars(25)`
- **Modifier chaining**: `message|upper|chars(10)|trim`
- **Modifier arguments**: `chars(5,10)`, `split('\t')`, `format("json")`
- **Aliases**: `message as msg`, `metadata:tier as environment`
- **Multiple columns**: `message, status, user_id`

## Installation

```python
from flyql.columns import parse
```

## Usage

### Basic Parsing

```python
from flyql.columns import parse

# Simple column
columns = parse("message")
# [ParsedColumn(name="message", modifiers=[], alias=None)]

# Nested column (colon-separated path)
columns = parse("metadata:labels:tier")
# [ParsedColumn(name="metadata:labels:tier", modifiers=[], alias=None)]

# Multiple columns
columns = parse("message, status, user_id")
# [ParsedColumn(...), ParsedColumn(...), ParsedColumn(...)]
```

### Modifiers (Transformations)

```python
# Modifier without arguments
columns = parse("message|upper")

# Modifier with arguments
columns = parse("message|chars(25)")

# Multiple arguments
columns = parse("text|substr(5,10)")

# String arguments (quoted)
columns = parse("message|split('\\t')")

# Chained modifiers
columns = parse("message|upper|chars(10)|trim")
```

### Aliases

```python
# Simple alias
columns = parse("message as msg")

# With modifier and alias
columns = parse("message|upper as MSG")
```

### Complete Example

```python
from flyql.columns import parse

input_str = "metadata:labels:env|upper|chars(10) as environment, status, user_id"
columns = parse(input_str)

for col in columns:
    print(f"Name: {col.name}")
    print(f"Modifiers: {col.modifiers}")
    print(f"Alias: {col.alias}")
    print()
```

Output:
```
Name: metadata:labels:env
Modifiers: [{'name': 'upper', 'arguments': []}, {'name': 'chars', 'arguments': [10]}]
Alias: environment

Name: status
Modifiers: []
Alias: None

Name: user_id
Modifiers: []
Alias: None
```

## Data Structure

### ParsedColumn

```python
class ParsedColumn:
    name: str                      # Full column name (e.g., "metadata:labels:tier")
    modifiers: List[Dict[str, Any]]  # List of modifiers with arguments
    alias: Optional[str]           # Optional alias from "as" keyword

    def as_dict(self) -> Dict[str, Any]:
        """Convert to dictionary representation"""
```

### Modifier Structure

```python
{
    "name": "chars",           # Modifier name
    "arguments": [25]          # List of arguments (typed: int, float, or str)
}
```

## Syntax

### Column Names

Valid characters: alphanumeric, underscore (`_`), hyphen (`-`), dot (`.`), colon (`:`), slash (`/`)

Examples:
- `message`
- `user_id`
- `request-id`
- `user.profile.name`
- `metadata:labels:tier`
- `path/to/column`

### Nested Paths

Use colon (`:`) as delimiter for nested JSON/map/array access:
- `metadata:labels:tier` → access nested structure
- `errors:0:message` → array index access

### Modifiers

Syntax: `column|modifier(arg1,arg2,...)`

- Modifier names: alphanumeric + underscore
- Arguments: integers, floats, or quoted strings
- No arguments: `column|upper`
- With arguments: `column|chars(25)`
- Multiple arguments: `column|substr(5,10)`
- String arguments: `column|split('\t')` or `column|split("\t")`

### Aliases

Syntax: `column as alias_name`

The `as` keyword must be lowercase. Alias names follow the same rules as column names.

### Multiple Columns

Separate columns with comma (`,`):
```
message, status, user_id
message|upper, status|lower
```

Whitespace around commas is optional.

## Error Handling

The parser raises `ParserError` with an errno code for various syntax errors:

```python
from flyql.columns import parse, ParserError

try:
    columns = parse("@invalid")
except ParserError as e:
    print(f"Error: {e.message}")
    print(f"Error code: {e.errno}")
```

Common errors:
- `errno=2`: Invalid character in column name
- `errno=3`: Invalid alias operator (not "as")
- `errno=6`: Invalid character after column
- `errno=7`: Expected modifier after `|`
- `errno=12`: Unclosed quoted string
- `errno=13`: Incomplete alias

## Validation (Optional)

The parser only performs syntax parsing. For schema validation (checking if columns exist, validating modifier names), use a separate validation step:

```python
from flyql.columns import parse, ParserError

# Parse first
columns = parse("message|chars(25), unknown_column|invalid_modifier")

# Then validate against your schema
valid_columns = ["message", "status", "user_id"]
known_modifiers = ["chars", "upper", "lower", "split"]

for col in columns:
    # Validate column exists
    root_column = col.name.split(":")[0]
    if root_column not in valid_columns:
        raise ValueError(f"Unknown column: {root_column}")

    # Validate modifiers
    for modifier in col.modifiers:
        if modifier["name"] not in known_modifiers:
            raise ValueError(f"Unknown modifier: {modifier['name']}")
```

## Test Data

Shared test data for multi-language implementations is located at:
```
/flyql/tests-data/columns/parser/
├── basic.json       # Basic parsing tests
├── modifiers.json   # Modifier tests
└── errors.json      # Error handling tests
```

These JSON files follow the same format as FlyQL's parser tests and can be used to verify implementations in other languages (Go, JavaScript, etc.).

## Differences from Telescope

This parser is extracted from Telescope's `fields.py` but with key changes:

1. **No schema dependency**: Doesn't require a `Source` model
2. **Simpler output**: Only returns `name`, `modifiers`, and `alias` (no `type`, `jsonstring`, `root_name`)
3. **No validation**: Doesn't validate column names or modifier names (validation is separate)
4. **Standalone**: Can be used independently of any specific application

## Architecture

The parser is a finite state machine (FSM) with 12 states:

- `EXPECT_FIELD`: Waiting for column name
- `FIELD`: Reading column name
- `EXPECT_MODIFIER`: Waiting for modifier name
- `MODIFIER`: Reading modifier name
- `MODIFIER_ARGUMENT`: Reading unquoted argument
- `MODIFIER_ARGUMENT_DOUBLE_QUOTED`: Reading double-quoted argument
- `MODIFIER_ARGUMENT_SINGLE_QUOTED`: Reading single-quoted argument
- `EXPECT_MODIFIER_ARGUMENT`: Waiting for next argument
- `EXPECT_MODIFIER_ARGUMENT_DELIMITER`: Waiting for `,` or `)`
- `MODIFIER_COMPLETE`: Modifier finished
- `EXPECT_ALIAS_OPERATOR`: Waiting for "as" keyword
- `EXPECT_ALIAS`: Reading alias name

The parser processes input character-by-character, tracking position and line numbers for detailed error reporting.

## License

MIT License (same as FlyQL)
