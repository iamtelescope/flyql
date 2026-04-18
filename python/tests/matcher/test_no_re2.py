import pytest

from flyql.core.parser import parse
from flyql.matcher.evaluator import Evaluator
from flyql.matcher.record import Record
from flyql.core.exceptions import FlyqlError
from flyql.errors_generated import ERR_RE2_MISSING, MATCHER_MESSAGES


@pytest.mark.parametrize(
    "query",
    [
        'msg~"hi"',
        'msg!~"hi"',
        'msg like "h%"',
        'msg not like "h%"',
        'msg ilike "h%"',
        'msg not ilike "h%"',
    ],
)
def test_no_re2_raises_err_re2_missing(monkeypatch, query):
    """When re2 is unavailable, every regex/LIKE-adjacent operator raises ERR_RE2_MISSING."""
    from flyql.matcher import evaluator as ev_mod

    monkeypatch.setattr(ev_mod, "_HAVE_RE2", False)
    monkeypatch.setattr(ev_mod, "re2", None)
    root = parse(query).root
    with pytest.raises(FlyqlError) as exc_info:
        Evaluator().evaluate(root, Record({"msg": "hi"}))
    assert exc_info.value.message == MATCHER_MESSAGES[ERR_RE2_MISSING]
