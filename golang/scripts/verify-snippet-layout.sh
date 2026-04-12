#!/usr/bin/env bash
set -euo pipefail

# Verify snippet directory layout invariant:
# - Any directory that contains *.go files must contain exactly one main.go
#   with `package main` and a `func main()`.
# - Directories with no *.go files may exist as intermediate containers.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "${SCRIPT_DIR}/../snippets"

failed=0
while IFS= read -r -d '' dir; do
  gofiles=$(find "$dir" -maxdepth 1 -name '*.go' -type f)
  if [ -n "$gofiles" ]; then
    count=$(printf '%s\n' "$gofiles" | wc -l | tr -d ' ')
    if [ "$count" -ne 1 ]; then
      echo "FAIL: $dir has $count .go files (expected exactly 1: main.go)" >&2
      failed=1
      continue
    fi
    name=$(basename "$(printf '%s' "$gofiles")")
    if [ "$name" != "main.go" ]; then
      echo "FAIL: $dir has $name (expected main.go)" >&2
      failed=1
      continue
    fi
    if ! grep -q '^package main' "$dir/main.go"; then
      echo "FAIL: $dir/main.go is not package main" >&2
      failed=1
      continue
    fi
    if ! grep -q 'func main()' "$dir/main.go"; then
      echo "FAIL: $dir/main.go has no main() function" >&2
      failed=1
      continue
    fi
  fi
done < <(find . -type d -print0)

exit $failed
