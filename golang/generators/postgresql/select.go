package postgresql

import (
	"fmt"
	"github.com/iamtelescope/flyql/golang/flyqltype"
	"strconv"
	"strings"

	flyql "github.com/iamtelescope/flyql/golang"
	"github.com/iamtelescope/flyql/golang/columns"
	"github.com/iamtelescope/flyql/golang/transformers"
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

// toKeyTransformers converts columns-package transformers (the canonical
// parser's output shape) to flyql-package transformers (the Key's field
// type). Ranges are zero-valued; downstream consumers read only Name
// and Arguments. Arguments are copied (not aliased) so downstream
// mutation cannot leak back into the source ParsedColumn.
func toKeyTransformers(cts []columns.Transformer) []flyql.Transformer {
	result := make([]flyql.Transformer, len(cts))
	for i, ct := range cts {
		args := make([]any, len(ct.Arguments))
		copy(args, ct.Arguments)
		result[i] = flyql.Transformer{
			Name:      ct.Name,
			Arguments: args,
		}
	}
	return result
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

	if (column.FlyQLType() == flyqltype.JSON) || column.FlyQLType() == flyqltype.JSONString {
		castIdentifier := identifier
		if column.FlyQLType() == flyqltype.JSONString {
			castIdentifier = fmt.Sprintf("(%s::jsonb)", identifier)
		}
		for i, part := range path {
			if err := validateJSONPathPart(part, pathQuoted[i]); err != nil {
				return "", err
			}
		}
		return buildJSONBPathRaw(castIdentifier, path, pathQuoted), nil
	}

	if column.FlyQLType() == flyqltype.Map {
		mapKey := strings.Join(path, ".")
		escapedKey, err := EscapeParam(mapKey)
		if err != nil {
			return "", err
		}
		return fmt.Sprintf("%s->%s", identifier, escapedKey), nil
	}

	if column.FlyQLType() == flyqltype.Array {
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
func ToSQLSelect(text string, cols map[string]*Column, registry ...*transformers.TransformerRegistry) (*SelectResult, error) {
	parsedCols, err := columns.Parse(text, columns.Capabilities{Transformers: true, Renderers: true})
	if err != nil {
		return nil, err
	}

	result := &SelectResult{
		Columns: make([]*SelectColumn, 0, len(parsedCols)),
	}
	exprs := make([]string, 0, len(parsedCols))

	for _, parsed := range parsedCols {
		key, err := flyql.ParseKey(parsed.Name, 0)
		if err != nil {
			return nil, fmt.Errorf("invalid column name %q: %w", parsed.Name, err)
		}
		key.Transformers = toKeyTransformers(parsed.Transformers)

		col, path, pathQuoted, err := resolveColumn(key, cols)
		if err != nil {
			return nil, err
		}

		identifier := getIdentifier(col)
		sqlExpr, err := buildSelectExpr(identifier, col, path, pathQuoted)
		if err != nil {
			return nil, fmt.Errorf("column %q: %w", parsed.Name, err)
		}

		if len(key.Transformers) > 0 {
			var reg *transformers.TransformerRegistry
			if len(registry) > 0 && registry[0] != nil {
				reg = registry[0]
			} else {
				reg = transformers.DefaultRegistry()
			}
			if err := validateTransformerChain(key.Transformers, reg); err != nil {
				return nil, fmt.Errorf("column %q: %w", parsed.Name, err)
			}
			if len(path) > 0 && ((col.FlyQLType() == flyqltype.JSON) || col.FlyQLType() == flyqltype.JSONString) {
				sqlExpr = fmt.Sprintf("(%s)::text", sqlExpr)
			}
			sqlExpr, err = applyTransformerSQL(sqlExpr, key.Transformers, "postgresql", reg)
			if err != nil {
				return nil, fmt.Errorf("column %q: %w", parsed.Name, err)
			}
		}

		alias := ""
		if parsed.Alias != nil {
			alias = *parsed.Alias
		}
		if alias != "" {
			sqlExpr = fmt.Sprintf("%s AS %s", sqlExpr, EscapeIdentifier(alias))
		} else if len(path) > 0 {
			// Path access produces an unnamed expression in PostgreSQL (e.g. "?column?").
			// Implicitly alias it using the full dotted reference so the column is
			// addressable by name in the response.
			alias = strings.SplitN(key.Raw, "|", 2)[0]
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
