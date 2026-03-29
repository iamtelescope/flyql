import re
from dataclasses import dataclass, field
from typing import Any, List, Mapping, Optional, Tuple

from flyql.core.exceptions import FlyqlError
from flyql.core.expression import Expression
from flyql.core.key import Key, parse_key
from flyql.core.constants import (
    Operator,
    VALID_KEY_VALUE_OPERATORS,
    VALID_BOOL_OPERATORS,
)
from flyql.core.tree import Node

from flyql.generators.postgresql.column import Column
from flyql.generators.postgresql.helpers import (
    validate_operation,
    validate_in_list_types,
)
from flyql.generators.postgresql.constants import (
    NORMALIZED_TYPE_STRING,
    NORMALIZED_TYPE_INT,
    NORMALIZED_TYPE_FLOAT,
    NORMALIZED_TYPE_BOOL,
    NORMALIZED_TYPE_DATE,
)
from flyql.generators.transformer_helpers import (
    apply_transformer_sql,
    get_transformer_output_type,
    validate_transformer_chain,
)
from flyql.transformers.registry import TransformerRegistry

BOOL_OP_TO_SQL = {
    "and": "AND",
    "or": "OR",
}

LIKE_PATTERN_CHAR = "*"
SQL_LIKE_PATTERN_CHAR = "%"
JSON_KEY_PATTERN = re.compile(r"^[a-zA-Z_][.a-zA-Z0-9_-]*$")

ESCAPE_CHARS_MAP = {
    "\b": "\\b",
    "\f": "\\f",
    "\r": "\\r",
    "\n": "\\n",
    "\t": "\\t",
    "\0": "\\0",
    "\a": "\\a",
    "\v": "\\v",
    "\\": "\\\\",
    "'": "\\'",
}


def validate_json_path_part(part: str, quoted: bool) -> None:
    if quoted:
        return
    if not part:
        raise FlyqlError("Invalid JSON path part")
    try:
        idx = int(part)
        if idx >= 0 and str(idx) == part:
            return
    except ValueError:
        pass
    if not JSON_KEY_PATTERN.match(part):
        raise FlyqlError("Invalid JSON path part")


def validate_operator(op: str) -> None:
    if op not in VALID_KEY_VALUE_OPERATORS:
        raise FlyqlError(f"invalid operator: {op}")


def validate_bool_operator(op: str) -> None:
    if op not in VALID_BOOL_OPERATORS:
        raise FlyqlError(f"invalid bool operator: {op}")


def escape_param(item: Any) -> str:
    if item is None:
        return "NULL"
    elif isinstance(item, str):
        return f"'{''.join(ESCAPE_CHARS_MAP.get(c, c) for c in item)}'"
    elif isinstance(item, bool):
        return "true" if item else "false"
    elif isinstance(item, (int, float)):
        return str(item)
    else:
        raise FlyqlError(f"unsupported type for escape_param: {type(item).__name__}")


def escape_identifier(name: str) -> str:
    escaped = name.replace('"', '""')
    return f'"{escaped}"'


def get_identifier(column: Column) -> str:
    if column.raw_identifier:
        return column.raw_identifier
    return escape_identifier(column.name)


def prepare_like_pattern_value(value: str) -> Tuple[bool, str]:
    pattern_found = False
    new_value = ""
    i = 0
    while i < len(value):
        char = value[i]
        if char == LIKE_PATTERN_CHAR:
            if i > 0 and value[i - 1] == "\\":
                new_value += LIKE_PATTERN_CHAR
            else:
                new_value += SQL_LIKE_PATTERN_CHAR
                pattern_found = True
        elif char == SQL_LIKE_PATTERN_CHAR:
            pattern_found = True
            new_value += "\\"
            new_value += SQL_LIKE_PATTERN_CHAR
        elif char == "\\" and i + 1 < len(value) and value[i + 1] == LIKE_PATTERN_CHAR:
            new_value += "\\"
        else:
            new_value += char
        i += 1
    return pattern_found, new_value


def _build_jsonb_path(
    identifier: str, path_parts: List[str], quoted: List[bool]
) -> str:
    if not path_parts:
        return identifier
    result = identifier
    for i, part in enumerate(path_parts):
        is_quoted = i < len(quoted) and quoted[i]
        is_last = i == len(path_parts) - 1
        if not is_quoted:
            try:
                idx = int(part)
                if idx >= 0 and str(idx) == part:
                    result += f"->>{idx}" if is_last else f"->{idx}"
                    continue
            except ValueError:
                pass
        escaped = escape_param(part)
        result += f"->>{escaped}" if is_last else f"->{escaped}"
    return result


