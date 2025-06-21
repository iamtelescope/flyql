import json
import os
import pytest
from flyql.core.key import Key, KeyParser, parse_key
from flyql.core.exceptions import FlyqlError


def load_test_data():
    """Load test data from JSON file."""
    test_data_path = os.path.join(
        os.path.dirname(__file__), "../../../tests-data/core/key.json"
    )
    with open(test_data_path, "r") as f:
        return json.load(f)


class TestKey:
    def test_init_single_segment(self):
        key = Key(["test"])
        assert key.segments == ["test"]
        assert key.is_segmented == False
        assert key.raw == "test"

    def test_init_multiple_segments(self):
        key = Key(["key", "some", "path"])
        assert key.segments == ["key", "some", "path"]
        assert key.is_segmented == True
        assert key.raw == "key:some:path"

    def test_init_with_raw(self):
        key = Key(["key", "some:path"], "key:'some:path'")
        assert key.segments == ["key", "some:path"]
        assert key.is_segmented == True
        assert key.raw == "key:'some:path'"

    def test_init_empty(self):
        key = Key([])
        assert key.segments == []
        assert key.is_segmented == False
        assert key.raw == ""


class TestParseKeyFromJSON:
    @pytest.fixture
    def test_data(self):
        return load_test_data()

    def test_success_cases(self, test_data):
        """Test all success cases from JSON test data."""
        success_tests = [
            test for test in test_data["tests"] if test["expected_result"] == "success"
        ]

        for test_case in success_tests:
            key = parse_key(test_case["input"])
            expected = test_case["expected_key"]

            assert (
                key.segments == expected["segments"]
            ), f"Failed for test: {test_case['name']}"
            assert (
                key.is_segmented == expected["is_segmented"]
            ), f"Failed for test: {test_case['name']}"
            assert key.raw == expected["raw"], f"Failed for test: {test_case['name']}"

    def test_error_cases(self, test_data):
        """Test all error cases from JSON test data."""
        error_tests = [
            test for test in test_data["tests"] if test["expected_result"] == "error"
        ]

        for test_case in error_tests:
            with pytest.raises(FlyqlError, match=test_case["expected_error_message"]):
                parse_key(test_case["input"])


