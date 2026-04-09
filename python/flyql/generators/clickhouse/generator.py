import math
import re
from dataclasses import dataclass, field
from typing import List, Mapping, Optional, Tuple, Any

from flyql.core.exceptions import FlyqlError
from flyql.core.expression import Expression, FunctionCall
from flyql.types import ValueType
from flyql.core.key import Key, parse_key
from flyql.core.constants import (
    Operator,
    VALID_KEY_VALUE_OPERATORS,
    VALID_BOOL_OPERATORS,
)
from flyql.core.tree import Node

from flyql.generators.clickhouse.column import Column
from flyql.generators.clickhouse.helpers import (
    validate_operation,
    validate_in_list_types,
)
from flyql.generators.clickhouse.constants import (
    NORMALIZED_TYPE_STRING,
    NORMALIZED_TYPE_INT,
    NORMALIZED_TYPE_FLOAT,
    NORMALIZED_TYPE_BOOL,
    NORMALIZED_TYPE_DATE,
)
from flyql.generators.transformer_helpers import (
    apply_transformer_sql,
    validate_transformer_chain,
)
from flyql.transformers.registry import TransformerRegistry

BOOL_OP_TO_SQL = {"and": "AND", "or": "OR"}

OPERATOR_TO_CLICKHOUSE_FUNC = {
    Operator.EQUALS.value: "equals",
    Operator.NOT_EQUALS.value: "notEquals",
    Operator.REGEX.value: "match",
    Operator.NOT_REGEX.value: "match",
    Operator.GREATER_THAN.value: "greater",
    Operator.LOWER_THAN.value: "less",
    Operator.GREATER_OR_EQUALS_THAN.value: "greaterOrEquals",
    Operator.LOWER_OR_EQUALS_THAN.value: "lessOrEquals",
}


def get_identifier(column: Column) -> str:
    if column.raw_identifier:
        return column.raw_identifier
    return column.name


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


def validate_json_path_part(part: str) -> None:
    if not part:
        raise FlyqlError("invalid JSON path part")
    if not JSON_KEY_PATTERN.match(part):
        raise FlyqlError("invalid JSON path part")


def validate_operator(op: str) -> None:
    if op not in VALID_KEY_VALUE_OPERATORS:
        raise FlyqlError(f"invalid operator: {op}")


def validate_bool_operator(op: str) -> None:
    if op not in VALID_BOOL_OPERATORS:
        raise FlyqlError(f"invalid bool operator: {op}")


def _escape_like_param(value: str) -> str:
    s = str(value)
    like_escaped = ""
    i = 0
    while i < len(s):
        c = s[i]
        if c == "\\":
            if i + 1 < len(s) and s[i + 1] in ("%", "_"):
                like_escaped += c + s[i + 1]
                i += 2
                continue
            else:
                like_escaped += "\\\\"
        else:
            like_escaped += c
        i += 1
    return escape_param(like_escaped)


def escape_param(item: Any) -> str:
    if item is None:
        return "NULL"
    elif isinstance(item, str):
        return f"'{''.join(ESCAPE_CHARS_MAP.get(c, c) for c in item)}'"
    elif isinstance(item, bool):
        return str(item).lower()
    elif isinstance(item, float):
        if not math.isfinite(item):
            raise FlyqlError(f"unsupported numeric value for escape_param: {item}")
        return str(int(item)) if item == int(item) else str(item)
    elif isinstance(item, int):
        return str(item)
    else:
        raise FlyqlError(f"unsupported type for escape_param: {type(item).__name__}")


def is_number(value: Any) -> bool:
    try:
        float(value)
    except (ValueError, TypeError):
        try:
            int(value)
        except (ValueError, TypeError):
            return False
        else:
            return True
    else:
        return True