def _build_jsonb_path_raw(
    identifier: str, path_parts: List[str], quoted: List[bool]
) -> str:
    if not path_parts:
        return identifier
    result = identifier
    for i, part in enumerate(path_parts):
        is_quoted = i < len(quoted) and quoted[i]
        if not is_quoted:
            try:
                idx = int(part)
                if idx >= 0 and str(idx) == part:
                    result += f"->{idx}"
                    continue
            except ValueError:
                pass
        escaped = escape_param(part)
        result += f"->{escaped}"
    return result


def expression_to_sql_simple(
    expression: Expression,
    columns: Mapping[str, Column],
    registry: Optional[TransformerRegistry] = None,
) -> str:
    column_name = expression.key.segments[0]
    if column_name not in columns:
        raise FlyqlError(f"unknown column: {column_name}")

    column = columns[column_name]

    if column.values and str(expression.value) not in column.values:
        raise FlyqlError(f"unknown value: {expression.value}")

    if column.normalized_type is not None and not expression.key.transformers:
        validate_operation(
            expression.value, column.normalized_type, expression.operator
        )

    identifier = get_identifier(column)
    if expression.key.transformers:
        validate_transformer_chain(expression.key.transformers, registry=registry)
        identifier = apply_transformer_sql(
            identifier, expression.key.transformers, "postgresql", registry=registry
        )

    if expression.operator == Operator.REGEX.value:
        value = escape_param(str(expression.value))
        return f"{identifier} ~ {value}"
    elif expression.operator == Operator.NOT_REGEX.value:
        value = escape_param(str(expression.value))
        return f"{identifier} !~ {value}"
    elif expression.operator in (Operator.EQUALS.value, Operator.NOT_EQUALS.value):
        operator = expression.operator
        is_like_pattern, processed = prepare_like_pattern_value(str(expression.value))
        escaped_value = escape_param(processed)
        if is_like_pattern:
            operator = (
                "LIKE" if expression.operator == Operator.EQUALS.value else "NOT LIKE"
            )
        return f"{identifier} {operator} {escaped_value}"
    else:
        value = escape_param(expression.value)
        return f"{identifier} {expression.operator} {value}"


def expression_to_sql_segmented(
    expression: Expression, columns: Mapping[str, Column]
) -> str:
    if expression.key.transformers:
        raise FlyqlError(
            "transformers on segmented (nested path) keys are not supported"
        )
    column_name = expression.key.segments[0]
    if column_name not in columns:
        raise FlyqlError(f"unknown column: {column_name}")

    column = columns[column_name]

    if column.normalized_type is not None and not column.jsonstring:
        validate_operation(
            expression.value, column.normalized_type, expression.operator
        )

    identifier = get_identifier(column)

    if column.is_jsonb or column.jsonstring:
        cast_identifier = f"({identifier}::jsonb)" if column.jsonstring else identifier
        json_path = expression.key.segments[1:]
        json_path_quoted = expression.key.quoted_segments[1:]
        for i, part in enumerate(json_path):
            validate_json_path_part(
                part, json_path_quoted[i] if i < len(json_path_quoted) else False
            )

        path_expr = _build_jsonb_path(cast_identifier, json_path, json_path_quoted)
        value = escape_param(expression.value)

        if expression.operator == Operator.REGEX.value:
            return f"{path_expr} ~ {value}"
        elif expression.operator == Operator.NOT_REGEX.value:
            return f"{path_expr} !~ {value}"
        elif isinstance(expression.value, (int, float)) and not isinstance(
            expression.value, bool
        ):
            jsonb_raw = _build_jsonb_path_raw(
                cast_identifier, json_path, json_path_quoted
            )
            return (
                f"(jsonb_typeof({jsonb_raw}) = 'number' AND "
                f"({path_expr})::numeric {expression.operator} {value})"
            )
        elif isinstance(expression.value, str):
            jsonb_raw = _build_jsonb_path_raw(
                cast_identifier, json_path, json_path_quoted
            )
            return (
                f"(jsonb_typeof({jsonb_raw}) = 'string' AND "
                f"{path_expr} {expression.operator} {value})"
            )
        else:
            return f"{path_expr} {expression.operator} {value}"

    elif column.is_hstore:
        map_key = ".".join(expression.key.segments[1:])
        escaped_map_key = escape_param(map_key)
        value = escape_param(expression.value)
        access_expr = f"{identifier}->{escaped_map_key}"

        if expression.operator == Operator.REGEX.value:
            return f"{access_expr} ~ {value}"
        elif expression.operator == Operator.NOT_REGEX.value:
            return f"{access_expr} !~ {value}"
        else:
            return f"{access_expr} {expression.operator} {value}"

    elif column.is_array:
        array_index_str = ".".join(expression.key.segments[1:])
        try:
            array_index = int(array_index_str)
        except ValueError as err:
            raise FlyqlError(
                f"invalid array index, expected number: {array_index_str}"
            ) from err
        value = escape_param(expression.value)
        pg_index = array_index + 1
        access_expr = f"{identifier}[{pg_index}]"

        if expression.operator == Operator.REGEX.value:
            return f"{access_expr} ~ {value}"
        elif expression.operator == Operator.NOT_REGEX.value:
            return f"{access_expr} !~ {value}"
        else:
            return f"{access_expr} {expression.operator} {value}"

    else:
        raise FlyqlError("path search for unsupported column type")


