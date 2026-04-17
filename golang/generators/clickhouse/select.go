package clickhouse

import (
	"fmt"
	"github.com/iamtelescope/flyql/golang/flyqltype"
	"regexp"
	"strconv"
	"strings"

	flyql "github.com/iamtelescope/flyql/golang"
	"github.com/iamtelescope/flyql/golang/columns"
	"github.com/iamtelescope/flyql/golang/transformers"
)

type SelectColumn struct {
	Key     flyql.Key
	Alias   string
	Column  *Column
	SQLExpr string
}

type SelectResult struct {
	Columns []*SelectColumn
	SQL     string
}

var validAliasPattern = regexp.MustCompile(`^[a-zA-Z_][a-zA-Z0-9_.]*$`)

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

func resolveColumn(key flyql.Key, columns map[string]*Column) (*Column, []string, error) {
	segments := key.Segments
	for i := len(segments); i > 0; i-- {
		candidateKey := strings.Join(segments[:i], ".")
		col, ok := columns[candidateKey]
		if ok {
			return col, segments[i:], nil
		}
	}
	return nil, nil, fmt.Errorf("unknown column: %s", key.Raw)
}

func buildSelectExpr(column *Column, path []string) (string, error) {
	if len(path) == 0 {
		return getIdentifier(column), nil
	}

	if column.FlyQLType() == flyqltype.JSON {
		for _, part := range path {
			if err := validateJSONPathPart(part); err != nil {
				return "", err
			}
		}
		pathParts := make([]string, len(path))
		for i, part := range path {
			pathParts[i] = fmt.Sprintf("`%s`", part)
		}
		return fmt.Sprintf("%s.%s", getIdentifier(column), strings.Join(pathParts, ".")), nil
	}

	if column.FlyQLType() == flyqltype.JSONString {
		pathParts := make([]string, len(path))
		for i, part := range path {
			escaped, err := EscapeParam(part)
			if err != nil {
				return "", err
			}
			pathParts[i] = escaped
		}
		return fmt.Sprintf("JSONExtractString(%s, %s)", getIdentifier(column), strings.Join(pathParts, ", ")), nil
	}

	if column.FlyQLType() == flyqltype.Map {
		mapKey := strings.Join(path, ".")
		escaped, err := EscapeParam(mapKey)
		if err != nil {
			return "", err
		}
		return fmt.Sprintf("%s[%s]", getIdentifier(column), escaped), nil
	}

	if column.FlyQLType() == flyqltype.Array {
		indexStr := strings.Join(path, ".")
		index, err := strconv.Atoi(indexStr)
		if err != nil {
			return "", fmt.Errorf("invalid array index, expected number: %s", indexStr)
		}
		sqlIndex := index + 1
		return fmt.Sprintf("%s[%d]", getIdentifier(column), sqlIndex), nil
	}

	return "", fmt.Errorf("path access on non-composite column type: %s", column.Name)
}

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

		col, path, err := resolveColumn(key, cols)
		if err != nil {
			return nil, err
		}

		sqlExpr, err := buildSelectExpr(col, path)
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
			sqlExpr, err = applyTransformerSQL(sqlExpr, key.Transformers, "clickhouse", reg)
			if err != nil {
				return nil, fmt.Errorf("column %q: %w", parsed.Name, err)
			}
		}

		alias := ""
		if parsed.Alias != nil {
			alias = *parsed.Alias
		}
		if alias != "" {
			if !validAliasPattern.MatchString(alias) {
				return nil, fmt.Errorf("invalid alias: %s", alias)
			}
			quotedAlias := alias
			if strings.Contains(alias, ".") {
				quotedAlias = fmt.Sprintf("`%s`", alias)
			}
			sqlExpr = fmt.Sprintf("%s AS %s", sqlExpr, quotedAlias)
		} else if len(path) > 0 {
			alias = strings.SplitN(key.Raw, "|", 2)[0]
			if !validAliasPattern.MatchString(alias) {
				return nil, fmt.Errorf("invalid alias: %s", alias)
			}
			quotedAlias := alias
			if strings.Contains(alias, ".") {
				quotedAlias = fmt.Sprintf("`%s`", alias)
			}
			sqlExpr = fmt.Sprintf("%s AS %s", sqlExpr, quotedAlias)
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