def truthy_expression_to_sql_where(
    expression: Expression, columns: Mapping[str, Column]
) -> str:
    """Generate SQL for truthy check (non-falsy value).

    Type-aware truthy checks:
    - String: column IS NOT NULL AND column != ''
    - Int/Float: column IS NOT NULL AND column != 0
    - Bool: column (ClickHouse supports boolean expressions directly)
    - Date: column IS NOT NULL
    """
    column_name = expression.key.segments[0]
    if column_name not in columns:
        raise FlyqlError(f"unknown column: {column_name}")

    column = columns[column_name]

    col_id = get_identifier(column)

    if expression.key.is_segmented:
        if column.jsonstring:
            json_path = expression.key.segments[1:]
            json_path_str = ", ".join([escape_param(x) for x in json_path])
            leaf_expr = f"JSONExtractString({col_id}, {json_path_str})"
            if expression.key.transformers:
                leaf_expr = apply_transformer_sql(
                    leaf_expr, expression.key.transformers, "clickhouse"
                )
            return f"(JSONHas({col_id}, {json_path_str}) AND " f"{leaf_expr} != '')"
        elif column.is_json:
            json_path = expression.key.segments[1:]
            for part in json_path:
                validate_json_path_part(part)
            json_path_str = ".".join(f"`{part}`" for part in json_path)
            leaf_expr = f"{col_id}.{json_path_str}"
            if expression.key.transformers:
                leaf_expr = apply_transformer_sql(
                    leaf_expr, expression.key.transformers, "clickhouse"
                )
                return f"({leaf_expr} IS NOT NULL AND {leaf_expr} != '')"
            return f"({leaf_expr} IS NOT NULL)"
        elif column.is_map:
            map_key = ".".join(expression.key.segments[1:])
            escaped_map_key = escape_param(map_key)
            leaf_expr = f"{col_id}[{escaped_map_key}]"
            if expression.key.transformers:
                leaf_expr = apply_transformer_sql(
                    leaf_expr, expression.key.transformers, "clickhouse"
                )
            return (
                f"(mapContains({col_id}, {escaped_map_key}) AND " f"{leaf_expr} != '')"
            )
        elif column.is_array:
            array_index_str = ".".join(expression.key.segments[1:])
            try:
                array_index = int(array_index_str)
            except Exception as err:
                raise FlyqlError(
                    f"invalid array index, expected number: {array_index_str}"
                ) from err
            leaf_expr = f"{col_id}[{array_index}]"
            if expression.key.transformers:
                leaf_expr = apply_transformer_sql(
                    leaf_expr, expression.key.transformers, "clickhouse"
                )
            return f"(length({col_id}) >= {array_index} AND " f"{leaf_expr} != '')"
        else:
            raise FlyqlError("path search for unsupported column type")
    else:
        if expression.key.transformers:
            col_ref = apply_transformer_sql(
                col_id, expression.key.transformers, "clickhouse"
            )
            return f"({col_ref} IS NOT NULL AND {col_ref} != '')"
        elif column.jsonstring:
            return (
                f"({col_id} IS NOT NULL AND {col_id} != '' AND "
                f"JSONLength({col_id}) > 0)"
            )
        elif column.normalized_type == NORMALIZED_TYPE_BOOL:
            return col_id
        elif column.normalized_type == NORMALIZED_TYPE_STRING:
            return f"({col_id} IS NOT NULL AND {col_id} != '')"
        elif column.normalized_type in (NORMALIZED_TYPE_INT, NORMALIZED_TYPE_FLOAT):
            return f"({col_id} IS NOT NULL AND {col_id} != 0)"
        elif column.normalized_type == NORMALIZED_TYPE_DATE:
            return f"({col_id} IS NOT NULL)"
        else:
            return f"({col_id} IS NOT NULL)"


