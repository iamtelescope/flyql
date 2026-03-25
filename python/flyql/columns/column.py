import json
from typing import List, Dict, Any, Optional
from flyql.core.key import Key


class ParsedColumn:
    def __init__(
        self,
        name: str,
        modifiers: List[Dict[str, Any]],
        alias: Optional[str],
        key: Optional[Key] = None,
        display_name: str = "",
    ):
        self.name = name
        self.modifiers = modifiers
        self.alias = alias
        self.key = key
        self.display_name = display_name

    @property
    def segments(self) -> List[str]:
        return self.key.segments if self.key else [self.name]

    @property
    def is_segmented(self) -> bool:
        return self.key.is_segmented if self.key else False

    def as_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "modifiers": self.modifiers,
            "alias": self.alias,
            "segments": self.segments,
            "is_segmented": self.is_segmented,
            "display_name": self.display_name,
        }

    def as_json(self) -> str:
        return json.dumps(self.as_dict())