# Individual test methods for better debugging and IDE support
class TestParseKeyIndividual:
    @pytest.fixture
    def test_data(self):
        return load_test_data()

    def test_empty_string(self, test_data):
        test_case = next(t for t in test_data["tests"] if t["name"] == "empty_string")
        key = parse_key(test_case["input"])
        expected = test_case["expected_key"]
        assert key.segments == expected["segments"]
        assert key.is_segmented == expected["is_segmented"]
        assert key.raw == expected["raw"]

    def test_single_segment(self, test_data):
        test_case = next(t for t in test_data["tests"] if t["name"] == "single_segment")
        key = parse_key(test_case["input"])
        expected = test_case["expected_key"]
        assert key.segments == expected["segments"]
        assert key.is_segmented == expected["is_segmented"]
        assert key.raw == expected["raw"]

    def test_multiple_segments(self, test_data):
        test_case = next(
            t for t in test_data["tests"] if t["name"] == "multiple_segments"
        )
        key = parse_key(test_case["input"])
        expected = test_case["expected_key"]
        assert key.segments == expected["segments"]
        assert key.is_segmented == expected["is_segmented"]
        assert key.raw == expected["raw"]

    def test_quoted_segment_simple(self, test_data):
        test_case = next(
            t for t in test_data["tests"] if t["name"] == "quoted_segment_simple"
        )
        key = parse_key(test_case["input"])
        expected = test_case["expected_key"]
        assert key.segments == expected["segments"]
        assert key.is_segmented == expected["is_segmented"]
        assert key.raw == expected["raw"]

    def test_quoted_segment_only(self, test_data):
        test_case = next(
            t for t in test_data["tests"] if t["name"] == "quoted_segment_only"
        )
        key = parse_key(test_case["input"])
        expected = test_case["expected_key"]
        assert key.segments == expected["segments"]
        assert key.is_segmented == expected["is_segmented"]
        assert key.raw == expected["raw"]

    def test_multiple_quoted_segments(self, test_data):
        test_case = next(
            t for t in test_data["tests"] if t["name"] == "multiple_quoted_segments"
        )
        key = parse_key(test_case["input"])
        expected = test_case["expected_key"]
        assert key.segments == expected["segments"]
        assert key.is_segmented == expected["is_segmented"]
        assert key.raw == expected["raw"]

    def test_escaped_quote_in_quoted_segment(self, test_data):
        test_case = next(
            t
            for t in test_data["tests"]
            if t["name"] == "escaped_quote_in_quoted_segment"
        )
        key = parse_key(test_case["input"])
        expected = test_case["expected_key"]
        assert key.segments == expected["segments"]
        assert key.is_segmented == expected["is_segmented"]
        assert key.raw == expected["raw"]

    def test_escaped_backslash(self, test_data):
        test_case = next(
            t for t in test_data["tests"] if t["name"] == "escaped_backslash"
        )
        key = parse_key(test_case["input"])
        expected = test_case["expected_key"]
        assert key.segments == expected["segments"]
        assert key.is_segmented == expected["is_segmented"]
        assert key.raw == expected["raw"]

    def test_escaped_colon_in_normal_segment(self, test_data):
        test_case = next(
            t
            for t in test_data["tests"]
            if t["name"] == "escaped_colon_in_normal_segment"
        )
        key = parse_key(test_case["input"])
        expected = test_case["expected_key"]
        assert key.segments == expected["segments"]
        assert key.is_segmented == expected["is_segmented"]
        assert key.raw == expected["raw"]

    def test_empty_segments(self, test_data):
        test_case = next(t for t in test_data["tests"] if t["name"] == "empty_segments")
        key = parse_key(test_case["input"])
        expected = test_case["expected_key"]
        assert key.segments == expected["segments"]
        assert key.is_segmented == expected["is_segmented"]
        assert key.raw == expected["raw"]

    def test_empty_quoted_segment(self, test_data):
        test_case = next(
            t for t in test_data["tests"] if t["name"] == "empty_quoted_segment"
        )
        key = parse_key(test_case["input"])
        expected = test_case["expected_key"]
        assert key.segments == expected["segments"]
        assert key.is_segmented == expected["is_segmented"]
        assert key.raw == expected["raw"]

    def test_trailing_colon(self, test_data):
        test_case = next(t for t in test_data["tests"] if t["name"] == "trailing_colon")
        key = parse_key(test_case["input"])
        expected = test_case["expected_key"]
        assert key.segments == expected["segments"]
        assert key.is_segmented == expected["is_segmented"]
        assert key.raw == expected["raw"]

    def test_leading_colon(self, test_data):
        test_case = next(t for t in test_data["tests"] if t["name"] == "leading_colon")
        key = parse_key(test_case["input"])
        expected = test_case["expected_key"]
        assert key.segments == expected["segments"]
        assert key.is_segmented == expected["is_segmented"]
        assert key.raw == expected["raw"]

    def test_complex_escaping(self, test_data):
        test_case = next(
            t for t in test_data["tests"] if t["name"] == "complex_escaping"
        )
        key = parse_key(test_case["input"])
        expected = test_case["expected_key"]
        assert key.segments == expected["segments"]
        assert key.is_segmented == expected["is_segmented"]
        assert key.raw == expected["raw"]

    def test_tab_and_newline_escapes(self, test_data):
        test_case = next(
            t for t in test_data["tests"] if t["name"] == "tab_and_newline_escapes"
        )
        key = parse_key(test_case["input"])
        expected = test_case["expected_key"]
        assert key.segments == expected["segments"]
        assert key.is_segmented == expected["is_segmented"]
        assert key.raw == expected["raw"]

    def test_unterminated_quote_raises_error(self, test_data):
        test_case = next(
            t for t in test_data["tests"] if t["name"] == "unterminated_quote_error"
        )
        with pytest.raises(FlyqlError, match=test_case["expected_error_message"]):
            parse_key(test_case["input"])

    def test_incomplete_escape_raises_error(self, test_data):
        test_case = next(
            t for t in test_data["tests"] if t["name"] == "incomplete_escape_error"
        )
        with pytest.raises(FlyqlError, match=test_case["expected_error_message"]):
            parse_key(test_case["input"])

    def test_double_quoted_segment_simple(self, test_data):
        test_case = next(
            t for t in test_data["tests"] if t["name"] == "double_quoted_segment_simple"
        )
        key = parse_key(test_case["input"])
        expected = test_case["expected_key"]
        assert key.segments == expected["segments"]
        assert key.is_segmented == expected["is_segmented"]
        assert key.raw == expected["raw"]

    def test_double_quoted_segment_only(self, test_data):
        test_case = next(
            t for t in test_data["tests"] if t["name"] == "double_quoted_segment_only"
        )
        key = parse_key(test_case["input"])
        expected = test_case["expected_key"]
        assert key.segments == expected["segments"]
        assert key.is_segmented == expected["is_segmented"]
        assert key.raw == expected["raw"]

    def test_mixed_single_and_double_quotes(self, test_data):
        test_case = next(
            t
            for t in test_data["tests"]
            if t["name"] == "mixed_single_and_double_quotes"
        )
        key = parse_key(test_case["input"])
        expected = test_case["expected_key"]
        assert key.segments == expected["segments"]
        assert key.is_segmented == expected["is_segmented"]
        assert key.raw == expected["raw"]

    def test_escaped_double_quote_in_double_quoted_segment(self, test_data):
        test_case = next(
            t
            for t in test_data["tests"]
            if t["name"] == "escaped_double_quote_in_double_quoted_segment"
        )
        key = parse_key(test_case["input"])
        expected = test_case["expected_key"]
        assert key.segments == expected["segments"]
        assert key.is_segmented == expected["is_segmented"]
        assert key.raw == expected["raw"]

    def test_json_key_with_quotes(self, test_data):
        test_case = next(
            t for t in test_data["tests"] if t["name"] == "json_key_with_quotes"
        )
        key = parse_key(test_case["input"])
        expected = test_case["expected_key"]
        assert key.segments == expected["segments"]
        assert key.is_segmented == expected["is_segmented"]
        assert key.raw == expected["raw"]

    def test_json_key_with_quotes_and_colons(self, test_data):
        test_case = next(
            t
            for t in test_data["tests"]
            if t["name"] == "json_key_with_quotes_and_colons"
        )
        key = parse_key(test_case["input"])
        expected = test_case["expected_key"]
        assert key.segments == expected["segments"]
        assert key.is_segmented == expected["is_segmented"]
        assert key.raw == expected["raw"]

    def test_empty_double_quoted_segments(self, test_data):
        test_case = next(
            t for t in test_data["tests"] if t["name"] == "empty_double_quoted_segments"
        )
        key = parse_key(test_case["input"])
        expected = test_case["expected_key"]
        assert key.segments == expected["segments"]
        assert key.is_segmented == expected["is_segmented"]
        assert key.raw == expected["raw"]

    def test_unterminated_double_quote_raises_error(self, test_data):
        test_case = next(
            t
            for t in test_data["tests"]
            if t["name"] == "unterminated_double_quote_error"
        )
        with pytest.raises(FlyqlError, match=test_case["expected_error_message"]):
            parse_key(test_case["input"])