def falsy_expression_to_sql_where(
    expression: Expression, columns: Mapping[str, Column]
) -> str:
    """Generate SQL for falsy check (null or falsy value).

    Type-aware falsy checks (negation of truthy):
    - String: column IS NULL OR column = ''
    - Int/Float: column IS NULL OR column = 0
    - Bool: NOT column (handles NULL correctly in ClickHouse)
    - Date: column IS NULL
    """
    column_name = expression.key.segments[0]
    if column_name not in columns:
        raise FlyqlError(f"unknown column: {column_name}")

    column = columns[column_name]

    col_id = get_identifier(column)

    if expression.key.is_segmented:
        if column.jsonstring:
            json_path = expression.key.segments[1:]
            json_path_str = ", ".join([escape_param(x) for x in json_path])
            leaf_expr = f"JSONExtractString({col_id}, {json_path_str})"
            if expression.key.transformers:
                leaf_expr = apply_transformer_sql(
                    leaf_expr, expression.key.transformers, "clickhouse"
                )
            return f"(NOT JSONHas({col_id}, {json_path_str}) OR " f"{leaf_expr} = '')"
        elif column.is_json:
            json_path = expression.key.segments[1:]
            for part in json_path:
                validate_json_path_part(part)
            json_path_str = ".".join(f"`{part}`" for part in json_path)
            leaf_expr = f"{col_id}.{json_path_str}"
            if expression.key.transformers:
                leaf_expr = apply_transformer_sql(
                    leaf_expr, expression.key.transformers, "clickhouse"
                )
                return f"({leaf_expr} IS NULL OR {leaf_expr} = '')"
            return f"({leaf_expr} IS NULL)"
        elif column.is_map:
            map_key = ".".join(expression.key.segments[1:])
            escaped_map_key = escape_param(map_key)
            leaf_expr = f"{col_id}[{escaped_map_key}]"
            if expression.key.transformers:
                leaf_expr = apply_transformer_sql(
                    leaf_expr, expression.key.transformers, "clickhouse"
                )
            return (
                f"(NOT mapContains({col_id}, {escaped_map_key}) OR "
                f"{leaf_expr} = '')"
            )
        elif column.is_array:
            array_index_str = ".".join(expression.key.segments[1:])
            try:
                array_index = int(array_index_str)
            except Exception as err:
                raise FlyqlError(
                    f"invalid array index, expected number: {array_index_str}"
                ) from err
            leaf_expr = f"{col_id}[{array_index}]"
            if expression.key.transformers:
                leaf_expr = apply_transformer_sql(
                    leaf_expr, expression.key.transformers, "clickhouse"
                )
            return f"(length({col_id}) < {array_index} OR " f"{leaf_expr} = '')"
        else:
            raise FlyqlError("path search for unsupported column type")
    else:
        if expression.key.transformers:
            col_ref = apply_transformer_sql(
                col_id, expression.key.transformers, "clickhouse"
            )
            return f"({col_ref} IS NULL OR {col_ref} = '')"
        elif column.jsonstring:
            return (
                f"({col_id} IS NULL OR {col_id} = '' OR " f"JSONLength({col_id}) = 0)"
            )
        elif column.normalized_type == NORMALIZED_TYPE_BOOL:
            return f"NOT {col_id}"
        elif column.normalized_type == NORMALIZED_TYPE_STRING:
            return f"({col_id} IS NULL OR {col_id} = '')"
        elif column.normalized_type in (NORMALIZED_TYPE_INT, NORMALIZED_TYPE_FLOAT):
            return f"({col_id} IS NULL OR {col_id} = 0)"
        elif column.normalized_type == NORMALIZED_TYPE_DATE:
            return f"({col_id} IS NULL)"
        else:
            return f"({col_id} IS NULL)"


def in_expression_to_sql_where(
    expression: Expression, columns: Mapping[str, Column]
) -> str:
    column_name = expression.key.segments[0]
    if column_name not in columns:
        raise FlyqlError(f"unknown column: {column_name}")

    column = columns[column_name]
    is_not_in = expression.operator == Operator.NOT_IN.value

    if not expression.values:
        return "1" if is_not_in else "0"

    is_heterogeneous = (
        expression.values_types is not None and len(set(expression.values_types)) > 1
    )
    if (
        column.normalized_type is not None
        and not expression.key.is_segmented
        and not is_heterogeneous
    ):
        validate_in_list_types(expression.values, column.normalized_type)

    values_parts: List[str] = []
    for i, v in enumerate(expression.values):
        rhs_ref = None
        if (
            expression.values_types is not None
            and i < len(expression.values_types)
            and expression.values_types[i] == ValueType.COLUMN
        ):
            rhs_ref = _resolve_rhs_column_ref(str(v), columns)
        values_parts.append(rhs_ref if rhs_ref is not None else escape_param(v))
    values_sql = ", ".join(values_parts)
    sql_op = "NOT IN" if is_not_in else "IN"

    col_id = get_identifier(column)

    if expression.key.is_segmented:
        if column.is_json:
            json_path = expression.key.segments[1:]
            for part in json_path:
                validate_json_path_part(part)
            json_path_str = ".".join(f"$.{part}" for part in json_path)
            leaf_expr = f"JSON_VALUE({col_id}, '{json_path_str}')"
            if expression.key.transformers:
                leaf_expr = apply_transformer_sql(
                    leaf_expr, expression.key.transformers, "clickhouse"
                )
            return f"{leaf_expr} {sql_op} ({values_sql})"
        elif column.jsonstring:
            json_path = expression.key.segments[1:]
            json_path_str = ", ".join([escape_param(x) for x in json_path])
            leaf_expr = f"JSONExtractString({col_id}, {json_path_str})"
            if expression.key.transformers:
                leaf_expr = apply_transformer_sql(
                    leaf_expr, expression.key.transformers, "clickhouse"
                )
            return f"{leaf_expr} {sql_op} ({values_sql})"
        elif column.is_map:
            map_key = ".".join(expression.key.segments[1:])
            escaped_map_key = escape_param(map_key)
            leaf_expr = f"{col_id}[{escaped_map_key}]"
            if expression.key.transformers:
                leaf_expr = apply_transformer_sql(
                    leaf_expr, expression.key.transformers, "clickhouse"
                )
            return f"{leaf_expr} {sql_op} ({values_sql})"
        elif column.is_array:
            array_index_str = ".".join(expression.key.segments[1:])
            try:
                array_index = int(array_index_str)
            except Exception as err:
                raise FlyqlError(
                    f"invalid array index, expected number: {array_index_str}"
                ) from err
            leaf_expr = f"{col_id}[{array_index}]"
            if expression.key.transformers:
                leaf_expr = apply_transformer_sql(
                    leaf_expr, expression.key.transformers, "clickhouse"
                )
            return f"{leaf_expr} {sql_op} ({values_sql})"
        else:
            raise FlyqlError("path search for unsupported column type")
    else:
        col_ref = col_id
        if expression.key.transformers:
            col_ref = apply_transformer_sql(
                col_ref, expression.key.transformers, "clickhouse"
            )
        return f"{col_ref} {sql_op} ({values_sql})"


