from typing import List
from .parser import Parser
from .column import ParsedColumn
from .exceptions import ParserError
from flyql.core.key import parse_key


def parse(text: str) -> List[ParsedColumn]:
    """
    Parse columns string and return list of ParsedColumn objects.

    Args:
        text: Columns definition string (e.g., "message, status|upper as code")

    Returns:
        List of ParsedColumn objects with parsed path segments

    Raises:
        ParserError: If parsing fails

    Examples:
        >>> columns = parse("message")
        >>> columns = parse("message, status, user_id")
        >>> columns = parse("message|chars(25) as msg")
        >>> columns = parse("metadata.labels.tier|upper")
        >>> columns = parse("data.'key.with.dots'.nested")
    """
    parser = Parser()
    parser.parse(text)
    columns = []
    for column_dict in parser.columns:
        # Parse the column name as a path with segments
        key = parse_key(column_dict["name"])
        columns.append(
            ParsedColumn(
                name=column_dict["name"],
                modifiers=column_dict["modifiers"],
                alias=column_dict["alias"],
                key=key,
            )
        )
    return columns


__all__ = ["parse", "Parser", "ParsedColumn", "ParserError"]
