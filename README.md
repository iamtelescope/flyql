# FlyQL

A simple query language accompanied by a parser that transforms input queries into an Abstract Syntax Tree (AST). This AST represents the syntactic structure of the query and can later be used by generator modules to produce target code ,such as SQL, for filtering or processing data.

## Basic Query Structure

A query consists of one or more conditions connected by boolean operators (**and**, **or**, **not**). Conditions can be comparisons or truthy checks.

```
status=200 and active and not archived
```
- `status=200` - `status` field equals `200`
- `active` - `active` field has a truthy value
- `not archived` - `archived` field is falsy (null, empty, zero, or false)

More examples:
```
service!=api or user="john doe"     # comparisons with or
message~"error.*" and not debug     # regex match and negation
(a=1 or b=2) and not (c=3 and d=4)  # grouped conditions
```

## Syntax

### Operators

FlyQL supports the following comparison operators:

- **Equals** - `=`
- **Not equals** - `!=`
- **Regex match** - `~`
- **Not regex match** - `!~`
- **Greater than** - `>`
- **Lower than** - `<`
- **Greater or equals than** - `>=`
- **Lower or equals than** - `<=`

### Truthy Checks

A standalone key without an operator checks if the field has a truthy value:

```
active
message and status
```

A value is considered **falsy** if it is:
- `null` / `None` / missing
- Empty string `""`
- Zero `0`
- Boolean `false`

Everything else is **truthy**.

### Negation Operator

Use `not` to negate any expression:

```
not active                  # field is falsy
not status=200              # status is not 200
not (a=1 and b=2)           # negates the grouped expression
active and not archived     # combine with other conditions
```

Double negation cancels out: `not not active` is equivalent to `active`.

### Boolean Operators and Parentheses
- **Boolean operators** - Use `and` to require all conditions to be true and `or` to allow for either condition.
- **Negation** - Use `not` before any expression to negate it.
- **Parentheses** - Use `(` and `)` to group conditions and set the precedence of operations (parentheses must be matched on both sides to avoid errors).

### General Query Syntax Rules
- **Standalone keys** - A key without an operator is treated as a truthy check.
- **Comparisons** - A key with an operator must have a corresponding value.
- **Spaces** - Spaces around operators are allowed (`status=200` and `status = 200` are equivalent).

### Handling values
- **Without spaces** - If the value contains no spaces, you can write it directly (e.g., `status=200`).
- **With spaces** - If the value includes spaces, enclose it in single (`'`) or double (`"`) quotes (e.g., `user="John Doe"` or `user='John Doe'`).
- **Escaping quotes** - If the value itself contains quotes, these must be properly escaped (e.g. `user='John\'s Doe'`).
