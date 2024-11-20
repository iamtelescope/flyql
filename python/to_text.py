#!/usr/bin/env python
from argparse import ArgumentParser

from flyql.parser import parse
from flyql.generator import to_text


def main() -> None:
    parser = ArgumentParser()
    parser.add_argument("expression")
    args = parser.parse_args()

    print(to_text(parse(args.expression).root))


if __name__ == "__main__":
    main()
