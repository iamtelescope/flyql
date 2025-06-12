# FlyQL

A simple query language accompanied by a parser that transforms input queries into an Abstract Syntax Tree (AST). This AST represents the syntactic structure of the query and can later be used by generator modules to produce target code ,such as SQL, for filtering or processing data.

## Basic Query Structure

A query consists of one or more conditions connected by boolean operators (**and**, **or**). Each condition compares a **key** with a **value** using a specific **operator**.

```(flyql)
status=200 and (service!=api or user="john doe")
```
- `status = 200` - `status` field is exactly `200`
- `service = api` - `service` field is not equals to `api`
- `user =~ "John.*"` - `user` field is equals to regex

Parentheses determine that the condition (`service!=api or user="john doe"`) is evaluated as a group.

## Syntax

### Operators

FlyQL supports the following comparison operators:

- **Equals** - `=`
- **Not equals** - `!=`
- **Equals regex** - `=~`
- **Not equals regex** - `!~`
- **Greater than** - `>`
- **Lower than** - `<`
- **Greater or equals than** - `>=`
- **Lower or equals than** - `<=`

### Boolean Operators and Parentheses
- **Boolean operators** - Use `and` to require all conditions to be true and `or` to allow for either condition.
- **Parentheses** - Use `(` and `)` to group conditions and set the precedence of operations (parentheses must be matched on both sides to avoid errors).

### General Query Syntax Rules
- **No spaces** - There must be no spaces between the key, operator, and value.
- **Mandatory Operator and Value** - Every key must be immediately followed by a valid operator and a corresponding value.

### Handling values
- **Without spaces** - If the value contains no spaces, you can write it directly (e.g., `status=200`).
- **With spaces** - If the value includes spaces, enclose it in single (`'`) or double (`"`) quotes (e.g., `user="John Doe"` or `user='John Doe'`).
- **Escaping quotes** - If the value itself contains quotes, these must be properly escaped (e.g. `user='John\'s Doe'`).
