"""Parameter binding for FlyQL ASTs.

`bind_params()` walks a parsed AST and substitutes parameter placeholders with
concrete values. Parameters can appear in:

  - Expression values:        `status=$code`
  - IN-list values:           `status in [$x, $y]`
  - Function arguments:       `created=ago($duration)`
  - Transformer arguments:    `key|transform($arg)=value` (left as-is in
                               the key string; bind_params() does not rewrite
                               keys; downstream consumers handle this)

bind_params() mutates the AST in place and returns the same Node.
"""

from typing import Any, Dict, Set, Union

from flyql.core.exceptions import FlyqlError
from flyql.core.expression import Expression, FunctionCall, Parameter, Duration
from flyql.core.tree import Node
from flyql.types import ValueType

INT64_MIN = -(2**63)
INT64_MAX = 2**63 - 1

_DURATION_UNITS = ("s", "m", "h", "d", "w")


def _value_type_for(value: Any) -> ValueType:
    """Map a Python value to its FlyQL ValueType. Raises on unsupported."""
    if value is None:
        return ValueType.NULL
    if isinstance(value, bool):
        return ValueType.BOOLEAN
    if isinstance(value, int):
        if INT64_MIN <= value <= INT64_MAX:
            return ValueType.INTEGER
        return ValueType.BIGINT
    if isinstance(value, float):
        return ValueType.FLOAT
    if isinstance(value, str):
        return ValueType.STRING
    raise FlyqlError(f"unsupported parameter value type: {type(value).__name__}")


def _parse_duration(value: str) -> Duration:
    """Parse a string like '5m' or '1h' into a Duration."""
    if not value or len(value) < 2:
        raise FlyqlError(f"invalid duration value: {value!r}")
    unit = value[-1]
    if unit not in _DURATION_UNITS:
        raise FlyqlError(
            f"invalid duration unit '{unit}' — expected one of {_DURATION_UNITS}"
        )
    try:
        num = int(value[:-1])
    except ValueError as e:
        raise FlyqlError(f"invalid duration value: {value!r}") from e
    return Duration(value=num, unit=unit)


def _resolve_param(
    param: Parameter,
    params: Dict[str, Any],
    consumed: Set[str],
    max_positional: list,
) -> Any:
    """Look up a parameter value, marking it consumed and tracking max index."""
    if param.positional:
        idx = int(param.name)
        if idx > max_positional[0]:
            max_positional[0] = idx
    if param.name not in params:
        prefix = "$" if not param.positional else "$"
        raise FlyqlError(f"unbound parameter: {prefix}{param.name}")
    consumed.add(param.name)
    return params[param.name]


def _bind_function_call(
    fc: FunctionCall,
    params: Dict[str, Any],
    consumed: Set[str],
    max_positional: list,
) -> None:
    """Resolve parameters within a FunctionCall in place."""
    if not fc.parameter_args:
        return

    if fc.name == "ago":
        # ago(...) takes durations. Each parameter must resolve to a string
        # like "5m" or directly to a Duration-compatible value.
        for param in fc.parameter_args:
            value = _resolve_param(param, params, consumed, max_positional)
            if isinstance(value, str):
                fc.duration_args.append(_parse_duration(value))
            elif isinstance(value, Duration):
                fc.duration_args.append(value)
            else:
                raise FlyqlError(
                    f"ago() parameter must be a duration string or Duration, "
                    f"got {type(value).__name__}"
                )
    elif fc.name == "today":
        # today(timezone)
        if len(fc.parameter_args) > 1:
            raise FlyqlError("today() accepts at most one parameter (timezone)")
        value = _resolve_param(fc.parameter_args[0], params, consumed, max_positional)
        if not isinstance(value, str):
            raise FlyqlError(
                f"today() timezone parameter must be a string, got {type(value).__name__}"
            )
        fc.timezone = value
    elif fc.name == "startOf":
        # startOf(unit, timezone?) — parameter could be either position
        # depending on what was already provided as a literal.
        # If unit was provided as literal, params fill timezone; otherwise
        # the first param is the unit, second (if any) is timezone.
        idx = 0
        if not fc.unit:
            value = _resolve_param(
                fc.parameter_args[idx], params, consumed, max_positional
            )
            if not isinstance(value, str):
                raise FlyqlError(
                    f"startOf() unit parameter must be a string, got {type(value).__name__}"
                )
            if value not in ("day", "week", "month"):
                raise FlyqlError(
                    f"invalid unit '{value}' — expected 'day', 'week', or 'month'"
                )
            fc.unit = value
            idx += 1
        if idx < len(fc.parameter_args):
            value = _resolve_param(
                fc.parameter_args[idx], params, consumed, max_positional
            )
            if not isinstance(value, str):
                raise FlyqlError(
                    f"startOf() timezone parameter must be a string, got {type(value).__name__}"
                )
            fc.timezone = value
            idx += 1
        if idx < len(fc.parameter_args):
            raise FlyqlError(
                "startOf() accepts at most two parameters (unit, timezone)"
            )
    elif fc.name == "now":
        raise FlyqlError("now() does not accept arguments")
    else:
        raise FlyqlError(f"unknown function: {fc.name}")

    # All parameter args have been resolved into the proper fields; clear them.
    fc.parameter_args = []


