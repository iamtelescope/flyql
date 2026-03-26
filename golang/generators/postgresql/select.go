package postgresql

import (
	"fmt"
	"strconv"
	"strings"

	flyql "github.com/iamtelescope/flyql/golang"
)

// SelectColumn represents a single parsed and validated column in a SELECT list.
type SelectColumn struct {
	Key     flyql.Key
	Alias   string
	Column  *Column
	SQLExpr string
}

// SelectResult is the output of ToSQLSelect.
type SelectResult struct {
	Columns []*SelectColumn
	SQL     string
}

type rawSelectColumn struct {
	name  string
	alias string
}

func parseRawSelectColumns(text string) ([]rawSelectColumn, error) {
	parts := strings.Split(text, ",")
	result := make([]rawSelectColumn, 0, len(parts))
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		lower := strings.ToLower(part)
		idx := strings.Index(lower, " as ")
		var name, alias string
		if idx >= 0 {
			name = strings.TrimSpace(part[:idx])
			alias = strings.TrimSpace(part[idx+4:])
		} else {
			name = part
		}
		if name == "" {
			return nil, fmt.Errorf("empty column name")
		}
		result = append(result, rawSelectColumn{name: name, alias: alias})
	}
	return result, nil
}

// resolveColumn finds the column using greedy longest-match on key segments.
// Returns the matched Column and the remaining path segments.
//
// Given segments ["a","b","c"], it tries:
//  1. "a.b.c" — direct match (join scenario with RawIdentifier)
//  2. "a.b"   — root column, path ["c"]
//  3. "a"     — root column, path ["b","c"]
func resolveColumn(key flyql.Key, columns map[string]*Column) (*Column, []string, []bool, error) {
	segments := key.Segments
	for i := len(segments); i > 0; i-- {
		candidateKey := strings.Join(segments[:i], ".")
		col, ok := columns[candidateKey]
		if ok {
			return col, segments[i:], key.QuotedSegments[i:], nil
		}
	}
	return nil, nil, nil, fmt.Errorf("unknown column: %s", key.Raw)
}

func buildSelectExpr(identifier string, column *Column, path []string, pathQuoted []bool) (string, error) {
	if len(path) == 0 {
		return identifier, nil
	}

	if column.IsJSONB || column.JSONString {
		castIdentifier := identifier
		if column.JSONString {
			castIdentifier = fmt.Sprintf("(%s::jsonb)", identifier)
		}
		for i, part := range path {
			if err := validateJSONPathPart(part, pathQuoted[i]); err != nil {
				return "", err
			}
		}
		return buildJSONBPathRaw(castIdentifier, path, pathQuoted), nil
	}

	if column.IsHstore {
		mapKey := strings.Join(path, ".")
		escapedKey, err := EscapeParam(mapKey)
		if err != nil {
			return "", err
		}
		return fmt.Sprintf("%s->%s", identifier, escapedKey), nil
	}

	if column.IsArray {
		indexStr := strings.Join(path, ".")
		index, err := strconv.Atoi(indexStr)
		if err != nil {
			return "", fmt.Errorf("invalid array index, expected number: %s", indexStr)
		}
		return fmt.Sprintf("%s[%d]", identifier, index+1), nil
	}

	return "", fmt.Errorf("path access on non-composite column type: %s", column.Name)
}

// ToSQLSelect parses a columns expression string, validates each column reference
// against the provided column map, and returns SQL-ready SELECT expressions.
//
// text uses comma-separated column references with optional "as" aliases:
//
//	"a, a.b, a.b.c as label, g"
//
// Segmented keys (a.b) are resolved against the root column's type:
//   - JSONB:  a->>'b'
//   - hstore: a->'b'
//   - array:  a[1]
//
// Column lookup uses greedy longest-match on segments, so join-qualified
// references like "users.name" resolve correctly when registered as:
//
//	columns["users.name"] = &Column{RawIdentifier: "u.name", Type: "text"}
//
// No implicit aliases are added; use "col as alias" explicitly.
func ToSQLSelect(text string, columns map[string]*Column) (*SelectResult, error) {
	raws, err := parseRawSelectColumns(text)
	if err != nil {
		return nil, err
	}

	result := &SelectResult{
		Columns: make([]*SelectColumn, 0, len(raws)),
	}
	exprs := make([]string, 0, len(raws))

	for _, raw := range raws {
		key, err := flyql.ParseKey(raw.name)
		if err != nil {
			return nil, fmt.Errorf("invalid column name %q: %w", raw.name, err)
		}

		col, path, pathQuoted, err := resolveColumn(key, columns)
		if err != nil {
			return nil, err
		}

		identifier := getIdentifier(col)
		sqlExpr, err := buildSelectExpr(identifier, col, path, pathQuoted)
		if err != nil {
			return nil, fmt.Errorf("column %q: %w", raw.name, err)
		}

		alias := raw.alias
		if alias != "" {
			sqlExpr = fmt.Sprintf("%s AS %s", sqlExpr, EscapeIdentifier(alias))
		} else if len(path) > 0 {
			// Path access produces an unnamed expression in PostgreSQL (e.g. "?column?").
			// Implicitly alias it using the full dotted reference so the column is
			// addressable by name in the response.
			alias = raw.name
			sqlExpr = fmt.Sprintf("%s AS %s", sqlExpr, EscapeIdentifier(alias))
		}

		result.Columns = append(result.Columns, &SelectColumn{
			Key:     key,
			Alias:   alias,
			Column:  col,
			SQLExpr: sqlExpr,
		})
		exprs = append(exprs, sqlExpr)
	}

	result.SQL = strings.Join(exprs, ", ")
	return result, nil
}
