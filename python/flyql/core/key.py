from dataclasses import dataclass, field
from typing import Any, List, Optional, Tuple

from flyql.core.exceptions import FlyqlError, KeyParseError
from flyql.core.range import Range


@dataclass
class KeyTransformer:
    """Parsed transformer invocation from a key pipeline (e.g., ``upper`` or
    ``format("YYYY")``). Carries the transformer's source ranges so tooling
    can map the AST back to the raw input.
    """

    name: str
    arguments: List[Any]
    range: Range
    name_range: Range
    argument_ranges: List[Range] = field(default_factory=list)


class Key:
    def __init__(
        self,
        segments: List[str],
        raw: Optional[str] = None,
        quoted_segments: Optional[List[bool]] = None,
        transformers: Optional[List[KeyTransformer]] = None,
        range: Optional[Range] = None,
        segment_ranges: Optional[List[Range]] = None,
    ):
        self.segments = segments
        self.is_segmented = len(segments) > 1
        self.raw = raw if raw is not None else ".".join(segments)
        self.quoted_segments = (
            quoted_segments if quoted_segments is not None else [False] * len(segments)
        )
        self.transformers: List[KeyTransformer] = (
            transformers if transformers is not None else []
        )
        if range is None:
            # Synthesize a default range from the raw string length for
            # direct SDK construction. The parser always passes real ranges.
            range = Range(0, len(self.raw))
        if segment_ranges is None:
            segment_ranges = []
            off = 0
            for i, seg in enumerate(segments):
                start = off
                end = off + len(seg)
                segment_ranges.append(Range(start, end))
                off = end + 1  # account for '.' separator
        self.range = range
        self.segment_ranges = segment_ranges


class KeyParser:
    def __init__(self) -> None:
        self.input = ""
        self.pos = 0
        self.base_offset = 0
        self.segments: List[str] = []
        self.quoted_segments: List[bool] = []
        self.segment_ranges: List[Range] = []
        self.current_segment = ""
        self.current_segment_quoted = False
        self.current_segment_has_content = False
        self.current_segment_start = -1

    def peek(self, offset: int = 0) -> Optional[str]:
        pos = self.pos + offset
        return self.input[pos] if pos < len(self.input) else None

    def advance(self) -> Optional[str]:
        char = self.peek()
        self.pos += 1
        return char

    def parse_escape_sequence(self) -> str:
        self.advance()  # Skip backslash
        char = self.peek()

        if char == "'":
            self.advance()
            return "'"
        elif char == '"':
            self.advance()
            return '"'
        elif char == "\\":
            self.advance()
            return "\\"
        elif char == "n":
            self.advance()
            return "\n"
        elif char == "t":
            self.advance()
            return "\t"
        elif char is not None:
            result = char
            self.advance()
            return result
        else:
            raise KeyParseError(
                f"Key parsing error: Incomplete escape sequence at position {self.pos}",
                range=Range(
                    self.base_offset + self.pos,
                    self.base_offset + self.pos + 1,
                ),
            )

    def parse_quoted_segment(self, quote_char: str) -> None:
        # If no content yet, segment starts at the opening quote position.
        if not self.current_segment_has_content and self.current_segment_start == -1:
            self.current_segment_start = self.pos
        self.advance()  # Skip opening quote

        while self.peek() is not None:
            char = self.peek()

            if char == "\\":
                self.current_segment += self.parse_escape_sequence()
            elif char == quote_char:
                self.advance()  # Skip closing quote
                return
            else:
                char = self.advance()
                if char is not None:
                    self.current_segment += char

        raise KeyParseError(
            f"Key parsing error: Unterminated quoted segment starting at position {self.pos}",
            range=Range(
                self.base_offset + self.pos,
                self.base_offset + self.pos,
            ),
        )

    def parse_normal_segment(self) -> None:
        while self.peek() is not None:
            char = self.peek()

            if char == ".":
                return
            elif char == "'":
                is_first = not self.current_segment_has_content
                self.parse_quoted_segment("'")
                if is_first:
                    self.current_segment_quoted = True
                self.current_segment_has_content = True
            elif char == '"':
                is_first = not self.current_segment_has_content
                self.parse_quoted_segment('"')
                if is_first:
                    self.current_segment_quoted = True
                self.current_segment_has_content = True
            elif char == "\\":
                if self.current_segment_start == -1:
                    self.current_segment_start = self.pos
                self.current_segment += self.parse_escape_sequence()
                self.current_segment_has_content = True
            else:
                if self.current_segment_start == -1:
                    self.current_segment_start = self.pos
                char = self.advance()
                if char is not None:
                    self.current_segment += char
                self.current_segment_has_content = True

    def parse(self, key_string: str, base_offset: int = 0) -> Key:
        self.input = key_string
        self.pos = 0
        self.base_offset = base_offset
        self.segments = []
        self.quoted_segments = []
        self.segment_ranges = []
        self.current_segment = ""
        self.current_segment_quoted = False
        self.current_segment_has_content = False
        self.current_segment_start = -1

        key_range = Range(base_offset, base_offset + len(key_string))

        if not self.input:
            return Key([], self.input, [], range=key_range, segment_ranges=[])

        while self.pos < len(self.input):
            seg_start_before = self.pos
            self.parse_normal_segment()
            seg_end = self.pos

            # If segment was empty (e.g. ".foo" where leading dot produced empty seg),
            # the segment's range is the zero-width span at the current position.
            if self.current_segment_start == -1:
                seg_start = self.base_offset + seg_start_before
            else:
                seg_start = self.base_offset + self.current_segment_start
            self.segments.append(self.current_segment)
            self.quoted_segments.append(self.current_segment_quoted)
            self.segment_ranges.append(Range(seg_start, self.base_offset + seg_end))
            self.current_segment = ""
            self.current_segment_quoted = False
            self.current_segment_has_content = False
            self.current_segment_start = -1

            if self.peek() == ".":
                self.advance()  # Skip dot
                if self.pos >= len(self.input):
                    self.segments.append("")
                    self.quoted_segments.append(False)
                    self.segment_ranges.append(
                        Range(
                            self.base_offset + self.pos,
                            self.base_offset + self.pos,
                        )
                    )

        return Key(
            self.segments,
            self.input,
            self.quoted_segments,
            range=key_range,
            segment_ranges=self.segment_ranges,
        )


