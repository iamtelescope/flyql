from typing import List, Optional
from flyql.core.exceptions import FlyqlError


class Key:
    def __init__(self, segments: List[str], raw: Optional[str] = None):
        self.segments = segments
        self.is_segmented = len(segments) > 1
        self.raw = raw if raw is not None else ":".join(segments)


class KeyParser:
    def __init__(self) -> None:
        self.input = ""
        self.pos = 0
        self.segments: List[str] = []
        self.current_segment = ""

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
            self.advance()  # Skip the escaped character
            return "'"
        elif char == '"':
            self.advance()  # Skip the escaped character
            return '"'
        elif char == "\\":
            self.advance()  # Skip the escaped character
            return "\\"
        elif char == "n":
            self.advance()  # Skip the escaped character
            return "\n"
        elif char == "t":
            self.advance()  # Skip the escaped character
            return "\t"
        elif char is not None:
            result = char
            self.advance()  # Skip the escaped character
            return result  # Return the character as-is for unknown escapes
        else:
            raise FlyqlError(
                f"Key parsing error: Incomplete escape sequence at position {self.pos}"
            )

    def parse_quoted_segment(self, quote_char: str) -> None:
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

        raise FlyqlError(
            f"Key parsing error: Unterminated quoted segment starting at position {self.pos}"
        )

    def parse_normal_segment(self) -> None:
        while self.peek() is not None:
            char = self.peek()

            if char == ":":
                return
            elif char == "'":
                self.parse_quoted_segment("'")
            elif char == '"':
                self.parse_quoted_segment('"')
            elif char == "\\":
                self.current_segment += self.parse_escape_sequence()
            else:
                char = self.advance()
                if char is not None:
                    self.current_segment += char

    def parse(self, key_string: str) -> Key:
        self.input = key_string
        self.pos = 0
        self.segments = []
        self.current_segment = ""
        if not self.input:
            return Key([], self.input)

        while self.pos < len(self.input):
            self.parse_normal_segment()

            self.segments.append(self.current_segment)
            self.current_segment = ""

            if self.peek() == ":":
                self.advance()  # Skip colon
                # If we're at the end after a colon, add empty segment
                if self.pos >= len(self.input):
                    self.segments.append("")

        return Key(self.segments, self.input)


def parse_key(key_string: str) -> Key:
    parser = KeyParser()
    return parser.parse(key_string)
