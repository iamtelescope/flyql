"""``flyql.matcher.match`` — convenience wrapper for one-shot matches.

Parity notes:
  - JavaScript: ``match(query, data, registry, { defaultTimezone })`` —
    uses native ``RegExp`` (PCRE-ish; supports backreferences and lookahead).
  - Go: ``matcher.Match(query, data, registry...)`` — uses stdlib ``regexp``
    (RE2-based; does NOT support backreferences/lookahead; no timezone
    override in the helper).
  - Python (this): uses ``re2`` when ``[re2]`` extra is installed; raises
    ``FlyqlError(ERR_RE2_MISSING)`` if the extra is absent AND the query
    uses ``~`` or ``LIKE``/``ILIKE``.

Cross-language portability: patterns that use backreferences or lookahead
work in JavaScript but raise in Python and Go. Stick to a conservative
subset (anchors, character classes, quantifiers) for portable queries.

For repeated matches against many records, instantiate ``Evaluator``
directly so its regex cache is reused.
"""

from typing import Any, Mapping, Optional

from flyql.core.parser import parse
from flyql.matcher.evaluator import Evaluator
from flyql.matcher.record import Record
from flyql.transformers.registry import TransformerRegistry


def match(
    query: str,
    data: Mapping[str, Any],
    registry: Optional[TransformerRegistry] = None,
    *,
    default_timezone: str = "UTC",
) -> bool:
    from flyql.core.exceptions import FlyqlError

    result = parse(query)
    if result.root is None:
        raise FlyqlError("empty query has no AST root")
    evaluator = Evaluator(registry=registry, default_timezone=default_timezone)
    return evaluator.evaluate(result.root, Record(dict(data)))
