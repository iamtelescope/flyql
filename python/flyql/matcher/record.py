import json
from typing import Any

from flyql.matcher.key import Key


class Record:
    def __init__(
        self,
        data: dict[str, Any],
    ):
        self.data = data

    def is_propbably_jsonstring(
        self,
        value,
    ) -> bool:
        if not isinstance(value, str):
            return False
        if value.startswith("{") and value.endswith("}"):
            return True
        if value.startswith("[") and value.endswith("["):
            return True
        return False

    def extract_path(
        self,
        value: dict[str, Any],
        path: tuple,
    ):
        for key in path:
            if isinstance(value, dict) and key in value:
                value = value[key]
            else:
                return None
        return value

    def get_value(
        self,
        key: Key,
    ):
        value = self.data[key.value]
        if not key.path:
            return value
        else:
            if self.is_propbably_jsonstring(value):
                try:
                    value = json.loads(value)
                except Exception as err:
                    return None
            elif not isinstance(value, dict):
                return None
            return self.extract_path(value, key.path)