def in_expression_to_sql(expression: Expression, columns: Mapping[str, Column]) -> str:
    is_not_in = expression.operator == Operator.NOT_IN.value

    if not expression.values:
        return "TRUE" if is_not_in else "FALSE"

    column_name = expression.key.segments[0]
    if column_name not in columns:
        raise FlyqlError(f"unknown column: {column_name}")

    column = columns[column_name]

    if column.normalized_type is not None and not expression.key.is_segmented:
        validate_in_list_types(expression.values, column.normalized_type)

    values_sql = ", ".join(escape_param(v) for v in expression.values)
    sql_op = "NOT IN" if is_not_in else "IN"
    identifier = get_identifier(column)
    if expression.key.transformers:
        identifier = apply_transformer_sql(
            identifier, expression.key.transformers, "postgresql"
        )

    if expression.key.is_segmented:
        if column.is_jsonb or column.jsonstring:
            cast_identifier = (
                f"({identifier}::jsonb)" if column.jsonstring else identifier
            )
            json_path = expression.key.segments[1:]
            json_path_quoted = expression.key.quoted_segments[1:]
            for i, part in enumerate(json_path):
                validate_json_path_part(
                    part, json_path_quoted[i] if i < len(json_path_quoted) else False
                )
            path_expr = _build_jsonb_path(cast_identifier, json_path, json_path_quoted)
            return f"{path_expr} {sql_op} ({values_sql})"
        elif column.is_hstore:
            map_key = ".".join(expression.key.segments[1:])
            escaped_map_key = escape_param(map_key)
            return f"{identifier}->{escaped_map_key} {sql_op} ({values_sql})"
        elif column.is_array:
            array_index_str = ".".join(expression.key.segments[1:])
            try:
                array_index = int(array_index_str)
            except ValueError as err:
                raise FlyqlError(
                    f"invalid array index, expected number: {array_index_str}"
                ) from err
            return f"{identifier}[{array_index + 1}] {sql_op} ({values_sql})"
        else:
            raise FlyqlError("path search for unsupported column type")

    return f"{identifier} {sql_op} ({values_sql})"