def has_expression_to_sql_where(
    expression: Expression, columns: Mapping[str, Column]
) -> str:
    column_name = expression.key.segments[0]
    if column_name not in columns:
        raise FlyqlError(f"unknown column: {column_name}")

    column = columns[column_name]
    is_not_has = expression.operator == Operator.NOT_HAS.value
    rhs_ref = None
    if expression.value_type == ValueType.COLUMN:
        rhs_ref = _resolve_rhs_column_ref(str(expression.value), columns)
    value = rhs_ref if rhs_ref is not None else escape_param(expression.value)

    col_id = get_identifier(column)

    if expression.key.is_segmented:
        if column.is_json:
            json_path = expression.key.segments[1:]
            for part in json_path:
                validate_json_path_part(part)
            json_path_str = ".".join(f"$.{part}" for part in json_path)
            leaf_expr = f"JSON_VALUE({col_id}, '{json_path_str}')"
            if expression.key.transformers:
                leaf_expr = apply_transformer_sql(
                    leaf_expr, expression.key.transformers, "clickhouse"
                )
            if is_not_has:
                return f"position({leaf_expr}, {value}) = 0"
            return f"position({leaf_expr}, {value}) > 0"
        elif column.jsonstring:
            json_path = expression.key.segments[1:]
            json_path_str = ", ".join(escape_param(x) for x in json_path)
            leaf_expr = f"JSONExtractString({col_id}, {json_path_str})"
            if expression.key.transformers:
                leaf_expr = apply_transformer_sql(
                    leaf_expr, expression.key.transformers, "clickhouse"
                )
            if is_not_has:
                return f"position({leaf_expr}, {value}) = 0"
            return f"position({leaf_expr}, {value}) > 0"
        elif column.is_map:
            map_key = ".".join(expression.key.segments[1:])
            escaped_map_key = escape_param(map_key)
            leaf_expr = f"{col_id}[{escaped_map_key}]"
            if expression.key.transformers:
                leaf_expr = apply_transformer_sql(
                    leaf_expr, expression.key.transformers, "clickhouse"
                )
            if is_not_has:
                return f"position({leaf_expr}, {value}) = 0"
            return f"position({leaf_expr}, {value}) > 0"
        elif column.is_array:
            array_index_str = ".".join(expression.key.segments[1:])
            try:
                array_index = int(array_index_str)
            except Exception as err:
                raise FlyqlError(
                    f"invalid array index, expected number: {array_index_str}"
                ) from err
            leaf_expr = f"{col_id}[{array_index}]"
            if expression.key.transformers:
                leaf_expr = apply_transformer_sql(
                    leaf_expr, expression.key.transformers, "clickhouse"
                )
            if is_not_has:
                return f"position({leaf_expr}, {value}) = 0"
            return f"position({leaf_expr}, {value}) > 0"
        else:
            raise FlyqlError("path search for unsupported column type")

    col_ref = col_id
    is_array_result = column.is_array
    if expression.key.transformers:
        col_ref = apply_transformer_sql(
            col_ref, expression.key.transformers, "clickhouse"
        )
        from flyql.generators.transformer_helpers import get_transformer_output_type

        out_type = get_transformer_output_type(expression.key.transformers)
        if out_type and out_type.value == "array":
            is_array_result = True

    if is_array_result:
        if is_not_has:
            return f"NOT has({col_ref}, {value})"
        return f"has({col_ref}, {value})"
    elif column.is_map:
        if is_not_has:
            return f"NOT mapContains({col_ref}, {value})"
        return f"mapContains({col_ref}, {value})"
    elif column.is_json:
        if is_not_has:
            return f"NOT JSON_EXISTS({col_ref}, concat('$.', {value}))"
        return f"JSON_EXISTS({col_ref}, concat('$.', {value}))"
    elif column.jsonstring:
        if is_not_has:
            return f"NOT JSONHas({col_ref}, {value})"
        return f"JSONHas({col_ref}, {value})"
    elif column.normalized_type == NORMALIZED_TYPE_STRING:
        if is_not_has:
            return f"({col_ref} IS NULL OR position({col_ref}, {value}) = 0)"
        return f"position({col_ref}, {value}) > 0"
    else:
        raise FlyqlError(
            f"has operator is not supported for column type: {column.normalized_type}"
        )


