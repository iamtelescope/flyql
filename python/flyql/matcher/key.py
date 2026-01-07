from typing import List
from flyql.core.key import parse_key


class Key:
    def __init__(
        self,
        value: str,
    ) -> None:
        parsed_key = parse_key(value)
        self.value = parsed_key.segments[0] if parsed_key.segments else value
        self.path: List[str] = (
            parsed_key.segments[1:] if len(parsed_key.segments) > 1 else []
        )