def truthy_expression_to_sql(
    expression: Expression, columns: Mapping[str, Column]
) -> str:
    column_name = expression.key.segments[0]
    if column_name not in columns:
        raise FlyqlError(f"unknown column: {column_name}")

    column = columns[column_name]
    identifier = get_identifier(column)

    if expression.key.is_segmented:
        if column.is_jsonb or column.jsonstring:
            cast_identifier = (
                f"({identifier}::jsonb)" if column.jsonstring else identifier
            )
            json_path = expression.key.segments[1:]
            json_path_quoted = expression.key.quoted_segments[1:]
            for i, part in enumerate(json_path):
                validate_json_path_part(
                    part, json_path_quoted[i] if i < len(json_path_quoted) else False
                )
            path_expr = _build_jsonb_path(cast_identifier, json_path, json_path_quoted)
            return f"({path_expr} IS NOT NULL AND {path_expr} != '')"
        elif column.is_hstore:
            map_key = ".".join(expression.key.segments[1:])
            escaped_map_key = escape_param(map_key)
            return (
                f"({identifier} ? {escaped_map_key} AND "
                f"{identifier}->{escaped_map_key} != '')"
            )
        elif column.is_array:
            array_index_str = ".".join(expression.key.segments[1:])
            try:
                array_index = int(array_index_str)
            except ValueError as err:
                raise FlyqlError(
                    f"invalid array index, expected number: {array_index_str}"
                ) from err
            pg_index = array_index + 1
            return (
                f"(array_length({identifier}, 1) >= {pg_index} AND "
                f"{identifier}[{pg_index}] != '')"
            )
        else:
            raise FlyqlError("path search for unsupported column type")

    if expression.key.transformers:
        col_ref = apply_transformer_sql(
            identifier, expression.key.transformers, "postgresql"
        )
        return f"({col_ref} IS NOT NULL AND {col_ref} != '')"

    if column.jsonstring:
        empty_obj = "'{}'::jsonb"
        return (
            f"({identifier} IS NOT NULL AND {identifier} != '' AND "
            f"CASE jsonb_typeof({identifier}::jsonb) "
            f"WHEN 'array' THEN jsonb_array_length({identifier}::jsonb) > 0 "
            f"WHEN 'object' THEN {identifier}::jsonb != {empty_obj} "
            f"ELSE false END)"
        )

    if column.normalized_type == NORMALIZED_TYPE_BOOL:
        return identifier
    elif column.normalized_type == NORMALIZED_TYPE_STRING:
        return f"({identifier} IS NOT NULL AND {identifier} != '')"
    elif column.normalized_type in (NORMALIZED_TYPE_INT, NORMALIZED_TYPE_FLOAT):
        return f"({identifier} IS NOT NULL AND {identifier} != 0)"
    elif column.normalized_type == NORMALIZED_TYPE_DATE:
        return f"({identifier} IS NOT NULL)"
    else:
        return f"({identifier} IS NOT NULL)"


def falsy_expression_to_sql(
    expression: Expression, columns: Mapping[str, Column]
) -> str:
    column_name = expression.key.segments[0]
    if column_name not in columns:
        raise FlyqlError(f"unknown column: {column_name}")

    column = columns[column_name]
    identifier = get_identifier(column)

    if expression.key.is_segmented:
        if column.is_jsonb or column.jsonstring:
            cast_identifier = (
                f"({identifier}::jsonb)" if column.jsonstring else identifier
            )
            json_path = expression.key.segments[1:]
            json_path_quoted = expression.key.quoted_segments[1:]
            for i, part in enumerate(json_path):
                validate_json_path_part(
                    part, json_path_quoted[i] if i < len(json_path_quoted) else False
                )
            path_expr = _build_jsonb_path(cast_identifier, json_path, json_path_quoted)
            return f"({path_expr} IS NULL OR {path_expr} = '')"
        elif column.is_hstore:
            map_key = ".".join(expression.key.segments[1:])
            escaped_map_key = escape_param(map_key)
            return (
                f"(NOT ({identifier} ? {escaped_map_key}) OR "
                f"{identifier}->{escaped_map_key} = '')"
            )
        elif column.is_array:
            array_index_str = ".".join(expression.key.segments[1:])
            try:
                array_index = int(array_index_str)
            except ValueError as err:
                raise FlyqlError(
                    f"invalid array index, expected number: {array_index_str}"
                ) from err
            pg_index = array_index + 1
            return (
                f"(array_length({identifier}, 1) < {pg_index} OR "
                f"{identifier}[{pg_index}] = '')"
            )
        else:
            raise FlyqlError("path search for unsupported column type")

    if expression.key.transformers:
        col_ref = apply_transformer_sql(
            identifier, expression.key.transformers, "postgresql"
        )
        return f"({col_ref} IS NULL OR {col_ref} = '')"

    if column.jsonstring:
        empty_obj = "'{}'::jsonb"
        return (
            f"({identifier} IS NULL OR {identifier} = '' OR "
            f"CASE jsonb_typeof({identifier}::jsonb) "
            f"WHEN 'array' THEN jsonb_array_length({identifier}::jsonb) = 0 "
            f"WHEN 'object' THEN {identifier}::jsonb = {empty_obj} "
            f"ELSE true END)"
        )

    if column.normalized_type == NORMALIZED_TYPE_BOOL:
        return f"NOT {identifier}"
    elif column.normalized_type == NORMALIZED_TYPE_STRING:
        return f"({identifier} IS NULL OR {identifier} = '')"
    elif column.normalized_type in (NORMALIZED_TYPE_INT, NORMALIZED_TYPE_FLOAT):
        return f"({identifier} IS NULL OR {identifier} = 0)"
    elif column.normalized_type == NORMALIZED_TYPE_DATE:
        return f"({identifier} IS NULL)"
    else:
        return f"({identifier} IS NULL)"