_DURATION_UNIT_TO_CLICKHOUSE = {
    "s": "SECOND",
    "m": "MINUTE",
    "h": "HOUR",
    "d": "DAY",
}


def _function_call_to_sql(fc: FunctionCall, default_tz: str) -> str:
    def resolve_tz(explicit: str) -> str:
        if explicit:
            return explicit
        if default_tz:
            return default_tz
        return "UTC"

    if fc.name == "ago":
        parts: list[str] = []
        for d in fc.duration_args:
            val = d.value
            unit = d.unit
            if unit == "w":
                val = val * 7
                unit = "d"
            ch_unit = _DURATION_UNIT_TO_CLICKHOUSE.get(unit)
            if ch_unit is None:
                raise FlyqlError(f"unsupported duration unit: {unit}")
            parts.append(f"INTERVAL {val} {ch_unit}")
        return "(now() - " + " - ".join(parts) + ")"

    if fc.name == "now":
        return "now()"

    if fc.name == "today":
        tz = resolve_tz(fc.timezone)
        return f"toDate(toTimezone(now(), {escape_param(tz)}))"

    if fc.name == "startOf":
        tz = resolve_tz(fc.timezone)
        escaped_tz = escape_param(tz)
        if fc.unit == "day":
            return f"toStartOfDay(toTimezone(now(), {escaped_tz}))"
        if fc.unit == "week":
            return f"toStartOfWeek(toTimezone(now(), {escaped_tz}), 1)"
        if fc.unit == "month":
            return f"toStartOfMonth(toTimezone(now(), {escaped_tz}))"
        raise FlyqlError(f"unsupported startOf unit: {fc.unit}")

    raise FlyqlError(f"unsupported function: {fc.name}")


