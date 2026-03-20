import re
from typing import List, Optional

from flyql.generators.postgresql.constants import (
    NORMALIZED_TYPE_TO_POSTGRESQL_TYPES,
    NORMALIZED_TYPE_STRING,
    NORMALIZED_TYPE_INT,
    NORMALIZED_TYPE_FLOAT,
    NORMALIZED_TYPE_BOOL,
    NORMALIZED_TYPE_DATE,
    NORMALIZED_TYPE_ARRAY,
    NORMALIZED_TYPE_JSON,
    NORMALIZED_TYPE_HSTORE,
)

REGEX = {
    NORMALIZED_TYPE_STRING: re.compile(
        r"^(varchar|char|character varying|character)\s*\(\s*\d+\s*\)", re.IGNORECASE
    ),
    NORMALIZED_TYPE_FLOAT: re.compile(
        r"^(numeric|decimal)\s*\(\s*\d+\s*(,\s*\d+)?\s*\)", re.IGNORECASE
    ),
    NORMALIZED_TYPE_DATE: re.compile(r"^timestamp\s*\(\s*\d+\s*\)", re.IGNORECASE),
    NORMALIZED_TYPE_ARRAY: re.compile(r"(\[\]$|^_)", re.IGNORECASE),
}


def normalize_postgresql_type(pg_type: str) -> Optional[str]:
    if not pg_type or not isinstance(pg_type, str):
        return None

    normalized = pg_type.strip().lower()

    if REGEX[NORMALIZED_TYPE_ARRAY].search(normalized):
        return NORMALIZED_TYPE_ARRAY

    if REGEX[NORMALIZED_TYPE_STRING].match(normalized):
        return NORMALIZED_TYPE_STRING
    if normalized in NORMALIZED_TYPE_TO_POSTGRESQL_TYPES[NORMALIZED_TYPE_STRING]:
        return NORMALIZED_TYPE_STRING

    if normalized in NORMALIZED_TYPE_TO_POSTGRESQL_TYPES[NORMALIZED_TYPE_INT]:
        return NORMALIZED_TYPE_INT

    if REGEX[NORMALIZED_TYPE_FLOAT].match(normalized):
        return NORMALIZED_TYPE_FLOAT
    if normalized in NORMALIZED_TYPE_TO_POSTGRESQL_TYPES[NORMALIZED_TYPE_FLOAT]:
        return NORMALIZED_TYPE_FLOAT

    if normalized in NORMALIZED_TYPE_TO_POSTGRESQL_TYPES[NORMALIZED_TYPE_BOOL]:
        return NORMALIZED_TYPE_BOOL

    if REGEX[NORMALIZED_TYPE_DATE].match(normalized):
        return NORMALIZED_TYPE_DATE
    if normalized in NORMALIZED_TYPE_TO_POSTGRESQL_TYPES[NORMALIZED_TYPE_DATE]:
        return NORMALIZED_TYPE_DATE

    if normalized in NORMALIZED_TYPE_TO_POSTGRESQL_TYPES[NORMALIZED_TYPE_JSON]:
        return NORMALIZED_TYPE_JSON

    if normalized in NORMALIZED_TYPE_TO_POSTGRESQL_TYPES[NORMALIZED_TYPE_HSTORE]:
        return NORMALIZED_TYPE_HSTORE

    return None


class Column:
    def __init__(
        self,
        name: str,
        _type: str,
        values: Optional[List[str]] = None,
    ):
        self.name = name
        self.type = _type
        self.values = values or []
        self.normalized_type = normalize_postgresql_type(_type)
        self.is_array = self.normalized_type == NORMALIZED_TYPE_ARRAY
        self.is_jsonb = self.normalized_type == NORMALIZED_TYPE_JSON
        self.is_hstore = self.normalized_type == NORMALIZED_TYPE_HSTORE
        self.raw_identifier = ""

    def with_raw_identifier(self, identifier: str) -> "Column":
        self.raw_identifier = identifier
        return self
