import json
from typing import Any, Dict, Tuple

from flyql.matcher.key import Key


class Record:
    def __init__(
        self,
        data: Dict[str, Any],
    ) -> None:
        self.data = data

    def is_propbably_jsonstring(
        self,
        value: Any,
    ) -> bool:
        if not isinstance(value, str):
            return False
        if value.startswith("{") and value.endswith("}"):
            return True
        if value.startswith("[") and value.endswith("]"):
            return True
        return False

    def extract_path(
        self,
        value: Any,
        path: Tuple[str, ...],
    ) -> Any:
        for key in path:
            if isinstance(value, list):
                try:
                    idx = int(key)
                except (ValueError, TypeError):
                    return None
                if idx < 0 or idx >= len(value):
                    return None
                value = value[idx]
            elif isinstance(value, dict) and key in value:
                value = value[key]
            else:
                return None
        return value

    def get_value(
        self,
        key: Key,
    ) -> Any:
        value = self.data.get(key.value)
        if value is None:
            return None
        if not key.path:
            return value
        else:
            if self.is_propbably_jsonstring(value):
                try:
                    value = json.loads(value)
                except Exception:  # pylint: disable=broad-exception-caught
                    return None
            elif not isinstance(value, (dict, list)):
                return None
            return self.extract_path(value, tuple(key.path))