def _bind_expression(
    expr: Expression,
    params: Dict[str, Any],
    consumed: Set[str],
    max_positional: list,
) -> None:
    """Resolve parameters in a single Expression in place."""
    # Case 1: expression.value is a Parameter
    if isinstance(expr.value, Parameter):
        value = _resolve_param(expr.value, params, consumed, max_positional)
        expr.value_type = _value_type_for(value)
        expr.value = value
        return

    # Case 2: expression.value is a FunctionCall with parameter_args
    if isinstance(expr.value, FunctionCall):
        _bind_function_call(expr.value, params, consumed, max_positional)
        return

    # Case 3: expression.values contains Parameters (IN-list)
    if expr.values is not None:
        new_values = []
        new_types = []
        existing_types = expr.values_types or []
        for i, v in enumerate(expr.values):
            if isinstance(v, Parameter):
                value = _resolve_param(v, params, consumed, max_positional)
                new_values.append(value)
                new_types.append(_value_type_for(value))
            else:
                new_values.append(v)
                if i < len(existing_types):
                    new_types.append(existing_types[i])
                else:
                    new_types.append(_value_type_for(v))
        expr.values = new_values
        expr.values_types = new_types


def _walk(
    node: Union[Node, None],
    params: Dict[str, Any],
    consumed: Set[str],
    max_positional: list,
) -> None:
    if node is None:
        return
    if node.expression is not None:
        _bind_expression(node.expression, params, consumed, max_positional)
    _walk(node.left, params, consumed, max_positional)
    _walk(node.right, params, consumed, max_positional)


def bind_params(node: Node, params: Dict[str, Any]) -> Node:
    """Substitute parameter placeholders in a parsed AST with concrete values.

    Args:
        node: The root Node of a parsed FlyQL query.
        params: A dict mapping parameter names (without the `$` prefix) to
            concrete values. Positional parameters use string keys of digits
            (e.g. ``{"1": 42}``).

    Returns:
        The same Node, with parameters substituted in place.

    Raises:
        FlyqlError: if a referenced parameter is missing, an extra parameter
            is provided, or a value has an unsupported type.
    """
    if not isinstance(params, dict):
        raise FlyqlError("bind_params() params must be a dict")

    consumed: Set[str] = set()
    max_positional = [0]
    _walk(node, params, consumed, max_positional)

    # Validate: any provided params not consumed are "unused".
    # For positional params, only complain about indices > max_positional.
    for key in params:
        if key in consumed:
            continue
        if key.isdigit() and int(key) <= max_positional[0]:
            # Within positional range but not consumed → missing in AST is fine
            # only if the index was referenced. Since we mark all referenced
            # ones as consumed, this branch means the AST didn't reference it.
            raise FlyqlError(f"unused parameter: {key}")
        raise FlyqlError(f"unused parameter: {key}")

    # Also validate that every positional index from 1 to max was provided.
    for i in range(1, max_positional[0] + 1):
        if str(i) not in params:
            raise FlyqlError(f"unbound parameter: ${i}")

    return node