def has_expression_to_sql(expression: Expression, columns: Mapping[str, Column]) -> str:
    column_name = expression.key.segments[0]
    if column_name not in columns:
        raise FlyqlError(f"unknown column: {column_name}")

    column = columns[column_name]
    is_not_has = expression.operator == Operator.NOT_HAS.value
    identifier = get_identifier(column)
    if expression.key.transformers:
        identifier = apply_transformer_sql(
            identifier, expression.key.transformers, "postgresql"
        )
    value = escape_param(expression.value)

    if expression.key.is_segmented:
        if column.is_jsonb or column.jsonstring:
            cast_identifier = (
                f"({identifier}::jsonb)" if column.jsonstring else identifier
            )
            json_path = expression.key.segments[1:]
            json_path_quoted = expression.key.quoted_segments[1:]
            for i, part in enumerate(json_path):
                validate_json_path_part(
                    part, json_path_quoted[i] if i < len(json_path_quoted) else False
                )
            path_expr = _build_jsonb_path(cast_identifier, json_path, json_path_quoted)
            if is_not_has:
                return f"position({value} in {path_expr}) = 0"
            return f"position({value} in {path_expr}) > 0"
        elif column.is_hstore:
            map_key = ".".join(expression.key.segments[1:])
            escaped_map_key = escape_param(map_key)
            leaf_expr = f"{identifier}->{escaped_map_key}"
            if is_not_has:
                return f"position({value} in {leaf_expr}) = 0"
            return f"position({value} in {leaf_expr}) > 0"
        elif column.is_array:
            array_index_str = ".".join(expression.key.segments[1:])
            try:
                array_index = int(array_index_str)
            except ValueError as err:
                raise FlyqlError(
                    f"invalid array index, expected number: {array_index_str}"
                ) from err
            pg_index = array_index + 1
            leaf_expr = f"{identifier}[{pg_index}]"
            if is_not_has:
                return f"position({value} in {leaf_expr}) = 0"
            return f"position({value} in {leaf_expr}) > 0"
        else:
            raise FlyqlError("path search for unsupported column type")

    is_array_result = column.is_array
    out_type = get_transformer_output_type(expression.key.transformers)
    if out_type and out_type.value == "array":
        is_array_result = True

    if is_array_result:
        if is_not_has:
            return f"NOT ({value} = ANY({identifier}))"
        return f"{value} = ANY({identifier})"
    elif column.is_jsonb or column.jsonstring:
        cast_identifier = f"({identifier}::jsonb)" if column.jsonstring else identifier
        if is_not_has:
            return f"NOT ({cast_identifier} ? {value})"
        return f"{cast_identifier} ? {value}"
    elif column.is_hstore:
        if is_not_has:
            return f"NOT ({identifier} ? {value})"
        return f"{identifier} ? {value}"
    elif column.normalized_type == NORMALIZED_TYPE_STRING:
        if is_not_has:
            return f"({identifier} IS NULL OR position({value} in {identifier}) = 0)"
        return f"position({value} in {identifier}) > 0"
    else:
        raise FlyqlError(
            f"has operator is not supported for column type: {column.normalized_type}"
        )


def expression_to_sql(
    expression: Expression,
    columns: Mapping[str, Column],
    registry: Optional[TransformerRegistry] = None,
) -> str:
    if expression.operator == Operator.TRUTHY.value:
        return truthy_expression_to_sql(expression, columns)
    if expression.operator in (Operator.IN.value, Operator.NOT_IN.value):
        return in_expression_to_sql(expression, columns)
    if expression.operator in (Operator.HAS.value, Operator.NOT_HAS.value):
        return has_expression_to_sql(expression, columns)
    validate_operator(expression.operator)
    if expression.key.is_segmented:
        return expression_to_sql_segmented(expression, columns)
    return expression_to_sql_simple(expression, columns, registry=registry)