def expression_to_sql_where(
    expression: Expression,
    columns: Mapping[str, Column],
    registry: Optional[TransformerRegistry] = None,
    default_timezone: str = "UTC",
) -> str:
    if expression.operator == Operator.TRUTHY.value:
        return truthy_expression_to_sql_where(expression, columns)

    if expression.operator in (Operator.IN.value, Operator.NOT_IN.value):
        return in_expression_to_sql_where(expression, columns)

    if expression.operator in (Operator.HAS.value, Operator.NOT_HAS.value):
        return has_expression_to_sql_where(expression, columns)

    if expression.value_type == ValueType.FUNCTION:
        if expression.key.is_segmented:
            raise FlyqlError("temporal functions are not supported with segmented keys")
        fc = expression.value
        if not isinstance(fc, FunctionCall):
            raise FlyqlError("expected FunctionCall value for function type")
        column_name = expression.key.segments[0]
        if column_name not in columns:
            raise FlyqlError(f"unknown column: {column_name}")
        column = columns[column_name]
        if column.normalized_type and column.normalized_type != NORMALIZED_TYPE_DATE:
            raise FlyqlError(
                f"temporal function '{fc.name}' is not valid for column "
                f"'{column_name}' of type '{column.normalized_type}'"
            )
        value = _function_call_to_sql(fc, default_timezone)
        col_ref = get_identifier(column)
        if expression.key.transformers:
            validate_transformer_chain(expression.key.transformers, registry=registry)
            col_ref = apply_transformer_sql(
                col_ref,
                expression.key.transformers,
                "clickhouse",
                registry=registry,
            )
        return f"{col_ref} {expression.operator} {value}"

    validate_operator(expression.operator)
    text = ""

    if expression.key.is_segmented:
        reverse_operator = ""
        if expression.operator == Operator.NOT_REGEX.value:
            reverse_operator = "NOT "
        func = OPERATOR_TO_CLICKHOUSE_FUNC[expression.operator]
        column_name = expression.key.segments[0]
        if column_name not in columns:
            raise FlyqlError(f"unknown column: {column_name}")
        column = columns[column_name]

        if column.normalized_type is not None and not expression.key.transformers:
            validate_operation(
                expression.value, column.normalized_type, expression.operator
            )

        col_id = get_identifier(column)

        if column.jsonstring:
            json_path = expression.key.segments[1:]
            json_path_str = ", ".join([escape_param(x) for x in json_path])

            rhs_ref = None
            if expression.value_type == ValueType.COLUMN:
                rhs_ref = _resolve_rhs_column_ref(str(expression.value), columns)
            if rhs_ref is not None:
                leaf_expr = f"JSONExtractString({col_id}, {json_path_str})"
                if expression.key.transformers:
                    leaf_expr = apply_transformer_sql(
                        leaf_expr, expression.key.transformers, "clickhouse"
                    )
                text = f"{reverse_operator}{func}({leaf_expr}, {rhs_ref})"
            else:
                str_value = escape_param(expression.value)
                if expression.key.transformers:
                    # When transformers are present, extract the value as string and
                    # apply the transformer to the leaf, then compare as string.
                    leaf_expr = apply_transformer_sql(
                        f"JSONExtractString({col_id}, {json_path_str})",
                        expression.key.transformers,
                        "clickhouse",
                    )
                    text = f"{reverse_operator}{func}({leaf_expr}, {str_value})"
                else:
                    multi_if = [
                        f"JSONType({col_id}, {json_path_str}) = 'String', {func}(JSONExtractString({col_id}, {json_path_str}), {str_value})"  # pylint: disable=line-too-long
                    ]
                    if expression.value_type in (
                        ValueType.INTEGER,
                        ValueType.BIGINT,
                        ValueType.FLOAT,
                    ) and expression.operator not in [
                        Operator.REGEX.value,
                        Operator.NOT_REGEX.value,
                    ]:
                        multi_if.extend(
                            [
                                f"JSONType({col_id}, {json_path_str}) = 'Int64', {func}(JSONExtractInt({col_id}, {json_path_str}), {expression.value})",  # pylint: disable=line-too-long
                                f"JSONType({col_id}, {json_path_str}) = 'Double', {func}(JSONExtractFloat({col_id}, {json_path_str}), {expression.value})",  # pylint: disable=line-too-long
                                f"JSONType({col_id}, {json_path_str}) = 'Bool', {func}(JSONExtractBool({col_id}, {json_path_str}), {expression.value})",  # pylint: disable=line-too-long
                            ]
                        )
                    multi_if.append("0")
                    multi_if_str = ",".join(multi_if)
                    text = f"{reverse_operator}multiIf({multi_if_str})"
        elif column.is_json:
            json_path = expression.key.segments[1:]
            for part in json_path:
                validate_json_path_part(part)
            json_path_str = ".".join(f"`{part}`" for part in json_path)
            rhs_ref = None
            if expression.value_type == ValueType.COLUMN:
                rhs_ref = _resolve_rhs_column_ref(str(expression.value), columns)
            value = rhs_ref if rhs_ref is not None else escape_param(expression.value)
            leaf_expr = f"{col_id}.{json_path_str}"
            if expression.key.transformers:
                leaf_expr = apply_transformer_sql(
                    leaf_expr, expression.key.transformers, "clickhouse"
                )
            text = f"{leaf_expr} {expression.operator} {value}"
        elif column.is_map:
            map_key = ".".join(expression.key.segments[1:])
            escaped_map_key = escape_param(map_key)
            rhs_ref = None
            if expression.value_type == ValueType.COLUMN:
                rhs_ref = _resolve_rhs_column_ref(str(expression.value), columns)
            value = rhs_ref if rhs_ref is not None else escape_param(expression.value)
            leaf_expr = f"{col_id}[{escaped_map_key}]"
            if expression.key.transformers:
                leaf_expr = apply_transformer_sql(
                    leaf_expr, expression.key.transformers, "clickhouse"
                )
            text = f"{reverse_operator}{func}({leaf_expr}, {value})"
        elif column.is_array:
            array_index_str = ".".join(expression.key.segments[1:])
            try:
                array_index = int(array_index_str)
            except Exception as err:
                raise FlyqlError(
                    f"invalid array index, expected number: {array_index_str}"
                ) from err
            rhs_ref = None
            if expression.value_type == ValueType.COLUMN:
                rhs_ref = _resolve_rhs_column_ref(str(expression.value), columns)
            value = rhs_ref if rhs_ref is not None else escape_param(expression.value)
            leaf_expr = f"{col_id}[{array_index}]"
            if expression.key.transformers:
                leaf_expr = apply_transformer_sql(
                    leaf_expr, expression.key.transformers, "clickhouse"
                )
            text = f"{reverse_operator}{func}({leaf_expr}, {value})"
        else:
            raise FlyqlError("path search for unsupported column type")

    else:
        column_name = expression.key.segments[0]
        if column_name not in columns:
            raise FlyqlError(f"unknown column: {column_name}")

        column = columns[column_name]

        rhs_ref = None
        if expression.value_type == ValueType.COLUMN:
            rhs_ref = _resolve_rhs_column_ref(str(expression.value), columns)

        if rhs_ref is not None:
            col_ref = get_identifier(column)
            if expression.key.transformers:
                validate_transformer_chain(
                    expression.key.transformers, registry=registry
                )
                col_ref = apply_transformer_sql(
                    col_ref,
                    expression.key.transformers,
                    "clickhouse",
                    registry=registry,
                )
            if expression.operator == Operator.REGEX.value:
                text = f"match({col_ref}, {rhs_ref})"
            elif expression.operator == Operator.NOT_REGEX.value:
                text = f"NOT match({col_ref}, {rhs_ref})"
            elif expression.operator in (
                Operator.LIKE.value,
                Operator.NOT_LIKE.value,
                Operator.ILIKE.value,
                Operator.NOT_ILIKE.value,
            ):
                like_op = {
                    Operator.LIKE.value: "LIKE",
                    Operator.NOT_LIKE.value: "NOT LIKE",
                    Operator.ILIKE.value: "ILIKE",
                    Operator.NOT_ILIKE.value: "NOT ILIKE",
                }[expression.operator]
                text = f"{col_ref} {like_op} {rhs_ref}"
            else:
                text = f"{col_ref} {expression.operator} {rhs_ref}"
        else:
            if column.values and str(expression.value) not in column.values:
                raise FlyqlError(f"unknown value: {expression.value}")

            if column.normalized_type is not None and not expression.key.transformers:
                validate_operation(
                    expression.value, column.normalized_type, expression.operator
                )

            col_ref = get_identifier(column)
            if expression.key.transformers:
                validate_transformer_chain(
                    expression.key.transformers, registry=registry
                )
                col_ref = apply_transformer_sql(
                    col_ref,
                    expression.key.transformers,
                    "clickhouse",
                    registry=registry,
                )

            if expression.operator == Operator.REGEX.value:
                value = escape_param(str(expression.value))
                text = f"match({col_ref}, {value})"
            elif expression.operator == Operator.NOT_REGEX.value:
                value = escape_param(str(expression.value))
                text = f"NOT match({col_ref}, {value})"
            elif expression.operator == Operator.LIKE.value:
                value = _escape_like_param(expression.value)
                text = f"{col_ref} LIKE {value}"
            elif expression.operator == Operator.NOT_LIKE.value:
                value = _escape_like_param(expression.value)
                text = f"{col_ref} NOT LIKE {value}"
            elif expression.operator == Operator.ILIKE.value:
                value = _escape_like_param(expression.value)
                text = f"{col_ref} ILIKE {value}"
            elif expression.operator == Operator.NOT_ILIKE.value:
                value = _escape_like_param(expression.value)
                text = f"{col_ref} NOT ILIKE {value}"
            elif expression.operator in [
                Operator.EQUALS.value,
                Operator.NOT_EQUALS.value,
            ]:
                if expression.value_type == ValueType.NULL:
                    text = (
                        f"{col_ref} IS NULL"
                        if expression.operator == Operator.EQUALS.value
                        else f"{col_ref} IS NOT NULL"
                    )
                elif expression.value_type == ValueType.BOOLEAN:
                    bool_literal = "true" if expression.value else "false"
                    text = f"{col_ref} {expression.operator} {bool_literal}"
                else:
                    value = escape_param(str(expression.value))
                    text = f"{col_ref} {expression.operator} {value}"
            else:
                value = escape_param(expression.value)
                text = f"{col_ref} {expression.operator} {value}"
    return text


