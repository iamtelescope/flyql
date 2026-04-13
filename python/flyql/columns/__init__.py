import json
from typing import Any, Dict, List, Optional
from .parser import Parser
from .column import ParsedColumn
from .exceptions import ParserError
from .validator import diagnose
from flyql.core.key import parse_key


def parse(
    text: str, capabilities: Optional[Dict[str, Any]] = None
) -> List[ParsedColumn]:
    """
    Parse columns string and return list of ParsedColumn objects.

    Args:
        text: Columns definition string (e.g., "message, status|upper as code")
        capabilities: Optional capabilities config (e.g., {"transformers": True})

    Returns:
        List of ParsedColumn objects with parsed path segments

    Raises:
        ParserError: If parsing fails

    Examples:
        >>> columns = parse("message")
        >>> columns = parse("message, status, user_id")
        >>> columns = parse("message|chars(25) as msg", {"transformers": True})
        >>> columns = parse("metadata.labels.tier|upper", {"transformers": True})
        >>> columns = parse("data.'key.with.dots'.nested")
    """
    parser = Parser(capabilities=capabilities)
    parser.parse(text)
    columns = []
    for column_dict in parser.columns:
        # Parse the column name as a path with segments
        key = parse_key(column_dict["name"])
        alias = column_dict["alias"]
        transformer_ranges = [
            {
                "name_range": t.get("name_range"),
                "argument_ranges": t.get("argument_ranges", []),
            }
            for t in column_dict["transformers"]
        ]
        renderer_dicts = column_dict.get("renderers", [])
        renderer_ranges = [
            {
                "name_range": r.get("name_range"),
                "argument_ranges": r.get("argument_ranges", []),
            }
            for r in renderer_dicts
        ]
        columns.append(
            ParsedColumn(
                name=column_dict["name"],
                transformers=column_dict["transformers"],
                alias=alias,
                key=key,
                display_name=alias if alias else "",
                name_range=column_dict.get("name_range"),
                transformer_ranges=transformer_ranges,
                renderers=renderer_dicts,
                renderer_ranges=renderer_ranges,
            )
        )
    return columns


def parse_to_dicts(
    text: str, capabilities: Optional[Dict[str, Any]] = None
) -> List[Dict[str, Any]]:
    return [col.as_dict() for col in parse(text, capabilities=capabilities)]


def parse_to_json(text: str, capabilities: Optional[Dict[str, Any]] = None) -> str:
    return json.dumps(parse_to_dicts(text, capabilities=capabilities))


__all__ = [
    "parse",
    "parse_to_dicts",
    "parse_to_json",
    "Parser",
    "ParsedColumn",
    "ParserError",
    "diagnose",
]
