import json
from typing import List, Dict, Any, Optional
from flyql.core.key import Key
from flyql.core.range import Range


class ParsedColumn:
    def __init__(
        self,
        name: str,
        transformers: List[Dict[str, Any]],
        alias: Optional[str],
        key: Optional[Key] = None,
        display_name: str = "",
        name_range: Optional[Range] = None,
        transformer_ranges: Optional[List[Dict[str, Any]]] = None,
        renderers: Optional[List[Dict[str, Any]]] = None,
        renderer_ranges: Optional[List[Dict[str, Any]]] = None,
    ):
        self.name = name
        self.transformers = transformers
        self.alias = alias
        self.key = key
        self.display_name = display_name
        self.name_range = name_range
        self.transformer_ranges = transformer_ranges
        self.renderers = renderers or []
        self.renderer_ranges = renderer_ranges

    @property
    def segments(self) -> List[str]:
        return self.key.segments if self.key else [self.name]

    @property
    def is_segmented(self) -> bool:
        return self.key.is_segmented if self.key else False

    def as_dict(self) -> Dict[str, Any]:
        result: Dict[str, Any] = {
            "name": self.name,
            "transformers": [
                {"name": t["name"], "arguments": t["arguments"]}
                for t in self.transformers
            ],
            "alias": self.alias,
            "segments": self.segments,
            "is_segmented": self.is_segmented,
            "display_name": self.display_name,
        }
        if self.renderers:
            result["renderers"] = [
                {"name": r["name"], "arguments": r["arguments"]} for r in self.renderers
            ]
        return result

    def as_json(self) -> str:
        return json.dumps(self.as_dict())