def _find_single_leaf_expression(node: Optional[Node]) -> Optional[Expression]:
    if node is None:
        return None
    if getattr(node, "negated", False):
        return None
    if node.expression is not None:
        return node.expression
    if node.left is not None and node.right is None:
        return _find_single_leaf_expression(node.left)
    if node.right is not None and node.left is None:
        return _find_single_leaf_expression(node.right)
    return None


def to_sql_where(
    root: Node,
    columns: Mapping[str, Column],
    registry: Optional[TransformerRegistry] = None,
    default_timezone: str = "UTC",
) -> str:
    """
    Returns ClickHouse WHERE clause for given tree and columns
    """
    left = ""
    right = ""
    text = ""
    is_negated = getattr(root, "negated", False)

    if root.expression is not None:
        # For negated truthy expressions, generate falsy SQL directly
        if is_negated and root.expression.operator == Operator.TRUTHY.value:
            text = falsy_expression_to_sql_where(
                expression=root.expression, columns=columns
            )
            is_negated = False  # Already handled
        else:
            text = expression_to_sql_where(
                expression=root.expression,
                columns=columns,
                registry=registry,
                default_timezone=default_timezone,
            )
    elif (
        is_negated
        and root.expression is None
        and not (root.left is not None and root.right is not None)
    ):
        child = root.left if root.left is not None else root.right
        leaf_expr = _find_single_leaf_expression(child)
        if leaf_expr is not None and leaf_expr.operator == Operator.TRUTHY.value:
            return falsy_expression_to_sql_where(expression=leaf_expr, columns=columns)

    if root.left is not None:
        left = to_sql_where(
            root=root.left,
            columns=columns,
            registry=registry,
            default_timezone=default_timezone,
        )

    if root.right is not None:
        right = to_sql_where(
            root=root.right,
            columns=columns,
            registry=registry,
            default_timezone=default_timezone,
        )

    if len(left) > 0 and len(right) > 0:
        validate_bool_operator(root.bool_operator)
        text = f"({left} {BOOL_OP_TO_SQL[root.bool_operator]} {right})"
    elif len(left) > 0:
        text = left
    elif len(right) > 0:
        text = right

    if is_negated and text:
        text = f"NOT ({text})"

    return text