def _parse_transformer_arguments(
    args_str: str, base_offset: int
) -> Tuple[List[Any], List[Range]]:
    args: List[Any] = []
    ranges: List[Range] = []
    i = 0
    while i < len(args_str):
        # Skip leading whitespace BEFORE capturing the argument start.
        while i < len(args_str) and args_str[i] == " ":
            i += 1
        if i >= len(args_str):
            break
        arg_start = i
        if args_str[i] in ('"', "'"):
            quote = args_str[i]
            i += 1
            val = ""
            while i < len(args_str) and args_str[i] != quote:
                if args_str[i] == "\\" and i + 1 < len(args_str):
                    i += 1
                    if args_str[i] == "t":
                        val += "\t"
                    elif args_str[i] == "n":
                        val += "\n"
                    else:
                        val += args_str[i]
                else:
                    val += args_str[i]
                i += 1
            if i < len(args_str):
                i += 1  # consume closing quote
            else:
                raise KeyParseError(
                    "unclosed string in transformer arguments",
                    Range(base_offset + arg_start, base_offset + i),
                )
            arg_end = i
            args.append(val)
            ranges.append(Range(base_offset + arg_start, base_offset + arg_end))
        else:
            val = ""
            while i < len(args_str) and args_str[i] not in (",", " "):
                val += args_str[i]
                i += 1
            arg_end = i
            try:
                args.append(int(val))
            except ValueError:
                try:
                    args.append(float(val))
                except ValueError:
                    args.append(val)
            ranges.append(Range(base_offset + arg_start, base_offset + arg_end))
        while i < len(args_str) and args_str[i] in (" ", ","):
            i += 1
    return args, ranges


def _parse_transformer_spec(spec: str, base_offset: int) -> KeyTransformer:
    paren_index = spec.find("(")
    if paren_index == -1:
        return KeyTransformer(
            name=spec,
            arguments=[],
            range=Range(base_offset, base_offset + len(spec)),
            name_range=Range(base_offset, base_offset + len(spec)),
            argument_ranges=[],
        )
    name = spec[:paren_index]
    close_index = spec.rfind(")")
    if close_index == -1:
        partial_args_str = spec[paren_index + 1 :]
        if partial_args_str:
            arg_values, arg_ranges = _parse_transformer_arguments(
                partial_args_str, base_offset + paren_index + 1
            )
            return KeyTransformer(
                name=name,
                arguments=arg_values,
                range=Range(base_offset, base_offset + len(spec)),
                name_range=Range(base_offset, base_offset + paren_index),
                argument_ranges=arg_ranges,
            )
        return KeyTransformer(
            name=name,
            arguments=[],
            range=Range(base_offset, base_offset + len(spec)),
            name_range=Range(base_offset, base_offset + paren_index),
            argument_ranges=[],
        )
    args_str = spec[paren_index + 1 : close_index]
    arg_values, arg_ranges = _parse_transformer_arguments(
        args_str, base_offset + paren_index + 1
    )
    return KeyTransformer(
        name=name,
        arguments=arg_values,
        range=Range(base_offset, base_offset + len(spec)),
        name_range=Range(base_offset, base_offset + paren_index),
        argument_ranges=arg_ranges,
    )


def parse_key(key_string: str, base_offset: int = 0) -> Key:
    parts = key_string.split("|")
    base_key_string = parts[0]
    transformer_specs = parts[1:] if len(parts) > 1 else []

    parser = KeyParser()
    key = parser.parse(base_key_string, base_offset)

    if transformer_specs:
        transformers: List[KeyTransformer] = []
        # First transformer spec starts after base key + '|' char.
        running_offset = base_offset + len(base_key_string) + 1
        for spec in transformer_specs:
            parsed = _parse_transformer_spec(spec, running_offset)
            if not parsed.name:
                raise KeyParseError(
                    "empty transformer name in key",
                    range=Range(running_offset, running_offset + len(spec)),
                )
            transformers.append(parsed)
            running_offset += len(spec) + 1
        key.transformers = transformers
        key.raw = key_string
        # Key.range covers entire pipeline including transformers.
        key.range = Range(base_offset, base_offset + len(key_string))

    return key


def __getattr__(name: str) -> Any:
    if name == "Transformer":
        import warnings

        warnings.warn(
            "flyql.core.key.Transformer is renamed to KeyTransformer and will be removed in 1.1.0. "
            "Update imports to `from flyql.core.key import KeyTransformer`.",
            DeprecationWarning,
            stacklevel=2,
        )
        return KeyTransformer
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