def to_sql(
    root: Node,
    columns: Mapping[str, Column],
    registry: Optional[TransformerRegistry] = None,
) -> str:
    """Returns PostgreSQL WHERE clause for given tree and columns."""
    left = ""
    right = ""
    text = ""
    is_negated = getattr(root, "negated", False)

    if root.expression is not None:
        if is_negated and root.expression.operator == Operator.TRUTHY.value:
            text = falsy_expression_to_sql(expression=root.expression, columns=columns)
            is_negated = False
        else:
            text = expression_to_sql(
                expression=root.expression, columns=columns, registry=registry
            )

    if root.left is not None:
        left = to_sql(root=root.left, columns=columns, registry=registry)

    if root.right is not None:
        right = to_sql(root=root.right, columns=columns, registry=registry)

    if len(left) > 0 and len(right) > 0:
        validate_bool_operator(root.bool_operator)
        sql_bool_op = BOOL_OP_TO_SQL[root.bool_operator]
        text = f"({left} {sql_bool_op} {right})"
    elif len(left) > 0:
        text = left
    elif len(right) > 0:
        text = right

    if is_negated and text:
        text = f"NOT ({text})"

    return text


# SELECT clause generation


@dataclass
class SelectColumn:
    key: Key
    alias: str
    column: Column
    sql_expr: str


@dataclass
class SelectResult:
    columns: List[SelectColumn] = field(default_factory=list)
    sql: str = ""


def _parse_raw_select_columns(text: str) -> List[Tuple[str, str]]:
    parts = text.split(",")
    result: List[Tuple[str, str]] = []
    for part in parts:
        part = part.strip()
        if not part:
            continue
        lower = part.lower()
        idx = lower.find(" as ")
        if idx >= 0:
            name = part[:idx].strip()
            alias = part[idx + 4 :].strip()
        else:
            name = part
            alias = ""
        if not name:
            raise FlyqlError("empty column name")
        result.append((name, alias))
    return result


def _resolve_column(
    key: Key, columns: Mapping[str, Column]
) -> Tuple[Column, List[str], List[bool]]:
    segments = key.segments
    for i in range(len(segments), 0, -1):
        candidate_key = ".".join(segments[:i])
        if candidate_key in columns:
            return columns[candidate_key], segments[i:], key.quoted_segments[i:]
    raise FlyqlError(f"unknown column: {key.raw}")


def _build_select_expr(
    identifier: str, column: Column, path: List[str], path_quoted: List[bool]
) -> str:
    if not path:
        return identifier

    if column.is_jsonb or column.jsonstring:
        cast_identifier = f"({identifier}::jsonb)" if column.jsonstring else identifier
        for i, part in enumerate(path):
            validate_json_path_part(
                part, path_quoted[i] if i < len(path_quoted) else False
            )
        return _build_jsonb_path_raw(cast_identifier, path, path_quoted)

    if column.is_hstore:
        map_key = ".".join(path)
        escaped_key = escape_param(map_key)
        return f"{identifier}->{escaped_key}"

    if column.is_array:
        index_str = ".".join(path)
        try:
            index = int(index_str)
        except ValueError as err:
            raise FlyqlError(
                f"invalid array index, expected number: {index_str}"
            ) from err
        return f"{identifier}[{index + 1}]"

    raise FlyqlError(f"path access on non-composite column type: {column.name}")


def generate_select(
    text: str,
    columns: Mapping[str, Column],
    registry: Optional[TransformerRegistry] = None,
) -> SelectResult:
    """Generate a PostgreSQL SELECT clause from a column expression string."""
    raws = _parse_raw_select_columns(text)
    select_columns: List[SelectColumn] = []
    exprs: List[str] = []

    for name, alias in raws:
        key = parse_key(name)
        column, path, path_quoted = _resolve_column(key, columns)

        identifier = get_identifier(column)
        sql_expr = _build_select_expr(identifier, column, path, path_quoted)
        if key.transformers:
            validate_transformer_chain(key.transformers, registry=registry)
            sql_expr = apply_transformer_sql(
                sql_expr, key.transformers, "postgresql", registry=registry
            )

        if alias:
            sql_expr = f"{sql_expr} AS {escape_identifier(alias)}"
        elif path:
            alias = name
            sql_expr = f"{sql_expr} AS {escape_identifier(alias)}"

        select_columns.append(
            SelectColumn(key=key, alias=alias, column=column, sql_expr=sql_expr)
        )
        exprs.append(sql_expr)

    return SelectResult(columns=select_columns, sql=", ".join(exprs))