# SELECT clause generation

VALID_ALIAS_PATTERN = re.compile(r"^[a-zA-Z_][a-zA-Z0-9_.]*$")


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


def _resolve_rhs_column_ref(value: str, columns: Mapping[str, Column]) -> Optional[str]:
    try:
        key = parse_key(value)
    except Exception:
        return None
    try:
        column, path = _resolve_column(key, columns)
    except FlyqlError:
        return None
    return _build_select_expr(column, path)


def _resolve_column(
    key: Key, columns: Mapping[str, Column]
) -> Tuple[Column, List[str]]:
    segments = key.segments
    for i in range(len(segments), 0, -1):
        candidate_key = ".".join(segments[:i])
        if candidate_key in columns:
            return columns[candidate_key], segments[i:]
    raise FlyqlError(f"unknown column: {key.raw}")


def _build_select_expr(column: Column, path: List[str]) -> str:
    col_id = get_identifier(column)

    if not path:
        return col_id

    if column.is_json:
        for part in path:
            validate_json_path_part(part)
        path_parts = [f"`{part}`" for part in path]
        return f"{col_id}.{'.'.join(path_parts)}"

    if column.jsonstring:
        json_path_parts = [escape_param(p) for p in path]
        return f"JSONExtractString({col_id}, {', '.join(json_path_parts)})"

    if column.is_map:
        map_key = ".".join(path)
        escaped_key = escape_param(map_key)
        return f"{col_id}[{escaped_key}]"

    if column.is_array:
        index_str = ".".join(path)
        try:
            index = int(index_str)
        except ValueError as err:
            raise FlyqlError(
                f"invalid array index, expected number: {index_str}"
            ) from err
        return f"{col_id}[{index}]"

    raise FlyqlError(f"path access on non-composite column type: {column.name}")


def to_sql_select(
    text: str,
    columns: Mapping[str, Column],
    registry: Optional[TransformerRegistry] = None,
) -> SelectResult:
    """Generate a ClickHouse SELECT clause from a column expression string."""
    raws = _parse_raw_select_columns(text)
    select_columns: List[SelectColumn] = []
    exprs: List[str] = []

    for name, alias in raws:
        key = parse_key(name)
        column, path = _resolve_column(key, columns)

        sql_expr = _build_select_expr(column, path)
        if key.transformers:
            validate_transformer_chain(key.transformers, registry=registry)
            sql_expr = apply_transformer_sql(
                sql_expr, key.transformers, "clickhouse", registry=registry
            )

        if alias:
            if not VALID_ALIAS_PATTERN.match(alias):
                raise FlyqlError(f"invalid alias: {alias}")
            quoted_alias = f"`{alias}`" if "." in alias else alias
            sql_expr = f"{sql_expr} AS {quoted_alias}"
        elif path:
            alias = key.raw.split("|")[0]
            if not VALID_ALIAS_PATTERN.match(alias):
                raise FlyqlError(f"invalid alias: {alias}")
            quoted_alias = f"`{alias}`" if "." in alias else alias
            sql_expr = f"{sql_expr} AS {quoted_alias}"

        select_columns.append(
            SelectColumn(key=key, alias=alias, column=column, sql_expr=sql_expr)
        )
        exprs.append(sql_expr)

    return SelectResult(columns=select_columns, sql=", ".join(exprs))
