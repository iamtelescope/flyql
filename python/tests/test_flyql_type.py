"""Unit tests for the flyql.flyql_type module."""

import pytest

from flyql.flyql_type import Type, type_permits_unknown_children

PERMISSIVE = {Type.JSON, Type.JSONString, Type.Map, Type.Unknown}


@pytest.mark.parametrize("type_value", list(Type))
def test_type_permits_unknown_children_exactness(type_value: Type) -> None:
    """Returns True for exactly the four JSON-family types; False for everything else."""
    assert type_permits_unknown_children(type_value) is (type_value in PERMISSIVE)
