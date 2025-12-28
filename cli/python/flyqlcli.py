#!/usr/bin/env python3

import argparse
import json
import sys
from typing import Dict, Any, Optional

from flyql.core.parser import parse, ParserError
from flyql.matcher.evaluator import Evaluator, REGEX_ENGINE_PYTHON_STD
from flyql.matcher.record import Record
from flyql.generators.clickhouse.generator import to_sql
from flyql.generators.clickhouse.field import Field


def parse_fields(fields_json: str) -> Dict[str, Field]:
    """Parse fields JSON into Field objects."""
    try:
        fields_data = json.loads(fields_json)
    except json.JSONDecodeError as e:
        print(f"Error: Invalid fields JSON: {e}", file=sys.stderr)
        sys.exit(1)

    fields = {}
    for name, config in fields_data.items():
        field_type = config.get("type", "String")
        jsonstring = config.get("jsonstring", False)
        values = config.get("values", [])
        fields[name] = Field(
            name=name,
            jsonstring=jsonstring,
            _type=field_type,
            values=values,
        )
    return fields


def node_to_dict(node) -> Optional[Dict[str, Any]]:
    """Convert AST node to dictionary for JSON output."""
    if node is None:
        return None

    result: Dict[str, Any] = {}

    if node.expression:
        expr = node.expression
        result["expression"] = {
            "key": expr.key.raw,
            "operator": expr.operator,
        }
        if expr.operator in ("in", "not in"):
            result["expression"]["values"] = expr.values
            result["expression"]["values_type"] = expr.values_type
        elif expr.operator != "truthy":
            result["expression"]["value"] = expr.value
            result["expression"]["value_is_string"] = expr.value_is_string

    if node.bool_operator:
        result["bool_operator"] = node.bool_operator

    if node.negated:
        result["negated"] = True

    if node.left:
        result["left"] = node_to_dict(node.left)

    if node.right:
        result["right"] = node_to_dict(node.right)

    return result


def cmd_parse(query: str) -> None:
    """Parse query and output AST as JSON."""
    try:
        parser = parse(query)
        ast = node_to_dict(parser.root)
        print(json.dumps(ast, indent=2))
    except ParserError as e:
        print(f"Parse error: {e}", file=sys.stderr)
        sys.exit(1)


def cmd_generate(query: str, fields_json: str, generator: str) -> None:
    """Generate target code from query."""
    if generator != "clickhouse":
        print(
            f"Error: Unknown generator '{generator}'. Supported: clickhouse",
            file=sys.stderr,
        )
        sys.exit(1)

    try:
        parser = parse(query)
    except ParserError as e:
        print(f"Parse error: {e}", file=sys.stderr)
        sys.exit(1)

    fields = parse_fields(fields_json)

    try:
        sql = to_sql(parser.root, fields)
        print(sql)
    except Exception as e:
        print(f"Generator error: {e}", file=sys.stderr)
        sys.exit(1)


def cmd_evaluate(query: str) -> None:
    """Evaluate query against JSON lines from stdin."""
    try:
        parser = parse(query)
    except ParserError as e:
        print(f"Parse error: {e}", file=sys.stderr)
        sys.exit(1)

    evaluator = Evaluator(regex_engine=REGEX_ENGINE_PYTHON_STD)

    for line_num, line in enumerate(sys.stdin, 1):
        line = line.strip()
        if not line:
            continue

        try:
            data = json.loads(line)
        except json.JSONDecodeError as e:
            print(f"Warning: Invalid JSON on line {line_num}: {e}", file=sys.stderr)
            continue

        record = Record(data)
        try:
            if evaluator.evaluate(parser.root, record):
                print(line)
        except KeyError:
            # Field not found in record, skip
            continue
        except Exception as e:
            print(f"Warning: Evaluation error on line {line_num}: {e}", file=sys.stderr)
            continue


def main():
    parser = argparse.ArgumentParser(
        description="FlyQL CLI - Query language for filtering and generating SQL",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )

    parser.add_argument(
        "--query",
        "-q",
        required=True,
        help="FlyQL query string (e.g., 'status=200 and active')",
    )

    parser.add_argument(
        "--fields",
        "-f",
        default="{}",
        help='JSON object with field definitions (e.g., \'{"status": {"type": "Int32"}}\')',
    )

    parser.add_argument(
        "--generate",
        "-g",
        metavar="TARGET",
        help="Generate code for target (supported: clickhouse)",
    )

    parser.add_argument(
        "--evaluate",
        "-e",
        action="store_true",
        help="Evaluate query against JSON lines from stdin",
    )

    parser.add_argument(
        "--parse",
        "-p",
        action="store_true",
        help="Parse query and output AST as JSON",
    )

    args = parser.parse_args()

    actions = sum([bool(args.generate), args.evaluate, args.parse])
    if actions == 0:
        print(
            "Error: Specify one of --generate, --evaluate, or --parse", file=sys.stderr
        )
        sys.exit(1)
    if actions > 1:
        print(
            "Error: --generate, --evaluate, and --parse are mutually exclusive",
            file=sys.stderr,
        )
        sys.exit(1)

    if args.parse:
        cmd_parse(args.query)
    elif args.generate:
        cmd_generate(args.query, args.fields, args.generate)
    elif args.evaluate:
        cmd_evaluate(args.query)


if __name__ == "__main__":
    main()
