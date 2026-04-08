import pytest

from flyql.transformers.base import TransformerType
from flyql.transformers.builtins import (
    LenTransformer,
    LowerTransformer,
    SplitTransformer,
    UpperTransformer,
)


class TestUpperTransformer:
    def setup_method(self) -> None:
        self.t = UpperTransformer()

    def test_name(self) -> None:
        assert self.t.name == "upper"

    def test_input_type(self) -> None:
        assert self.t.input_type == TransformerType.STRING

    def test_output_type(self) -> None:
        assert self.t.output_type == TransformerType.STRING

    @pytest.mark.parametrize(
        "dialect, col, expected",
        [
            ("clickhouse", "message", "upper(message)"),
            ("postgresql", "message", "UPPER(message)"),
            ("starrocks", "message", "UPPER(message)"),
        ],
    )
    def test_sql(self, dialect: str, col: str, expected: str) -> None:
        assert self.t.sql(dialect, col) == expected

    def test_apply(self) -> None:
        assert self.t.apply("hello") == "HELLO"

    def test_apply_mixed_case(self) -> None:
        assert self.t.apply("Hello World") == "HELLO WORLD"


class TestLowerTransformer:
    def setup_method(self) -> None:
        self.t = LowerTransformer()

    def test_name(self) -> None:
        assert self.t.name == "lower"

    def test_input_type(self) -> None:
        assert self.t.input_type == TransformerType.STRING

    def test_output_type(self) -> None:
        assert self.t.output_type == TransformerType.STRING

    @pytest.mark.parametrize(
        "dialect, col, expected",
        [
            ("clickhouse", "message", "lower(message)"),
            ("postgresql", "message", "LOWER(message)"),
            ("starrocks", "message", "LOWER(message)"),
        ],
    )
    def test_sql(self, dialect: str, col: str, expected: str) -> None:
        assert self.t.sql(dialect, col) == expected

    def test_apply(self) -> None:
        assert self.t.apply("HELLO") == "hello"


class TestLenTransformer:
    def setup_method(self) -> None:
        self.t = LenTransformer()

    def test_name(self) -> None:
        assert self.t.name == "len"

    def test_input_type(self) -> None:
        assert self.t.input_type == TransformerType.STRING

    def test_output_type(self) -> None:
        assert self.t.output_type == TransformerType.INT

    @pytest.mark.parametrize(
        "dialect, col, expected",
        [
            ("clickhouse", "field", "length(field)"),
            ("postgresql", "field", "LENGTH(field)"),
            ("starrocks", "field", "LENGTH(field)"),
        ],
    )
    def test_sql(self, dialect: str, col: str, expected: str) -> None:
        assert self.t.sql(dialect, col) == expected

    def test_apply(self) -> None:
        assert self.t.apply("hello") == 5

    def test_apply_empty(self) -> None:
        assert self.t.apply("") == 0


class TestSqlNesting:
    def test_upper_then_len(self) -> None:
        upper = UpperTransformer()
        length = LenTransformer()
        result = "field"
        result = upper.sql("postgresql", result)
        result = length.sql("postgresql", result)
        assert result == "LENGTH(UPPER(field))"

    def test_lower_then_len_clickhouse(self) -> None:
        lower = LowerTransformer()
        length = LenTransformer()
        result = "field"
        result = lower.sql("clickhouse", result)
        result = length.sql("clickhouse", result)
        assert result == "length(lower(field))"


class TestSplitTransformerSQLEscaping:
    def setup_method(self) -> None:
        self.t = SplitTransformer()

    def test_escapes_single_quotes(self) -> None:
        sql = self.t.sql("clickhouse", "col", ["'"])
        assert "\\'" in sql

    def test_escapes_backslashes(self) -> None:
        sql = self.t.sql("clickhouse", "col", ["\\"])
        assert "\\\\" in sql

    def test_escapes_backslash_before_quote(self) -> None:
        sql = self.t.sql("clickhouse", "col", ["\\'"])
        # Backslash escaped first (\\), then quote (\') => \\\'
        assert "\\\\\\'" in sql
