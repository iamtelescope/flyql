#!/usr/bin/env python3
"""Python errno-parity CLI.

Parses a single flyql query via the core or columns parser and prints
`{errno, error_text}` as JSON. Used by the e2e parity harness (runner.py
--errno-parity) to compare Python's errno emission against JS and Go.

AssertionError is NOT caught — unreachable markers propagate as bugs.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "python"))

from flyql.columns.exceptions import ParserError as ColumnsParserError
from flyql.columns.parser import Parser as ColumnsParser
from flyql.core.parser import Parser as CoreParser
from flyql.core.parser import ParserError as CoreParserError


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True)
    ap.add_argument("--category", choices=("core", "columns"), default="core")
    ap.add_argument("--transformers", action="store_true")
    ap.add_argument("--renderers", action="store_true")
    args = ap.parse_args()

    out = {"errno": 0, "error_text": ""}
    if args.category == "core":
        p = CoreParser()
        try:
            p.parse(args.input)
        except CoreParserError as e:
            out = {"errno": e.errno, "error_text": p.error_text}
    else:
        caps = {"transformers": args.transformers, "renderers": args.renderers}
        p = ColumnsParser(capabilities=caps)
        try:
            p.parse(args.input)
        except ColumnsParserError as e:
            out = {"errno": e.errno, "error_text": p.error_text}

    json.dump(out, sys.stdout, ensure_ascii=False)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
