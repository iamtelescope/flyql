"""Static assertion: matcher evaluator never references renderers.

Renderers architecturally cannot reach the matcher: the matcher operates on
WHERE-AST ``Expression.key.transformers``, not on SELECT-list ``ParsedColumn``.
This test enforces that invariant by scanning the evaluator source for the
substring ``renderer`` — a future refactor that tried to thread renderers
through matching would trip this and require an explicit decision.
"""

from pathlib import Path


def test_matcher_evaluator_never_mentions_renderer():
    evaluator_path = (
        Path(__file__).parent.parent.parent / "flyql" / "matcher" / "evaluator.py"
    )
    source = evaluator_path.read_text()
    assert "renderer" not in source.lower(), (
        "matcher/evaluator.py contains 'renderer' — renderers must NEVER "
        "reach the matcher. See tech-spec-column-renderers-api Decision 20."
    )
