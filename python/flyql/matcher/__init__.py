from flyql.matcher.evaluator import Evaluator
from flyql.matcher.matcher import match
from flyql.matcher.record import Record

__all__ = [
    "Evaluator",
    "Record",
    "match",
]

try:
    import re2 as _re2  # type: ignore[import-untyped]

    del _re2
except ImportError:
    import warnings

    warnings.warn(
        "flyql.matcher imported without [re2] extra — "
        "regex (~) and LIKE operators will raise ERR_RE2_MISSING. "
        "Install with `pip install flyql[re2]`.",
        ImportWarning,
        stacklevel=2,
    )
